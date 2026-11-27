// Datos operativos reales para el tenant de prueba (Samjuro).
// Se insertan en las tablas del ERP del negocio, no en demos ni en app_state.
// Idempotente: borra solo las operaciones de este tenant y las vuelve a crear.

import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";

const root = fileURLToPath(new URL("../", import.meta.url));
const envText = readFileSync(`${root}.env.local`, "utf8");
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const { runAsSuperAdmin } = await import(pathToFileURL(`${root}lib/db.js`).href);

const tenantRows = await runAsSuperAdmin((tx) => tx`
  select id::text, source_key, name, niche from public.tenants where source_key = 't16'
`);
const tenant = tenantRows[0];
if (!tenant) throw new Error("No existe el tenant t16 (Samjuro)");

const TENANT_ID = tenant.id;
console.log(`Sembrando operaciones para ${tenant.name} (${tenant.source_key}) · niche=${tenant.niche}`);

// ── Catálogo ───────────────────────────────────────────────────────────────
const CATEGORIES = [
  { name: "Alimentos y bebidas", unit: "und", brands: ["Andina", "Valle", "Delgado", "Sol", "Andes", "Norte"] },
  { name: "Limpieza", unit: "und", brands: ["Brillo", "Limpia", "Fresh", "Total", "Clear", "Home"] },
  { name: "Higiene personal", unit: "und", brands: ["Derma", "Suave", "Care", "Natural", "Vital", "Bella"] },
  { name: "Papelería", unit: "und", brands: ["Pluma", "Papel", "Oficina", "Libro", "Tinta", "Cuaderno"] },
  { name: "Ferretería", unit: "und", brands: ["Herr", "Tornillo", "Fierro", "Obra", "Metal", "Nivel"] },
  { name: "Textil", unit: "und", brands: ["Algodón", "Lino", "Seda", "Denim", "Punto", "Hilo"] },
  { name: "Electrónica", unit: "und", brands: ["Volt", "Digital", "Micro", "Tech", "Lumen", "Signal"] },
  { name: "Farmacia", unit: "caja", brands: ["Salud", "Vida", "Farma", "Bien", "Med", "Cuidado"] },
  { name: "Construcción", unit: "und", brands: ["Cemento", "Ladrillo", "Arena", "Varilla", "Madera", "Pintura"] },
  { name: "Logística", unit: "und", brands: ["Caja", "Pallet", "Fleje", "Etiqueta", "Bolsa", "Envase"] },
];

const PRODUCT_COUNT = 1240;
const products = [];
for (let i = 1; i <= PRODUCT_COUNT; i++) {
  const cat = CATEGORIES[i % CATEGORIES.length];
  const brand = cat.brands[i % cat.brands.length];
  const descriptor = ["Premium", "Económico", "Industrial", "Familiar", "Profesional", "Compacto"][i % 6];
  const price = Math.round((9000 + ((i * 7919) % 840000)) / 100) * 100;
  const cost = Math.round(price * (0.58 + ((i % 17) / 100)) / 100) * 100;
  products.push({
    id: randomUUID(),
    sku: `SKU-${String(i).padStart(5, "0")}`,
    name: `${brand} ${descriptor} ${cat.name} ${i}`,
    description: `${descriptor} · ${cat.name} · referencia ${i}`,
    category: cat.name,
    price,
    cost,
    stock: 40 + ((i * 137) % 820),
    min_stock: 15 + (i % 35),
    unit: cat.unit,
  });
}

// ── Clientes ───────────────────────────────────────────────────────────────
const FIRST = ["Carlos", "María", "Andrés", "Lucía", "Jorge", "Sofía", "Diego", "Valentina", "Felipe", "Camila", "Oscar", "Tatiana"];
const LAST = ["Ramírez", "Gómez", "López", "Martínez", "Ruiz", "Hernández", "Díaz", "Moreno", "Torres", "Vega", "Castro", "Ortega"];
const CITY = ["Bogotá", "Medellín", "Cali", "Barranquilla", "Bucaramanga", "Pereira", "Manizales", "Armenia", "Cúcuta", "Ibagué"];
const CUSTOMER_COUNT = 480;
const customers = [];
for (let i = 1; i <= CUSTOMER_COUNT; i++) {
  const first = FIRST[i % FIRST.length];
  const last = LAST[(i * 5) % LAST.length];
  customers.push({
    id: randomUUID(),
    name: `${first} ${last}`,
    document: String(90000000000 + i),
    email: `cliente${i}@negocio${i % 12}.com`,
    phone: `3${String(100000000 + ((i * 7919) % 899999999)).slice(0, 9)}`,
    city: CITY[i % CITY.length],
    address: `Calle ${10 + (i % 90)} # ${1 + (i % 40)}-${10 + (i % 20)}`,
  });
}

// ── Pedidos ────────────────────────────────────────────────────────────────
const STATUS = ["delivered", "delivered", "delivered", "delivered", "delivered", "shipped", "shipped", "confirmed", "pending", "cancelled"];
const ORDER_COUNT = 620;
const orders = [];
const items = [];
const movements = [];
const now = Date.now();

