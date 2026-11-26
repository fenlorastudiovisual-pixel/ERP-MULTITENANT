# ERP Multitenant — Prototipo del Super Admin

Prototipo navegable del centro de control del nuevo ERP multitenant. Diseño independiente: no reutiliza código ni datos de ningún proyecto anterior.

## Arrancar

```bash
cd "FENLORA VISUAL STUDIO/ERP-MULTITENANT/superadmin-prototype"
npm install
npm run dev
```

Abrir **http://localhost:8790**. Para comprobar la compilación: `npm run build`.

## Cómo entrar (producción)

Abre **https://erp.fenloravisual.com**. El acceso se hace con Cloudflare Access:

1. Cloudflare te muestra la pantalla de inicio de sesión.
2. Elige **One-time PIN** y escribe `fenlorastudiovisual@gmail.com`.
3. Te llega un código al correo; al introducirlo estás dentro del panel. **No hay contraseña del ERP que recordar**.

Para salir, pulsa **Salir** arriba a la derecha. Eso cierra también la sesión de Cloudflare.

### Activar Cloudflare Access

El código ya está preparado; falta crear la aplicación en el panel de Cloudflare:

1. Entra en **dash.cloudflare.com** → tu cuenta → **Zero Trust** → **Access** → **Applications** → **Add an application** → **Self-hosted**.
2. Application name: `ERP Multitenant`. Domain: `erp.fenloravisual.com`.
3. En **Policies**, crea una regla *Allow* con **Email** igual a `fenlorastudiovisual@gmail.com` y método **One-time PIN**. No actives Google: afectaría a otros sistemas de la cuenta.
4. Guarda y copia el **Application Audience (AUD) Tag** y el **team domain** (`https://<tu-equipo>.cloudflareaccess.com`).
5. Protege también el Worker: **Workers & Pages** → `erp-multitenant` → pestaña **Access** → **Protect this Worker behind Access** → **All traffic**. Así no se puede evadir Access por la URL `workers.dev`.
6. Añade los secrets y despliega:

```powershell
npx wrangler secret put CF_ACCESS_TEAM_DOMAIN
npx wrangler secret put CF_ACCESS_AUD
npm run deploy
```

Mientras esos dos secrets no existan, sigue funcionando el login con contraseña. En cuanto se añaden, el formulario queda desactivado.

El plan gratuito de Cloudflare Zero Trust incluye hasta 50 usuarios.

Nota: esta cuenta no ofrece la opción de proteger el Worker a nivel de Worker. La URL `workers.dev` puede mostrar la interfaz, pero `/api/me` y `/api/state` devuelven 401 sin un token válido de Access y el login por contraseña está desactivado. Para mayor rigor se puede crear una segunda aplicación Access con ese hostname como destino.

## Conectar Neon (Postgres gratuito)

1. Crea un proyecto en **https://neon.tech** (plan Free, sin tarjeta).
2. Copia la *connection string* (usa la del **pooler**) del Dashboard → tu proyecto → *Connection string*.
3. Copia `.env.example` a `.env.local` y pega la URL en `DATABASE_URL`. Cambia la frase secreta `SUPERADMIN_KEY`.
4. Aplica el esquema:

   ```bash
   npm run db:setup
   npm run db:check
   ```

5. Reinicia `npm run dev`. El pie del menú debe decir **«Neon conectado»**. Comprueba `http://localhost:8790/api/health`.

Sin `DATABASE_URL` la app sigue funcionando igual con `localStorage`. Con Neon, la consola guarda el estado en `public.app_state` (JSONB) y, en la misma transacción, lo refleja en tablas operativas reales: `plans`, `modules`, `plan_limits`, `tenants`, `subscriptions`, `demo_scenarios`, `demo_tenants`, `languages`, `translations`, `leads`, `profiles` y `platform_config`. La UI sigue leyendo el JSONB, así que no cambia su aspecto ni su forma de guardar.

### Normalización y RLS real

Los scripts disponibles son:

```bash
npm run db:inspect        # conteos por tabla y resumen del estado (solo lectura)
npm run db:migrate-state  # backfill del JSONB a las tablas operativas (idempotente)
npm run db:rls-check      # comprueba que RLS se aplica de verdad
```

Los UUID son deterministas: `t1`, `d7` o `inicio` siempre producen el mismo UUID, por lo que la migración se puede repetir sin duplicados.

