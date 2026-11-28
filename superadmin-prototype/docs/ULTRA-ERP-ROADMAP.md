# Ultra ERP — roadmap de implementación

Este documento materializa la combinación decidida tras revisar ERPNext/Frappe, Huly, NocoBase e IDurar, contrastada con el benchmark 2026 de ERPs enterprise (SAP, Oracle Fusion, NetSuite, Dynamics 365, Workday, Infor, IFS).

**Estado actual: P0 + Fase 2 + Fase 3A (EPM) aplicados y verificados en la BD del ERP.** `npm test` → 69/69 pruebas en verde; `npm run build` → correcto (5 rutas `/negocio/api/ultra/*`). Se aplicaron `ultra-erp-core.sql` (90 sentencias en una transacción; 29 tablas base + 4 de EPM) y `seed-ultra-config.sql` (1 entidad, 2 libros, 4 reglas, 1 grupo, 1 miembro, permisos RLS ampliados a los objetos EPM). Worker desplegado en la versión `16577602-a810-476f-846c-d69053b8d3f3`. La BD de **Samjuro no se tocó**.

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
| `database/ultra-erp-core.sql` | Migración aditiva aplicada: control plane, libros, FX, consolidación, intercompany, event envelope, feature flags, agentes, hash-chain y tablas EPM. |
| `lib/ultra/*.test.mjs` | 69 pruebas unitarias sin bases de datos ni dependencias nuevas. |

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

La migración SQL **ya se aplicó en la BD del ERP** (verificada: 29 tablas `erp_*`, sin tablas de Samjuro). Se ejecutó desde `superadmin-prototype`, con el entorno cargado desde `.env.local`:

```powershell
.\node_modules\.bin\dotenvx.cmd run -f .env.local -- node database/migrate-ultra-core.mjs --confirm=ULTRA-CORE
.\node_modules\.bin\dotenvx.cmd run -f .env.local -- node database/apply-ultra-seed.mjs --confirm=ULTRA-SEED
```

Node no carga `.env.local` automáticamente; por eso se usa `dotenvx`. El migrador usa el protocolo Postgres completo (`pg`) porque el endpoint HTTP de Neon no persiste DDL multi-sentencia; `database/split-sql.mjs` separa las 90 sentencias respetando comentarios, comillas y bloques `$$`. Todo se ejecuta en una sola transacción. El SQL no contiene `DELETE`, `TRUNCATE` ni `DROP TABLE`: solo `CREATE IF NOT EXISTS`, `ALTER ... ADD COLUMN`, `DROP/CREATE POLICY`, `DROP/CREATE TRIGGER`, constraints condicionales y el trigger de hash-chain de auditoría.

## Verificación de P0

```powershell
npm test       # 48 tests, 48 pass, 0 fail (antes de Fase 2)
npm run build  # compile + typecheck + 6 páginas estáticas OK
```

## Qué se entrega en Fase 2 (API de contabilidad derivada)

| Archivo | Qué hace |
|---|---|
| `lib/ultra/accounting-service.js` | Servidor únicamente. Lee configuración, deriva asientos por libro, persiste con `ON CONFLICT DO NOTHING` y consolida. `runner` inyectable e importación diferida de `db.js`. |
| `lib/ultra/workflow-definitions.js` | Registro allowlisted: un solo workflow (`ultra.close`), eventos `submit/approve/reject` y guardas por rol `owner/admin/accounting`. La API no acepta definiciones del body. |
| `lib/ultra/ledger.js` | Añade `rounding_account`; la diferencia de redondeo FX se cierra en `rounding_difference`, nunca se reparte entre cuentas reales. |
| `lib/ultra/workflow.js` | `posted` es estado terminal, para que el cierre contable complete el workflow. |
| `lib/ultra/metadata.js` | Registro actualizado con `rounding_account` y `entity_id`. |
| `app/negocio/api/ultra/ledgers/route.js` | `GET`: libros, reglas, tasas, grupos y miembros. Requiere `finance.view`. |
| `app/negocio/api/ultra/postings/route.js` | `GET`: asientos derivados. `POST`: deriva desde un asiento operativo publicado; `dryRun` calcula sin escribir. Requiere `finance.view` / `journal.post`. |
| `app/negocio/api/ultra/consolidations/route.js` | `GET`: grupos/miembros. `POST`: consolidación con vigencia, FX, eliminaciones y NCI. Solo lectura. Requiere `finance.view`. |
| `app/negocio/api/ultra/workflows/route.js` | `GET`: ejecuciones debidas y definiciones. `POST`: `start/advance/resume/run_due` sobre el registro permitido. Requiere `journal.post`. |
| `database/seed-ultra-config.sql` | Configuración mínima aplicada: entidad `Samjuro`, libros `local`/`group` en COP, 4 reglas y grupo `SAMJURO`. Sin tasas ni importes inventados. |
| `lib/ultra/accounting-service.test.mjs` y `workflow-definitions.test.mjs` | 7 pruebas nuevas sin base de datos. |

