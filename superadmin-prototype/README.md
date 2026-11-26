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

#### Las rutas de Access (importante para las demos)

Además de la aplicación de la consola, hay que dejar **cuatro rutas** en Zero Trust → Access controls → Applications. Cloudflare aplica la regla **más específica**, así que no se pisan:

| Aplicación | Dominio | Path | Política |
| --- | --- | --- | --- |
| `ERP Multitenant` (consola) | `erp.fenloravisual.com` | vacío o `*` | **Allow**: Email `fenlorastudiovisual@gmail.com`, One-time PIN |
| `ERP Multitenant — Negocio` | `erp.fenloravisual.com` | `negocio/recuperar*` | **Allow**: Email del negocio, One-time PIN |
| `ERP Multitenant — Panel negocio` | `erp.fenloravisual.com` | `negocio*` | **Bypass**: Include = Everyone |
| `ERP Multitenant — Demos públicas` | `erp.fenloravisual.com` | `demo/*` | **Bypass**: Include = Everyone |

**Importante:** para que una ruta sea pública usa la acción **Bypass**, no **Allow**. Un *Allow* con selector *Everyone* **sigue pidiendo el PIN** porque Cloudflare obliga a autenticar antes de evaluar la regla. Bypass desactiva Access para esa ruta.

El Path de las demos es `demo/*` (con barra) y no `demo*`: así `/demo/<token>` queda público pero `/demos` (el centro privado del Super Admin) sigue protegido por la consola.

Sin la última aplicación, un prospecto que abra un enlace `/demo/...` verá la pantalla de PIN en vez de la demo. **No actives Google y no toques ninguna otra aplicación de Zero Trust.**

## Demos reales: de un negocio semilla a un cliente

Ya no son tarjetas decorativas. Cada demo es un panel navegable con datos operativos guardados en Neon.

1. Entra en **https://erp.fenloravisual.com/demos** (dentro de la consola del Super Admin).
2. Elige el nicho, escribe el nombre del negocio y pulsa **Crear demo**. Se generan 24 productos, 26 clientes, 42 pedidos, 24 facturas y los módulos propios del nicho (agenda, obras, producción, envíos, fincas, suscripciones o alertas).
3. Pulsa **Abrir** para recorrerla: puedes buscar, crear pedidos, avanzar estados y marcar facturas pagadas. Los cambios se guardan en esa demo.
4. Pulsa **Copiar enlace** o escribe el WhatsApp del cliente y pulsa **Enviar por WhatsApp**. Se abre `wa.me` con un mensaje ya redactado y el enlace `https://erp.fenloravisual.com/demo/<token>`. No se envía nada automáticamente: el mensaje queda listo en el teléfono para que lo envíes tú.
5. El prospecto explora y pulsa **Solicitar mi acceso**. Eso captura nombre, WhatsApp y correo; en el centro de demos aparece como **Con lead**.
6. Cuando quieras, pulsa **Convertir en tenant**: la demo se convierte en un negocio real y el correo del lead queda como owner.

El botón **Crear las 15 demos de los negocios** convierte los 15 negocios de muestra (`t1`–`t15`) en demos navegables. Samjuro (`t16`) queda fuera porque es el tenant de prueba real.

Los enlaces son opacos, caducan a los 14 días por defecto y viven en `public.demo_links` con RLS. Los datos se generan con `lib/demo-data.js`. Para crear la tabla en una instalación nueva:

```bash
npm run db:migrate-demos
```

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

Sin `DATABASE_URL` la app sigue funcionando igual con `localStorage`. Con Neon, la consola guarda el estado en `public.app_state` (JSONB) y, en la misma transacción, lo refleja en tablas operativas reales: `plans`, `modules`, `plan_limits`, `tenants`, `subscriptions`, `demo_scenarios`, `demo_tenants`, `demo_links`, `languages`, `translations`, `leads`, `profiles` y `platform_config`. La UI sigue leyendo el JSONB, así que no cambia su aspecto ni su forma de guardar.

### Normalización y RLS real

Los scripts disponibles son:

