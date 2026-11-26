// Resolución de identidad del panel del negocio.
// El tenant NUNCA se toma de la URL: se deduce del correo verificado por Access
// y de la tabla public.tenant_members. Solo la resolución usa contexto de
// plataforma; todos los datos que se muestran después se leen como tenant.

import { runAsSuperAdmin } from "./db.js";

export async function resolveTenantIdentity(email) {
  if (!email) return null;
  const rows = await runAsSuperAdmin((tx) => tx`
    select t.id::text as tenant_id,
           t.source_key as tenant_key,
           t.name as tenant_name,
           p.id::text as user_id,
           tm.role,
           tm.active
    from public.profiles p
    join public.tenant_members tm on tm.user_id = p.id
    join public.tenants t on t.id = tm.tenant_id
    where lower(p.email) = lower(${email}) and tm.active
    order by case tm.role when 'owner' then 0 when 'admin' then 1 else 2 end, t.name
    limit 1
  `);
  return rows[0] || null;
}