for (let i = 1; i <= ORDER_COUNT; i++) {
  const orderId = randomUUID();
  const count = 1 + ((i * 7) % 6);
  let subtotal = 0;
  for (let j = 0; j < count; j++) {
    const product = products[(i * 13 + j * 97) % products.length];
    const quantity = 1 + ((i + j * 3) % 8);
    const total = Math.round(product.price * quantity * 100) / 100;
    subtotal += total;
    items.push({
      id: randomUUID(), order_id: orderId, product_id: product.id,
      quantity, unit_price: product.price, total,
    });
    if (i % 10 !== 0) {
      movements.push({
        id: randomUUID(), product_id: product.id, quantity: -quantity,
        kind: "out", reason: `Pedido PED-2026-${String(i).padStart(5, "0")}`,
      });
    }
  }
  subtotal = Math.round(subtotal * 100) / 100;
  const tax = Math.round(subtotal * 0.19 * 100) / 100;
  orders.push({
    id: orderId,
    number: `PED-2026-${String(i).padStart(5, "0")}`,
    customer_id: customers[(i * 17) % customers.length].id,
    status: STATUS[i % STATUS.length],
    subtotal,
    tax,
    total: Math.round((subtotal + tax) * 100) / 100,
    notes: i % 9 === 0 ? "Entrega prioritaria" : null,
    created_at: new Date(now - ((i * 37) % 180) * 86400000).toISOString(),
  });
}

const json = (rows) => JSON.stringify(rows);
const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

// ── Reemplazo atómico de las operaciones de este tenant ───────────────────
await runAsSuperAdmin((tx) => [
  tx`delete from public.stock_movements where tenant_id = ${TENANT_ID}::uuid`,
  tx`delete from public.order_items where tenant_id = ${TENANT_ID}::uuid`,
  tx`delete from public.orders where tenant_id = ${TENANT_ID}::uuid`,
  tx`delete from public.customers where tenant_id = ${TENANT_ID}::uuid`,
  tx`delete from public.products where tenant_id = ${TENANT_ID}::uuid`,
]);

const queries = [];
for (const group of chunk(products, 250)) {
  queries.push(txInsertProducts(group));
}
for (const group of chunk(customers, 200)) {
  queries.push(txInsertCustomers(group));
}
for (const group of chunk(orders, 100)) {
  queries.push(txInsertOrders(group));
}
for (const group of chunk(items, 400)) {
  queries.push(txInsertItems(group));
}
for (const group of chunk(movements, 400)) {
  queries.push(txInsertMovements(group));
}

function withTenant(rows) {
  return rows.map((row) => ({ ...row, tenant_id: TENANT_ID }));
}

function txInsertProducts(rows) {
  return (tx) => tx`
    insert into public.products
      (id, tenant_id, sku, name, description, category, price, cost, stock, min_stock, unit)
    select x.id::uuid, x.tenant_id::uuid, x.sku, x.name, x.description, x.category,
           x.price::numeric, x.cost::numeric, x.stock::integer,
           x.min_stock::integer, x.unit
    from jsonb_to_recordset(${json(withTenant(rows))}::jsonb) as x(
      id text, tenant_id text, sku text, name text, description text, category text,
      price text, cost text, stock text, min_stock text, unit text
    )
  `;
}

function txInsertCustomers(rows) {
  return (tx) => tx`
    insert into public.customers
      (id, tenant_id, name, document, email, phone, city, address)
    select x.id::uuid, x.tenant_id::uuid, x.name, x.document, x.email, x.phone, x.city, x.address
    from jsonb_to_recordset(${json(withTenant(rows))}::jsonb) as x(
      id text, tenant_id text, name text, document text, email text, phone text,
      city text, address text
    )
  `;
}

function txInsertOrders(rows) {
  return (tx) => tx`
    insert into public.orders
      (id, tenant_id, number, customer_id, status, subtotal, tax, total, notes, created_at)
    select x.id::uuid, x.tenant_id::uuid, x.number, x.customer_id::uuid, x.status,
           x.subtotal::numeric, x.tax::numeric, x.total::numeric, x.notes,
           x.created_at::timestamptz
    from jsonb_to_recordset(${json(withTenant(rows))}::jsonb) as x(
      id text, tenant_id text, number text, customer_id text, status text,
      subtotal text, tax text, total text, notes text, created_at text
    )
  `;
}

function txInsertItems(rows) {
  return (tx) => tx`
    insert into public.order_items
      (tenant_id, order_id, product_id, quantity, unit_price, total)
    select x.tenant_id::uuid, x.order_id::uuid, x.product_id::uuid,
           x.quantity::integer, x.unit_price::numeric, x.total::numeric
    from jsonb_to_recordset(${json(withTenant(rows))}::jsonb) as x(
      tenant_id text, order_id text, product_id text, quantity text,
      unit_price text, total text
    )
  `;
}

function txInsertMovements(rows) {
  return (tx) => tx`
    insert into public.stock_movements (tenant_id, product_id, quantity, kind, reason)
    select x.tenant_id::uuid, x.product_id::uuid, x.quantity::integer, x.kind, x.reason
    from jsonb_to_recordset(${json(withTenant(rows))}::jsonb) as x(
      tenant_id text, product_id text, quantity text, kind text, reason text
    )
  `;
}

for (const build of queries) {
  await runAsSuperAdmin(build);
}

const [p, c, o, it, m] = await runAsSuperAdmin((tx) => [
  tx`select count(*)::int as n from public.products where tenant_id = ${TENANT_ID}::uuid`,
  tx`select count(*)::int as n from public.customers where tenant_id = ${TENANT_ID}::uuid`,
  tx`select count(*)::int as n from public.orders where tenant_id = ${TENANT_ID}::uuid`,
  tx`select count(*)::int as n from public.order_items where tenant_id = ${TENANT_ID}::uuid`,
  tx`select count(*)::int as n from public.stock_movements where tenant_id = ${TENANT_ID}::uuid`,
]);
console.log(`OK · productos=${p[0].n} clientes=${c[0].n} pedidos=${o[0].n} items=${it[0].n} movimientos=${m[0].n}`);
