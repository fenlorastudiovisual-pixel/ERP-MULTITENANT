// Registro de objetos de negocio del Ultra ERP.
// Inspirado en DocType de Frappe, pero con dos diferencias deliberadas:
//   1) las reglas de tenant se compilan a RLS de Postgres (ver policies.js);
//   2) el descriptor es código versionado, no solo una fila editable en la BD.

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/i;

export function assertIdentifier(value, label = "identificador") {
  if (!IDENTIFIER.test(String(value))) {
    throw new Error(`${label} inválido: ${String(value)}`);
  }
  return String(value);
}

const object = (descriptor) =>
  Object.freeze({
    version: 1,
    tenantColumn: "tenant_id",
    primaryKey: "id",
    audit: true,
    skipPermissionPolicy: false,
    required: [],
    unique: [],
    permissions: { viewer: ["read"] },
    ...descriptor,
  });

/**
 * Objetos del control plane y del núcleo financiero.
 * `permissions` usa nombres lógicos: read/create/update/delete/approve/post.
 * `policies.js` traduce read/create/update/delete a SELECT/INSERT/UPDATE/DELETE.
 */
export const OBJECTS = Object.freeze({
  entity: object({
    name: "entity",
    table: "erp_entities",
    label: "Entidad del holding",
    fields: ["id", "tenant_id", "parent_id", "kind", "code", "name", "country", "currency", "status", "attributes"],
    required: ["tenant_id", "kind", "code", "name"],
    unique: [["tenant_id", "code"]],
    permissions: {
      viewer: ["read"],
      manager: ["read", "create", "update"],
      admin: ["read", "create", "update", "delete", "approve"],
      owner: ["read", "create", "update", "delete", "approve"],
    },
  }),

  policy: object({
    name: "policy",
    table: "erp_policies",
    label: "Política ABAC/RBAC",
    fields: ["tenant_id", "object_type", "action", "role", "domain", "priority", "enabled"],
    required: ["tenant_id", "object_type", "action", "role"],
    unique: [["tenant_id", "object_type", "action", "role"]],
    // Esta tabla se consulta desde erp_has_permission(): evitar recursión.
    skipPermissionPolicy: true,
    permissions: { viewer: ["read"], admin: ["read", "create", "update", "delete"] },
  }),

  workflowDefinition: object({
    name: "workflowDefinition",
    table: "erp_workflow_definitions",
    label: "Definición de workflow",
    fields: ["tenant_id", "key", "version", "definition", "active"],
    required: ["tenant_id", "key", "version", "definition"],
    unique: [["tenant_id", "key", "version"]],
    permissions: { viewer: ["read"], manager: ["read", "create"], admin: ["read", "create", "update", "delete"] },
  }),

  workflowInstance: object({
    name: "workflowInstance",
    table: "erp_workflow_instances",
    label: "Instancia de workflow",
    fields: ["id", "tenant_id", "definition_key", "definition_version", "entity_type", "entity_id", "state", "status", "context", "idempotency_key", "attempts", "next_run_at", "error"],
    required: ["tenant_id", "definition_key", "definition_version", "state"],
    unique: [["tenant_id", "idempotency_key"]],
    permissions: { viewer: ["read"], manager: ["read", "create", "update"], admin: ["read", "create", "update", "delete"] },
  }),

  outbox: object({
    name: "outbox",
    table: "erp_outbox",
    label: "Outbox transaccional",
    fields: ["id", "tenant_id", "direction", "event_type", "dedupe_key", "payload", "status", "attempts", "available_at", "processed_at"],
    required: ["tenant_id", "direction", "event_type", "dedupe_key"],
    unique: [["tenant_id", "dedupe_key"]],
    permissions: { viewer: ["read"], admin: ["read", "update"] },
  }),

  auditEvent: object({
    name: "auditEvent",
    table: "erp_audit_events",
    label: "Evento de auditoría inmutable",
    fields: ["id", "tenant_id", "actor_id", "actor_role", "action", "object_type", "object_id", "before", "after", "metadata", "occurred_at"],
    required: ["tenant_id", "action", "object_type", "object_id"],
    permissions: { viewer: ["read"], admin: ["read"] },
  }),

  party: object({
    name: "party",
    table: "partners",
    label: "Cliente / proveedor",
    fields: ["id", "tenant_id", "kind", "document_type", "document", "name", "email", "active"],
    required: ["tenant_id", "name"],
    unique: [["tenant_id", "document_type", "document"]],
    permissions: { viewer: ["read"], manager: ["read", "create", "update"], admin: ["read", "create", "update", "delete"] },
  }),

  item: object({
    name: "item",
    table: "items",
    label: "Producto / servicio",
    fields: ["id", "tenant_id", "sku", "name", "brand", "category", "price", "cost_price", "tax_rate"],
    required: ["tenant_id", "sku", "name"],
    unique: [["tenant_id", "sku"]],
    permissions: { viewer: ["read"], manager: ["read", "create", "update"], admin: ["read", "create", "update", "delete"] },
  }),

  quote: object({
    name: "quote",
    table: "invoices_ops",
    label: "Cotización",
    fields: ["id", "tenant_id", "number", "prefix", "partner_id", "subtotal", "tax", "total", "status"],
    required: ["tenant_id", "number", "prefix", "partner_id"],
    unique: [["tenant_id", "number"]],
    permissions: { viewer: ["read"], manager: ["read", "create", "update", "approve"], admin: ["read", "create", "update", "delete", "approve"] },
  }),

  invoice: object({
    name: "invoice",
    table: "invoices_ops",
    label: "Factura",
    fields: ["id", "tenant_id", "number", "prefix", "partner_id", "subtotal", "tax", "total", "balance", "status"],
    required: ["tenant_id", "number", "prefix", "partner_id"],
    unique: [["tenant_id", "number"]],
    permissions: { viewer: ["read"], manager: ["read", "create", "update"], admin: ["read", "create", "update", "delete", "post"] },
  }),

  payment: object({
    name: "payment",
    table: "payments_in",
    label: "Pago recibido",
    fields: ["id", "tenant_id", "number", "partner_id", "amount", "method", "status"],
    required: ["tenant_id", "number", "partner_id", "amount"],
    unique: [["tenant_id", "number"]],
    permissions: { viewer: ["read"], manager: ["read", "create"], admin: ["read", "create", "update", "delete"] },
  }),

  journalEntry: object({
    name: "journalEntry",
    table: "journal_entries",
    label: "Asiento contable",
    fields: ["id", "tenant_id", "number", "entry_date", "total_debit", "total_credit", "status"],
    required: ["tenant_id", "number", "entry_date"],
    unique: [["tenant_id", "number"]],
    permissions: { viewer: ["read"], admin: ["read", "create", "post"] },
  }),
});

