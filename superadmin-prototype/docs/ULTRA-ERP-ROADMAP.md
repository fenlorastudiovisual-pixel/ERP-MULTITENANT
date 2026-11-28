# Ultra ERP — roadmap de implementación

Este documento materializa la combinación decidida tras revisar ERPNext/Frappe, Huly, NocoBase e IDurar, contrastada con el benchmark 2026 de ERPs enterprise (SAP, Oracle Fusion, NetSuite, Dynamics 365, Workday, Infor, IFS).

**Estado actual: P0 completado en código.** `npm test` → 48/48 pruebas en verde; `npm run build` → correcto. La migración SQL **sigue sin aplicar** y no se desplegó nada nuevo.

## Principios arquitectónicos (ADR)

- **ADR-001 — Metadatos, pero con RLS real.** Como ERPNext, el dominio se describe en metadatos versionados; a diferencia de ERPNext, las reglas de tenant se compilan a **policies de Postgres**, no quedan solo en Python.
- **ADR-002 — Control plane + data plane.** Como Huly, existe un plano global de identidad/workspace (`erp_entities`) y un data plane por tenant. El routing es determinista por tenant/entidad.
- **ADR-003 — Workflows duraderos.** Como NocoBase v3, los procesos usan estados, guards, effects post-commit, idempotencia y outbox transaccional. No dependemos de su licencia ni de su designer visual.
- **ADR-004 — Ledger innegociable.** El núcleo financiero existe y es append-only; Samjuro ya demostró el patrón `COT → FV → cartera → asiento balanceado`.
- **ADR-005 — Rechazo explícito de IDurar.** No se adopta su modelo de permisos, ni su PDF público, ni su ausencia de tests.
- **ADR-006 — Libros paralelos derivados.** Una operación operativa nunca se reescribe para adaptarla a otro libro. Cada ledger (`operational`, `group`, `statutory`, `fiscal`, `budget`) obtiene su propia versión mediante reglas declarativas con FX histórico. Inspirado en SAP ACDOCA y Oracle Subledger Accounting.
- **ADR-007 — Auditoría append-only con hash-chain.** `erp_audit_events` encadena `hash_prev → hash` por tenant y rechaza `UPDATE`/`DELETE` por trigger. Es la condición no negociable para holdings.
- **ADR-008 — Agentes gobernados.** El agente propone; solo puede ejecutar si está en la allowlist y, cuando aplica, tras aprobación humana. Toda llamada queda trazada.

## Qué se entrega en P0

| Archivo | Qué hace |
|---|---|
| `lib/ultra/metadata.js` | Registro de objetos estilo DocType: tabla, campos, permisos, unicidad, auditoría. Incluye los objetos nuevos de ledger, consolidación, IC, eventos y agentes. |
| `lib/ultra/policies.js` | Compila metadatos a SQL de RLS (`ENABLE/FORCE`, `DROP/CREATE POLICY`) usando `app.tenant_id` y `app.user_role`. |
| `lib/ultra/entities.js` | Jerarquía holding → compañía → sucursal → departamento → centro de costo, con detección de ciclos. |
| `lib/ultra/money.js` | Dinero en unidades menores, IVA incluido y validación de asientos balanceados. |
| `lib/ultra/workflow.js` | Motor duradero puro: estados, guards, effects, idempotencia, reintentos y outbox. |
| `lib/ultra/workflow-store.js` | Adaptador a Postgres sobre `runAsTenant`: agrupa operaciones en una transacción, prohíbe mezclar tenants y no ejecuta DDL. El cliente `db.js` se importa de forma diferida. |
| `lib/ultra/ledger.js` | Libros paralelos, reglas de contabilización, tasas vigentes por fecha y derivación balanceada sin mutar la operación. |
| `lib/ultra/consolidation.js` | Grupos con vigencia, participación no controladora, CTA PVA/VAL y agregación con eliminaciones. |
| `lib/ultra/intercompany.js` | Matching determinista por par/moneda/clave con tolerancia en unidades menores y asientos de eliminación balanceados. |
| `lib/ultra/tax.js` | Reglas fiscales por jurisdicción y vigencia; IVA incluido (Samjuro) y exclusivo; validación de payload de factura electrónica sin credenciales. |
| `lib/ultra/observability.js` | `trace_id`/`span_id`, redacción de secretos en contexto y evaluación de SLO. |
| `lib/ultra/agents.js` | Definición de agente, allowlist de herramientas, gate humano, ejecución y traza. |
| `lib/ultra/index.js` | Barrel único de los módulos anteriores. |
| `database/ultra-erp-core.sql` | Migración aditiva **no aplicada**: control plane, libros, FX, consolidación, intercompany, event envelope, feature flags, agentes y hash-chain. |
| `lib/ultra/*.test.mjs` | 48 pruebas unitarias sin bases de datos ni dependencias nuevas. |

