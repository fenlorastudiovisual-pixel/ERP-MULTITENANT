// Inventario multi-almacén del ERP: transferencias, ajustes y conteos físicos.
// Toda mutación ocurre en UNA transacción con contexto RLS y deja movimiento,
// capas FIFO y, cuando corresponde, asiento en el libro contable único.

import { runAsTenant } from "../db.js";
import { writeAudit } from "./permissions.js";

const uuid = (value) => (value ? String(value) : null);
const qty = (value) => Number(value);
const reasonOf = (value) => String(value || "").trim().slice(0, 200) || "Sin motivo";
const year = () => String(new Date().getUTCFullYear());

/** Transferencia entre almacenes. No genera asiento: el activo no cambia de dueño. */
export async function transferStock(ctx, { itemId, fromWarehouseId, toWarehouseId, quantity, reason }) {
  const tenantId = ctx.identity.tenant_id;
  const actorId = uuid(ctx.identity.user_id);
  const amount = qty(quantity);
  if (!itemId || !fromWarehouseId || !toWarehouseId) throw Object.assign(new Error("Faltan datos de la transferencia"), { status: 400 });
  if (fromWarehouseId === toWarehouseId) throw Object.assign(new Error("Los almacenes de origen y destino deben ser distintos"), { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0) throw Object.assign(new Error("La cantidad debe ser mayor que cero"), { status: 400 });

  const rows = await runAsTenant(tenantId, (tx) => tx`
    with seq as (
      insert into public.sequences (tenant_id, doc_type, prefix, period, next_value)
      values (${tenantId}::uuid, 'inventory_movement', 'IM', ${year()}, 2)
      on conflict (tenant_id, doc_type, prefix, period)
      do update set next_value = public.sequences.next_value + 1, updated_at = now()
      returning next_value - 1 as num
    ),
    locked as (
      select quantity from public.stock_balances
      where tenant_id = ${tenantId}::uuid and warehouse_id = ${uuid(fromWarehouseId)}::uuid
        and item_id = ${uuid(itemId)}::uuid
      for update
    ),
    src as (
      insert into public.stock_balances
        (tenant_id, warehouse_id, item_id, quantity, reserved, average_cost, last_cost)
      values (${tenantId}::uuid, ${uuid(fromWarehouseId)}::uuid, ${uuid(itemId)}::uuid,
              0, 0, 0, 0)
      on conflict (tenant_id, warehouse_id, item_id) do update set
        quantity = public.stock_balances.quantity + ${-amount},
        updated_at = now()
      returning quantity, average_cost, last_cost
    ),
    dst as (
      insert into public.stock_balances
        (tenant_id, warehouse_id, item_id, quantity, reserved, average_cost, last_cost)
      select ${tenantId}::uuid, ${uuid(toWarehouseId)}::uuid, ${uuid(itemId)}::uuid,
             ${amount}, 0, src.average_cost, src.last_cost
      from src
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
      returning quantity, average_cost
    ),
    mov_out as (
      insert into public.inventory_movements
        (id, tenant_id, number, movement_type, item_id, from_warehouse_id, to_warehouse_id,
         quantity, unit_cost, total_cost, balance_after, reason, reference_type, created_by)
      select gen_random_uuid(), ${tenantId}::uuid,
             'IM-' || lpad(seq.num::text, 6, '0') || '-O', 'transfer_out',
             ${uuid(itemId)}::uuid, ${uuid(fromWarehouseId)}::uuid, ${uuid(toWarehouseId)}::uuid,
             ${amount}, src.average_cost, round(${amount} * src.average_cost, 2),
             src.quantity, ${reasonOf(reason)}, 'transfer', ${actorId}::uuid
      from seq cross join src
      returning id
    ),
    mov_in as (
      insert into public.inventory_movements
        (id, tenant_id, number, movement_type, item_id, from_warehouse_id, to_warehouse_id,
         quantity, unit_cost, total_cost, balance_after, reason, reference_type, created_by)
      select gen_random_uuid(), ${tenantId}::uuid,
             'IM-' || lpad(seq.num::text, 6, '0') || '-I', 'transfer_in',
             ${uuid(itemId)}::uuid, ${uuid(fromWarehouseId)}::uuid, ${uuid(toWarehouseId)}::uuid,
             ${amount}, dst.average_cost, round(${amount} * dst.average_cost, 2),
             dst.quantity, ${reasonOf(reason)}, 'transfer', ${actorId}::uuid
      from seq cross join dst
      returning id
    ),
    layers as (
      select id, remaining_qty, unit_cost, received_at, created_at
      from public.inventory_cost_layers
      where tenant_id = ${tenantId}::uuid and item_id = ${uuid(itemId)}::uuid
        and warehouse_id = ${uuid(fromWarehouseId)}::uuid and remaining_qty > 0
      for update
    ),
    ranked as (
      select id, remaining_qty, unit_cost, received_at,
             coalesce(sum(remaining_qty) over (
               order by received_at, created_at
               rows between unbounded preceding and 1 preceding
             ), 0) as prev_qty
      from layers
    ),
    take as (
      select id, least(remaining_qty, ${amount} - prev_qty) as take_qty, unit_cost, received_at
      from ranked where prev_qty < ${amount}
    ),
    consume as (
      update public.inventory_cost_layers l
      set remaining_qty = l.remaining_qty - t.take_qty,
          consumed_qty = l.consumed_qty + t.take_qty,
          updated_at = now()
      from take t where l.id = t.id
      returning l.id
    ),
    new_layers as (
      insert into public.inventory_cost_layers
        (tenant_id, item_id, warehouse_id, movement_id, quantity, remaining_qty, unit_cost, received_at)
      select ${tenantId}::uuid, ${uuid(itemId)}::uuid, ${uuid(toWarehouseId)}::uuid,
             (select id from mov_in), t.take_qty, t.take_qty, t.unit_cost, t.received_at
      from take t
      returning id
    ),
    guard as (
      select public.erp_assert(
        coalesce((select sum(take_qty) from take), 0) >= ${amount},
        'No hay capas FIFO suficientes para la transferencia'
      ) as ok
    ),
    guard_source as (
      select public.erp_assert(exists (select 1 from locked),
        'No existe saldo en el almacén de origen') as ok
    )
    select 'IM-' || lpad(seq.num::text, 6, '0') as number,
           src.quantity::float as source_balance,
           dst.quantity::float as destination_balance,
           guard.ok
    from seq cross join locked cross join src cross join dst cross join guard cross join guard_source
  `, ctx.identity.role, actorId || "");

  await writeAudit(ctx, "inventory.transfer", "item", itemId, {
    from: fromWarehouseId, to: toWarehouseId, quantity: amount, reason: reasonOf(reason),
  });
  return rows[0] || null;
}

/**
 * Ajuste de inventario con motivo.
 * Los motivos de pérdida/sobrante generan asiento balanceado en el libro único.
 */
export async function adjustStock(ctx, { warehouseId, itemId, quantity, reason, unitCost }) {
  const tenantId = ctx.identity.tenant_id;
  const actorId = uuid(ctx.identity.user_id);
  const delta = qty(quantity);
  if (!warehouseId || !itemId) throw Object.assign(new Error("Faltan datos del ajuste"), { status: 400 });
  if (!Number.isFinite(delta) || delta === 0) throw Object.assign(new Error("La cantidad debe ser distinta de cero"), { status: 400 });

  const motive = reasonOf(reason);
  const negative = delta < 0;
  const amount = Math.abs(delta);
  const loss = /pérdida|perdida|daño|dano|robo|merma|count_loss/i.test(motive);
  const surplus = /sobrante|regularización|regularizacion|count_surplus/i.test(motive);
  const journal = negative ? loss : surplus;
  const debitCode = negative ? "5905" : "1510";
  const creditCode = negative ? "1510" : "4905";

  const rows = await runAsTenant(tenantId, (tx) => tx`
    with seq as (
      insert into public.sequences (tenant_id, doc_type, prefix, period, next_value)
      values (${tenantId}::uuid, 'inventory_movement', 'IM', ${year()}, 2)
      on conflict (tenant_id, doc_type, prefix, period)
      do update set next_value = public.sequences.next_value + 1, updated_at = now()
      returning next_value - 1 as num
    ),
    locked as (
      select quantity, average_cost from public.stock_balances
      where tenant_id = ${tenantId}::uuid and warehouse_id = ${uuid(warehouseId)}::uuid
        and item_id = ${uuid(itemId)}::uuid
      for update
    ),
    cost as (
      select coalesce(nullif(${Number(unitCost) || 0}, 0),
                      (select average_cost from locked),
                      (select cost_price from public.items
                       where tenant_id = ${tenantId}::uuid and id = ${uuid(itemId)}::uuid),
                      0) as unit_cost
    ),
    sb as (
      insert into public.stock_balances
        (tenant_id, warehouse_id, item_id, quantity, reserved, average_cost, last_cost)
      select ${tenantId}::uuid, ${uuid(warehouseId)}::uuid, ${uuid(itemId)}::uuid,
             case when ${delta} > 0 then ${delta} else 0 end,
             0, cost.unit_cost, cost.unit_cost
      from cost
      on conflict (tenant_id, warehouse_id, item_id) do update set
        quantity = public.stock_balances.quantity + ${delta},
        average_cost = case
          when public.stock_balances.quantity + excluded.quantity > 0 and ${delta} > 0
          then round((public.stock_balances.quantity * public.stock_balances.average_cost
                      + excluded.quantity * excluded.average_cost)
                     / (public.stock_balances.quantity + excluded.quantity), 2)
          else public.stock_balances.average_cost end,
        last_cost = excluded.last_cost,
        updated_at = now()
      returning quantity, average_cost
    ),
    mov as (
      insert into public.inventory_movements
        (id, tenant_id, number, movement_type, item_id, from_warehouse_id,
         quantity, unit_cost, total_cost, balance_after, reason, reference_type, created_by)
      select gen_random_uuid(), ${tenantId}::uuid,
             'IM-' || lpad(seq.num::text, 6, '0'), 'adjustment',
             ${uuid(itemId)}::uuid, ${uuid(warehouseId)}::uuid,
             ${amount}, cost.unit_cost, round(${amount} * cost.unit_cost, 2),
             sb.quantity, ${motive}, 'adjustment', ${actorId}::uuid
      from seq cross join cost cross join sb
      returning id
    ),
    layers as (
      select id, remaining_qty, unit_cost, received_at, created_at
      from public.inventory_cost_layers
      where ${negative} and tenant_id = ${tenantId}::uuid
        and item_id = ${uuid(itemId)}::uuid and warehouse_id = ${uuid(warehouseId)}::uuid
        and remaining_qty > 0
      for update
    ),
    ranked as (
      select id, remaining_qty, unit_cost, received_at,
             coalesce(sum(remaining_qty) over (
               order by received_at, created_at
               rows between unbounded preceding and 1 preceding
             ), 0) as prev_qty
      from layers
    ),
    take as (
      select id, least(remaining_qty, ${amount} - prev_qty) as take_qty, unit_cost, received_at
      from ranked where prev_qty < ${amount}
    ),
    consume as (
      update public.inventory_cost_layers l
      set remaining_qty = l.remaining_qty - t.take_qty,
          consumed_qty = l.consumed_qty + t.take_qty,
          updated_at = now()
      from take t where l.id = t.id
      returning l.id
    ),
    insert_layer as (
      insert into public.inventory_cost_layers
        (tenant_id, item_id, warehouse_id, movement_id, quantity, remaining_qty, unit_cost)
      select ${tenantId}::uuid, ${uuid(itemId)}::uuid, ${uuid(warehouseId)}::uuid,
             (select id from mov), ${delta}, ${delta}, cost.unit_cost
      from cost where not ${negative}
      returning id
    ),
    guard as (
      select public.erp_assert(
        not ${negative} or coalesce((select sum(take_qty) from take), 0) >= ${amount},
        'No hay capas FIFO suficientes para el ajuste'
      ) as ok
    ),
    guard_balance as (
      select public.erp_assert(exists (select 1 from locked),
        'No existe saldo para ajustar en ese almacén') as ok
    ),
    je_seq as (
      insert into public.sequences (tenant_id, doc_type, prefix, period, next_value)
      select ${tenantId}::uuid, 'journal', 'AS', ${year()}, 2 where ${journal}
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
             ${motive} || ' · ' || 'IM-' || lpad(seq.num::text, 6, '0'),
             'inventory_adjustment', (select id from mov),
             round(${amount} * cost.unit_cost, 2), round(${amount} * cost.unit_cost, 2),
             'posted', ${actorId}::uuid
      from je_seq cross join seq cross join cost
      returning id, number
    ),
    jel as (
      insert into public.journal_lines
        (id, tenant_id, entry_id, account_id, debit, credit, ref_type, ref_id, line_order)
      select gen_random_uuid(), ${tenantId}::uuid, je.id,
             a.id,
             case when v.nature = 'debit' then round(${amount} * cost.unit_cost, 2) else 0 end,
             case when v.nature = 'credit' then round(${amount} * cost.unit_cost, 2) else 0 end,
             'inventory_adjustment', (select id from mov), v.ord
      from je cross join cost
      cross join lateral (values
        (${debitCode}::text, 'debit'::text, 1),
        (${creditCode}::text, 'credit'::text, 2)
      ) as v(code, nature, ord)
      join public.accounts a on a.tenant_id = ${tenantId}::uuid and a.code = v.code
      returning id
    )
    select 'IM-' || lpad(seq.num::text, 6, '0') as number,
           sb.quantity::float as balance,
           cost.unit_cost::float as unit_cost,
           (select number from je) as journal_number,
           guard.ok
    from seq cross join sb cross join cost cross join guard cross join guard_balance
  `, ctx.identity.role, actorId || "");

  await writeAudit(ctx, "inventory.adjust", "item", itemId, {
    warehouseId, quantity: delta, reason: motive, journal: rows[0]?.journal_number || null,
  });
  return rows[0] || null;
}

/** Conteo físico: aplica diferencias, deja movimientos y asiento por el neto. */
export async function recordCount(ctx, { warehouseId, counts, reason }) {
  const tenantId = ctx.identity.tenant_id;
  const actorId = uuid(ctx.identity.user_id);
  if (!warehouseId) throw Object.assign(new Error("Selecciona un almacén"), { status: 400 });
  if (!Array.isArray(counts) || counts.length === 0) throw Object.assign(new Error("Registra al menos un conteo"), { status: 400 });
  for (const row of counts) {
    if (!row?.itemId || !Number.isFinite(Number(row.countedQty)) || Number(row.countedQty) < 0) {
      throw Object.assign(new Error("Los conteos deben tener ítem y cantidad contada >= 0"), { status: 400 });
    }
  }
  const payload = JSON.stringify(counts.map((row) => ({
    item_id: String(row.itemId), counted_qty: Number(row.countedQty),
  })));
  const motive = reasonOf(reason);

  // El neto y el asiento se resuelven ANTES de insertar el conteo: un UPDATE en
  // otro CTE no vería la fila recién insertada (mismo snapshot de la sentencia).
  const rows = await runAsTenant(tenantId, (tx) => tx`
    with seq_mov as (
      insert into public.sequences (tenant_id, doc_type, prefix, period, next_value)
      values (${tenantId}::uuid, 'inventory_movement', 'IM', ${year()}, 2)
      on conflict (tenant_id, doc_type, prefix, period)
      do update set next_value = public.sequences.next_value + 1, updated_at = now()
      returning next_value - 1 as num
    ),
    seq_count as (
      insert into public.sequences (tenant_id, doc_type, prefix, period, next_value)
      values (${tenantId}::uuid, 'inventory_count', 'IC', ${year()}, 2)
      on conflict (tenant_id, doc_type, prefix, period)
      do update set next_value = public.sequences.next_value + 1, updated_at = now()
      returning next_value - 1 as num
    ),
    count_number as (
      select 'IC-' || lpad(seq_count.num::text, 6, '0') as number from seq_count
    ),
    inputs as (
      select item_id::uuid as item_id, counted_qty::numeric as counted_qty,
             row_number() over ()::int as line_order
      from jsonb_to_recordset(${payload}::jsonb) as x(item_id text, counted_qty numeric)
    ),
    locked as (
      select sb.item_id, sb.quantity, sb.average_cost
      from public.stock_balances sb
      join inputs i on i.item_id = sb.item_id and sb.tenant_id = ${tenantId}::uuid
        and sb.warehouse_id = ${uuid(warehouseId)}::uuid
      for update of sb
    ),
    guard_items as (
      select public.erp_assert((select count(*) from locked) = (select count(*) from inputs),
        'Hay ítems del conteo sin saldo en el almacén seleccionado') as ok
    ),
    net as (
      select coalesce(sum(round((i.counted_qty - l.quantity) * l.average_cost, 2)), 0) as amount
      from inputs i join locked l on l.item_id = i.item_id
    ),
    ids as (
      select gen_random_uuid() as count_id, gen_random_uuid() as journal_id
    ),
    je_seq as (
      insert into public.sequences (tenant_id, doc_type, prefix, period, next_value)
      select ${tenantId}::uuid, 'journal', 'AS', ${year()}, 2
      where exists (select 1 from net where amount <> 0)
      on conflict (tenant_id, doc_type, prefix, period)
      do update set next_value = public.sequences.next_value + 1, updated_at = now()
      returning next_value - 1 as num
    ),
    je as (
      insert into public.journal_entries
        (id, tenant_id, number, entry_date, description, source_type, source_id,
         total_debit, total_credit, status, created_by)
      select ids.journal_id, ${tenantId}::uuid,
             'AS-' || lpad(je_seq.num::text, 6, '0'), current_date,
             'Conteo ' || count_number.number || ' · ' || ${motive},
             'inventory_count', ids.count_id,
             abs(net.amount), abs(net.amount), 'posted', ${actorId}::uuid
      from ids cross join je_seq cross join count_number cross join net
      where net.amount <> 0
      returning id, number
    ),
    cnt as (
      insert into public.inventory_counts
        (id, tenant_id, number, warehouse_id, reason, notes, difference_total,
         journal_number, created_by)
      select ids.count_id, ${tenantId}::uuid, count_number.number,
             ${uuid(warehouseId)}::uuid, ${motive},
             'Conteo aplicado desde el panel ERP', net.amount,
             (select number from je), ${actorId}::uuid
      from ids cross join count_number cross join net cross join guard_items
      returning id, number, difference_total, journal_number
    ),
    lines as (
      insert into public.inventory_count_lines
        (id, tenant_id, count_id, item_id, expected_qty, counted_qty, difference,
         unit_cost, difference_cost, line_order)
      select gen_random_uuid(), ${tenantId}::uuid, cnt.id, i.item_id,
             l.quantity, i.counted_qty, i.counted_qty - l.quantity,
             l.average_cost, round((i.counted_qty - l.quantity) * l.average_cost, 2),
             i.line_order - 1
      from inputs i
      join locked l on l.item_id = i.item_id
      cross join cnt
      returning item_id, difference, difference_cost, unit_cost, line_order
    ),
    applied as (
      update public.stock_balances sb
      set quantity = i.counted_qty, updated_at = now()
      from inputs i
      where sb.tenant_id = ${tenantId}::uuid and sb.warehouse_id = ${uuid(warehouseId)}::uuid
        and sb.item_id = i.item_id and i.counted_qty >= 0
      returning sb.item_id, sb.quantity
    ),
    mov as (
      insert into public.inventory_movements
        (id, tenant_id, number, movement_type, item_id, from_warehouse_id,
         quantity, unit_cost, total_cost, balance_after, reason, reference_type, reference_id, created_by)
      select gen_random_uuid(), ${tenantId}::uuid,
             'IM-' || lpad(seq_mov.num::text, 6, '0') || '-' || lpad(l.line_order::text, 2, '0'),
             'count', l.item_id, ${uuid(warehouseId)}::uuid,
             abs(l.difference), l.unit_cost, abs(l.difference_cost), a.quantity,
             ${motive}, 'inventory_count', (select count_id from ids), ${actorId}::uuid
      from lines l join applied a on a.item_id = l.item_id
      cross join seq_mov
      where l.difference <> 0
      returning id
    ),
    jel as (
      insert into public.journal_lines
        (id, tenant_id, entry_id, account_id, debit, credit, ref_type, ref_id, line_order)
      select gen_random_uuid(), ${tenantId}::uuid, je.id, a.id,
             case when v.nature = 'debit' then abs(net.amount) else 0 end,
             case when v.nature = 'credit' then abs(net.amount) else 0 end,
             'inventory_count', je.id, v.ord
      from je cross join net
      cross join lateral (values
        (case when net.amount > 0 then '1510' else '5905' end, 'debit'::text, 1),
        (case when net.amount > 0 then '4905' else '1510' end, 'credit'::text, 2)
      ) as v(code, nature, ord)
      join public.accounts a on a.tenant_id = ${tenantId}::uuid and a.code = v.code
      returning id
    )
    select cnt.number, cnt.difference_total, cnt.journal_number,
           (select count(*)::int from lines) as lines_count
    from cnt
  `, ctx.identity.role, actorId || "");

  await writeAudit(ctx, "inventory.count", "warehouse", warehouseId, {
    count: rows[0]?.number, lines: rows[0]?.lines_count, reason: motive,
  });
  return rows[0] || null;
}
