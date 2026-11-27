// Compras del ERP: pedidos a proveedor, recepciones, existencias y asiento.
// Las recepciones son el único punto de entrada de stock comprado y alimentan
// el mismo libro contable y el mismo libro de inventario del tenant.

import { runAsTenant } from "../db.js";
import { writeAudit } from "./permissions.js";

const uuid = (value) => (value ? String(value) : null);
const text = (value) => String(value || "").trim().slice(0, 200);
const year = () => String(new Date().getUTCFullYear());

/** Crea un pedido de compra. El proveedor debe ser partner.kind supplier|both. */
export async function createPurchaseOrder(ctx, { supplierId, warehouseId, lines, expectedDate, notes }) {
  const tenantId = ctx.identity.tenant_id;
  const actorId = uuid(ctx.identity.user_id);
  if (!supplierId || !warehouseId) throw Object.assign(new Error("Proveedor y almacén son obligatorios"), { status: 400 });
  if (!Array.isArray(lines) || lines.length === 0) throw Object.assign(new Error("Agrega al menos una línea"), { status: 400 });

  const payload = JSON.stringify(lines.map((row) => ({
    item_id: String(row.itemId),
    quantity: Number(row.quantity),
    unit_cost: Number(row.unitCost),
    tax_rate: Number(row.taxRate ?? 0.19),
  })));

  const rows = await runAsTenant(tenantId, (tx) => tx`
    with seq as (
      insert into public.sequences (tenant_id, doc_type, prefix, period, next_value)
      values (${tenantId}::uuid, 'purchase_order', 'OC', ${year()}, 2)
      on conflict (tenant_id, doc_type, prefix, period)
      do update set next_value = public.sequences.next_value + 1, updated_at = now()
      returning next_value - 1 as num
    ),
    inputs as (
      select item_id::uuid as item_id, quantity::numeric as quantity,
             unit_cost::numeric as unit_cost, tax_rate::numeric as tax_rate,
             row_number() over ()::int as line_order
      from jsonb_to_recordset(${payload}::jsonb) as x
        (item_id text, quantity numeric, unit_cost numeric, tax_rate numeric)
    ),
    valid as (
      select i.*, round(i.quantity * i.unit_cost, 2) as subtotal,
             round(i.quantity * i.unit_cost * i.tax_rate, 2) as tax_amount
      from inputs i
      join public.items it on it.id = i.item_id and it.tenant_id = ${tenantId}::uuid
      where i.quantity > 0 and i.unit_cost >= 0
    ),
    totals as (
      select coalesce(sum(subtotal), 0) as subtotal, coalesce(sum(tax_amount), 0) as tax,
             coalesce(sum(subtotal + tax_amount), 0) as total
      from valid
    ),
    guard as (
      select public.erp_assert((select count(*) from valid) = (select count(*) from inputs),
        'Hay líneas de compra no válidas') as ok
    ),
    ord as (
      insert into public.purchase_orders
        (id, tenant_id, number, supplier_id, warehouse_id, status, subtotal, tax, total,
         expected_date, notes, created_by)
      select gen_random_uuid(), ${tenantId}::uuid,
             'OC-' || lpad(seq.num::text, 6, '0'), ${uuid(supplierId)}::uuid,
             ${uuid(warehouseId)}::uuid, 'draft', totals.subtotal, totals.tax, totals.total,
             ${expectedDate || null}::date, ${text(notes) || null}, ${actorId}::uuid
      from seq cross join totals cross join guard
      where (select ok from guard)
      returning id, number, total
    ),
    lines as (
      insert into public.purchase_order_lines
        (id, tenant_id, order_id, item_id, quantity, unit_cost, tax_rate, tax_amount, total, line_order)
      select gen_random_uuid(), ${tenantId}::uuid, ord.id, v.item_id, v.quantity,
             v.unit_cost, v.tax_rate, v.tax_amount, v.subtotal + v.tax_amount, v.line_order - 1
      from ord cross join valid v
      returning id
    )
    select ord.id::text as id, ord.number, ord.total::float as total,
           (select count(*)::int from lines) as lines
    from ord
  `, ctx.identity.role, actorId || "");

  await writeAudit(ctx, "purchase.order.create", "purchase_order", rows[0]?.id, {
    supplierId, warehouseId, lines: rows[0]?.lines,
  });
  return rows[0] || null;
}

/** Aprueba un pedido para permitir su recepción. */
export async function approvePurchaseOrder(ctx, orderId) {
  const tenantId = ctx.identity.tenant_id;
  const rows = await runAsTenant(tenantId, (tx) => tx`
    update public.purchase_orders
    set status = 'approved', updated_at = now()
    where tenant_id = ${tenantId}::uuid and id = ${uuid(orderId)}::uuid and status = 'draft'
    returning id::text, number, status
  `, ctx.identity.role, uuid(ctx.identity.user_id) || "");
  if (rows[0]) await writeAudit(ctx, "purchase.order.approve", "purchase_order", orderId, {});
  return rows[0] || null;
}

