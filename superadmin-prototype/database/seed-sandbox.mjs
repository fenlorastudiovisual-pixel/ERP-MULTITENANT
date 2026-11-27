// Crea t17_sandbox: copia de t16 SOLO LECTURA del tenant real.
// Todo lo que se escriba aquí afecta exclusivamente al sandbox.
// Idempotente: limpia y reconstruye los datos del sandbox desde Samjuro.
// Uso: npm run db:sandbox

import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

function loadEnv() {
  try {
    const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // Sin .env.local.
  }
}

loadEnv();
const url = process.env.DATABASE_URL;
if (!url) throw new Error("Falta DATABASE_URL en .env.local");
const sql = neon(url);

const [source] = await sql`
  select id::text, name, niche, plan_id, country, city, status, owner_email, brand, settings
  from public.tenants where source_key = 't16'
`;
if (!source) throw new Error("No existe el tenant real t16 (Samjuro)");

// 1) Tenant sandbox. Nunca se actualiza t16.
await sql`
  insert into public.tenants
    (slug, source_key, name, niche, plan_id, country, city, status, isolation_mode, region,
     owner_email, health_score, brand, settings)
  select 'samjuro-sandbox', 't17_sandbox', 'Samjuro Sandbox', s.niche, s.plan_id,
         s.country, s.city, 'active', 'pool', 'america', s.owner_email, 100, s.brand, s.settings
  from public.tenants s where s.id = ${source.id}::uuid
  on conflict (slug) do update set
    source_key = excluded.source_key, name = excluded.name, status = excluded.status,
    brand = excluded.brand, settings = excluded.settings, updated_at = now()
`;
const [sandbox] = await sql`select id::text from public.tenants where slug = 'samjuro-sandbox'`;
const T = sandbox.id;
console.log(`Sandbox ${T} creado desde ${source.name} (${source.id}).`);

// 2) Limpieza exclusiva del sandbox, en orden de dependencias.
const cleanups = [
  "payment_allocations", "payments_in", "receivables", "invoice_lines", "invoices_ops",
  "sales_order_lines", "sales_orders", "journal_lines", "journal_entries",
  "purchase_receipt_lines", "purchase_receipts", "purchase_order_lines", "purchase_orders",
  "inventory_count_lines", "inventory_counts", "inventory_cost_layers", "inventory_movements",
  "stock_balances", "warehouses", "items", "partners", "accounts", "periods",
  "sequences", "role_permissions", "erp_module_settings",
  "stock_movements", "order_items", "orders", "customers", "products",
];
for (const table of cleanups) {
  await sql.query(`delete from public.${table} where tenant_id = '${T}'::uuid`);
}

// 3) Dueño del sandbox: el mismo usuario owner del tenant real, con rol owner aquí.
await sql`
  insert into public.tenant_members (tenant_id, user_id, role, site_id, active)
  select ${T}::uuid, tm.user_id, 'owner', tm.site_id, true
  from public.tenant_members tm
  where tm.tenant_id = ${source.id}::uuid and tm.role = 'owner'
  on conflict (tenant_id, user_id) do update set role = 'owner', active = true
`;

