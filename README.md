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

## ERP operativo (Fase 3)

El panel `/negocio` ya trabaja contra Neon con un solo modelo de datos y un solo libro contable por tenant. `t16` es **solo lectura**: todas las pruebas y escrituras ocurren en `t17_sandbox` (Samjuro Piloto).

**El piloto ya contiene los datos reales de Samjuro**, importados desde su Supabase con un rol de solo lectura (`erp_reader`) y sin escribir nunca en el sistema real: 635 productos, 960 presentaciones, 158 clientes (151 únicos por documento), 131 pedidos y 5.415 líneas. El SKU validado fue `CH-ESM-208` (Esmalte #208 Aries). `t16` conserva sus datos sintéticos anteriores solo como referencia.

La importación quedó registrada en `samjuro_stage.raw_tables` (Neon) y en `SAMJURO-EXPORT/raw/*.json`. Para repetirla:

```bash
cd superadmin-prototype
node database/import-samjuro.mjs   # lee el staging, reemplaza solo t17_sandbox
```

El script no contiene credenciales: toma `DATABASE_URL` de `.env.local`. La fuente real **no tiene costos de proveedor** (0 de 960 presentaciones y 0 en el historial), por eso las utilidades muestran costo $0 hasta que se registren compras en el ERP. El IVA está incluido en los precios de Samjuro; el márgen se calcula restando el 19% antes de descontar el costo.

```bash
cd superadmin-prototype
npm run db:erp-core       # migración aditiva: 48 tablas con RLS forzado
npm run db:erp-inventory  # inventario y compras: 56 tablas con RLS forzado
npm run db:sandbox        # clona t16 en t17_sandbox y verifica los conteos de t16
npm run db:verify-phase3  # transferencia, ajuste, conteo, OC y recepción
npm run build
npm run dev               # http://localhost:8790
```

- Las sesiones nuevas entran por defecto al sandbox, llamado **Samjuro Piloto**; el panel lo muestra en la pestaña **Detalle**.
- La pestaña **Utilidades** muestra precio final con IVA, precio sin IVA, costo de proveedor, utilidad bruta y margen por producto y por pedido. El IVA se excluye del margen porque no es ganancia.
- **Finanzas** emite facturas desde pedidos confirmados/entregados, registra pagos y consulta cartera y asientos.
- **Inventario** gestiona almacenes, transferencias, ajustes con motivo, conteos físicos y valoración promedio/FIFO en una sola vista.
- **Compras** crea y aprueba pedidos a proveedores (partners), registra recepciones y genera entrada de stock más asiento balanceado `1510/1355/2405`.
- `public.invoices` sigue siendo la facturación de Fenlora al tenant; las facturas del negocio están en `public.invoices_ops`.
- DIAN queda preparada (numeración, UUID/QR, eventos) pero sin envío real hasta tener resolución y certificado.
- La sección «Demos» permanece vacía: sin botones ni enlaces de prueba.

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
