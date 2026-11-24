# ERP-MULTITENANT

Raíz del proyecto del nuevo ERP multitenant. **Carpeta independiente**: no reutiliza código ni datos del proyecto anterior.

Repositorio: https://github.com/fenlorastudiovisual-pixel/ERP-MULTITENANT

Producción: **https://erp.fenloravisual.com** (Cloudflare Worker `erp-multitenant` + Neon).

## Abrir en Visual Studio Code

1. Abrir VS Code.
2. **File → Open Folder…** y seleccionar esta carpeta:
   `D:\datos\Desktop\FENLORA VISUAL STUDIO\ERP-MULTITENANT`
3. Desde la terminal integrada de VS Code:

   ```bash
   cd superadmin-prototype
   npm install
   npm run dev
   ```

4. Abrir **http://localhost:8790**.

> No modifiques el proyecto anterior: esta carpeta es totalmente independiente.

## Contenido

```
DISENO-ERP-MULTITENANT.md   Diseño completo: arquitectura, 17 secciones del Super Admin y 14 demos
superadmin-prototype/       Prototipo navegable Next.js + React
  app/                      Shell, estilos y endpoints (/api/state, /api/health)
  components/               Secciones y componentes reutilizables
  lib/                      Datos semilla y cliente de Neon con contexto RLS
  database/                 schema.sql, script de instalación y verificación
  README.md                 Guía detallada del prototipo
```

## Base de datos

El prototipo funciona sin base de datos (datos en `localStorage`). Para conectarlo a Neon:

1. Copiar `superadmin-prototype/.env.example` a `superadmin-prototype/.env.local`.
2. Pegar la connection string de Neon en `DATABASE_URL` y configurar las claves del Super Admin.
3. Ejecutar desde `superadmin-prototype/`:

   ```bash
   npm run db:setup
   npm run db:check
   ```

`.env.local` está excluido en `.gitignore`: la connection string **nunca** debe subirse a GitHub.

## Dominios y despliegue

Neon es solo Postgres. Los dominios y subdominios (`erp.tudominio.com`, `demo.tudominio.com`, etc.) se gestionan en Cloudflare.

La app se despliega como **Cloudflare Worker** con OpenNext:

```bash
cd superadmin-prototype
npm run cf:login
npx wrangler secret put DATABASE_URL
npx wrangler secret put SUPERADMIN_KEY
npm run deploy
```

El Worker se llama `erp-multitenant`. En Cloudflare → Workers & Pages → `erp-multitenant` → **Domains & Routes** se añade el dominio (por ejemplo `erp.tudominio.com`). La guía completa está en `superadmin-prototype/README.md`.
