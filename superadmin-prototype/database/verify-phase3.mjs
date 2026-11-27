// Prueba real de la Fase 3 contra t17_sandbox. Nunca escribe en t16.
// Uso: npm run db:verify-phase3  (después de npm run db:sandbox)

import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

function loadEnv() {
  const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

loadEnv();
const sql = neon(process.env.DATABASE_URL);
const [[sandbox], [real]] = await Promise.all([
  sql`select id::text from public.tenants where source_key = 't17_sandbox'`,
  sql`select id::text from public.tenants where source_key = 't16'`,
]);
if (!sandbox?.id || !real?.id) throw new Error("No se encontraron los tenants t17_sandbox / t16");
const T = sandbox.id;
const R = real.id;

const [owner] = await sql`
  select user_id::text from public.tenant_members
  where tenant_id = ${T}::uuid and role = 'owner' and active limit 1
`;
const ctx = { identity: { tenant_id: T, role: "owner", user_id: owner?.user_id || "" } };

const { transferStock, adjustStock, recordCount } = await import("../lib/erp/inventory.js");
const { createPurchaseOrder, approvePurchaseOrder, receivePurchaseOrder } = await import("../lib/erp/purchases.js");

const [wh] = await sql`
  select
    md5('principal:' || ${T}::text)::text as principal,
    md5('secundario:' || ${T}::text)::text as secondary
`;
const [item] = await sql`
  select i.id::text as id, i.name, i.cost_price::float as cost
  from public.items i
  join public.stock_balances sb on sb.item_id = i.id
    and sb.warehouse_id = md5('principal:' || ${T}::text)::uuid
  where i.tenant_id = ${T}::uuid and sb.quantity >= 10
  order by i.name limit 1
`;
if (!item?.id) throw new Error("No hay ítems con stock suficiente para probar");
console.log(`Ítem de prueba: ${item.name} (${item.id})`);

const transfer = await transferStock(ctx, {
  itemId: item.id, fromWarehouseId: wh.principal, toWarehouseId: wh.secondary,
  quantity: 5, reason: "Prueba de transferencia entre almacenes",
});
console.log("Transferencia:", transfer.number);

const adjust = await adjustStock(ctx, {
  warehouseId: wh.principal, itemId: item.id, quantity: -2, reason: "Merma por daño",
});
console.log("Ajuste:", adjust.number, "asiento:", adjust.journal_number || "sin asiento");

const [current] = await sql`
  select quantity::float as quantity from public.stock_balances
  where tenant_id = ${T}::uuid and warehouse_id = ${wh.principal}::uuid and item_id = ${item.id}::uuid
`;
const counted = Math.max(0, Number(current.quantity) - 1);
const count = await recordCount(ctx, {
  warehouseId: wh.principal,
  counts: [{ itemId: item.id, countedQty: counted }],
  reason: "Conteo físico de prueba",
});
console.log("Conteo:", count.number, "diferencia:", count.difference_total, "asiento:", count.journal_number || "sin asiento");

const [supplier] = await sql`
  select id::text as id from public.partners
  where tenant_id = ${T}::uuid and kind = 'supplier' and active order by name limit 1
`;
const order = await createPurchaseOrder(ctx, {
  supplierId: supplier.id, warehouseId: wh.principal,
  lines: [{ itemId: item.id, quantity: 3, unitCost: 10000, taxRate: 0.19 }],
  notes: "Pedido de prueba Fase 3",
});
await approvePurchaseOrder(ctx, order.id);
const receipt = await receivePurchaseOrder(ctx, { orderId: order.id });
console.log("Compra:", order.number, "→", receipt.number, "asiento:", receipt.journal_number);

const [verify] = await sql`
  select
    (select count(*)::int from public.inventory_movements where tenant_id = ${T}::uuid) as movements,
    (select count(*)::int from public.inventory_counts where tenant_id = ${T}::uuid) as counts,
    (select count(*)::int from public.purchase_orders where tenant_id = ${T}::uuid) as orders,
    (select count(*)::int from public.purchase_receipts where tenant_id = ${T}::uuid) as receipts,
    (select count(*)::int from public.journal_entries where tenant_id = ${T}::uuid) as journal_entries,
    (select count(*)::int from public.journal_entries je
       where je.tenant_id = ${T}::uuid
         and abs(je.total_debit - je.total_credit) > 0.01) as unbalanced,
    (select count(*)::int from public.journal_lines jl
       where jl.tenant_id = ${T}::uuid
         and (jl.debit < 0 or jl.credit < 0 or (jl.debit > 0 and jl.credit > 0))) as bad_lines,
    (select quantity::float from public.stock_balances
       where tenant_id = ${T}::uuid and warehouse_id = ${wh.secondary}::uuid
         and item_id = ${item.id}::uuid) as secondary_qty,
    (select count(*)::int from public.invoices_ops where tenant_id = ${R}::uuid) as real_invoices,
    (select count(*)::int from public.journal_entries where tenant_id = ${R}::uuid) as real_journal,
    (select count(*)::int from public.products where tenant_id = ${R}::uuid) as real_products,
    (select count(*)::int from public.customers where tenant_id = ${R}::uuid) as real_customers,
    (select count(*)::int from public.orders where tenant_id = ${R}::uuid) as real_orders,
    (select count(*)::int from public.order_items where tenant_id = ${R}::uuid) as real_items,
    (select count(*)::int from public.stock_movements where tenant_id = ${R}::uuid) as real_movements
`;
console.log("Verificación sandbox:", JSON.stringify({
  movements: verify.movements, counts: verify.counts, orders: verify.orders,
  receipts: verify.receipts, journal_entries: verify.journal_entries,
  unbalanced: verify.unbalanced, bad_lines: verify.bad_lines, secondary_qty: verify.secondary_qty,
}));
console.log("Samjuro real (solo lectura):", JSON.stringify({
  products: verify.real_products, customers: verify.real_customers, orders: verify.real_orders,
  items: verify.real_items, movements: verify.real_movements,
  invoices: verify.real_invoices, journal: verify.real_journal,
}));
if (verify.unbalanced || verify.bad_lines || Number(verify.secondary_qty) !== 5) {
  throw new Error("Falló la validación de inventario/compras");
}
if (verify.real_products !== 1240 || verify.real_customers !== 480 || verify.real_orders !== 620
  || verify.real_items !== 2168 || verify.real_movements !== 1980 || verify.real_invoices || verify.real_journal) {
  throw new Error("Samjuro cambió. Revisar de inmediato.");
}
console.log("OK. Fase 3 validada. Samjuro no fue modificado.");