```bash
npm run db:inspect        # conteos por tabla y resumen del estado (solo lectura)
npm run db:migrate-state  # backfill del JSONB a las tablas operativas (idempotente)
npm run db:migrate-auth   # sesiones rotables y MFA del panel del negocio (idempotente)
npm run db:migrate-demos  # tabla de demos compartibles con datos reales (idempotente)
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

> **Seguridad:** con Cloudflare Access activo, la consola valida el JWT de Access en cada petición y comprueba que el correo corresponda a un `super_admin` activo en Neon. Sin Access, el modo de respaldo usa contraseña hasheada con PBKDF2 y cookie firmada con HMAC. `SUPERADMIN_KEY` es secreto del servidor y nunca viaja al navegador. El panel del negocio usa su propia cookie, contraseña con PBKDF2 de 600.000 iteraciones y MFA TOTP opcional; Access solo protege la recuperación.

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

El negocio **no entra desde la consola del Super Admin**. Tiene su propia puerta en **https://erp.fenloravisual.com/negocio**.

- El usuario entra con el **correo del negocio y su contraseña**. Cloudflare Access **no interviene** en la entrada diaria.
- Si no tiene contraseña o la olvidó, abre **https://erp.fenloravisual.com/negocio/recuperar**: ahí sí Cloudflare Access verifica su correo con **One-time PIN** y la app le permite crear o cambiar la contraseña. Access no "entrega" contraseñas: solo confirma quién es el usuario.
- La contraseña usa PBKDF2 con **600.000 iteraciones**, cookie propia `erp_tenant_session` separada de la del Super Admin y rotación de sesiones al cambiar la contraseña. Opcionalmente se puede activar **MFA con app de autenticación (TOTP)** desde «Seguridad de tu cuenta».
- El negocio se deduce del correo verificado y de `public.tenant_members`; **no se puede elegir con la URL**.
- Los datos se leen con el contexto RLS de ese tenant. El Super Admin no puede abrir este panel.
- Muestra plan, límites, módulos, equipo, salud y facturas del negocio.
- Cada entrada se registra en `public.audit_log`.
- La consola del Super Admin ya no tiene el botón «Entrar al negocio».

**Primera vez:** abre `/negocio/recuperar`, verifica tu correo con el PIN, crea la contraseña y después entra normalmente por `/negocio`.

#### Alta de un negocio (flujo correcto)

En **Tenants → Nuevo negocio** se escribe el **nombre** y el **correo del administrador del negocio**. Al guardar:

- El correo se guarda en el negocio (`settings.email` y `app_state`).
- Se crea o reutiliza su identidad y se le vincula como **owner** del tenant en `public.tenant_members` de forma automática. El mismo correo puede administrar varios negocios; no se duplica su perfil.
- Si el correo del negocio cambia, el acceso anterior se desactiva automáticamente.
- No hace falta dar de alta el correo en ninguna política de Access para entrar: Access solo se usa en `/negocio/recuperar*`.

Los negocios creados antes de que existiera el campo se completan una sola vez con:

```bash
npm run db:backfill-email
```

#### Configurar Access para `/negocio/recuperar` (una sola vez)

Hay que hacer **dos cambios manuales** en **Zero Trust → Access → Applications** para el panel del negocio, y un tercero para las demos (ver la tabla de rutas de Access más arriba):

1. Editar la aplicación existente **`ERP Multitenant — Negocio`**. Dejar el dominio `erp.fenloravisual.com` y cambiar su **Path** de `negocio*` a **`negocio/recuperar*`**. Conservar su política *Allow* con **Email** igual al correo del negocio y método **One-time PIN**, y conservar su **AUD** (`42dd0fd8004d4dfd59461cbed3e42dccd34f995b4a692cd14873852b80fea302`). No actives Google ni toques otras aplicaciones.
2. Crear una aplicación nueva con nombre, por ejemplo, `ERP Multitenant — Panel negocio`, dominio `erp.fenloravisual.com` y Path **`negocio*`**, con política **Bypass** y regla *Include = Everyone*. Esta app es la que permite que `/negocio` cargue sin pedir PIN; la regla más específica (`negocio/recuperar*`) sigue mandando en la recuperación.

No hay que cambiar el secreto `CF_ACCESS_TENANT_AUD`: la app de recuperación conserva su AUD. El token del Super Admin no sirve en el panel y el token de recuperación no sirve en la consola.

Para comprobar la API directamente con la sesión del negocio: `GET /negocio/api/me` (devuelve `authMode: "password"`). Sin sesión devuelve 401.

### 4. Verificar

Abre la URL de producción **https://erp.fenloravisual.com** (o la de `workers.dev` que imprime Wrangler) y comprueba:

```
/api/health  →  {"ok":true,"mode":"neon",...}
```

### 5. Dominio en Cloudflare

El dominio de producción ya configurado es **erp.fenloravisual.com** (Cloudflare → Workers & Pages → `erp-multitenant` → Domains & Routes). Cloudflare creó el DNS automáticamente. Las demos comparten este dominio y viven en **`/demo/<token>`**; no hace falta crear otro subdominio ni otro Worker.

### Preview local del Worker

```bash
Copy-Item .dev.vars.example .dev.vars   # rellena los valores
npm run preview
```

`.dev.vars` está excluido de Git.

## Qué incluye

- **17 secciones** del Super Admin, agrupadas en Centro de control, Configuración, Confianza, Crecimiento y Sistema.
- **Panel de control** con KPIs globales, ingresos, módulos más usados, actividad y alertas.
- **Tenants**: filtros, alta asistida, detalle con pestañas, clonar, suspender y cambiar modo de aislamiento.
- **Planes y funciones**: editor visual de módulos (incluido / add-on / no disponible), límites, feature flags, precio y simulador.
- **Demos reales**: centro en `/demos` con **14 nichos** y datos operativos completos, enlace público `/demo/<token>` interactivo, envío por WhatsApp con `wa.me`, captura de lead y conversión a tenant. El botón masivo convierte los 15 negocios de muestra (Samjuro excluido). La sección antigua de «Fábrica de demos» queda como catálogo visual y enlaza al centro real.
- **Configuración**: usuarios/roles/SSO, idiomas y traducciones, localización fiscal, white-label con vista previa en vivo, módulos y versiones.
- **Operaciones**: seguridad y auditoría, observabilidad, cuotas y colas, soporte con SLA, integraciones, migración de datos, BI global y ajustes del sistema.
- **Persistencia**: Neon (JSONB con RLS) con respaldo en `localStorage`. En Configuración del sistema → Datos del prototipo se pueden restablecer.

## Estructura

```
app/page.js                  Shell: sidebar, topbar, búsqueda, estado y persistencia
app/globals.css              Sistema visual
app/api/state/route.js       GET/PUT/DELETE del estado en Neon
app/api/health/route.js      Comprobación de conexión
lib/data.js                  Datos semilla (10 módulos base + 8 extendidos, 16 tenants, 14 plantillas)
lib/demo-data.js             Generador determinista de datos operativos por nicho
lib/db.js                    Cliente Neon + contexto RLS por transacción
app/demos/page.js            Centro de demos del Super Admin
app/demo/[token]/page.js     Panel público interactivo de la demo
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
