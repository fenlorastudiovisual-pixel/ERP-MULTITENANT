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
2. Elige **Google** y entra con `fenlorastudiovisual@gmail.com` (o el código que te llega al correo).
3. Ya estás dentro del panel. **No hay contraseña del ERP que recordar**: la recuperas con Google.

Para salir, pulsa **Salir** arriba a la derecha. Eso cierra también la sesión de Cloudflare.

### Activar Cloudflare Access

El código ya está preparado; falta crear la aplicación en el panel de Cloudflare:

1. Entra en **dash.cloudflare.com** → tu cuenta → **Zero Trust** → **Access** → **Applications** → **Add an application** → **Self-hosted**.
2. Application name: `ERP Multitenant`. Domain: `erp.fenloravisual.com`.
3. En **Policies**, crea una regla *Allow* con **Email** igual a `fenlorastudiovisual@gmail.com`. Añade también un segundo método (por ejemplo *One-time PIN*) para no depender solo de Google.
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

Sin `DATABASE_URL` la app sigue funcionando igual con `localStorage`. Con Neon, tenants, planes, demos, usuarios, idiomas, leads y configuración se guardan en `public.app_state` (JSONB) protegido por RLS: solo una sesión con `app.user_role = 'super_admin'` puede leerlo o escribirlo.

### Contexto RLS por tenant

`lib/db.js` expone `runAsTenant(tenantId, (tx) => tx\`...\`)` y `runAsSuperAdmin(...)`. Ambos fijan `app.tenant_id`, `app.user_role` y `app.actor_id` con `set_config(..., true)` dentro de la misma transacción, antes de la consulta. Así el valor no se filtra entre peticiones ni entre tenants.

`npm run db:check` imprime ambos contextos para verificarlo.

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
npx wrangler secret put SUPERADMIN_KEY
npx wrangler secret put CF_ACCESS_TEAM_DOMAIN
npx wrangler secret put CF_ACCESS_AUD
```

Pega la misma connection string de Neon y la misma frase secreta que usas en `.env.local`, además del team domain y el AUD tag de tu aplicación Access. No existe `NEXT_PUBLIC_SUPERADMIN_KEY`: esa clave pública ya no se usa.

### 3. Compilar y desplegar

```bash
npm run deploy
```

El script `database/build-worker.mjs` oculta todos los archivos `.env*` durante el build para que **`DATABASE_URL` y `SUPERADMIN_KEY` no queden horneados en el bundle**. En runtime, los secrets de Cloudflare se leen desde `process.env`.

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