export function getObject(name) {
  const descriptor = OBJECTS[name];
  if (!descriptor) throw new Error(`Objeto desconocido: ${name}`);
  return descriptor;
}

export function listObjects() {
  return Object.values(OBJECTS);
}

export function assertTable(descriptor) {
  assertIdentifier(descriptor.table, "tabla");
  assertIdentifier(descriptor.tenantColumn, "columna de tenant");
  return `public.${descriptor.table}`;
}

/**
 * Validación mínima dePayload antes de tocar la BD.
 * No reemplaza constraints de Postgres; fallen temprano para errores de API.
 */
export function validateRecord(objectName, record = {}) {
  const descriptor = getObject(objectName);
  const missing = descriptor.required.filter((field) => record[field] === undefined || record[field] === null || record[field] === "");
  if (missing.length) {
    const error = new Error(`${descriptor.label}: campos requeridos ausentes: ${missing.join(", ")}`);
    error.status = 422;
    error.fields = missing;
    throw error;
  }
  return record;
}

export function permissionsFor(objectName, role = "viewer") {
  return [...(getObject(objectName).permissions[role] || [])];
}

export function describeObjects() {
  return listObjects().map((descriptor) => ({
    name: descriptor.name,
    label: descriptor.label,
    table: descriptor.table,
    required: descriptor.required,
    unique: descriptor.unique,
    permissions: descriptor.permissions,
  }));
}
