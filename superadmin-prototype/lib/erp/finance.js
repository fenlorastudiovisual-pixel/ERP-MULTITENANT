// Servicios financieros del ERP. Toda operación que toca dinero o stock
// se ejecuta en UNA transacción y genera su asiento contable.
// La API solo valida y autoriza; las reglas viven aquí.

import { runAsTenant } from "../db.js";

const asUuid = (value) => (value ? String(value) : null);

/**
 * Emite una factura operativa desde una orden confirmada/entregada.
 * Genera: número atómico, líneas, cartera, asiento balanceado y marca la orden.
 */
export async function issueInvoiceFromOrder(ctx, orderId) {
  const tenantId = ctx.identity.tenant_id;
  const actorId = asUuid(ctx.identity.user_id);
  const year = String(new Date().getUTCFullYear());
  const rows = await runAsTenant(tenantId, (tx) => tx`
    with ord as (
      select * from public.sales_orders o
      where tenant_id = ${tenantId}::uuid
        and id = ${asUuid(orderId)}::uuid
        and status in ('confirmed', 'delivered')
        and exists (
          select 1 from public.sales_order_lines sol
          where sol.order_id = o.id and sol.tenant_id = ${tenantId}::uuid
        )
      for update of o
    ),
    locked_seq as (
      insert into public.sequences (tenant_id, doc_type, prefix, period, next_value)
      select ${tenantId}::uuid, 'invoice', 'FV', ${year}, 2 from ord
      on conflict (tenant_id, doc_type, prefix, period)
      do update set next_value = public.sequences.next_value + 1, updated_at = now()
      returning next_value - 1 as num
    ),
    inv as (
      insert into public.invoices_ops
        (id, tenant_id, number, prefix, partner_id, sales_order_id, issue_date, due_date,
         currency, subtotal, discount, tax, total, balance, status, notes, created_by)
      select gen_random_uuid(), ${tenantId}::uuid,
             'FV-' || lpad(locked_seq.num::text, 6, '0'), 'FV',
             o.partner_id, o.id, current_date,
             current_date + make_interval(days => coalesce(p.payment_terms_days, 0)),
             o.currency, o.subtotal, o.discount, o.tax, o.total, o.total, 'issued',
             'Emitida desde ' || o.number, ${actorId}::uuid
      from ord o
      cross join locked_seq
      left join public.partners p on p.id = o.partner_id and p.tenant_id = ${tenantId}::uuid
      returning *
    ),
    lines as (
      insert into public.invoice_lines
        (id, tenant_id, invoice_id, item_id, description, quantity, unit_price,
         discount, tax_rate, tax_amount, total, line_order)
      select gen_random_uuid(), ${tenantId}::uuid, inv.id, sol.item_id, i.name,
             sol.quantity, sol.unit_price, sol.discount, coalesce(i.tax_rate, 0.19),
             round((sol.unit_price - sol.discount) * sol.quantity * coalesce(i.tax_rate, 0.19), 2),
             sol.total, sol.line_order
      from inv
      join public.sales_order_lines sol on sol.order_id = inv.sales_order_id and sol.tenant_id = ${tenantId}::uuid
      join public.items i on i.id = sol.item_id and i.tenant_id = ${tenantId}::uuid
      returning id
    ),
    recv as (
      insert into public.receivables
        (id, tenant_id, invoice_id, partner_id, amount, balance, due_date, status)
      select gen_random_uuid(), ${tenantId}::uuid, inv.id, inv.partner_id,
             inv.total, inv.total, inv.due_date, 'open'
      from inv
      returning id
    ),
    cogs as (
      select coalesce(sum(sol.cost_unit * sol.quantity), 0) as amount
      from inv
      join public.sales_order_lines sol on sol.order_id = inv.sales_order_id and sol.tenant_id = ${tenantId}::uuid
    ),
    period as (
      insert into public.periods (tenant_id, year, month, status)
      select ${tenantId}::uuid, extract(year from current_date)::int,
             extract(month from current_date)::int, 'open'
      on conflict (tenant_id, year, month) do nothing
      returning 1
    ),
    je_seq as (
      insert into public.sequences (tenant_id, doc_type, prefix, period, next_value)
      select ${tenantId}::uuid, 'journal', 'AS', ${year}, 2 from inv
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
             'Factura ' || inv.number, 'invoice', inv.id,
             inv.total + cogs.amount, inv.total + cogs.amount, 'posted', ${actorId}::uuid
      from inv cross join je_seq cross join cogs
      returning *
    ),
    jel as (
      insert into public.journal_lines
        (id, tenant_id, entry_id, account_id, debit, credit, partner_id, ref_type, ref_id, line_order)
      select gen_random_uuid(), ${tenantId}::uuid, je.id, a.id,
             case when v.nature = 'debit' then v.amount else 0 end,
             case when v.nature = 'credit' then v.amount else 0 end,
             inv.partner_id, 'invoice', inv.id, v.ord
      from je
      join inv on inv.id = je.source_id
      cross join cogs
      cross join lateral (values
        ('1305'::text, inv.total, 'debit'::text, 1),
        ('4135'::text, inv.subtotal - inv.discount, 'credit'::text, 2),
        ('4750'::text, inv.tax, 'credit'::text, 3),
        ('5105'::text, cogs.amount, 'debit'::text, 4),
        ('1510'::text, cogs.amount, 'credit'::text, 5)
      ) as v(code, amount, nature, ord)
      join public.accounts a on a.tenant_id = ${tenantId}::uuid and a.code = v.code
      returning id
    ),
    done as (
      update public.sales_orders set status = 'invoiced', updated_at = now()
      where id = ${asUuid(orderId)}::uuid and tenant_id = ${tenantId}::uuid
      returning id
    )
    select inv.id::text as id, inv.number, inv.total::float as total,
           inv.balance::float as balance, inv.status,
           je.number as journal_number
    from inv, je
  `, ctx.identity.role, asUuid(ctx.identity.user_id) || "");
  return rows[0] || null;
}

