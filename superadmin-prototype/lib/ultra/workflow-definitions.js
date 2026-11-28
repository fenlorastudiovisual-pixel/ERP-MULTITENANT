// Definiciones de workflow permitidas en el servidor. La API nunca acepta
// definiciones desde el body: solo nombres y acciones de esta lista.

import { createWorkflowEngine, defineWorkflow } from "./workflow.js";

const FINANCE_APPROVERS = new Set(["owner", "admin", "accounting"]);

const financeActor = {
  name: "finance_actor",
  check: ({ actor }) => FINANCE_APPROVERS.has(String(actor || "")),
};

export const CLOSE_WORKFLOW = defineWorkflow({
  key: "ultra.close",
  version: 1,
  initial: "draft",
  states: {
    draft: { label: "Borrador" },
    review: { label: "En revisión" },
    posted: { label: "Contabilizado" },
    rejected: { label: "Rechazado" },
  },
  transitions: [
    {
      from: "draft", event: "submit", to: "review",
      guards: [financeActor],
      effects: [{ type: "notify", event: "close.submitted" }],
    },
    {
      from: "review", event: "approve", to: "posted",
      guards: [financeActor],
      effects: [{ type: "notify", event: "close.approved" }],
    },
    {
      from: "review", event: "reject", to: "rejected",
      guards: [financeActor],
      effects: [{ type: "notify", event: "close.rejected" }],
    },
  ],
});

export const WORKFLOWS = Object.freeze({ [CLOSE_WORKFLOW.key]: CLOSE_WORKFLOW });
export const ALLOWED_WORKFLOW_KEYS = Object.freeze(Object.keys(WORKFLOWS));
export const ALLOWED_ENTITY_TYPES = Object.freeze(["invoice", "derivedEntry", "consolidation", "closing"]);
export const ALLOWED_ACTIONS = Object.freeze(["start", "advance", "resume", "run_due"]);

export function workflowEvents(key = CLOSE_WORKFLOW.key) {
  const definition = WORKFLOWS[key];
  if (!definition) return [];
  return [...new Set(definition.transitions.map((transition) => transition.event))];
}

/** Crea el engine con handlers fijos y la definición registrada en memoria. */
export function createUltraWorkflowEngine({ store, now, id } = {}) {
  const handlers = {
    notify: async ({ instance, spec, emit }) => {
      if (!spec?.event) throw new Error("Effect notify sin event");
      return emit({
        event_type: spec.event,
        dedupe_key: `${instance.id}:${spec.event}`,
        payload: { workflow: CLOSE_WORKFLOW.key },
      });
    },
  };
  const engine = createWorkflowEngine({ store, handlers, now, id });
  for (const definition of Object.values(WORKFLOWS)) engine.registerDefinition(definition);
  return engine;
}
