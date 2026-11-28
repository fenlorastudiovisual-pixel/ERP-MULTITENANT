# Ultra ERP — roadmap de implementación

Este documento materializa la combinación decidida tras revisar ERPNext/Frappe, Huly, NocoBase e IDurar.

## Principios arquitectónicos (ADR)

- **ADR-001 — Metadatos, pero con RLS real.** Como ERPNext, el dominio se describe en metadatos versionados; a diferencia de ERPNext, las reglas de tenant se compilan a **policies de Postgres**, no quedan solo en Python.
- **ADR-002 — Control plane + data plane.** Como Huly, existe un plano global de identidad/workspace (`erp_entities`) y un data plane por tenant. El routing es determinista por tenant/entidad.
- **ADR-003 — Workflows duraderos.** Como NocoBase v3, los procesos usan estados, guards, effects post-commit, idempotencia y outbox transaccional. No dependemos de su licencia ni de su designer visual.
- **ADR-004 — Ledger innegociable.** El núcleo financiero existe y es append-only; Samjuro ya demostró el patrón `COT → FV → cartera → asiento balanceado`.
- **ADR-005 — Rechazo explícito de IDurar.** No se adopta su modelo de permisos, ni su PDF público, ni su ausencia de tests.

## Qué se entrega en esta primera fase

| Archivo | Qué hace |
|---|---|
| `lib/ultra/metadata.js` | Registro de objetos de negocio estilo DocType: tabla, campos requeridos, permisos, unicidad, auditoría |
| `lib/ultra/policies.js` | Compila metadatos a SQL de RLS (`ENABLE/FORCE`, `DROP/CREATE POLICY`) usando `app.tenant_id` y `app.user_role` |
| `lib/ultra/entities.js` | Jerarquía holding → compañía → sucursal → departamento → centro de costo, con detección de ciclos |
| `lib/ultra/money.js` | Dinero en unidades menores, IVA incluido y validación de asientos balanceados |
| `lib/ultra/workflow.js` | Motor de workflows con idempotencia, guards, reintentos, effects y outbox |
| `database/ultra-erp-core.sql` | Migración aditiva **no aplicada** con tablas del control plane |
| `lib/ultra/*.test.mjs` | Pruebas unitarias sin dependencias nuevas |

## Convención de contexto

`lib/db.js` ya fija dentro de la misma transacción:

- `app.tenant_id`
- `app.user_role`
- `app.actor_id`

Las policies nuevas usan las funciones existentes `public.current_tenant_id()` y `public.is_superadmin()`.

## Migración

La migración SQL **no se ha ejecutado**. Está lista para revisión. Cuando se decida aplicarla en una base que no sea la de producción de Samjuro:

```powershell
node database/migrate-ultra-core.mjs --confirm=ULTRA-CORE
```

El script exige el flag explícito y usa `DATABASE_APP_URL` / `DATABASE_URL` del entorno. No ejecuta `DELETE`, `TRUNCATE` ni `DROP TABLE`.

## Fases siguientes

1. **Fase 1 — Seed de metadatos.** Insertar los descriptores en la BD y generar policies para tablas nuevas.
2. **Fase 2 — Ledger y fiscalidad.** Motor de partidas dobles por jurisdicción, FX histórico y consolidación intercompañía.
3. **Fase 3 — Motor de procesos.** Persistir workflow instances/effects/outbox y exponer API de start/advance/resume.
4. **Fase 4 — Integraciones.** Webhooks firmados, OAuth2/OIDC/SAML, conectores y API keys con rotación.
5. **Fase 5 — UI.** Registry de componentes, dashboards por rol y operaciones masivas heredadas del cotizador de Samjuro.

## Lo que NO se hizo todavía

- No se modificó `SAMJURO`.
- No se aplicó DDL a ninguna base.
- No se tocó `pedidos`, `pedido_items`, `vendedoras`, `panel_acceso`, `auth.users` ni secretos.
- No se desplegó nada.
