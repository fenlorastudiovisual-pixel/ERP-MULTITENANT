-- Ultra ERP — configuración mínima del piloto. NO APLICADA AUTOMÁTICAMENTE.
-- Requiere que database/ultra-erp-core.sql ya esté aplicado.
-- No contiene DELETE, TRUNCATE ni DDL. Solo INSERT ... ON CONFLICT DO NOTHING.
-- No incluye tasas de cambio ni importes: con ambos libros en COP no se inventa FX.
-- Revisa los UUIDs antes de ejecutar en cualquier entorno.

-- Tenant piloto t17_sandbox / Samjuro.
-- Entity y libros usan UUIDs fijos para que el seed sea repetible.
insert into public.erp_entities (id, tenant_id, kind, code, name, status)
values (
  '10000000-0000-4000-8000-000000000001',
  '76fa9913-4ee3-40c4-bd43-ff300ad78d61',
  'company', 'SAMJURO', 'Samjuro', 'active'
)
on conflict (id) do nothing;

insert into public.erp_ledgers
  (id, tenant_id, entity_id, code, kind, currency, is_base, status)
values
  ('10000000-0000-4000-8000-000000000002', '76fa9913-4ee3-40c4-bd43-ff300ad78d61',
   '10000000-0000-4000-8000-000000000001', 'local', 'operational', 'COP', true, 'active'),
  ('10000000-0000-4000-8000-000000000003', '76fa9913-4ee3-40c4-bd43-ff300ad78d61',
   '10000000-0000-4000-8000-000000000001', 'group', 'group', 'COP', false, 'active')
on conflict (id) do nothing;

insert into public.erp_posting_rules
  (id, tenant_id, code, source_type, ledger_id, account_map, dimension_map, rounding_account, priority, active)
values
  ('10000000-0000-4000-8000-000000000004', '76fa9913-4ee3-40c4-bd43-ff300ad78d61',
   'local-invoice', 'invoice', '10000000-0000-4000-8000-000000000002',
   '{}'::jsonb, '{}'::jsonb, 'rounding_difference', 100, true),
  ('10000000-0000-4000-8000-000000000005', '76fa9913-4ee3-40c4-bd43-ff300ad78d61',
   'local-payment', 'payment', '10000000-0000-4000-8000-000000000002',
   '{}'::jsonb, '{}'::jsonb, 'rounding_difference', 100, true),
  ('10000000-0000-4000-8000-000000000006', '76fa9913-4ee3-40c4-bd43-ff300ad78d61',
   'group-invoice', 'invoice', '10000000-0000-4000-8000-000000000003',
   '{}'::jsonb, '{}'::jsonb, 'rounding_difference', 100, true),
  ('10000000-0000-4000-8000-000000000007', '76fa9913-4ee3-40c4-bd43-ff300ad78d61',
   'group-payment', 'payment', '10000000-0000-4000-8000-000000000003',
   '{}'::jsonb, '{}'::jsonb, 'rounding_difference', 100, true)
on conflict (id) do nothing;

insert into public.erp_consolidation_groups
  (id, tenant_id, code, name, reporting_currency, method, status)
values (
  '10000000-0000-4000-8000-000000000008', '76fa9913-4ee3-40c4-bd43-ff300ad78d61',
  'SAMJURO', 'Samjuro', 'COP', 'full', 'active'
)
on conflict (id) do nothing;

insert into public.erp_consolidation_members
  (tenant_id, group_id, entity_id, ownership, effective_from, effective_to, method)
values (
  '76fa9913-4ee3-40c4-bd43-ff300ad78d61',
  '10000000-0000-4000-8000-000000000008',
  '10000000-0000-4000-8000-000000000001',
  1, '2026-01-01', null, 'full'
)
on conflict (tenant_id, group_id, entity_id, effective_from) do nothing;

-- Permisos lógicos exigidos por las policies RLS de las tablas Ultra.
-- Sin estas filas, un rol owner/admin/accounting no puede ni leer la configuración.
insert into public.role_permissions (tenant_id, role, permission, allowed)
select
  '76fa9913-4ee3-40c4-bd43-ff300ad78d61'::uuid,
  r.role,
  o.object_name || '.' || a.action,
  true
from (values ('owner'), ('admin'), ('accounting')) as r(role)
cross join (values
  ('entity'), ('workflowDefinition'), ('workflowInstance'), ('outbox'),
  ('auditEvent'), ('ledger'), ('postingRule'), ('derivedEntry'),
  ('currencyRate'), ('consolidationGroup'), ('consolidationMember'),
  ('intercompanyPair'), ('intercompanyTransaction'), ('eliminationRule'),
  ('eliminationEntry'), ('eventEnvelope'), ('eventDelivery'), ('deadLetter'),
  ('featureFlag'), ('agentDefinition'), ('toolAllowlist'), ('agentRun'),
  ('approvalGate'), ('agentTrace')
) as o(object_name)
cross join (values ('read'), ('create'), ('update'), ('delete'), ('approve'), ('execute')) as a(action)
on conflict (tenant_id, role, permission) do update set allowed = excluded.allowed;