// 4) Copia de las tablas operativas actuales al sandbox (IDs deterministas).
await sql`
  insert into public.products
    (id, tenant_id, sku, name, description, category, price, cost, stock, min_stock, unit)
  select md5(p.id::text || ':product:' || ${T}::text)::uuid, ${T}::uuid, p.sku, p.name,
         p.description, p.category, p.price, p.cost, p.stock, p.min_stock, p.unit
  from public.products p where p.tenant_id = ${source.id}::uuid
  on conflict (tenant_id, sku) do update set
    name = excluded.name, price = excluded.price, cost = excluded.cost,
    stock = excluded.stock, updated_at = now()
`;
await sql`
  insert into public.customers
    (id, tenant_id, name, document, email, phone, city, address)
  select md5(c.id::text || ':customer:' || ${T}::text)::uuid, ${T}::uuid, c.name,
         c.document, c.email, c.phone, c.city, c.address
  from public.customers c where c.tenant_id = ${source.id}::uuid
  on conflict (tenant_id, document) do update set
    name = excluded.name, email = excluded.email, updated_at = now()
`;
await sql`
  insert into public.orders
    (id, tenant_id, number, customer_id, status, subtotal, tax, total, notes, created_at)
  select md5(o.id::text || ':order:' || ${T}::text)::uuid, ${T}::uuid, o.number,
         case when o.customer_id is null then null
              else md5(o.customer_id::text || ':customer:' || ${T}::text)::uuid end,
         o.status, o.subtotal, o.tax, o.total, o.notes, o.created_at
  from public.orders o where o.tenant_id = ${source.id}::uuid
  on conflict (tenant_id, number) do update set
    status = excluded.status, total = excluded.total, updated_at = now()
`;
await sql`
  insert into public.order_items
    (id, tenant_id, order_id, product_id, quantity, unit_price, total)
  select md5(oi.id::text || ':item:' || ${T}::text)::uuid, ${T}::uuid,
         md5(oi.order_id::text || ':order:' || ${T}::text)::uuid,
         md5(oi.product_id::text || ':product:' || ${T}::text)::uuid,
         oi.quantity, oi.unit_price, oi.total
  from public.order_items oi where oi.tenant_id = ${source.id}::uuid
  on conflict do nothing
`;
await sql`
  insert into public.stock_movements
    (id, tenant_id, product_id, quantity, kind, reason, created_at)
  select md5(sm.id::text || ':movement:' || ${T}::text)::uuid, ${T}::uuid,
         md5(sm.product_id::text || ':product:' || ${T}::text)::uuid,
         sm.quantity, sm.kind, sm.reason, sm.created_at
  from public.stock_movements sm where sm.tenant_id = ${source.id}::uuid
  on conflict do nothing
`;

// 5) Maestros canónicos del nuevo núcleo.
await sql`
  insert into public.partners
    (id, tenant_id, kind, document_type, document, name, trade_name, email, phone,
     city, address, payment_terms_days, credit_limit, tax_regime, active)
  select md5(c.id::text || ':partner:' || ${T}::text)::uuid, ${T}::uuid, 'customer',
         'NIT', c.document, c.name, c.name, c.email, c.phone, c.city, c.address,
         15, 5000000, 'responsable_iva', true
  from public.customers c where c.tenant_id = ${T}::uuid
  on conflict (tenant_id, document_type, document) do update set
    name = excluded.name, updated_at = now()
`;
await sql`
  insert into public.items
    (id, tenant_id, sku, name, description, category, uom, sale_price, cost_price, tax_rate)
  select md5(p.id::text || ':item:' || ${T}::text)::uuid, ${T}::uuid, p.sku, p.name,
         p.description, p.category, p.unit, p.price, p.cost, 0.19
  from public.products p where p.tenant_id = ${T}::uuid
  on conflict (tenant_id, sku) do update set
    name = excluded.name, sale_price = excluded.sale_price,
    cost_price = excluded.cost_price, updated_at = now()
`;
await sql`
  insert into public.warehouses (id, tenant_id, code, name, cost_center, active)
  values
    (md5('principal:' || ${T}::text)::uuid, ${T}::uuid, 'PRINCIPAL', 'Almacén principal', 'CC-01', true),
    (md5('secundario:' || ${T}::text)::uuid, ${T}::uuid, 'SECUNDARIO', 'Almacén secundario', 'CC-02', true)
  on conflict (tenant_id, code) do nothing
`;
await sql`
  insert into public.stock_balances (tenant_id, warehouse_id, item_id, quantity, reserved, average_cost, last_cost)
  select ${T}::uuid, w.id, md5(p.id::text || ':item:' || ${T}::text)::uuid,
         case when w.code = 'PRINCIPAL' then p.stock else 0 end, 0, p.cost, p.cost
  from public.products p
  cross join public.warehouses w
  where p.tenant_id = ${T}::uuid and w.tenant_id = ${T}::uuid
  on conflict (tenant_id, warehouse_id, item_id) do update set
    quantity = excluded.quantity, average_cost = excluded.average_cost,
    last_cost = excluded.last_cost, updated_at = now()
`;
await sql`
  insert into public.inventory_cost_layers
    (tenant_id, item_id, warehouse_id, quantity, remaining_qty, consumed_qty, unit_cost)
  select ${T}::uuid, md5(p.id::text || ':item:' || ${T}::text)::uuid,
         md5('principal:' || ${T}::text)::uuid, p.stock, p.stock, 0, p.cost
  from public.products p
  where p.tenant_id = ${T}::uuid and p.stock > 0
`;
// Proveedores de PRUEBA, creados solo en el sandbox. No representan proveedores reales de Samjuro.
await sql.query(`
  insert into public.partners
    (id, tenant_id, kind, document_type, document, name, trade_name, email, phone, city,
     payment_terms_days, credit_limit, tax_regime, active)
  values
    ${[
      ["TEST-SUP-01", "Proveedor de prueba 01"],
      ["TEST-SUP-02", "Proveedor de prueba 02"],
      ["TEST-SUP-03", "Proveedor de prueba 03"],
    ].map(([doc, name]) =>
      `(md5('${doc}:supplier:${T}')::uuid, '${T}'::uuid, 'supplier', 'NIT', '${doc}', '${name}', '${name}', 'pruebas@fenloravisual.com', '3000000000', 'Bogotá', 30, 10000000, 'responsable_iva', true)`
    ).join(",\n    ")}
  on conflict (tenant_id, document_type, document) do update set
    name = excluded.name, kind = 'supplier', updated_at = now()
`);