/**
 * Registra una recepción. Si no se envían líneas, recibe todo lo pendiente.
 * Genera entrada de stock, capa FIFO, actualización de promedio y asiento:
 * débito Inventario + IVA discriminado / crédito Proveedores.
 */
export async function receivePurchaseOrder(ctx, { orderId, lines, notes }) {
  const tenantId = ctx.identity.tenant_id;
  const actorId = uuid(ctx.identity.user_id);
  if (!orderId) throw Object.assign(new Error("Selecciona un pedido de compra"), { status: 400 });

  const requested = Array.isArray(lines) && lines.length
    ? lines.map((row) => ({
        line_id: String(row.lineId),
        quantity: Number(row.quantity),
        unit_cost: Number(row.unitCost) || null,
      }))
    : null;
  const payload = JSON.stringify(requested || []);

  const rows = await runAsTenant(tenantId, (tx) => tx`
    with seq_r as (
      insert into public.sequences (tenant_id, doc_type, prefix, period, next_value)
      values (${tenantId}::uuid, 'purchase_receipt', 'RC', ${year()}, 2)
      on conflict (tenant_id, doc_type, prefix, period)
      do update set next_value = public.sequences.next_value + 1, updated_at = now()
      returning next_value - 1 as num
    ),
    seq_m as (
      insert into public.sequences (tenant_id, doc_type, prefix, period, next_value)
      values (${tenantId}::uuid, 'inventory_movement', 'IM', ${year()}, 2)
      on conflict (tenant_id, doc_type, prefix, period)
      do update set next_value = public.sequences.next_value + 1, updated_at = now()
      returning next_value - 1 as num
    ),
    ord as (
      select * from public.purchase_orders
      where tenant_id = ${tenantId}::uuid and id = ${uuid(orderId)}::uuid
        and status in ('approved', 'partially_received')
      for update
    ),
    requested as (
      select line_id::uuid as line_id, quantity::numeric as quantity,
             unit_cost::numeric as unit_cost
      from jsonb_to_recordset(${payload}::jsonb) as x
        (line_id text, quantity numeric, unit_cost numeric)
    ),
    valid as (
      select pol.id as line_id, pol.item_id, pol.tax_rate,
             case when ${requested === null} then pol.quantity - pol.received_qty
                  else r.quantity end as quantity,
             coalesce(r.unit_cost, pol.unit_cost) as unit_cost,
             row_number() over (order by pol.line_order)::int as line_order
      from ord
      join public.purchase_order_lines pol on pol.order_id = ord.id and pol.tenant_id = ${tenantId}::uuid
      left join requested r on r.line_id = pol.id
      where pol.received_qty < pol.quantity
        and (${requested === null} or r.line_id is not null)
    ),
    checked as (
      select v.*, round(v.quantity * v.unit_cost, 2) as subtotal,
             round(v.quantity * v.unit_cost * v.tax_rate, 2) as tax_amount
      from valid v
      where v.quantity > 0
        and v.quantity <= (select quantity - received_qty from public.purchase_order_lines
                           where id = v.line_id and tenant_id = ${tenantId}::uuid)
    ),
    totals as (
      select coalesce(sum(subtotal), 0) as subtotal, coalesce(sum(tax_amount), 0) as tax,
             coalesce(sum(subtotal + tax_amount), 0) as total
      from checked
    ),
    guard as (
      select public.erp_assert((select count(*) from checked) = (select count(*) from valid)
        and (select count(*) from checked) > 0, 'La cantidad a recibir no es válida') as ok
    ),
    rec as (
      insert into public.purchase_receipts
        (id, tenant_id, number, purchase_order_id, supplier_id, warehouse_id,
         subtotal, tax, total, notes, created_by)
      select gen_random_uuid(), ${tenantId}::uuid,
             'RC-' || lpad(seq_r.num::text, 6, '0'), ord.id, ord.supplier_id,
             ord.warehouse_id, totals.subtotal, totals.tax, totals.total,
             ${text(notes) || null}, ${actorId}::uuid
      from seq_r cross join ord cross join totals cross join guard
      where (select ok from guard)
      returning id, number, subtotal, tax, total
    ),
    rec_lines as (
      insert into public.purchase_receipt_lines
        (id, tenant_id, receipt_id, order_line_id, item_id, quantity, unit_cost,
         tax_rate, tax_amount, total, line_order)
      select gen_random_uuid(), ${tenantId}::uuid, rec.id, c.line_id, c.item_id,
             c.quantity, c.unit_cost, c.tax_rate, c.tax_amount,
             c.subtotal + c.tax_amount, c.line_order - 1
      from rec cross join checked c
      returning id
    ),
    upd_lines as (
      update public.purchase_order_lines pol
      set received_qty = pol.received_qty + c.quantity
      from checked c
      where pol.id = c.line_id and pol.tenant_id = ${tenantId}::uuid
      returning pol.id
    ),
    stock_source as (
      select c.item_id, sum(c.quantity) as quantity,
             round(sum(c.quantity * c.unit_cost) / nullif(sum(c.quantity), 0), 2) as unit_cost
      from checked c
      group by c.item_id
    ),
    sb as (
      insert into public.stock_balances
        (tenant_id, warehouse_id, item_id, quantity, reserved, average_cost, last_cost)
      select ${tenantId}::uuid, ord.warehouse_id, s.item_id, s.quantity, 0, s.unit_cost, s.unit_cost
      from stock_source s cross join ord
      on conflict (tenant_id, warehouse_id, item_id) do update set
        quantity = public.stock_balances.quantity + excluded.quantity,
        average_cost = case
          when public.stock_balances.quantity + excluded.quantity > 0
          then round((public.stock_balances.quantity * public.stock_balances.average_cost
                      + excluded.quantity * excluded.average_cost)
                     / (public.stock_balances.quantity + excluded.quantity), 2)
          else public.stock_balances.average_cost end,
        last_cost = excluded.last_cost,
        updated_at = now()
      returning warehouse_id, item_id, quantity, average_cost
    ),
    mov as (
      insert into public.inventory_movements
        (id, tenant_id, number, movement_type, item_id, to_warehouse_id, quantity,
         unit_cost, total_cost, balance_after, reason, reference_type, reference_id,
         source_line_id, created_by)
      select gen_random_uuid(), ${tenantId}::uuid,
             'IM-' || lpad(seq_m.num::text, 6, '0') || '-' || lpad(c.line_order::text, 2, '0'),
             'purchase_in', c.item_id, ord.warehouse_id, c.quantity, c.unit_cost,
             c.subtotal, sb.quantity, 'Recepción ' || rec.number,
             'purchase_receipt', rec.id, c.line_id, ${actorId}::uuid
      from seq_m cross join ord cross join rec cross join checked c
      join sb on sb.item_id = c.item_id and sb.warehouse_id = ord.warehouse_id
      returning id, source_line_id
    ),
    layers as (
      insert into public.inventory_cost_layers
        (tenant_id, item_id, warehouse_id, movement_id, quantity, remaining_qty, unit_cost)
      select ${tenantId}::uuid, c.item_id, ord.warehouse_id, m.id, c.quantity, c.quantity, c.unit_cost
      from checked c cross join ord cross join rec cross join seq_m
      join mov m on m.source_line_id = c.line_id
      returning id
    ),
    je_seq as (
      insert into public.sequences (tenant_id, doc_type, prefix, period, next_value)
      values (${tenantId}::uuid, 'journal', 'AS', ${year()}, 2)
      on conflict (tenant_id, doc_type, prefix, period)
      do update set next_value = public.sequences.next_value + 1, updated_at = now()
      returning next_value - 1 as num
    ),
    je as (
      insert into public.journal_entries
        (id, tenant_id, number, entry_date, description, source_type, source_id,
         total_debit, total_credit, status, created_by)
      select gen_random_uuid(), ${tenantId}::uuid,
             'AS-' || lpad(je_seq.num::text, 6, '0'), current_date,
             'Recepción ' || rec.number || ' · ' || ord.number,
             'purchase_receipt', rec.id, rec.total, rec.total, 'posted', ${actorId}::uuid
      from je_seq cross join rec cross join ord
      returning id, number
    ),
    jel as (
      insert into public.journal_lines
        (id, tenant_id, entry_id, account_id, debit, credit, partner_id,
         ref_type, ref_id, line_order)
      select gen_random_uuid(), ${tenantId}::uuid, je.id, a.id,
             case when v.nature = 'debit' then v.amount else 0 end,
             case when v.nature = 'credit' then v.amount else 0 end,
             ord.supplier_id, 'purchase_receipt', rec.id, v.ord
      from je cross join rec cross join ord
      cross join lateral (values
        ('1510'::text, rec.subtotal, 'debit'::text, 1),
        ('1355'::text, rec.tax, 'debit'::text, 2),
        ('2405'::text, rec.total, 'credit'::text, 3)
      ) as v(code, amount, nature, ord)
      join public.accounts a on a.tenant_id = ${tenantId}::uuid and a.code = v.code
      returning id
    ),
    upd_order as (
      update public.purchase_orders o
      set received_total = o.received_total + rec.total,
          status = case
            when not exists (select 1 from public.purchase_order_lines pol
                             where pol.order_id = o.id and pol.tenant_id = ${tenantId}::uuid
                               and pol.received_qty < pol.quantity)
            then 'received' else 'partially_received' end,
          updated_at = now()
      from rec cross join ord
      where o.id = ord.id and o.tenant_id = ${tenantId}::uuid
      returning o.status
    ),
    upd_receipt as (
      update public.purchase_receipts r
      set journal_number = (select number from je)
      where r.id = (select id from rec)
      returning journal_number
    )
    select rec.number, rec.total::float as total,
           (select number from je) as journal_number,
           (select status from upd_order) as order_status,
           (select count(*)::int from rec_lines) as lines,
           guard.ok
    from rec cross join guard
  `, ctx.identity.role, actorId || "");

  await writeAudit(ctx, "purchase.receive", "purchase_receipt", rows[0]?.number, {
    orderId, total: rows[0]?.total, journal: rows[0]?.journal_number,
  });
  return rows[0] || null;
}
