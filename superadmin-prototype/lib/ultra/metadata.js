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
    fields: ["id", "tenant_id", "actor_id", "actor_role", "action", "object_type", "object_id", "before", "after", "metadata", "reason", "evidence_uri", "hash_prev", "hash", "sequence_no", "occurred_at"],
    required: ["tenant_id", "action", "object_type", "object_id"],
    permissions: { viewer: ["read"], admin: ["read", "create"] },
  }),

  ledger: object({
    name: "ledger",
    table: "erp_ledgers",
    label: "Libro contable",
    fields: ["id", "tenant_id", "entity_id", "code", "kind", "currency", "is_base", "fiscal_year_start", "metadata", "status"],
    required: ["tenant_id", "code", "kind"],
    unique: [["tenant_id", "code"]],
    permissions: { viewer: ["read"], manager: ["read"], admin: ["read", "create", "update", "delete"] },
  }),

  postingRule: object({
    name: "postingRule",
    table: "erp_posting_rules",
    label: "Regla de contabilización derivada",
    fields: ["id", "tenant_id", "code", "source_type", "ledger_id", "account_map", "dimension_map", "rounding_account", "priority", "active"],
    required: ["tenant_id", "code", "source_type", "ledger_id"],
    unique: [["tenant_id", "code", "ledger_id", "source_type"]],
    permissions: { viewer: ["read"], admin: ["read", "create", "update", "delete"] },
  }),

  derivedEntry: object({
    name: "derivedEntry",
    table: "erp_derived_entries",
    label: "Asiento derivado por libro",
    fields: ["id", "tenant_id", "source_type", "source_id", "ledger_id", "entity_id", "rule_id", "entry_date", "currency", "rate", "rate_type", "lines", "status"],
    required: ["tenant_id", "source_type", "source_id", "ledger_id", "entry_date", "currency"],
    unique: [["tenant_id", "source_type", "source_id", "ledger_id"]],
    permissions: { viewer: ["read"], admin: ["read", "create", "update", "post"] },
  }),

  currencyRate: object({
    name: "currencyRate",
    table: "erp_currency_rates",
    label: "Tasa de cambio histórica",
    fields: ["tenant_id", "rate_date", "from_currency", "to_currency", "rate_type", "rate", "source"],
    required: ["tenant_id", "rate_date", "from_currency", "to_currency", "rate_type", "rate"],
    unique: [["tenant_id", "rate_date", "from_currency", "to_currency", "rate_type"]],
    permissions: { viewer: ["read"], manager: ["read", "create"], admin: ["read", "create", "update", "delete"] },
  }),

  consolidationGroup: object({
    name: "consolidationGroup",
    table: "erp_consolidation_groups",
    label: "Grupo de consolidación",
    fields: ["id", "tenant_id", "code", "name", "parent_group_id", "reporting_currency", "method", "status"],
    required: ["tenant_id", "code", "name"],
    unique: [["tenant_id", "code"]],
    permissions: { viewer: ["read"], manager: ["read"], admin: ["read", "create", "update", "delete", "approve"] },
  }),

  consolidationMember: object({
    name: "consolidationMember",
    table: "erp_consolidation_members",
    label: "Entidad miembro del grupo",
    fields: ["tenant_id", "group_id", "entity_id", "ownership", "effective_from", "effective_to", "method"],
    required: ["tenant_id", "group_id", "entity_id", "effective_from", "ownership"],
    permissions: { viewer: ["read"], manager: ["read"], admin: ["read", "create", "update", "delete"] },
  }),

  intercompanyPair: object({
    name: "intercompanyPair",
    table: "erp_intercompany_pairs",
    label: "Par intercompañía",
    fields: ["id", "tenant_id", "entity_a", "entity_b", "tolerance_minor", "settlement_days", "status"],
    required: ["tenant_id", "entity_a", "entity_b"],
    unique: [["tenant_id", "entity_a", "entity_b"]],
    permissions: { viewer: ["read"], manager: ["read"], admin: ["read", "create", "update", "delete"] },
  }),

  intercompanyTransaction: object({
    name: "intercompanyTransaction",
    table: "erp_ic_transactions",
    label: "Transacción intercompañía",
    fields: ["id", "tenant_id", "pair_id", "source_type", "source_id", "entity_id", "counterparty_id", "direction", "amount", "currency", "match_key", "status"],
    required: ["tenant_id", "source_type", "source_id", "entity_id", "counterparty_id", "direction", "amount"],
    unique: [["tenant_id", "source_type", "source_id"]],
    permissions: { viewer: ["read"], manager: ["read", "create"], admin: ["read", "create", "update", "delete", "approve"] },
  }),

  eliminationRule: object({
    name: "eliminationRule",
    table: "erp_elimination_rules",
    label: "Regla de eliminación",
    fields: ["id", "tenant_id", "group_id", "code", "kind", "rule", "priority", "active"],
    required: ["tenant_id", "group_id", "code", "kind"],
    unique: [["tenant_id", "group_id", "code"]],
    permissions: { viewer: ["read"], admin: ["read", "create", "update", "delete"] },
  }),

  eliminationEntry: object({
    name: "eliminationEntry",
    table: "erp_elimination_entries",
    label: "Asiento de eliminación",
    fields: ["id", "tenant_id", "group_id", "period", "rule_id", "match_key", "currency", "lines", "status"],
    required: ["tenant_id", "group_id", "period", "match_key", "lines"],
    unique: [["tenant_id", "group_id", "period", "match_key", "rule_id"]],
    permissions: { viewer: ["read"], admin: ["read", "create", "update", "post"] },
  }),

  eventEnvelope: object({
    name: "eventEnvelope",
    table: "erp_event_envelope",
    label: "Evento de negocio",
    fields: ["id", "tenant_id", "event_id", "event_type", "aggregate_type", "aggregate_id", "correlation_id", "causation_id", "schema_version", "payload", "occurred_at"],
    required: ["tenant_id", "event_id", "event_type"],
    unique: [["tenant_id", "event_id"]],
    permissions: { viewer: ["read"], admin: ["read", "create"] },
  }),

  eventDelivery: object({
    name: "eventDelivery",
    table: "erp_event_deliveries",
    label: "Entrega de evento",
    fields: ["id", "tenant_id", "envelope_id", "subscription_id", "endpoint", "status", "attempts", "next_attempt_at", "delivered_at"],
    required: ["tenant_id", "envelope_id", "subscription_id", "endpoint"],
    unique: [["tenant_id", "envelope_id", "subscription_id"]],
    permissions: { viewer: ["read"], admin: ["read", "create", "update"] },
  }),

  deadLetter: object({
    name: "deadLetter",
    table: "erp_dead_letters",
    label: "Evento fallido definitivamente",
    fields: ["id", "tenant_id", "delivery_id", "envelope_id", "reason", "payload", "failed_at"],
    required: ["tenant_id", "delivery_id", "envelope_id", "reason"],
    unique: [["tenant_id", "delivery_id"]],
    permissions: { viewer: ["read"], admin: ["read", "create"] },
  }),

  featureFlag: object({
    name: "featureFlag",
    table: "erp_feature_flags",
    label: "Feature flag por tenant",
    fields: ["tenant_id", "flag", "scope", "entity_id", "enabled", "rollout", "config"],
    required: ["tenant_id", "flag", "scope"],
    permissions: { viewer: ["read"], manager: ["read"], admin: ["read", "create", "update", "delete"] },
  }),

  agentDefinition: object({
    name: "agentDefinition",
    table: "erp_agent_definitions",
    label: "Definición de agente",
    fields: ["id", "tenant_id", "key", "version", "name", "role", "autonomy", "approval_required", "tools", "config", "active"],
    required: ["tenant_id", "key", "version", "name"],
    unique: [["tenant_id", "key", "version"]],
    permissions: { viewer: ["read"], admin: ["read", "create", "update", "delete"] },
  }),

  toolAllowlist: object({
    name: "toolAllowlist",
    table: "erp_tool_allowlists",
    label: "Herramienta permitida a un agente",
    fields: ["tenant_id", "agent_id", "tool", "scopes", "max_calls"],
    required: ["tenant_id", "agent_id", "tool"],
    permissions: { viewer: ["read"], admin: ["read", "create", "update", "delete"] },
  }),

  agentRun: object({
    name: "agentRun",
    table: "erp_agent_runs",
    label: "Ejecución de agente",
    fields: ["id", "tenant_id", "agent_id", "agent_key", "status", "proposed", "context", "result", "approval", "created_at"],
    required: ["tenant_id", "status"],
    permissions: { viewer: ["read"], manager: ["read", "create"], admin: ["read", "create", "update", "approve"] },
  }),

  approvalGate: object({
    name: "approvalGate",
    table: "erp_approval_gates",
    label: "Gate de aprobación humana",
    fields: ["id", "tenant_id", "run_id", "gate_type", "required_role", "status", "decided_by", "decided_at", "note"],
    required: ["tenant_id", "run_id", "gate_type", "required_role", "status"],
    unique: [["tenant_id", "run_id", "gate_type"]],
    permissions: { viewer: ["read"], admin: ["read", "create", "update", "approve"] },
  }),

  agentTrace: object({
    name: "agentTrace",
    table: "erp_agent_traces",
    label: "Traza de herramienta de agente",
    fields: ["id", "tenant_id", "run_id", "step", "tool", "input", "output", "error", "duration_ms", "occurred_at"],
    required: ["tenant_id", "run_id", "step", "tool"],
    unique: [["tenant_id", "run_id", "step"]],
    permissions: { viewer: ["read"], admin: ["read", "create"] },
  }),

  budget: object({
    name: "budget",
    table: "erp_budgets",
    label: "Presupuesto EPM",
    fields: ["id", "tenant_id", "entity_id", "code", "name", "period", "currency", "dimensions", "status"],
    required: ["tenant_id", "code", "name", "period"],
    unique: [["tenant_id", "code", "period"]],
    permissions: { viewer: ["read"], manager: ["read"], admin: ["read", "create", "update", "approve"] },
  }),

  budgetLine: object({
    name: "budgetLine",
    table: "erp_budget_lines",
    label: "Línea de presupuesto",
    fields: ["tenant_id", "budget_id", "line_no", "account", "dimensions", "amount_minor"],
    required: ["tenant_id", "budget_id", "line_no", "account"],
    unique: [["tenant_id", "budget_id", "line_no"]],
    permissions: { viewer: ["read"], admin: ["read", "create", "update"] },
  }),

  cashPosition: object({
    name: "cashPosition",
    table: "erp_cash_positions",
    label: "Posición de tesorería",
    fields: ["id", "tenant_id", "entity_id", "position_date", "currency", "opening_minor", "inflow_minor", "outflow_minor", "closing_minor", "movements"],
    required: ["tenant_id", "entity_id", "position_date"],
    unique: [["tenant_id", "entity_id", "position_date", "currency"]],
    permissions: { viewer: ["read"], manager: ["read"], admin: ["read", "create", "update"] },
  }),

  forecast: object({
    name: "forecast",
    table: "erp_forecasts",
    label: "Previsión EPM",
    fields: ["id", "tenant_id", "entity_id", "period", "currency", "method", "amount_minor", "basis"],
    required: ["tenant_id", "entity_id", "period", "method"],
    unique: [["tenant_id", "entity_id", "period", "currency", "method"]],
    permissions: { viewer: ["read"], manager: ["read"], admin: ["read", "create", "update"] },
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