/**
 * Registra un pago y lo aplica a una o más cuentas por cobrar.
 * Genera el asiento débito banco/caja, crédito clientes.
 */
export async function recordPayment(ctx, { partnerId, amount, method, reference, allocations }) {
  const tenantId = ctx.identity.tenant_id;
  const actorId = asUuid(ctx.identity.user_id);
  const year = String(new Date().getUTCFullYear());
  const accountCode = method === "cash" ? "1105" : "1110";
  const payload = JSON.stringify((allocations || []).map((item) => ({
    receivable_id: String(item.receivableId), amount: Number(item.amount),
  })));

  const rows = await runAsTenant(tenantId, (tx) => tx`
    with locked_seq as (
      insert into public.sequences (tenant_id, doc_type, prefix, period, next_value)
      values (${tenantId}::uuid, 'payment', 'PA', ${year}, 2)
      on conflict (tenant_id, doc_type, prefix, period)
      do update set next_value = public.sequences.next_value + 1, updated_at = now()
      returning next_value - 1 as num
    ),
    pay as (
      insert into public.payments_in
        (id, tenant_id, number, partner_id, payment_date, method, amount, unapplied,
         reference, status, created_by)
      select gen_random_uuid(), ${tenantId}::uuid,
             'PA-' || lpad(locked_seq.num::text, 6, '0'), ${asUuid(partnerId)}::uuid,
             current_date, ${method}, ${Number(amount)}, ${Number(amount)},
             ${reference || null}, 'registered', ${actorId}::uuid
      from locked_seq
      returning *
    ),
    alloc as (
      insert into public.payment_allocations (id, tenant_id, payment_id, receivable_id, amount)
      select gen_random_uuid(), ${tenantId}::uuid, pay.id, a.receivable_id::uuid, a.amount
      from pay
      cross join jsonb_to_recordset(${payload}::jsonb) as a(receivable_id text, amount numeric)
      returning id, receivable_id, amount
    ),
    upd_recv as (
      update public.receivables r
      set balance = r.balance - a.amount,
          status = case when r.balance - a.amount <= 0 then 'paid' else 'partial' end
      from alloc a
      where r.id = a.receivable_id and r.tenant_id = ${tenantId}::uuid
        and r.balance >= a.amount
      returning r.id, a.amount
    ),
    valid_alloc as (
      select a.id, a.receivable_id, a.amount
      from alloc a
      join upd_recv u on u.id = a.receivable_id and u.amount = a.amount
    ),
    drop_invalid as (
      delete from public.payment_allocations a
      where a.id in (select id from alloc)
        and a.id not in (select id from valid_alloc)
      returning a.id
    ),
    upd_inv as (
      update public.invoices_ops i
      set balance = i.balance - v.amount,
          status = case when i.balance - v.amount <= 0 then 'paid' else 'partial' end,
          updated_at = now()
      from valid_alloc v
      join public.receivables r on r.id = v.receivable_id and r.tenant_id = ${tenantId}::uuid
      where i.id = r.invoice_id and i.tenant_id = ${tenantId}::uuid
      returning i.id
    ),
    unapplied as (
      update public.payments_in p
      set unapplied = p.amount - (select coalesce(sum(v.amount), 0) from valid_alloc v)
      where p.id = (select id from pay)
      returning unapplied
    ),
    je_seq as (
      insert into public.sequences (tenant_id, doc_type, prefix, period, next_value)
      values (${tenantId}::uuid, 'journal', 'AS', ${year}, 2)
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
             'Pago ' || pay.number, 'payment', pay.id,
             pay.amount,
             pay.amount,
             'posted', ${actorId}::uuid
      from pay cross join je_seq
      returning *
    ),
    jel as (
      insert into public.journal_lines
        (id, tenant_id, entry_id, account_id, debit, credit, partner_id, ref_type, ref_id, line_order)
      select gen_random_uuid(), ${tenantId}::uuid, je.id, a.id,
             case when v.nature = 'debit' then v.amount else 0 end,
             case when v.nature = 'credit' then v.amount else 0 end,
             pay.partner_id, 'payment', pay.id, v.ord
      from je
      join pay on pay.id = je.source_id
      cross join lateral (values
        (${accountCode}::text, pay.amount, 'debit'::text, 1),
        ('1305'::text, (select coalesce(sum(v.amount), 0) from valid_alloc v), 'credit'::text, 2),
        ('2105'::text, pay.amount - (select coalesce(sum(v.amount), 0) from valid_alloc v), 'credit'::text, 3)
      ) as v(code, amount, nature, ord)
      join public.accounts a on a.tenant_id = ${tenantId}::uuid and a.code = v.code
      returning id
    )
    select pay.id::text as id, pay.number, pay.amount::float as amount,
           (pay.amount - (select coalesce(sum(v.amount), 0) from valid_alloc v))::float as unapplied,
           pay.method, pay.partner_id::text as partner_id,
           je.number as journal_number,
           (select count(*)::int from drop_invalid) as dropped_allocations
    from pay, je
  `, ctx.identity.role, asUuid(ctx.identity.user_id) || "");
  return rows[0] || null;
}
