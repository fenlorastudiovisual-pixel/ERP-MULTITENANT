// Compilador de metadatos → RLS de Postgres.
// Convención del proyecto: app.tenant_id / app.user_role se fijan en lib/db.js.
// Las policies son aditivas: DROP POLICY IF EXISTS + CREATE POLICY, nunca DROP TABLE.

import { assertIdentifier, assertTable, getObject, listObjects } from "./metadata.js";

const ACTIONS = [
  { action: "read", sql: "select", check: false },
  { action: "create", sql: "insert", check: true },
  { action: "update", sql: "update", check: true },
  { action: "delete", sql: "delete", check: false },
];

const policyName = (table, action) => `${table}_${action.slice(0, 3)}`.slice(0, 63);

const tenantGuard = (descriptor) => `${descriptor.tenantColumn} = public.current_tenant_id()`;

const permissionGuard = (descriptor, action) =>
  `public.erp_has_permission('${descriptor.name}', '${action}')`;

/**
 * Devuelve los statements SQL necesarios para asegurar un objeto.
 * `skipPermissionPolicy` se usa en tablas leídas por erp_has_permission()
 * para evitar recursión; ahí solo se aplica el aislamiento por tenant.
 */
export function buildRlsPolicySql(objectName) {
  const descriptor = getObject(objectName);
  const table = assertTable(descriptor);
  const statements = [
    `alter table ${table} enable row level security;`,
    `alter table ${table} force row level security;`,
  ];

  for (const { action, sql, check } of ACTIONS) {
    const name = policyName(descriptor.table, action);
    const guard = descriptor.skipPermissionPolicy
      ? tenantGuard(descriptor)
      : `(${tenantGuard(descriptor)} and ${permissionGuard(descriptor, action)})`;
    const using = `public.is_superadmin() or ${guard}`;
    const clause = check
      ? `using (${using}) with check (${using})`
      : `using (${using})`;

    statements.push(`drop policy if exists ${name} on ${table};`);
    statements.push(`create policy ${name} on ${table} for ${sql} to public ${clause};`);
  }

  return statements;
}

/**
 * Varios objetos pueden compartir tabla (quote e invoice usan invoices_ops).
 * En ese caso las policies se combinan con OR para no sobrescribirse.
 */
export function buildTablePolicySql(table) {
  const tableName = assertIdentifier(table, "tabla");
  const descriptors = listObjects().filter((descriptor) => descriptor.table === tableName);
  if (!descriptors.length) throw new Error(`Tabla sin descriptor: ${tableName}`);
  const qualified = `public.${tableName}`;

  const statements = [
    `alter table ${qualified} enable row level security;`,
    `alter table ${qualified} force row level security;`,
  ];

  for (const { action, sql, check } of ACTIONS) {
    const guards = descriptors.map((descriptor) => {
      const tenant = tenantGuard(descriptor);
      if (descriptor.skipPermissionPolicy) return tenant;
      return `(${tenant} and ${permissionGuard(descriptor, action)})`;
    });
    const guard = guards.length === 1 ? guards[0] : `(${guards.join(" or ")})`;
    const using = `public.is_superadmin() or ${guard}`;
    const clause = check
      ? `using (${using}) with check (${using})`
      : `using (${using})`;
    const name = policyName(tableName, action);

    statements.push(`drop policy if exists ${name} on ${qualified};`);
    statements.push(`create policy ${name} on ${qualified} for ${sql} to public ${clause};`);
  }

  return statements;
}

export function buildAllPolicySql() {
  const tables = [...new Set(listObjects().map((descriptor) => descriptor.table))];
  return tables.flatMap((table) => buildTablePolicySql(table));
}

/**
 * Grants mínimos para el rol operativo de la app.
 * Se emiten por separado para poder revisarlos antes de aplicarlos.
 */
export function buildGrantSql(role = "authenticated") {
  const safeRole = role.replace(/[^A-Za-z0-9_]/g, "");
  if (!safeRole) throw new Error("Rol inválido");
  return listObjects().map((descriptor) => {
    const table = assertTable(descriptor);
    return `grant select, insert, update, delete on ${table} to ${safeRole};`;
  });
}

export function renderPolicyBundle() {
  return [
    "-- Políticas RLS generadas desde lib/ultra/metadata.js. No ejecutar automáticamente.",
    "-- Requiere public.current_tenant_id(), public.is_superadmin() y public.erp_has_permission().",
    "",
    ...buildAllPolicySql(),
    "",
  ].join("\n");
}

export function policyPlan() {
  return listObjects().map((descriptor) => ({
    object: descriptor.name,
    table: descriptor.table,
    statements: buildRlsPolicySql(descriptor.name).length,
    usesPermissionFunction: !descriptor.skipPermissionPolicy,
  }));
}