## Brechas cerradas frente al benchmark

| Brecha detectada | Respuesta en P0 |
|---|---|
| Un solo libro para todas las entidades | `erp_ledgers` + `erp_posting_rules` + `erp_derived_entries` |
| Sin moneda funcional por entidad ni FX histórico | `erp_currency_rates` con `spot/closing/average/historical` |
| Sin consolidación de holding | `erp_consolidation_groups`, `erp_consolidation_members`, NCI y CTA |
| Sin eliminaciones intercompañía | `erp_intercompany_pairs`, `erp_ic_transactions`, `erp_elimination_entries` |
| Fiscalidad hardcodeada al 19 % | `erp_tax_rules` por jurisdicción/vigencia; Samjuro sigue en modo inclusivo |
| Eventos sin contrato | `erp_event_envelope`, `erp_event_deliveries`, `erp_dead_letters` |
| Auditoría editable | triggers de hash-chain e inmutabilidad en `erp_audit_events` |
| IA sin gobernanza | `erp_agent_definitions`, `erp_tool_allowlists`, `erp_approval_gates`, `erp_agent_traces` |
| Logs con secretos | redacción obligatoria antes de emitir cualquier envelope |

## Convención de contexto

`lib/db.js` ya fija dentro de la misma transacción:

- `app.tenant_id`
- `app.user_role`
- `app.actor_id`

Las policies nuevas usan las funciones existentes `public.current_tenant_id()` y `public.is_superadmin()`. `createPgWorkflowStore` recibe el `runner` inyectable; en pruebas se sustituye sin abrir conexión.

## Migración

La migración SQL **no se ha ejecutado**. Está lista para revisión. Cuando se decida aplicarla en una base que no sea la de producción de Samjuro:

```powershell
node database/migrate-ultra-core.mjs --confirm=ULTRA-CORE
```

El script exige el flag explícito y usa `DATABASE_APP_URL` / `DATABASE_URL` del entorno. El SQL no contiene `DELETE`, `TRUNCATE` ni `DROP TABLE`: solo `CREATE IF NOT EXISTS`, `ALTER ... ADD COLUMN`, `DROP/CREATE POLICY`, `DROP/CREATE TRIGGER`, un `DROP CONSTRAINT` condicional para corregir el check v1 de `erp_workflow_effects`, y el trigger de hash-chain de auditoría.

## Verificación de P0

```powershell
npm test       # 48 tests, 48 pass, 0 fail
npm run build  # compile + typecheck + 6 páginas estáticas OK
```

## Fases siguientes

1. **Fase 1 — Seed de metadatos.** Insertar los descriptores en la BD y generar policies para las tablas nuevas.
2. **Fase 2 — API de contabilidad derivada.** Exponer `start/advance/resume`, posting por libro, cierre y consolidación con permisos por rol.
3. **Fase 3 — ESG/EPM y tesorería.** Presupuestos, cash pooling, previsiones y reportes por dimensión.
4. **Fase 4 — Integraciones.** Webhooks firmados, OAuth2/OIDC/SAML, conectores y API keys con rotación.
5. **Fase 5 — UI.** Worklists con acciones directas, object pages con anclas, comandos contextuales por rol/estado, vistas guardadas en URL y PWA/offline.

## Lo que NO se hizo todavía

- No se modificó `SAMJURO`.
- No se aplicó DDL a ninguna base.
- No se tocó `pedidos`, `pedido_items`, `vendedoras`, `panel_acceso`, `auth.users` ni secretos.
- No se desplegó nada; el Worker en producción sigue en la versión anterior a este P0.
