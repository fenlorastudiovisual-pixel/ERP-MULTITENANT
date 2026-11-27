import { readFileSync, writeFileSync } from "node:fs";
import crypto from "node:crypto";
import { neon } from "@neondatabase/serverless";

const ROOT = "D:\\datos\\Desktop\\FENLORA VISUAL STUDIO\\SAMJURO-EXPORT";
const envText = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const url = envText.match(/^DATABASE_URL=(.*)$/m)?.[1].replace(/^["']|["']$/g, "");
if (!url) throw new Error("DATABASE_URL no encontrada");
const sql = neon(url);
const u = (s) => {
  const h = crypto.createHash("md5").update(String(s)).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};
const num = (v) => Number(v || 0);
const text = (v) => (v == null ? "" : String(v));

const get = async (name) => {
  const rows = await sql`select payload from samjuro_stage.raw_tables where name = ${name}`;
  if (!rows[0]) throw new Error(`Falta la tabla en staging: ${name}`);
  return rows[0].payload;
};

const [tenant] = await sql`select id::text as id from public.tenants where source_key = 't17_sandbox'`;
if (!tenant) throw new Error("No existe t17_sandbox");
const T = tenant.id;

const products = await get("productos");
const presentations = await get("presentaciones");
const categories = await get("categorias");
const brands = await get("marcas");
const customers = await get("clientes_negocios");
const orders = await get("pedidos");
const lines = await get("pedido_items");

const before = await sql`
  select 'items'::text as tabla, count(*)::int as filas from public.items where tenant_id = ${T}::uuid
  union all select 'partners', count(*)::int from public.partners where tenant_id = ${T}::uuid
  union all select 'sales_orders', count(*)::int from public.sales_orders where tenant_id = ${T}::uuid
  union all select 'sales_order_lines', count(*)::int from public.sales_order_lines where tenant_id = ${T}::uuid
`;
writeFileSync(`${ROOT}\\pilot-before.json`, JSON.stringify({ tenant_id: T, before }, null, 2));

const categoryName = new Map(categories.map((c) => [c.id, c.nombre]));
const brandName = new Map(brands.map((b) => [b.id, b.nombre]));
const productById = new Map(products.map((p) => [p.id, p]));

const categoryFor = (p) => categoryName.get(p?.categoria_id) || brandName.get(p?.marca_id) || "General";
const priceForProduct = (productId) => {
  const ps = presentations
    .filter((x) => x.producto_id === productId && x.precio != null)
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  return num(ps[0]?.precio);
};

// Clients: deduplicate by document, because Samjuro has 17 repeated documents.
const partnerForCustomer = new Map();
const partnerRows = [];
const seenDocuments = new Set();
for (const c of customers) {
  const docType = text(c.tipo_documento || "CC");
  const doc = text(c.documento || `SIN-${String(c.id).slice(0, 8)}`);
  const key = `${docType}:${doc}`;
  let id = partnerForCustomer.get(c.id);
  if (!id) {
    if (!seenDocuments.has(key)) {
      id = u(`${doc}:partner:${T}`);
      seenDocuments.add(key);
      partnerRows.push({
        id,
        docType,
        doc,
        name: text(c.nombre),
        email: text(c.correo),
        phone: text(c.telefono),
        city: text(c.municipio),
        address: [text(c.direccion), text(c.zona)].filter(Boolean).join(" - "),
        active: c.activo !== false,
      });
    } else {
      id = u(`${doc}:partner:${T}`);
    }
  }
  partnerForCustomer.set(c.id, id);
}

// Items: one parent item per product (used by sales lines) + one item per real presentation.
const itemRows = [];
const itemForProduct = new Map();
for (const p of products) {
  const id = u(`${p.id}:product:${T}`);
  itemForProduct.set(p.id, id);
  itemRows.push({
    id,
    sku: text(p.sku),
    name: text(p.nombre),
    description: text(p.descripcion_corta),
    category: categoryFor(p),
    salePrice: priceForProduct(p.id),
    active: p.activo !== false,
  });
}
for (const pr of presentations) {
  const p = productById.get(pr.producto_id);
  const sku = text(pr.sku || `${text(p?.sku || "PROD")}-${String(pr.id).slice(0, 8)}`);
  itemRows.push({
    id: u(`${pr.id}:presentation:${T}`),
    sku,
    name: `${text(p?.nombre || "Producto")}${pr.nombre ? ` ${text(pr.nombre)}` : ""}`.trim(),
    description: text(pr.descripcion || p?.descripcion_corta),
    category: categoryFor(p),
    salePrice: num(pr.precio),
    active: pr.activo !== false,
  });
}
// Four historical lines reference products that no longer exist in the catalog; keep them.
const orphanSkus = new Set(lines.filter((l) => !productById.has(l.producto_id)).map((l) => text(l.producto_sku)));
for (const sku of orphanSkus) {
  const sample = lines.find((l) => text(l.producto_sku) === sku);
  if (!itemRows.some((i) => i.sku === sku)) {
    const id = u(`${sku}:orphan:${T}`);
    itemForProduct.set(`sku:${sku}`, id);
    itemRows.push({
      id,
      sku,
      name: text(sample?.producto_nombre || sku),
      description: "Producto histórico que ya no está en el catálogo",
      category: "General",
      salePrice: num(sample?.precio),
      active: false,
    });
  }
}
const itemIdBySku = new Map(itemRows.map((i) => [i.sku, i.id]));

// Sales orders and lines.
const groupedLines = new Map();
for (const l of lines) {
  const orderId = l.pedido_id;
  if (!groupedLines.has(orderId)) groupedLines.set(orderId, []);
  groupedLines.get(orderId).push(l);
}
const orderRows = [];
const lineRows = [];
for (const o of orders) {
  const id = u(`${o.id}:sales:${T}`);
  const its = groupedLines.get(o.id) || [];
  const gross = its.reduce((s, l) => s + num(l.cantidad) * num(l.precio), 0);
  const tax = gross - gross / 1.19;
  orderRows.push({
    id,
    number: `PED-${String(Number(o.numero)).padStart(6, "0")}`,
    partnerId: partnerForCustomer.get(o.negocio_id) || null,
    status: "confirmed",
    subtotal: Math.round((gross - tax) * 100) / 100,
    tax: Math.round(tax * 100) / 100,
    total: Math.round(gross * 100) / 100,
    notes: text(o.notas),
    createdAt: o.created_at,
  });
  its.forEach((l, idx) => {
    const itemId = itemForProduct.get(l.producto_id) || itemIdBySku.get(text(l.producto_sku));
    if (!itemId) return;
    lineRows.push({
      id: u(`${l.id}:salesline:${T}`),
      orderId: id,
      itemId,
      quantity: Math.max(1, Number(l.cantidad) || 1),
      unitPrice: num(l.precio),
      total: Math.round(num(l.cantidad) * num(l.precio) * 100) / 100,
      lineOrder: idx,
    });
  });
}

const warehouseId = u(`PRINCIPAL:warehouse:${T}`);

await sql.transaction((tx) => {
  const q = [];
  const tables = [
    "payment_allocations", "payments_in", "receivables", "invoice_lines", "invoices_ops",
    "journal_lines", "journal_entries", "sales_order_lines", "sales_orders",
    "inventory_count_lines", "inventory_counts", "inventory_movements", "inventory_cost_layers",
    "purchase_receipt_lines", "purchase_receipts", "purchase_order_lines", "purchase_orders",
    "stock_balances", "items", "partners", "warehouses",
    "order_items", "stock_movements", "orders", "customers", "products",
  ];
  for (const table of tables) {
    q.push(tx.query(`delete from public.${table} where tenant_id = $1::uuid`, [T]));
  }

  q.push(tx`
    insert into public.warehouses (id, tenant_id, code, name, active)
    values (${warehouseId}::uuid, ${T}::uuid, 'PRINCIPAL', 'Bodega principal', true)
  `);

  const n = partnerRows.length;
  q.push(tx`
    insert into public.partners (id, tenant_id, kind, document_type, document, name, email, phone, city, address, active)
    select * from unnest(
      ${partnerRows.map((r) => r.id)}::uuid[], ${Array(n).fill(T)}::uuid[],
      ${Array(n).fill("customer")}::text[], ${partnerRows.map((r) => r.docType)}::text[],
      ${partnerRows.map((r) => r.doc)}::text[], ${partnerRows.map((r) => r.name)}::text[],
      ${partnerRows.map((r) => r.email)}::text[], ${partnerRows.map((r) => r.phone)}::text[],
      ${partnerRows.map((r) => r.city)}::text[], ${partnerRows.map((r) => r.address)}::text[],
      ${partnerRows.map((r) => r.active)}::boolean[]
    ) as t(id, tenant_id, kind, document_type, document, name, email, phone, city, address, active)
    on conflict (tenant_id, document_type, document) do update set
      name = excluded.name, email = excluded.email, phone = excluded.phone,
      city = excluded.city, address = excluded.address, updated_at = now()
  `);

  const m = itemRows.length;
  q.push(tx`
    insert into public.items (id, tenant_id, sku, name, description, category, uom, sale_price, cost_price, tax_rate, active)
    select * from unnest(
      ${itemRows.map((r) => r.id)}::uuid[], ${Array(m).fill(T)}::uuid[],
      ${itemRows.map((r) => r.sku)}::text[], ${itemRows.map((r) => r.name)}::text[],
      ${itemRows.map((r) => r.description)}::text[], ${itemRows.map((r) => r.category)}::text[],
      ${Array(m).fill("und")}::text[], ${itemRows.map((r) => r.salePrice)}::numeric[],
      ${Array(m).fill(0)}::numeric[], ${Array(m).fill(0.19)}::numeric[],
      ${itemRows.map((r) => r.active)}::boolean[]
    ) as t(id, tenant_id, sku, name, description, category, uom, sale_price, cost_price, tax_rate, active)
    on conflict (tenant_id, sku) do update set
      name = excluded.name, description = excluded.description, category = excluded.category,
      sale_price = excluded.sale_price, active = excluded.active, updated_at = now()
  `);

  const o = orderRows.length;
  q.push(tx`
    insert into public.sales_orders (id, tenant_id, number, partner_id, warehouse_id, status, subtotal, discount, tax, total, currency, notes, created_at)
    select * from unnest(
      ${orderRows.map((r) => r.id)}::uuid[], ${Array(o).fill(T)}::uuid[],
      ${orderRows.map((r) => r.number)}::text[], ${orderRows.map((r) => r.partnerId)}::uuid[],
      ${Array(o).fill(warehouseId)}::uuid[], ${orderRows.map((r) => r.status)}::text[],
      ${orderRows.map((r) => r.subtotal)}::numeric[], ${Array(o).fill(0)}::numeric[],
      ${orderRows.map((r) => r.tax)}::numeric[], ${orderRows.map((r) => r.total)}::numeric[],
      ${Array(o).fill("COP")}::char(3)[], ${orderRows.map((r) => r.notes)}::text[],
      ${orderRows.map((r) => r.createdAt)}::timestamptz[]
    ) as t(id, tenant_id, number, partner_id, warehouse_id, status, subtotal, discount, tax, total, currency, notes, created_at)
  `);

  const l = lineRows.length;
  q.push(tx`
    insert into public.sales_order_lines (id, tenant_id, order_id, item_id, quantity, unit_price, discount, total, cost_unit, line_order)
    select * from unnest(
      ${lineRows.map((r) => r.id)}::uuid[], ${Array(l).fill(T)}::uuid[],
      ${lineRows.map((r) => r.orderId)}::uuid[], ${lineRows.map((r) => r.itemId)}::uuid[],
      ${lineRows.map((r) => r.quantity)}::integer[], ${lineRows.map((r) => r.unitPrice)}::numeric[],
      ${Array(l).fill(0)}::numeric[], ${lineRows.map((r) => r.total)}::numeric[],
      ${Array(l).fill(0)}::numeric[], ${lineRows.map((r) => r.lineOrder)}::integer[]
    ) as t(id, tenant_id, order_id, item_id, quantity, unit_price, discount, total, cost_unit, line_order)
  `);

  q.push(tx`
    insert into public.sequences (tenant_id, doc_type, prefix, period, next_value)
    values (${T}::uuid, 'sales_order', 'PED', '2026', 202)
    on conflict (tenant_id, doc_type, prefix, period)
    do update set next_value = greatest(public.sequences.next_value, excluded.next_value), updated_at = now()
  `);

  // Legacy operational tables used by the /negocio panel. Same IDs as the
  // normalized rows above, so both views describe the same real operations.
  const p = itemRows.length;
  q.push(tx`
    insert into public.products (id, tenant_id, sku, name, description, category, price, cost, stock, min_stock, unit, active)
    select * from unnest(
      ${itemRows.map((r) => r.id)}::uuid[], ${Array(p).fill(T)}::uuid[],
      ${itemRows.map((r) => r.sku)}::text[], ${itemRows.map((r) => r.name)}::text[],
      ${itemRows.map((r) => r.description)}::text[], ${itemRows.map((r) => r.category)}::text[],
      ${itemRows.map((r) => r.salePrice)}::numeric[], ${Array(p).fill(0)}::numeric[],
      ${Array(p).fill(0)}::integer[], ${Array(p).fill(0)}::integer[],
      ${Array(p).fill("und")}::text[], ${itemRows.map((r) => r.active)}::boolean[]
    ) as t(id, tenant_id, sku, name, description, category, price, cost, stock, min_stock, unit, active)
  `);
  q.push(tx`
    insert into public.customers (id, tenant_id, name, document, email, phone, city, address)
    select * from unnest(
      ${partnerRows.map((r) => r.id)}::uuid[], ${Array(n).fill(T)}::uuid[],
      ${partnerRows.map((r) => r.name)}::text[], ${partnerRows.map((r) => r.doc)}::text[],
      ${partnerRows.map((r) => r.email)}::text[], ${partnerRows.map((r) => r.phone)}::text[],
      ${partnerRows.map((r) => r.city)}::text[], ${partnerRows.map((r) => r.address)}::text[]
    ) as t(id, tenant_id, name, document, email, phone, city, address)
  `);
  q.push(tx`
    insert into public.orders (id, tenant_id, number, customer_id, status, subtotal, tax, total, notes, created_at)
    select * from unnest(
      ${orderRows.map((r) => r.id)}::uuid[], ${Array(o).fill(T)}::uuid[],
      ${orderRows.map((r) => r.number)}::text[], ${orderRows.map((r) => r.partnerId)}::uuid[],
      ${orderRows.map((r) => r.status)}::text[], ${orderRows.map((r) => r.subtotal)}::numeric[],
      ${orderRows.map((r) => r.tax)}::numeric[], ${orderRows.map((r) => r.total)}::numeric[],
      ${orderRows.map((r) => r.notes)}::text[], ${orderRows.map((r) => r.createdAt)}::timestamptz[]
    ) as t(id, tenant_id, number, customer_id, status, subtotal, tax, total, notes, created_at)
  `);
  q.push(tx`
    insert into public.order_items (id, tenant_id, order_id, product_id, quantity, unit_price, total)
    select * from unnest(
      ${lineRows.map((r) => r.id)}::uuid[], ${Array(l).fill(T)}::uuid[],
      ${lineRows.map((r) => r.orderId)}::uuid[], ${lineRows.map((r) => r.itemId)}::uuid[],
      ${lineRows.map((r) => r.quantity)}::integer[], ${lineRows.map((r) => r.unitPrice)}::numeric[],
      ${lineRows.map((r) => r.total)}::numeric[]
    ) as t(id, tenant_id, order_id, product_id, quantity, unit_price, total)
  `);
  return q;
});

const after = await sql`
  select
    (select count(*) from public.items where tenant_id = ${T}::uuid)::int as items,
    (select count(*) from public.partners where tenant_id = ${T}::uuid)::int as partners,
    (select count(*) from public.sales_orders where tenant_id = ${T}::uuid)::int as orders,
    (select count(*) from public.sales_order_lines where tenant_id = ${T}::uuid)::int as lines,
    (select count(*) from public.items where tenant_id = ${T}::uuid and sku = 'CH-ESM-208')::int as sku_validado,
    (select coalesce(sum(total), 0) from public.sales_orders where tenant_id = ${T}::uuid)::float as total_ventas
`;
writeFileSync(`${ROOT}\\pilot-after.json`, JSON.stringify({ tenant_id: T, after }, null, 2));
console.log(JSON.stringify({ before, after, inserted: { partners: partnerRows.length, items: itemRows.length, orders: orderRows.length, lines: lineRows.length } }, null, 2));