// 6) Pedidos del nuevo núcleo, con estado mapping desde el modelo anterior.
await sql`
  insert into public.sales_orders
    (id, tenant_id, number, partner_id, warehouse_id, status, subtotal, discount,
     tax, total, currency, notes, created_at)
  select md5(o.id::text || ':sales:' || ${T}::text)::uuid, ${T}::uuid, o.number,
         case when o.customer_id is null then null
              else md5(o.customer_id::text || ':partner:' || ${T}::text)::uuid end,
         md5('principal:' || ${T}::text)::uuid,
         case o.status
           when 'pending' then 'draft' when 'confirmed' then 'confirmed'
           when 'shipped' then 'delivered' when 'delivered' then 'invoiced'
           when 'cancelled' then 'cancelled' else 'draft' end,
         o.subtotal, 0, o.tax, o.total, 'COP', o.notes, o.created_at
  from public.orders o where o.tenant_id = ${T}::uuid
  on conflict (tenant_id, number) do update set
    status = excluded.status, total = excluded.total, updated_at = now()
`;
await sql`
  insert into public.sales_order_lines
    (id, tenant_id, order_id, item_id, quantity, unit_price, discount, total, cost_unit, line_order)
  select md5(oi.id::text || ':salesline:' || ${T}::text)::uuid, ${T}::uuid,
         md5(oi.order_id::text || ':sales:' || ${T}::text)::uuid,
         md5(oi.product_id::text || ':item:' || ${T}::text)::uuid,
         oi.quantity, oi.unit_price, 0, oi.total, coalesce(p.cost, 0),
         row_number() over (partition by oi.order_id order by oi.id)::int - 1
  from public.order_items oi
  left join public.products p on p.id = oi.product_id and p.tenant_id = ${T}::uuid
  where oi.tenant_id = ${T}::uuid
  on conflict do nothing
`;