### Endpoints

| Método y ruta | Body | Resultado |
|---|---|---|
| `GET /negocio/api/ultra/ledgers` | — | Configuración del tenant. |
| `GET /negocio/api/ultra/postings?limit=60` | — | Últimos asientos derivados. |
| `POST /negocio/api/ultra/postings` | `{ "sourceId": "<uuid asiento publicado>", "dryRun": true, "ledgerCodes": ["local","group"], "rateType": "closing" }` | `dryRun` devuelve el plan; sin `dryRun` inserta de forma idempotente y audita. |
| `GET /negocio/api/ultra/consolidations` | — | Grupos y miembros vigentes. |
| `POST /negocio/api/ultra/consolidations` | `{ "groupCode": "SAMJURO", "date": "2026-11-30", "rateType": "closing" }` | Balance consolidado con NCI y eliminaciones. |
| `GET /negocio/api/ultra/workflows` | — | Definiciones permitidas y ejecuciones debidas. |
| `POST /negocio/api/ultra/workflows` | `{ "action": "start", "entityType": "closing", "entityId": "<uuid>", "context": { "date": "2026-11-30" } }` | Inicia o reanuda el cierre gobernado. `advance` acepta solo `submit/approve/reject`. |

Si la migración aún no está aplicada, estas rutas responden `503` con un mensaje seguro («La migración Ultra ERP no está aplicada en esta base de datos…»). No se filtran cadenas de conexión ni detalles de Postgres.

### Orden manual para activar Fase 2

1. Aplicar `database/ultra-erp-core.sql` en una base de **pruebas**, con `node database/migrate-ultra-core.mjs --confirm=ULTRA-CORE`.
2. Revisar y aplicar `database/seed-ultra-config.sql` en el mismo entorno (solo `INSERT ... ON CONFLICT DO NOTHING`).
3. Verificar `GET /negocio/api/ultra/ledgers`: deben aparecer 2 libros, 4 reglas, 1 grupo y 1 miembro.
4. Tomar un `id` real de `public.journal_entries` con `status='posted'` y llamar a `POST /negocio/api/ultra/postings` con `dryRun:true`.
5. Revisar que cada asiento derivado esté balanceado; solo entonces repetir sin `dryRun`.
6. Probar `POST /negocio/api/ultra/consolidations` con `groupCode: "SAMJURO"` y una fecha válida.
7. Probar el cierre con `POST /negocio/api/ultra/workflows` (`start` → `submit` → `approve`) con un rol `owner`/`accounting`.
8. Recién después de esa validación, desplegar el Worker y avisar al usuario.

### Verificación de Fase 2

```powershell
npm test       # 58 tests, 58 pass, 0 fail
npm run build  # compile + typecheck + 4 rutas /ultra/* en el manifiesto
```

### Validación en BD real (ya ejecutada)

- Configuración leída con RLS real: libros `local`/`group` en COP, 4 reglas, grupo `SAMJURO`.
- Asiento operativo real `20bd9f33-…` (`invoice`, 2026-11-28, 3 líneas, `$ 1.744.108`).
- `dryRun`: 2 asientos derivados, ambos balanceados. Persistencia: `inserted: 2`, reintento `0` (idempotente).
- Consolidación corregida para usar **solo el libro `group`**: `$ 1.744.108`, sin duplicar el libro local.
- Workflow `ultra.close`: `draft → review → posted`; el guard bloquea al rol `sales` y aprueba `accounting`.

Durante la validación se corrigieron tres defectos reales: el migrador multi-sentencia con Neon HTTP, la falta de unicidad `(tenant_id, id)` en `erp_workflow_instances` y el formato del resultado de idempotencia devuelto por el store Postgres.

## Fase 3A — EPM y tesorería (aplicada)

| Archivo | Qué hace |
|---|---|
| `lib/ultra/epm.js` | Motores puros: presupuestos por dimensión, comparación en unidades menores, posición de caja y previsión (`budget` / `recent_average`). Rechaza comparar monedas distintas sin tasas reales. |
| `lib/ultra/epm-service.js` | Persistencia en `erp_budgets`, `erp_budget_lines`, `erp_cash_positions` y `erp_forecasts`. Lee los reales solo del libro `group`. `runner` inyectable e importación diferida de `db.js`. |
| `app/negocio/api/ultra/epm/route.js` | `GET` con `finance.view` y `POST` con `journal.post` para `budget`, `cash` y `forecast`. El tenant siempre viene de la sesión. |
| `lib/ultra/metadata.js` y `database/ultra-erp-core.sql` | Cuatro objetos nuevos con RLS forzado, trigger `touch_updated_at` y reglas en `erp_policies`. |
| `lib/ultra/epm.test.mjs` y `lib/ultra/epm-service.test.mjs` | 11 pruebas nuevas sin base de datos. |

