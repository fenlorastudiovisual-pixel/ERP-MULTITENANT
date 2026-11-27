// Resolución de identidad del panel del negocio.
// El tenant NUNCA se toma de la URL: se deduce del correo verificado por Access
// y de la tabla public.tenant_members. Solo la resolución usa contexto de
// plataforma; todos los datos que se muestran después se leen como tenant.
// Mientras Samjuro es el tenant de prueba, las sesiones nuevas caen en el
// sandbox: así ninguna acción del panel puede escribir en los datos reales.

import { runAsSuperAdmin } from "./db.js";

export async function listTenantIdentities(email) {
  if (!email) return [];
  return runAsSuperAdmin((tx) => tx`
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
    order by case when t.source_key = 't17_sandbox' then 0 else 1 end,
             case tm.role when 'owner' then 0 when 'admin' then 1 else 2 end,
             t.name
  `);
}

export async function resolveTenantIdentity(email, preferredTenantId = null) {
  const rows = await listTenantIdentities(email);
  if (!rows.length) return null;
  if (preferredTenantId) {
    return rows.find((row) => row.tenant_id === String(preferredTenantId)) || null;
  }
  return rows[0] || null;
}
