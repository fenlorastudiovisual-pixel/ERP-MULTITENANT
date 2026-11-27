// Permisos granulares del ERP. La base de datos es la fuente de verdad;
// el rol de la sesión nunca se toma del body de la petición.

import { runAsTenant } from "../db.js";

export async function hasPermission(ctx, permission) {
  const tenantId = ctx?.identity?.tenant_id;
  if (!tenantId) return false;
  const role = ctx?.identity?.role || "viewer";
  const rows = await runAsTenant(tenantId, (tx) => tx`
    select allowed from public.role_permissions
    where tenant_id = ${tenantId}::uuid and role = ${role} and permission = ${permission}
    limit 1
  `, role, ctx?.identity?.user_id || "");
  return rows[0]?.allowed === true;
}

export async function requirePermission(ctx, permission) {
  const allowed = await hasPermission(ctx, permission);
  if (!allowed) {
    const error = new Error(`Permiso requerido: ${permission}`);
    error.status = 403;
    error.publicMessage = "No tienes permiso para realizar esta acción.";
    throw error;
  }
}

export async function writeAudit(ctx, action, objectType, objectId, metadata = {}) {
  const tenantId = ctx?.identity?.tenant_id;
  if (!tenantId) return;
  const role = ctx?.identity?.role || "viewer";
  await runAsTenant(tenantId, (tx) => tx`
    insert into public.audit_log
      (tenant_id, actor_id, actor_role, action, object_type, object_id, metadata)
    values
      (${tenantId}::uuid, ${ctx?.identity?.user_id || null}::uuid, ${role},
       ${action}, ${objectType}, ${String(objectId)}, ${JSON.stringify(metadata)}::jsonb)
  `, role, ctx?.identity?.user_id || "");
}