### Endpoints EPM

| Método y ruta | Resultado |
|---|---|
| `GET /negocio/api/ultra/epm?view=budgets` | Presupuestos con sus líneas hidratadas desde unidades menores. |
| `GET /negocio/api/ultra/epm?view=comparison&budgetId=<uuid>&dimensions=<json>` | Presupuesto vs. asientos derivados del libro `group` en el periodo; filtra por dimensión. |
| `GET /negocio/api/ultra/epm?view=cash` / `?view=forecast` | Posiciones de caja y previsiones guardadas. |
| `POST /negocio/api/ultra/epm` | `{ "action": "budget", ... }`, `{ "action": "cash", ... }` o `{ "action": "forecast", ... }`. Requiere `journal.post` y audita la escritura. |

### Reglas de dinero

- Importes persistidos **siempre en unidades menores**; COP/CLP sin decimales.
- `defineBudget` guarda unidades mayores ya normalizadas y `compareBudget` convierte una sola vez: USD no duplica escala.
- **No se inventa FX**: comparar un presupuesto en moneda distinta a la de reporte falla con un mensaje explícito.
- La comparación usa únicamente el libro `group`, nunca el libro local, para no duplicar importes.
- Re-guardar un presupuesto usa el `id` real devuelto por `ON CONFLICT` antes de insertar las líneas: evita violación de FK y conserva la idempotencia.

### Validación en BD real (ya ejecutada)

- Reales de noviembre del asiento derivado: 3 líneas, débito/crédito `$ 1.744.108`.
- Presupuesto `PT-2026-11-SAMJURO`, creado con esas cuentas y dimensiones reales: comparación con **3 filas y desviación 0**; re-guardado idempotente con el mismo id.
- Caja al 2026-11-30: entradas `$ 1.744.108`, salidas `$ 1.744.108`, cierre `0`. Reintento sin duplicados.
- Previsión: método `recent_average`, periodos `2026-12` y `2027-01`, 2 filas. Reintento sin duplicados.
- RLS real: el rol `sales` ve **0** presupuestos; `owner` ve los permitidos.
- El presupuesto de debug `PT-DEBUG` se eliminó al terminar; quedó solo el presupuesto derivado de datos reales.

Durante la validación se corrigieron seis defectos: expectativa de desviación mal calculada en un test, doble conversión de escala en USD, importación de `fromMinor` desde el módulo equivocado, FK rota al re-guardar presupuestos, `budget.id=null` sobrescribiendo el id devuelto por la BD y `method=null` al guardar previsiones.

### Qué sigue y qué falta en Fase 3

- **Sigue:** Fase 3B (ESG) y la UI mínima del Ultra ERP sobre las cinco APIs.
- **Falta:** métricas ESG con fuente de datos real; datos de holding multi-entidad y tasas FX reales para probar consolidación y comparación en otra moneda (no se inventan).

## Fases siguientes

1. ~~**Fase 1 — Seed de metadatos.**~~ Aplicado en BD.
2. ~~**Fase 2 — API de contabilidad derivada.**~~ Aplicada y verificada en BD real.
3. ~~**Fase 3A — EPM y tesorería.**~~ Aplicada y verificada en BD real. **Falta Fase 3B (ESG).**
4. **Fase 4 — Integraciones.** Webhooks firmados, OAuth2/OIDC/SAML, conectores y API keys con rotación.
5. **Fase 5 — UI mínima del Ultra ERP.** Worklists con acciones directas, object pages con anclas, comandos contextuales por rol/estado, vistas guardadas en URL y PWA/offline.

## Lo que NO se hizo todavía

- No se modificó `SAMJURO`: la verificación previa confirmó que `DATABASE_URL` apunta al ERP (`tenants`/`role_permissions` sí; `pedidos`/`vendedoras` no).
- Sí se aplicó DDL aditivo a la BD del ERP, con confirmación explícita y en una transacción.
- No se tocó `pedidos`, `pedido_items`, `vendedoras`, `panel_acceso`, `auth.users` ni secretos.
- Worker desplegado después de la validación EPM: versión `16577602-a810-476f-846c-d69053b8d3f3` (anterior: `f06ee300-…`). Las cinco rutas `/negocio/api/ultra/*` existen en producción y responden `401` sin sesión en ambos dominios, igual que el resto del panel.
- Todavía no hay UI para estas APIs: solo se consumen por HTTP con sesión válida.
- No se probó consolidación multi-entidad ni FX real: faltan entidades y fuente de tasas; no se inventan.