Neon conecta por defecto con `neondb_owner`, que tiene `BYPASSRLS` e ignora las policies. Para que RLS se aplique de verdad se creó el rol `erp_app` (LOGIN sin `BYPASSRLS`):

```bash
npm run db:role
```

Ese script escribe `DATABASE_APP_URL` en `.env.local` y `.dev.vars` (ninguno se versiona). `lib/db.js` usa esa URL para las consultas de la app y `DATABASE_URL` queda reservada para migraciones. En producción hay que añadir el secreto con `npx wrangler secret put DATABASE_APP_URL`.

### Contexto RLS por tenant

`lib/db.js` expone `runAsTenant(tenantId, (tx) => tx\`...\`)` y `runAsSuperAdmin(...)`. Ambos fijan `app.tenant_id`, `app.user_role` y `app.actor_id` con `set_config(..., true)` dentro de la misma transacción, antes de la consulta. Así el valor no se filtra entre peticiones ni entre tenants.

`npm run db:check` imprime ambos contextos y `npm run db:rls-check` confirma que una consulta sin contexto devuelve 0 filas.

> **Seguridad:** con Cloudflare Access activo, el ERP valida el JWT de Access en cada petición y comprueba que el correo corresponda a un `super_admin` activo en Neon. Sin Access, el modo de respaldo usa contraseña hasheada con PBKDF2 y cookie firmada con HMAC. `SUPERADMIN_KEY` es secreto del servidor y nunca viaja al navegador.

## Desplegar en Cloudflare Workers (OpenNext)

La app ya está preparada para correr como Worker. `wrangler.jsonc` define el Worker `erp-multitenant` y `open-next.config.ts` usa la configuración mínima (sin R2/D1 obligatorios).

### 1. Autenticar

```bash
npm run cf:login
```

### 2. Crear los secrets en Cloudflare

**No los pongas en `wrangler.jsonc`** (ese archivo sí se sube a GitHub). Usa secrets:

```bash
npx wrangler secret put DATABASE_URL
npx wrangler secret put DATABASE_APP_URL
npx wrangler secret put SUPERADMIN_KEY
npx wrangler secret put CF_ACCESS_TEAM_DOMAIN
npx wrangler secret put CF_ACCESS_AUD
npx wrangler secret put CF_ACCESS_TENANT_AUD
```

Pega la connection string administrativa de Neon, la URL del rol `erp_app` generada por `npm run db:role`, la frase secreta de `.env.local`, el team domain y el AUD tag de tu aplicación Access. No existe `NEXT_PUBLIC_SUPERADMIN_KEY`: esa clave pública ya no se usa.

### 3. Compilar y desplegar

```bash
npm run deploy
```

El script `database/build-worker.mjs` oculta todos los archivos `.env*` durante el build para que **`DATABASE_URL` y `SUPERADMIN_KEY` no queden horneados en el bundle**. En runtime, los secrets de Cloudflare se leen desde `process.env`.

### Panel independiente del negocio (`/negocio`)

El negocio **no entra desde la consola del Super Admin**. Tiene su propia puerta en **https://erp.fenloravisual.com/negocio**, protegida por una aplicación de Access distinta.

- El usuario entra con su **One-time PIN** al correo que tenga vinculado a un negocio.
- El negocio se deduce del correo verificado y de `public.tenant_members`; **no se puede elegir con la URL**.
- Los datos se leen con el contexto RLS de ese tenant. El Super Admin no puede abrir este panel.
- Muestra plan, límites, módulos, equipo, salud y facturas del negocio.
- Cada entrada se registra en `public.audit_log`.
- La consola del Super Admin ya no tiene el botón «Entrar al negocio».

#### Alta de un negocio (flujo correcto)

En **Tenants → Nuevo negocio** se escribe el **nombre** y el **correo del administrador del negocio**. Al guardar:

- El correo se guarda en el negocio (`settings.email` y `app_state`).
- Se crea o reutiliza su identidad y se le vincula como **owner** del tenant en `public.tenant_members` de forma automática. El mismo correo puede administrar varios negocios; no se duplica su perfil.
- Si el correo del negocio cambia, el acceso anterior se desactiva automáticamente.
- El único paso manual restante es permitir ese correo en la política de Access del panel (ver abajo).

Los negocios creados antes de que existiera el campo se completan una sola vez con:

```bash
npm run db:backfill-email
```

#### Configurar Access para `/negocio` (una sola vez)

En **Zero Trust → Access → Applications → Add an application → Self-hosted**:

1. Application name: `ERP Multitenant — Negocio`.
2. Domain: `erp.fenloravisual.com` y Path: `negocio*`.
3. Policy *Allow* con **Email** igual al correo del negocio y método **One-time PIN**. No actives Google.
4. Guarda y copia el **Application Audience (AUD) Tag** de esta nueva aplicación.
5. Añade el secreto (lo hace el administrador técnico): `npx wrangler secret put CF_ACCESS_TENANT_AUD`.

La regla de `/negocio` es más específica que la del dominio completo, así que Cloudflare aplica la nueva política solo a esa ruta. El token del Super Admin no sirve aquí y el token del negocio no sirve en la consola.

Para comprobar la API directamente con la sesión del negocio: `GET /negocio/api/me`.

### 4. Verificar

Abre la URL de producción **https://erp.fenloravisual.com** (o la de `workers.dev` que imprime Wrangler) y comprueba:

```
/api/health  →  {"ok":true,"mode":"neon",...}
```

### 5. Dominio en Cloudflare

El dominio de producción ya configurado es **erp.fenloravisual.com** (Cloudflare → Workers & Pages → `erp-multitenant` → Domains & Routes). Cloudflare creó el DNS automáticamente. Las demos pueden ir en `demo.fenloravisual.com` apuntando al mismo Worker o a un Worker separado más adelante.

### Preview local del Worker

```bash
Copy-Item .dev.vars.example .dev.vars   # rellena los valores
npm run preview
```

`.dev.vars` está excluido de Git.

## Qué incluye

- **17 secciones** del Super Admin, agrupadas en Centro de control, Configuración, Confianza, Crecimiento y Sistema.
- **Panel de control** con KPIs globales, ingresos, módulos más usados, actividad y alertas.
- **Tenants**: filtros, alta asistida, detalle con pestañas, clonar, suspender, cambiar modo de aislamiento e impersonación auditada.
- **Planes y funciones**: editor visual de módulos (incluido / add-on / no disponible), límites, feature flags, precio y simulador.
- **Fábrica de demos**: las **14 demos del diseño**, asistente de 4 pasos, enlace con caducidad, vista previa con tour guiado, captura de lead, métricas y conversión a tenant real.
- **Configuración**: usuarios/roles/SSO, idiomas y traducciones, localización fiscal, white-label con vista previa en vivo, módulos y versiones.
- **Operaciones**: seguridad y auditoría, observabilidad, cuotas y colas, soporte con SLA, integraciones, migración de datos, BI global y ajustes del sistema.
- **Persistencia**: Neon (JSONB con RLS) con respaldo en `localStorage`. En Configuración del sistema → Datos del prototipo se pueden restablecer.

## Estructura

```
app/page.js                  Shell: sidebar, topbar, búsqueda, estado y persistencia
app/globals.css              Sistema visual
app/api/state/route.js       GET/PUT/DELETE del estado en Neon
app/api/health/route.js      Comprobación de conexión
lib/data.js                  Datos semilla (10 módulos base + 8 extendidos, 15 tenants, 14 demos)
lib/db.js                    Cliente Neon + contexto RLS por transacción
components/ui.jsx            Componentes reutilizables
components/sections-core.jsx Dashboard, Tenants, Plans, Billing
components/sections-config.jsx Usuarios, Idiomas, Localización, Branding, Módulos, Demos
components/sections-ops.jsx  Seguridad, Operaciones, Soporte, Integraciones, Datos, BI, Settings
database/schema.sql          Esquema Postgres con RLS, planes, módulos, flags, demos y auditoría
database/setup.mjs           Aplica schema.sql a Neon
database/check.mjs           Verifica conexión y contexto RLS
database/build-worker.mjs    Compila el Worker sin hornear secretos
open-next.config.ts          Configuración OpenNext para Cloudflare
wrangler.jsonc               Configuración del Worker
.dev.vars.example            Plantilla de variables locales del Worker
```

## Arquitectura y diseño

El diseño completo (arquitectura Pool/Bridge/Silo, 17 apartados del Super Admin, 14 demos y roadmap) está en `../DISENO-ERP-MULTITENANT.md`.