// 7) Numeración, plan de cuentas, periodos y configuración modular.
await sql`
  insert into public.sequences (tenant_id, doc_type, prefix, period, next_value) values
    (${T}::uuid, 'sales_order', 'PED', '2026', 621),
    (${T}::uuid, 'invoice', 'FV', '2026', 1),
    (${T}::uuid, 'payment', 'PA', '2026', 1),
    (${T}::uuid, 'journal', 'AS', '2026', 1),
    (${T}::uuid, 'inventory_movement', 'IM', '2026', 1),
    (${T}::uuid, 'inventory_count', 'IC', '2026', 1),
    (${T}::uuid, 'purchase_order', 'OC', '2026', 1),
    (${T}::uuid, 'purchase_receipt', 'RC', '2026', 1)
  on conflict (tenant_id, doc_type, prefix, period) do update set
    next_value = greatest(public.sequences.next_value, excluded.next_value)
`;
await sql.query(`
  insert into public.accounts (id, tenant_id, code, name, account_type, nature) values
    ${[
      ["1105", "Caja", "asset", "debit"],
      ["1110", "Bancos", "asset", "debit"],
      ["1305", "Clientes", "asset", "debit"],
      ["1510", "Inventario", "asset", "debit"],
      ["1355", "IVA discriminado", "asset", "debit"],
      ["2105", "Anticipos de clientes", "liability", "credit"],
      ["2405", "Proveedores", "liability", "credit"],
      ["3105", "Capital", "equity", "credit"],
      ["4135", "Ventas", "revenue", "credit"],
      ["4175", "Devoluciones sobre ventas", "revenue", "debit"],
      ["4750", "IVA generado", "liability", "credit"],
      ["4905", "Ingresos varios", "revenue", "credit"],
      ["5105", "Costo de ventas", "expense", "debit"],
      ["5905", "Gastos varios", "expense", "debit"],
    ].map(([code, name, type, nature]) =>
      `(md5('${code}:account:${T}')::uuid, '${T}'::uuid, '${code}', '${name}', '${type}', '${nature}')`
    ).join(",\n    ")}
  on conflict (tenant_id, code) do nothing
`);
await sql`
  insert into public.periods (tenant_id, year, month, status)
  select ${T}::uuid, extract(year from m)::int, extract(month from m)::int, 'open'
  from generate_series(date_trunc('month', now()) - interval '11 months',
                       date_trunc('month', now()), interval '1 month') m
  on conflict (tenant_id, year, month) do nothing
`;
await sql.query(`
  insert into public.erp_module_settings (tenant_id, module_code, active, config) values
    ${[
      ["core", true, {}], ["accounting", true, {}], ["invoicing", true, {}], ["receivables", true, {}],
      ["inventory", true, { valuation: "average" }], ["purchases", true, {}],
      ["crm", false, {}], ["restaurant", false, {}], ["pharmacy", false, {}],
      ["ecommerce", false, {}], ["projects", false, {}], ["manufacturing", false, {}],
    ].map(([code, active, config]) =>
      `('${T}'::uuid, '${code}', ${active}, '${JSON.stringify(config)}'::jsonb)`
    ).join(",\n    ")}
  on conflict (tenant_id, module_code) do update set
    active = excluded.active, config = excluded.config, updated_at = now()
`);

const permissions = [
  ["owner", "finance.view", true], ["owner", "product.create", true], ["owner", "order.create", true],
  ["owner", "order.discount", true], ["owner", "stock.adjust", true], ["owner", "invoice.issue", true],
  ["owner", "invoice.void", true], ["owner", "payment.record", true], ["owner", "journal.post", true],
  ["owner", "period.close", true], ["owner", "audit.export", true],
  ["admin", "finance.view", true], ["admin", "product.create", true], ["admin", "order.create", true],
  ["admin", "order.discount", true], ["admin", "stock.adjust", true], ["admin", "invoice.issue", true],
  ["admin", "invoice.void", true], ["admin", "payment.record", true], ["admin", "journal.post", true],
  ["admin", "period.close", false], ["admin", "audit.export", true],
  ["accounting", "finance.view", true], ["accounting", "product.create", false],
  ["accounting", "order.create", false], ["accounting", "order.discount", false],
  ["accounting", "stock.adjust", false], ["accounting", "invoice.issue", true],
  ["accounting", "invoice.void", true], ["accounting", "payment.record", true],
  ["accounting", "journal.post", true], ["accounting", "period.close", false],
  ["accounting", "audit.export", false],
  ["sales", "finance.view", false], ["sales", "product.create", false], ["sales", "order.create", true],
  ["sales", "order.discount", false], ["sales", "stock.adjust", false], ["sales", "invoice.issue", false],
  ["sales", "invoice.void", false], ["sales", "payment.record", false], ["sales", "journal.post", false],
  ["sales", "period.close", false], ["sales", "audit.export", false],
  ["warehouse", "finance.view", false], ["warehouse", "product.create", false],
  ["warehouse", "order.create", false], ["warehouse", "order.discount", false],
  ["warehouse", "stock.adjust", true], ["warehouse", "invoice.issue", false],
  ["warehouse", "invoice.void", false], ["warehouse", "payment.record", false],
  ["warehouse", "journal.post", false], ["warehouse", "period.close", false],
  ["warehouse", "audit.export", false],
  ["auditor", "finance.view", true], ["auditor", "audit.export", true],
  ["viewer", "finance.view", true], ["viewer", "audit.export", false],
  ["owner", "inventory.view", true], ["owner", "stock.transfer", true],
  ["owner", "purchase.view", true], ["owner", "purchase.create", true], ["owner", "purchase.receive", true],
  ["admin", "inventory.view", true], ["admin", "stock.transfer", true],
  ["admin", "purchase.view", true], ["admin", "purchase.create", true], ["admin", "purchase.receive", true],
  ["accounting", "inventory.view", true], ["accounting", "stock.transfer", false],
  ["accounting", "purchase.view", true], ["accounting", "purchase.create", false], ["accounting", "purchase.receive", false],
  ["sales", "inventory.view", true], ["sales", "stock.transfer", false],
  ["sales", "purchase.view", false], ["sales", "purchase.create", false], ["sales", "purchase.receive", false],
  ["warehouse", "inventory.view", true], ["warehouse", "stock.transfer", true],
  ["warehouse", "purchase.view", true], ["warehouse", "purchase.create", false], ["warehouse", "purchase.receive", true],
  ["auditor", "inventory.view", true], ["auditor", "stock.transfer", false],
  ["auditor", "purchase.view", true], ["auditor", "purchase.create", false], ["auditor", "purchase.receive", false],
  ["viewer", "inventory.view", true], ["viewer", "stock.transfer", false],
  ["viewer", "purchase.view", true], ["viewer", "purchase.create", false], ["viewer", "purchase.receive", false],
];
await sql.query(`
  insert into public.role_permissions (tenant_id, role, permission, allowed) values
    ${permissions.map(([role, permission, allowed]) =>
      `('${T}'::uuid, '${role}', '${permission}', ${allowed})`
    ).join(",\n    ")}
  on conflict (tenant_id, role, permission) do update set allowed = excluded.allowed
`);

