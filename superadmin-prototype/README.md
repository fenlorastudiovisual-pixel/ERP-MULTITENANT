# ERP Multitenant — Prototipo del Super Admin

Prototipo navegable del centro de control del nuevo ERP multitenant. Diseño independiente: no reutiliza código ni datos de ningún proyecto anterior.

## Arrancar

```bash
cd "FENLORA VISUAL STUDIO/ERP-MULTITENANT/superadmin-prototype"
npm install
npm run dev
```

Abrir **http://localhost:8790**. Para comprobar la compilación: `npm run build`.

## Conectar Neon (Postgres gratuito)

1. Crea un proyecto en **https://neon.tech** (plan Free, sin tarjeta).
2. Copia la *connection string* (usa la del **pooler**) del Dashboard → tu proyecto → *Connection string*.
3. Copia `.env.example` a `.env.local` y pega la URL en `DATABASE_URL`. Cambia las dos claves del Super Admin.
4. Aplica el esquema:

   ```bash
   npm run db:setup
   npm run db:check
   ```

5. Reinicia `npm run dev`. El pie del menú debe decir **«Neon conectado»**. Comprueba `http://localhost:8790/api/health`.

Sin `DATABASE_URL` la app sigue funcionando igual con `localStorage`. Con Neon, tenants, planes, demos, usuarios, idiomas, leads y configuración se guardan en `public.app_state` (JSONB) protegido por RLS: solo una sesión con `app.user_role = 'super_admin'` puede leerlo o escribirlo.

### Contexto RLS por tenant

`lib/db.js` expone `runAsTenant(tenantId, (tx) => tx\`...\`)` y `runAsSuperAdmin(...)`. Ambos fijan `app.tenant_id`, `app.user_role` y `app.actor_id` con `set_config(..., true)` dentro de la misma transacción, antes de la consulta. Así el valor no se filtra entre peticiones ni entre tenants.

`npm run db:check` imprime ambos contextos para verificarlo.

> **Seguridad:** `SUPERADMIN_KEY` / `NEXT_PUBLIC_SUPERADMIN_KEY` son una medida provisional para el prototipo. Antes de producción, sustitúyelas por autenticación real (sesión firmada) y comprueba el rol dentro de cada endpoint.

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
npx wrangler secret put SUPERADMIN_KEY
```

Pega la misma connection string de Neon y la misma frase secreta que usas en `.env.local`. `NEXT_PUBLIC_SUPERADMIN_KEY` no va como secret: se incrusta en el bundle del navegador durante el build (por eso es público por diseño).

### 3. Compilar y desplegar

```bash
npm run deploy
```

El script `database/build-worker.mjs` oculta `.env.local` durante el build para que **`DATABASE_URL` y `SUPERADMIN_KEY` no queden horneados en el bundle**; solo deja `NEXT_PUBLIC_SUPERADMIN_KEY`. En runtime, los secrets de Cloudflare sobrescriben `process.env`.

### 4. Verificar

Abre la URL que imprime Wrangler (normalmente `https://erp-multitenant.<tu-cuenta>.workers.dev`) y comprueba:

```
/api/health  →  {"ok":true,"mode":"neon",...}
```

### 5. Dominio en Cloudflare

En Cloudflare Dashboard → Workers & Pages → `erp-multitenant` → **Settings → Domains & Routes** añade el dominio, por ejemplo `erp.tudominio.com`. Cloudflare crea el DNS automáticamente. Las demos pueden ir en `demo.tudominio.com` apuntando al mismo Worker o a un Worker separado más adelante.

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