// 8) Verificación: sandbox completo y tenant real intacto.
const [counts] = await sql`
  select
    (select count(*)::int from public.products where tenant_id = ${T}::uuid) as products,
    (select count(*)::int from public.customers where tenant_id = ${T}::uuid) as customers,
    (select count(*)::int from public.orders where tenant_id = ${T}::uuid) as orders,
    (select count(*)::int from public.order_items where tenant_id = ${T}::uuid) as items,
    (select count(*)::int from public.stock_movements where tenant_id = ${T}::uuid) as movements,
    (select count(*)::int from public.partners where tenant_id = ${T}::uuid) as partners,
    (select count(*)::int from public.items where tenant_id = ${T}::uuid) as core_items,
    (select count(*)::int from public.sales_orders where tenant_id = ${T}::uuid) as sales_orders,
    (select count(*)::int from public.sales_order_lines where tenant_id = ${T}::uuid) as sales_lines,
    (select count(*)::int from public.accounts where tenant_id = ${T}::uuid) as accounts,
    (select count(*)::int from public.role_permissions where tenant_id = ${T}::uuid) as permissions,
    (select count(*)::int from public.warehouses where tenant_id = ${T}::uuid) as warehouses,
    (select count(*)::int from public.partners where tenant_id = ${T}::uuid and kind = 'supplier') as suppliers,
    (select count(*)::int from public.inventory_movements where tenant_id = ${T}::uuid) as movements_erp,
    (select count(*)::int from public.purchase_orders where tenant_id = ${T}::uuid) as purchase_orders,
    (select count(*)::int from public.invoices_ops where tenant_id = ${T}::uuid) as invoices_ops
`;
const [real] = await sql`
  select
    (select count(*)::int from public.products where tenant_id = ${source.id}::uuid) as products,
    (select count(*)::int from public.customers where tenant_id = ${source.id}::uuid) as customers,
    (select count(*)::int from public.orders where tenant_id = ${source.id}::uuid) as orders,
    (select count(*)::int from public.order_items where tenant_id = ${source.id}::uuid) as items,
    (select count(*)::int from public.stock_movements where tenant_id = ${source.id}::uuid) as movements
`;
console.log("Sandbox:", JSON.stringify(counts));
console.log("Samjuro real (solo lectura):", JSON.stringify(real));
if (real.products !== 1240 || real.customers !== 480 || real.orders !== 620 || real.items !== 2168 || real.movements !== 1980) {
  throw new Error("Los conteos de Samjuro cambiaron. Revisar antes de continuar.");
}
console.log("OK. Samjuro no fue modificado.");
