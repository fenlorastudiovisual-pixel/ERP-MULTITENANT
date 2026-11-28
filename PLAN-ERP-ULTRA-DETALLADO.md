# Plan ultra detallado de los ERP — ERP Multitenant / Fenlora Visual Studio

**Estado:** modelo aprobado por el usuario («hazla como lo hacen los grandes»). Fases 0–3 implementadas, verificadas en Neon y desplegadas; siguiente: Fase 4 (CRM/WhatsApp y BI). Samjuro (`t16`) sigue en solo lectura.
**Fecha:** 2026-11-27.
**Alcance:** plataforma `ERP-MULTITENANT` (proyecto independiente), tenant `t16` usado **solo como referencia de lectura**, tenant `t17_sandbox` (Samjuro Piloto) para pruebas de escritura, producción `https://erp.fenloravisual.com`.

> **Aclaración importante (actualizada):** los 1.240 productos, 480 clientes, 620 pedidos y 2.168 líneas que siguen en `t16` son **datos sintéticos generados para probar el sistema** (SKU `SKU-00001…`, nombres como «Limpia Económico Limpieza 1») y sirven solo como referencia de lectura. **El piloto `t17_sandbox` ya fue reemplazado por los datos reales de Samjuro**, importados desde su Supabase en modo solo lectura (ver §18). Samjuro es una empresa real con su propia cuenta de Supabase y su propio dominio; el ERP no escribe ni despliega allí. El panel indica ahora que las cifras del piloto son reales y que el costo de proveedor está pendiente de registro.

---

## 0. Resumen ejecutivo (la decisión que se propone)

**Propuesta central: un ERP lógico por negocio (tenant), con un núcleo común y «perfiles verticales» activables. No un ERP distinto por cada nicho, ni varios ERP dentro del mismo negocio.**

| Pregunta del usuario | Respuesta concreta propuesta |
| --- | --- |
| ¿Qué tipos de ERP? | 1 plataforma, 1 núcleo transaccional y 12 perfiles verticales (retail/distribución, restaurante, farmacia, e-commerce, servicios/agencia, construcción, manufactura, logística, clínica/salud, educación, inmobiliaria, profesionales independientes). Cada perfil activa módulos y tablas específicas sobre el mismo núcleo. |
| ¿Cada negocio manejaría un ERP? | Sí: cada **tenant** tiene su propio ERP (sus datos, su configuración, sus usuarios, su numeración y su RLS). Hoy hay 1 tenant de referencia (`t16`) y 1 piloto (`t17_sandbox`), ambos con datos de prueba pendientes de importar desde Samjuro. |
| ¿Varios ERP para cada negocio? | No. Varios ERP para el mismo negocio romperían la fuente de verdad, duplicarían contabilidad y stock y multiplicarían integraciones. Solo se crea un tenant adicional cuando hay una **persona jurídica o unidad operativa realmente separada** que requiere balances propios. |
| ¿Qué tendrá cada ERP? | Núcleo: maestros, inventario/valoración, compras, ventas, facturación, cartera, contabilidad, tesorería, BI y auditoría. Módulos verticales según perfil. Todo con roles, permisos, flujos, KPIs e integraciones. |
| ¿Por dónde empezar? | Perfil **Retail/Distribuidora** con Samjuro como **referencia de solo lectura**. Sus 1.240 productos, 480 clientes, 620 pedidos, 2.168 líneas y 1.980 movimientos se usan para diseñar y verificar, nunca para probar escrituras. Las pruebas de escritura se hacen en un **tenant sandbox clonado** (`t17_sandbox`). |

**Regla de oro:** si una función no se puede explicar con una tabla real, un rol real, un flujo real y un KPI real, no se implementa. Esto evita repetir el problema de las demos «bonitas pero inútiles».

---

## 1. Investigación de mercado y qué aprendimos (fuentes verificadas)

### 1.1 Panorama de productos (lo que el mercado ya considera «un ERP completo»)

| Producto | Cobertura observada | Lección para nuestro ERP |
| --- | --- | --- |
| **Odoo** (catálogo oficial, `odoo.com/es_ES/apps`) | Contabilidad, facturación, gastos, BI, documentos, CRM, ventas, POS tienda, POS restaurante, suscripciones, alquiler, website, eCommerce, blog, live chat, eLearning, inventario, manufactura, PLM, compras, calidad, RRHH, marketing, proyectos, service/helpdesk, IoT e IA. | La modularidad es el estándar esperado. Nuestro catálogo de módulos ya existe en `public.modules`; debe pasar de etiqueta decorativa a control real de activación por tenant. |
| **Microsoft Dynamics 365 Business Central** (sitio oficial) | ERP “agentic” para PYMES, agentes de gastos, pedidos de venta y cuentas por pagar, integración Microsoft 365, más de 55.000 empresas citadas. | La IA útil no es un chatbot suelto: son agentes dentro de flujos concretos (validar factura, sugerir pedido, conciliar). Siempre con aprobación humana. |
| **SAP Business One** (comparativas 2026) | Control financiero y de inventario maduro, casos de manufactura consolidados, ecosistema de partners. UX más pesada y dependencia del partner. | No copiar su complejidad; copiar su disciplina de control: valoración, auditoría y separación de roles. |
| **Oracle NetSuite** (comparativas 2026) | Referencia en finanzas multi-entidad y consolidación. | Si un dueño tiene dos razones sociales, se modelan como dos tenants y se consolida arriba; no se mezclan en un solo ERP. |
| **Zoho / ERPNext** (comparativas 2026) | Alternativas de coste bajo y código abierto; suficientes para PYMES pequeñas, con menos profundidad industrial. | Nuestro diferencial no es «tener más módulos», sino datos reales, despliegue rápido y WhatsApp operativo en LATAM. |

### 1.2 Datos de implementación (por qué hay que ir por fases)

- Estudio citado de 640 proyectos terminados: solo **32 % dentro de presupuesto** y **27 % en la fecha prevista**; varios análisis sitúan entre **55 % y 75 %** los proyectos que no cumplen objetivos originales (flectic.com, 2026).
- Gartner: más del **70 %** de iniciativas ERP no cumplirán completamente su business case para 2027; hasta **25 %** fallarán catastróficamente. En IA agentica, más del **40 %** podría cancelarse para 2027 por coste/valor poco claro.
- Panorama 2026 (170 organizaciones): mediana **9 meses** de duración, **50,6 %** dentro de presupuesto, ~**30 %** sobre presupuesto, **58,8 %** a tiempo; BI es la iniciativa digital más desplegada (**55,3 %**).

**Conclusión:** un “big bang” de 20 módulos es estadísticamente una mala idea. El plan se divide en fases con criterios de aceptación verificables en Neon.

### 1.3 Demanda real (Workana, Fiverr, Meta Ads)

- Workana (marzo 2026): proyecto de **implementación Odoo Enterprise + WooCommerce para distribución B2B multiempresa**, reemplazando QuickBooks + ForceManager. La demanda habla de *distribución*, *multiempresa*, *migración* e *integración*, no de demos.
- Fiverr: gigs de implementación Odoo (configuración contable, inventario, manufactura, RRHH) desde servicios básicos baratos hasta proyectos de **USD 1.000–2.500**; el valor está en puesta en marcha e integraciones.
- Meta Ad Library vía trycrush.ai: Biziverse («ERP & CRM for Every Business», 197 días activo) destaca **leads, facturación, inventario, manufactura, cuentas, tareas y soporte**; Sprites reporta **4.726 anuncios** de facturación; Wanqara vende POS/facturación con CTA directo a WhatsApp.

**Conclusión:** el mensaje de venta debe ser operativo y concreto («controla stock, factura y cobra»), no «mira esta demo».

### 1.4 WhatsApp en LATAM

- Meta/Kantar (11.056 adultos, 22 mercados, abril–septiembre 2025): **72,4 %** más probabilidad de compra y **74,6 %** más confianza cuando el negocio ofrece mensajería; **66,8 %** se frustra si no puede escribirle al negocio.
- LATAM: 420–530 M usuarios, penetración superior al 90 % en varios países.
- **Restricción actual:** no hay credenciales Meta. Por eso el flujo es `https://wa.me/<teléfono>?text=...` y el usuario envía manualmente. No se promete envío automático, bots ni API oficial hasta que existan credenciales.

---

## 2. Inventario de lo que ya existe (real, no propuesto)

### 2.1 Plataforma y acceso

- Worker Cloudflare `erp-multitenant`, dominio `erp.fenloravisual.com`, comparación `erp-multitenant.fenlorastudiovisual.workers.dev`.
- Neon Free con connection string **Pooled**; RLS forzado en todas las tablas operativas (`FORCE ROW LEVEL SECURITY`).
- 5 aplicaciones de Cloudflare Access: consola (AUD `7a37…`), recuperación/panel (`42dd…`), apps `c23e…`, `3fb4…`, `60c9…`, `ad47…`, `e2ae…`. Rutas públicas con **Bypass**, no `Allow`: `demo/*` y `api/demo/*`.
- Consola Super Admin: PIN por correo a `fenlorastudiovisual@gmail.com`. Panel `/negocio`: correo + contraseña; recuperación por PIN; MFA TOTP opcional (`public.tenant_mfa`).

### 2.2 Base de datos (30 tablas verificadas en `database/schema.sql`)

**Gestión / plataforma:** `auth.users`, `tenant_mfa`, `plans`, `modules`, `plan_modules`, `plan_limits`, `feature_flags`, `plan_flags`, `tenants`, `tenant_domains`, `tenant_modules`, `tenant_flags`, `subscriptions`, `invoices` (facturación *de la plataforma*, no facturas del negocio), `profiles`, `tenant_members`, `audit_log`, `app_state`, `platform_config`, `languages`, `translations`, `leads`.

**Demos (en pausa, datos reales pero no se promocionan):** `demo_scenarios`, `demo_tenants`, `demo_leads`, `demo_links`.

**Operativo real (fuente de verdad de Samjuro):** `products`, `customers`, `orders`, `order_items`, `stock_movements`.

### 2.3 Datos reales en Neon

| Tabla | Registros |
| --- | ---: |
| `products` | 1.240 |
| `customers` | 480 |
| `orders` | 620 |
| `order_items` | 2.168 |
| `stock_movements` | 1.980 |
| `tenants` | 1 (`t16` Samjuro) |
| `app_state.demos` / `.leads` | 0 / 0 |

### 2.4 Rutas operativas ya funcionando

`/negocio` con pestañas Resumen, Productos, Clientes, Pedidos, Facturación, Seguridad y Detalle; APIs `/negocio/api/me`, `overview`, `products`, `customers`, `orders`, `orders/[id]`; altas, descuento de stock con movimiento, ajustes de inventario y cambio de estado probados y limpiados.

### 2.5 Limitaciones actuales que el plan resuelve

1. `public.invoices` es la factura que Fenlora cobra al tenant; **no** es la factura que Samjuro le cobra a sus clientes. Falta facturación operativa.
2. No hay contabilidad/asientos: no existe balance, ni conciliación, ni costo de venta real.
3. Stock es un entero global por producto: no hay almacenes, lotes, series ni valoración.
4. No hay proveedores, compras ni cuentas por pagar.
5. No hay cartera, pagos, anticipos ni notas crédito.
6. `tenant_members` tiene un rol de texto libre sin matriz de permisos.
7. La consola muestra secciones que hoy no ejecutan acciones reales (planes, módulos, integraciones); el plan las convierte en configuración persistida.
8. La sección «Demos» se mantiene visible pero vacía, sin botones ni enlaces.

### 2.6 Regla de no intervención sobre Samjuro (decisión del usuario)

- **Samjuro (`t16`) es de solo lectura.** No se crean, editan, cancelan ni eliminan productos, clientes, pedidos, movimientos ni facturas en ese tenant. No se ejecutan scripts de seed, migraciones con datos de prueba ni pruebas de escritura contra `t16`.
- Se permiten únicamente `SELECT` para revisar la información real y validar que los reportes coincidan con los totales existentes.
- Toda prueba que necesite escribir (emitir factura, registrar pago, ajustar stock, migrar, contabilizar) se ejecuta en **`t17_sandbox`**, un tenant creado por copia de la estructura y de los datos de Samjuro, con `tenant_id` propio y RLS propio.
- El sandbox se crea con un script idempotente, se usa para verificar cada fase y se puede borrar y recrear sin consecuencias.
- Antes y después de cada fase se ejecuta un `db:check` de solo lectura sobre `t16` que confirma que los conteos siguen siendo 1.240 / 480 / 620 / 2.168 / 1.980. Si cambian, se detiene el trabajo.

---

## 3. Modelo de negocio y aislamiento

### 3.1 Unidades

| Unidad | Definición | Ejemplo real |
| --- | --- | --- |
| **Plataforma** | Fenlora Visual Studio; vende suscripciones. | Consola Super Admin. |
| **Tenant** | Negocio con datos, usuarios y configuración propios. | `t16` Samjuro. |
| **Sede / almacén** | Unidad operativa dentro del tenant. Compartirá contabilidad salvo que se configure como centro de costo. | Matriz y sucursal. |
| **Razón social** | Entidad jurídica. Si factura con NIT distinto, se modela como **otro tenant** y se consolida en reporting. | Samjuro S.A.S. vs. otra empresa del dueño. |
| **Perfil vertical** | Conjunto de módulos y reglas activadas para un tenant. | `retail_distribution` para Samjuro. |

### 3.2 Estrategia Pool / Bridge / Silo (ya diseñada en `DISENO-ERP-MULTITENANT.md`)

- **Pool (default):** mismas tablas con `tenant_id` + RLS. Coste bajo, despliegue inmediato. Samjuro está aquí.
- **Bridge:** mismo esquema, base de datos dedicada para tenants grandes o con requisito de backup propio.
- **Silo:** base/ esquema separado y cifrado propio para clientes enterprise o regulados.

Regla de migración: el código habla solo con la capa `runAsTenant(tenant_id, ...)` (`lib/db.js`); cambiar de Pool a Bridge/Silo es cambiar la conexión, no reescribir módulos. El `tenant_id` nunca se toma del body ni de la URL: viene de la sesión (`lib/tenant-context.js`).

### 3.3 Fuente de verdad

- Un solo registro por entidad maestra (producto, cliente, proveedor, cuenta contable).
- Los movimientos son inmutables: se corrigen con contramovimientos, nunca se borran.
- Toda operación que afecte dinero o stock es una **transacción** con rollback y escritura en `audit_log`.
- El super admin no lee datos operativos salvo impersonación auditada.

### 3.4 Modelo profesional: suite modular con complementos internos, no sistemas separados

Esta es la respuesta directa a la pregunta sobre «ERP contable vs. ERP visual» y «un panel vs. complementos».

**Cómo lo hacen los sistemas con experiencia:**

| Sistema | Patrón observado | Fuente |
| --- | --- | --- |
| **Gartner (definición de ERP)** | ERP es una *suite integrada* de aplicaciones que **comparten un modelo común de proceso y datos** (finance, HR, distribution, manufacturing, service, supply chain). No son sistemas independientes pegados. | `gartner.com/en/information-technology/topics/enterprise-resource-planning` |
| **SAP Business One** | «Una sola solución ERP asequible para gestionar toda la empresa». Trae de serie finanzas, compras, inventario, ventas, CRM, producción y proyectos. Además tiene **más de 500 add-ons de partners** y extensiones verticales. Es decir: **núcleo integrado + complementos**, no un ERP por área. | `sap.com/products/erp/business-one.html` y solution brief 2025 |
| **Odoo** | Apps instalables/desinstalables sobre **la misma instancia y la misma base de datos**: contabilidad, inventario, POS, WhatsApp, etc. El usuario ve un solo menú; los módulos activos cambian según licencia/configuración. | `odoo.com/documentation/18.0/applications.html` y catálogo de apps |
| **Microsoft Dynamics 365 Business Central** | Núcleo financiero/operativo + extensiones de **AppSource** y agentes de IA incrustados en el flujo. Un solo entorno, capabilities adicionales por app. | `learn.microsoft.com` / AppSource / sitio oficial |
| **Gartner MQ Cloud ERP 2025 + CIO 2026** | La arquitectura **modular/composable** es una característica *común* deseable, pero la mayoría sigue eligiendo **suite** por la integración mantenida por el proveedor; solo se añade best-of-breed cuando la necesidad supera el núcleo. Para 2027, >50 % de empresas orientadas a servicios buscarán un enfoque suite para capacidades fundacionales. | `gartner.com/doc/reprints?ct=251013…` y `cio.com/article/4121113` |

**Traducción a nuestro producto:**

1. **Si un negocio quiere solo contabilidad:** se activa solo el módulo financiero. No se le muestran tarjetas de restaurante, recetas ni envíos. Pero «solo contabilidad» **no significa solo pantallas de asientos**: para contar con un balance real necesita partners, impuestos, cuentas, secuencias, facturas, cartera, pagos y banco. Esos son **datos maestros del núcleo**, no adornos visuales. El módulo de inventario permanece desactivado y, si algún día se activa, sus movimientos **ya tienen una cuenta contable destino** y no requieren reentrada ni otro sistema.
2. **Si un negocio quiere todo:** **un solo panel, una sola sesión, un solo modelo de datos y un solo libro contable**. Los módulos se comportan como **complementos dentro de ese panel** (activación por `tenant_modules` + `feature_flags` + permisos), no como 12 aplicaciones con 12 logins. El usuario con permiso de `accounting` ve finanzas; el de `warehouse` ve almacén; ambos ven el mismo pedido real.
3. **Cuándo sí usar un sistema externo (best-of-breed):** cuando una capacidad supera claramente el núcleo —por ejemplo facturación DIAN certificada, nómina especializada o programación finita de manufactura—. En ese caso se integra por API/CSV con `ref_type/ref_id` y se concilia; **no se construye un segundo ERP paralelo**.
4. **BI no es el ERP:** los tableros son una capa de lectura sobre los mismos datos. Un panel bonito sin asientos, documentos y auditoría es exactamente el error de las demos que ya descartamos.

**Regla derivada para el código:** cada módulo nuevo debe poder desactivarse sin romper el núcleo (feature flag), pero al activarse debe escribir en el mismo `tenant_id`, el mismo `audit_log` y, cuando corresponda, el mismo `journal_entries`. Si un módulo crea su propia base de clientes o su propio libro contable, está mal diseñado.

---

## 4. Arquitectura de la aplicación

```
Cloudflare Access ──► Worker (OpenNext) ──► API routes /negocio/api/*
                                      │
                                      ├─ lib/tenant-context.js  (identidad)
                                      ├─ lib/db.js              (RLS por transacción)
                                      ├─ lib/erp/*              (servicios de dominio)
                                      └─ Neon (Pool / Bridge / Silo)
```

**Capas obligatorias para cada módulo nuevo:**

1. **Ruta UI** (`/negocio/...` o sección de consola) — solo muestra y valida.
2. **API route** — autentica, autoriza, valida schema, llama al servicio. Nunca contiene reglas de negocio duplicadas.
3. **Servicio de dominio** (`lib/erp/<modulo>.js`) — reglas, cálculos, numeración, transacciones.
4. **Repository SQL** — consultas con `runAsTenant`.
5. **Migración SQL** — tablas, índices, RLS, `FORCE RLS`, policies.
6. **Prueba** — semilla idempotente y verificación en Neon.

---

## 5. Catálogo de ERPs / perfiles verticales

Un ERP lógico por tenant; el perfil decide qué se activa. Matriz resumida (● = núcleo, ○ = módulo activo, — = no aplica):

| Módulo | Retail / Distribución | Restaurante | Farmacia | eCommerce | Servicios / Agencia | Construcción | Manufactura | Logística | Clínica / Salud | Educación | Inmobiliaria | Profesional |
| --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| Maestros (productos, clientes, proveedores) | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● |
| Inventario y almacenes | ● | ● | ● | ● | ○ | ● | ● | ● | ● | ○ | — | — |
| Ventas / pedidos | ● | ● | ● | ● | ○ | ○ | ● | ○ | ● | ○ | ○ | ● |
| Facturación electrónica | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● |
| Cartera y pagos | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● |
| Contabilidad y tesorería | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● |
| Compras y proveedores | ● | ● | ● | ○ | ○ | ● | ● | ○ | ● | ○ | ○ | ○ |
| Mesas / comandas / cocina | — | ● | — | — | — | — | — | — | — | — | — | — |
| Recetas y control de lotes | — | ○ | — | — | — | — | — | — | — | — | — | — |
| Vencimientos y dispensación | — | — | ● | — | — | — | — | — | ○ | — | — | — |
| Suscripciones y envíos | ○ | — | ○ | ● | ○ | — | — | ● | — | ○ | — | ○ |
| Proyectos, hitos y horas | — | — | — | — | ● | ● | ○ | ○ | — | ○ | ● | ● |
| Órdenes de producción / BOM | — | — | — | — | — | — | ● | — | — | — | — | — |
| Obra / presupuesto /工程量 | — | — | — | — | — | ● | — | — | — | — | ○ | — |
| Guías, rutas y tracking | ○ | ○ | ○ | ● | — | ○ | ● | ● | — | — | — | — |
| Agenda, citas y pacientes | — | — | ○ | — | ○ | — | — | — | ● | ● | ● | ● |
| Matrículas y calificaciones | — | — | — | — | — | — | — | — | — | ● | — | — |
| Contratos, inmuebles y comisiones | — | — | — | — | — | — | — | — | — | — | ● | — |
| CRM / leads / WhatsApp | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● |

### 5.1 Definición de los 12 perfiles

1. **Retail / Distribuidora** (inicial; Samjuro es la referencia real de solo lectura). Catálogo, stock multi-almacén, pedidos, facturación, cartera, rutas, WhatsApp. KPI: rotación, quiebre, margen por línea.
2. **Restaurante / cafetería**. Mesas, comandas, cocina, recetas, mermas, POS, propinas, facturación. KPI: ticket promedio, food cost, tiempo de preparación.
3. **Farmacia / droguería**. Lotes, vencimientos, dispensación, recetas, control de temperaturas. KPI: productos por vencer, quiebre crítico.
4. **eCommerce / tienda online**. Catálogo sincronizado, pedidos, pasarela, envíos, devoluciones, suscripciones. KPI: conversión, cancelaciones, día de pago.
5. **Servicios profesionales / agencia**. Clientes, proyectos, horas, hitos, facturación por hito, retainer. KPI: horas facturables, margen por proyecto.
6. **Construcción / obra**. Presupuesto de obra, avance por partida, materiales, mano de obra, subcontratistas, certificaciones. KPI: desviación presupuestal, coste por partida.
7. **Manufactura**. BOM, orden de producción, etapas, mermas, coste estándar vs real, calidad. KPI: eficiencia, merma, coste unitario.
8. **Logística / distribución de última milla**. Guías, rutas, conductores, evidencia de entrega, inventario en tránsito. KPI: entregas a tiempo, coste por envío.
9. **Clínica / salud**. Pacientes, citas, historia, facturación de servicios, convenios, inventario de insumos. KPI: ocupación, satisfacción, cartera por convenio.
10. **Educación**. Estudiantes, matrícula, cursos, calificaciones, facturación de pensiones. KPI: morosidad, retención.
11. **Inmobiliaria**. Inmuebles, clientes, visitas, propuestas, contratos, comisiones. KPI: pipeline por etapa, comisión cobrada.
12. **Profesional independiente**. Agenda, clientes, presupuestos, facturación simple, gastos, ISA/retenciones. KPI: ingresos por cliente, horas facturables.

**Orden de implementación propuesto:** Retail/Distribuidora → Restaurante → Servicios/Agencia → Farmacia → eCommerce → los restantes tras validación del núcleo.

---

## 6. Núcleo de módulos: detalle funcional

Cada módulo se entrega con: tablas, campos críticos, funciones, roles que lo operan, flujo, KPI y criterio de aceptación.

### 6.1 Maestros

**Tablas:** `partners` (clientes/proveedores unificados con `kind`), `partner_contacts`, `addresses`, `price_lists`, `price_list_items`, `taxes`, `currencies`, `exchange_rates`, `uoms`.

- `partners`: `id, tenant_id, kind[customer|supplier|both], document_type, document, name, trade_name, email, phone, city, address, payment_terms_days, credit_limit, tax_regime, active`.
- Funciones: alta, validación de NIT/cédula duplicada por tenant, búsqueda, fusiones controladas (con auditoría), importación CSV, exportación.
- Roles: `owner`, `admin`, `sales`, `accounting` (lectura), `viewer` (lectura).
- Flujo: alta → validación de documento → asignación de lista de precios → aprobación de crédito (si aplica).
- KPI: clientes activos, clientes con saldo vencido, deuda por cliente.
- Migración desde `public.customers`: copia con `kind='customer'`, sin borrar la tabla original hasta que la nueva esté validada.

### 6.2 Catálogo de productos y precios

**Tablas:** `items`, `item_variants`, `item_categories`, `item_price_history`, `item_barcodes`.

- `items`: `id, tenant_id, sku, name, category_id, uom_id, cost_method, sale_price, cost_price, taxable, active, image_url, notes`.
- Funciones: alta, variantes (talla/color), códigos de barras, precio por lista, histórico de precios (nunca se sobreescribe el precio de una línea de pedido), baja con sustituto.
- Flujo: crear → categorizar → precio → impuestos → activar.
- KPI: referencias activas, margen medio, productos sin movimiento 90 días.
- Migración desde `public.products` (1.240 filas reales).

### 6.3 Inventario y almacenes (núcleo de valoración)

**Tablas:** `warehouses`, `locations`, `stock_balances`, `stock_movements_v2`, `stock_valuation`, `stock_counts`, `stock_count_lines`, `lots`, `serial_numbers`.

- `stock_balances`: `tenant_id, warehouse_id, item_id, quantity, reserved, average_cost, updated_at` (único por triple).
- `stock_movements_v2`: `id, tenant_id, warehouse_id, item_id, qty_in, qty_out, kind[purchase|sale|transfer_in|transfer_out|adjustment|production|return], ref_type, ref_id, unit_cost, total_cost, occurred_at, created_by, reversed_by`.
- Funciones: Entrada, Salida, Transferencia entre almacenes, Ajuste con motivo, Conteo físico con diferencias, Reserva, Devolución, Valoración media ponderada (metodología configurable: FIFO o promedio), consulta de existencias por almacén.
- Reglas: ninguna salida deja stock negativo salvo configuración explícita; todo movimiento referencia un documento; los ajustes requieren `reason` y aprobación si superan umbral; un movimiento nunca se edita, se revierte.
- Roles: `warehouse` (operador), `inventory_manager` (ajustes), `accounting` (valoración), `owner` (configuración).
- Flujo: documento → reserva → movimiento → actualización de saldo y costo → asiento contable.
- KPI: stock por almacén, productos bajo mínimo, valor del inventario, rotación, antigüedad, diferencias de conteo.
- Migración desde `public.stock_movements` (1.980 filas): convertir a `stock_movements_v2` con almacén por defecto y `unit_cost = products.cost`; conservar `products.stock` como saldo inicial.

### 6.4 Ventas y pedidos

**Tablas:** `quotes`, `quote_lines`, `sales_orders`, `sales_order_lines`, `deliveries`, `delivery_lines`, `sales_returns`, `sales_return_lines`.

- `sales_orders`: `id, tenant_id, number, partner_id, warehouse_id, price_list_id, status[draft|confirmed|partially_delivered|delivered|invoiced|cancelled], subtotal, discount, tax, total, currency, notes, confirmed_at, created_by`.
- Reglas: el precio se copia al `sales_order_lines.unit_price`; el descuento máximo depende del rol; confirmar reserva stock; entregar genera salida; cancelar revierte reservas;Facturar cambia estado y bloquea edición.
- Flujo: presupuesto → pedido → confirmación → entrega → factura → cobro.
- Roles: `sales` (crea), `sales_manager` (descuentos), `warehouse` (entrega), `accounting` (factura), `owner`.
- KPI: pedidos por estado, ticket promedio, margen por pedido, ciclo pedido→entrega, tasa de cancelación.
- Migración desde `public.orders` / `public.order_items` (620 / 2.168).

### 6.5 Facturación operativa

**Tablas:** `invoices_ops`, `invoice_lines`, `credit_notes`, `credit_note_lines`, `invoice_taxes`, `invoice_sequences`, `dian_events` (futuro).

- **No confundir** con `public.invoices` (cobro de Fenlora al tenant).
- `invoices_ops`: `id, tenant_id, number, prefix, partner_id, sales_order_id, issue_date, due_date, currency, exchange_rate, subtotal, discount, tax, total, balance, status[draft|issued|paid|partial|overdue|credited|void], uuid_dian, qr_payload, created_by`.
- Funciones: generar desde pedido o libre, aplicar impuestos (IVA 19 %, exento, excluido, retenciones configurables), notas crédito, anulación con motivo, reimpresión, envío por correo/WhatsApp (**wa.me manual**), secuencias concurrentes por prefijo (serie resolución DIAN cuando se active).
- Reglas: numeración consecutiva sin huecos; una factura nunca se edita después de emitida; se corrige con nota crédito; total = líneas + impuestos − descuentos; redondeo a 2 decimales.
- Flujo: pedido entregado → borrador → revisión contable → emisión → envío → contabilización → cobro.
- KPI: facturado por mes, facturas vencidas, nota crédito sobre ventas, DSO.
- Criterio de aceptación: emitir factura en `t17_sandbox` desde un pedido clonado de Samjuro y ver el asiento contable generado; `t16` permanece con sus conteos originales.

### 6.6 Cartera, cobros y pagos

**Tablas:** `receivables`, `payments_in`, `payment_allocations`, `payment_methods`, `cash_discounts`, `collections_tasks`.

- `receivables`: factura, cliente, valor, saldo, vencimiento, edad, estado.
- Funciones: registrar pago (efectivo, transferencia, PSE, tarjeta), aplicar a una o varias facturas, anticipos, descuento por pronto pago, cartera por edades, plan de cobranza, recordatorio por WhatsApp (`wa.me`).
- Reglas: un pago no puede exceder el saldo; la asignación es transaccional; un pago sin identificar queda como anticipo; los abonos generan asiento.
- Roles: `accounting`, `collector`, `owner`.
- KPI: DSO, cartera vencida 30/60/90+, índice de recuperación, cobrado vs facturado.

### 6.7 Compras y proveedores

**Tablas:** `purchase_orders`, `purchase_order_lines`, `purchase_receipts`, `purchase_receipt_lines`, `supplier_invoices`, `supplier_invoice_lines`, `purchase_returns`.

- Flujo: solicitud → cotización → OC → recepción (entrada de stock + asiento) → factura del proveedor → pago.
- Reglas: no se factura sin recepción (salvo configuración); diferencia de cantidad genera nota de ajuste; tres vías coincidentes OC/recepción/factura con tolerancia configurable.
- KPI: gasto por proveedor, OC pendientes, lead time, variación precio vs cotizado.

### 6.8 Cuentas por pagar y tesorería

**Tablas:** `payables`, `payments_out`, `payment_out_allocations`, `bank_accounts`, `bank_transactions`, `cash_box`, `cash_box_sessions`, `reconciliations`.

- Funciones: registrar obligaciones, programar pagos, pagos parciales, caja menor, arqueo, conciliación bancaria, flujo de efectivo proyectado.
- KPI: pagos vencidos, efectivo disponible, días de pago a proveedores, desviación de conciliación.

### 6.9 Contabilidad

**Tablas:** `accounts`, `journal_entries`, `journal_lines`, `periods`, `cost_centers`, `budgets`, `budget_lines`, `accounting_rules`.

- `journal_lines`: `entry_id, account_id, debit, credit, cost_center_id, partner_id, ref_type, ref_id`.
- Funciones: plan de cuentas por tenant (plantilla Colombia), asientos automáticos desde facturas/pagos/recepciones/nómina, asientos manuales balanceados, periodos abiertos/cerrados, centro de costo, presupuesto vs real, balance, P&L, flujo de efectivo.
- Reglas: débito = crédito por asiento; solo periodos abiertos; asiento automático referencing document; rechazar eliminación de asiento contabilizado (se revierte).
- Roles: `accounting` (escribe), `auditor` (lee), `owner` (cierra periodos).
- KPI: utilidad, margen, gasto por centro de costo, desviación presupuestal.

### 6.10 CRM y WhatsApp

**Tablas:** `leads_ops`, `activities`, `opportunities`, `opportunity_stages`, `whatsapp_links`, `message_templates`.

- Funciones: captura de lead, etapas, tareas, seguimiento, generación de `wa.me` con plantilla y datos reales del cliente, registro manual del envío (**sin API automática**).
- Regla: el sistema never afirma que envió el mensaje; solo que preparó el enlace.
- KPI: leads por etapa, conversión, tiempo de respuesta, ventas por canal.

### 6.11 BI y reporting

**Tablas:** `report_definitions`, `report_favorites`, `dashboard_widgets`, `report_exports`.

- Funciones: panel por rol, KPIs del §6, tableros configurables, export CSV/XLSX, programación de informes por correo.
- Regla: todo KPI debe poder desglosarse hasta el documento origen (drill-down).
- KPI propio: adoption (usuarios activos por módulo).

### 6.12 Auditoría y seguridad

- `audit_log` ya existe: `tenant_id, actor_id, actor_role, action, object_type, object_id, reason, metadata, occurred_at`.
- Ampliar con: `ip`, `user_agent`, `before`, `after`, `impersonated_by`, `risk_level`.
- Funciones: registrar toda mutación, impersonación controlada, exportación, retención configurable, alertas por acción sensible (cierre de periodo, anulación de factura, ajuste de stock).
- Roles: `security_admin`, `auditor`, `owner`.

### 6.13 Configuración y platform

- `modules`, `plan_modules`, `tenant_modules`, `feature_flags`: pasar de catálogo visual a **control real**: una ruta solo se registra si el módulo está activo para el tenant.
- `sequences`: numeración atómica por `tenant_id, doc_type, prefix, period` con `SELECT ... FOR UPDATE` o contador con `ON CONFLICT`.
- `settings`: impuestos, moneda, idioma, formato de documento, logo, pies de factura, umbrales de aprobación.

---

## 7. Módulos verticales en detalle

| Vertical | Tablas nuevas | Funciones críticas | KPI principal |
| --- | --- | --- | --- |
| Restaurante | `tables`, `orders_pos`, `comanda_lines`, `recipes`, `recipe_items`, `waste_logs`, `tips` | Abrir mesa, comanda por cocina/bar, traspaso, dividir cuenta, propina, food cost | Food cost % y ticket promedio |
| Farmacia | `drug_lots`, `expiry_alerts`, `prescriptions`, `dispensations`, `cold_chain_logs` | Lote + vencimiento, alerta 30/60/90 días, dispensación, sustitución | Productos por vencer y rupturas |
| eCommerce | `channels`, `channel_orders`, `shipments`, `shipment_tracking`, `returns` | Sincronización de catálogo, pedido por canal, guía, devolución | Conversión y entregas a tiempo |
| Servicios | `projects`, `project_milestones`, `time_entries`, `retainers` | Presupuesto por proyecto, registrar horas, hito facturable, retainer | Horas facturables y margen |
| Construcción | `projects_works`, `work_items`, `progress_certificates`, `subcontractors` | Presupuesto por partida, avance, certificación, control de materiales | Desviación presupuestal |
| Manufactura | `boms`, `bom_items`, `production_orders`, `production_stages`, `quality_checks` | BOM, orden, etapas, mermas, coste estándar vs real | Eficiencia y merma |
| Logística | `vehicles`, `drivers`, `routes`, `route_stops`, `proof_of_delivery` | Ruta, guía, evidencia, tránsito | Entregas a tiempo / coste por envío |
| Clínica | `patients`, `appointments`, `medical_records`, `services`, `insurance_agreements` | Agenda, historia, facturación por servicio, convenio | Ocupación y cartera por convenio |
| Educación | `students`, `enrollments`, `courses`, `grades`, `tuition_invoices` | Matrícula, curso, nota, pensión | Morosidad y retención |
| Inmobiliaria | `properties`, `viewings`, `offers`, `contracts`, `commissions` | Inmueble, visita, propuesta, contrato, comisión | Pipeline y comisión cobrada |
| Profesional | `agenda`, `budgets_simple`, `expenses`, `tax_withholdings` | Presupuesto simple, gasto, retención, factura | Ingreso por cliente |

**Regla de activación:** el perfil no duplica código del núcleo; añade tablas, servicios y pantallas. Un cambio en ventas o contabilidad se hereda por todos los perfiles.

---

## 8. Modelo de datos propuesto (alta nivel, todas con `tenant_id` y RLS)

| Dominio | Tablas nuevas propuestas | Depende de |
| --- | --- | --- |
| Maestros | `partners`, `partner_contacts`, `addresses`, `price_lists`, `price_list_items`, `taxes`, `currencies`, `exchange_rates`, `uoms`, `item_categories`, `items`, `item_variants`, `item_barcodes`, `item_price_history` | `tenants` |
| Inventario | `warehouses`, `locations`, `stock_balances`, `stock_movements_v2`, `stock_valuation`, `stock_counts`, `stock_count_lines`, `lots`, `serial_numbers` | `items` |
| Ventas | `quotes`, `quote_lines`, `sales_orders`, `sales_order_lines`, `deliveries`, `delivery_lines`, `sales_returns`, `sales_return_lines` | `items`, `partners` |
| Facturación | `invoices_ops`, `invoice_lines`, `invoice_taxes`, `credit_notes`, `credit_note_lines`, `sequences`, `email_log` | `sales_orders` |
| Cartera | `receivables`, `payments_in`, `payment_allocations`, `payment_methods`, `collections_tasks` | `invoices_ops` |
| Compras | `purchase_orders`, `purchase_order_lines`, `purchase_receipts`, `purchase_receipt_lines`, `supplier_invoices`, `supplier_invoice_lines`, `purchase_returns` | `partners`, `items` |
| Tesorería | `payables`, `payments_out`, `payment_out_allocations`, `bank_accounts`, `bank_transactions`, `cash_box`, `cash_box_sessions`, `reconciliations` | `supplier_invoices` |
| Contabilidad | `accounts`, `journal_entries`, `journal_lines`, `periods`, `cost_centers`, `budgets`, `budget_lines`, `accounting_rules` | todos los movimientos |
| CRM/IA | `leads_ops`, `activities`, `opportunities`, `whatsapp_links`, `message_templates`, `ai_suggestions`, `ai_feedback` | `partners` |
| BI | `report_definitions`, `dashboard_widgets`, `report_exports` | todos |
| Verticales | tablas del §7 | según perfil |

**Convención para todas:** `id uuid default gen_random_uuid()`, `tenant_id uuid not null references tenants(id)`, `created_at`, `updated_at`, `created_by`, `active`, `UNIQUE (tenant_id, <natural_key>)`, índice por `(tenant_id, fecha/estado)`, RLS + `FORCE RLS` con policy `tenant_id = current_tenant_id()`.

**Migración de datos reales (sin pérdida):**

| Tabla actual | Destino | Registros |
| --- | --- | ---: |
| `products` | `items` (+ `stock_balances` inicial) | 1.240 |
| `customers` | `partners` (`kind='customer'`) | 480 |
| `orders` | `sales_orders` | 620 |
| `order_items` | `sales_order_lines` | 2.168 |
| `stock_movements` | `stock_movements_v2` (almacén default, `unit_cost=cost`) | 1.980 |

Las tablas actuales se conservan como capa de compatibilidad hasta que la nueva UI esté validada en producción; nunca se ejecuta un `DROP` en la misma migración.

---

## 9. Roles y permisos (RBAC)

### 9.1 Roles del tenant

| Rol | Puede | No puede |
| --- | --- | --- |
| `owner` | Todo; cerrar periodos; invitar; configurar módulos; impersonar con auditoría | — |
| `admin` | Configurar maestros y usuarios; operar todos los módulos | Cerrar periodos, borrar tenant |
| `accounting` | Facturas, cartera, pagos, asientos, reportes | Modificar catálogo de precios, entregar stock |
| `sales` | Crear presupuestos/pedidos, ver precios y stock | Facturar, cobrar, ajustar stock |
| `sales_manager` | Lo de `sales` + descuentos hasta umbral + aprobar pedidos | Contabilizar |
| `warehouse` | Recepciones, entregas, transferencias, conteos | Ver costes sensibles, facturar |
| `purchasing` | OC y recepciones | Pagar, contabilizar |
| `collector` | Ver cartera y registrar pagos | Emitir facturas |
| `auditor` | Solo lectura + exportar auditoría | Escribir |
| `viewer` | Solo lectura de paneles autorizados | Escribir, exportar datos sensibles |

### 9.2 Matriz de permisos (ejemplo, se persiste en `role_permissions`)

| Acción | owner | admin | accounting | sales | warehouse | auditor |
| --- | :-: | :-: | :-: | :-: | :-: | :-: |
| `product.create` | ✓ | ✓ | — | — | — | — |
| `order.create` | ✓ | ✓ | — | ✓ | — | — |
| `order.discount` | ✓ | ✓ | — | ≤ umbral | — | — |
| `stock.adjust` | ✓ | ✓ | — | — | ✓ (con motivo) | — |
| `invoice.issue` | ✓ | ✓ | ✓ | — | — | — |
| `invoice.void` | ✓ | ✓ | ✓ (con motivo) | — | — | — |
| `payment.record` | ✓ | ✓ | ✓ | — | — | — |
| `journal.post` | ✓ | ✓ | ✓ | — | — | — |
| `period.close` | ✓ | — | — | — | — | — |
| `audit.export` | ✓ | ✓ | — | — | — | ✓ |

### 9.3 Separación de funciones

- Quien crea una factura no puede anularla sin aprobación de otro usuario.
- Quien ajusta stock no puede contabilizar el mismo ajuste.
- Cierre de periodo requiere `owner` y deja asiento de auditoría con `before/after`.

---

## 10. Flujos críticos end-to-end

### 10.1 Order-to-Cash (venta)

1. `sales` crea presupuesto → `quote_lines` con precio de `price_list`.
2. Cliente acepta → `sales_order` en `draft`; `sales_manager` confirma si hay descuento.
3. Confirmar reserva en `stock_balances.reserved`; validar disponibilidad por almacén.
4. `warehouse` genera `delivery`; salida de stock con `unit_cost` del promedio ponderado.
5. `accounting` emite `invoices_ops`; `journal_lines` débito cartera / crédito ingresos + IVA; débito COGS / crédito inventario.
6. Cliente paga → `payments_in` + `payment_allocations` → débito banco/caja, crédito cartera.
7. Cierre de mes: cartera por edades, DSO y P&L.

### 10.2 Procure-to-Pay (compra)

1. Reposición automática por `min_stock` o solicitud manual.
2. `purchase_order` aprobada según umbral.
3. `purchase_receipt` → entrada a `stock_balances` con coste; asiento débito inventario / crédito obligación.
4. Factura de proveedor → comparación 3 vías (OC, recepción, factura) dentro de tolerancia; diferencias a `accounting`.
5. `payments_out` aplicado a `payables`; conciliación bancaria.
6. Reporte de gasto por proveedor y lead time.

### 10.3 Record-to-Report (contabilidad)

1. Reglas automáticas por tipo de documento (`accounting_rules`).
2. Asiento generado al confirmar documento, con `ref_type/ref_id`.
3. Asiento manual solo con balance verificado en la API.
4. Cierre de periodo: bloqueo, verificación de balance, generación de balance/P&L/flujo.
5. Auditoría consulta `audit_log` y exporta.

### 10.4 Devolución y nota crédito

1. Cliente devuelve → `sales_returns` → entrada de stock con coste original.
2. `credit_notes` referencia la factura, reduce `balance`.
3. Asiento reverso; nunca se borra la factura original.

### 10.5 Corrección de inventario

1. Conteo físico → `stock_count_lines` con diferencias.
2. Aprobación por `inventory_manager` si excede umbral.
3. Movimiento `adjustment` con `reason` y asiento contable.

---

## 11. Numeración, impuestos y multi-moneda

- `sequences` con `tenant_id, doc_type, prefix, period, next_value`, bloqueo optimista. Nunca se reutiliza un número; los huecos se explican con `void`.
- Facturación colombiana: IVA 19 %, exento, excluido, retención en la fuente y retenciones de ICA configurables en `taxes`; `invoices_ops.tax` desglosado en `invoice_taxes`.
- Preparación DIAN: `uuid_dian`, `qr_payload` y `dian_events` listos; **no se envía nada a DIAN hasta que exista credencial y certificación**. La factura interna funciona sin eso.
- Multi-moneda: `currency` por documento, `exchange_rates` por fecha, reportes en moneda funcional del tenant y en moneda de presentación.

---

## 12. Integraciones

| Integración | Estado | Implementación concreta |
| --- | --- | --- |
| WhatsApp | Disponible sin credenciales | `whatsapp_links`: `https://wa.me/<teléfono>?text=<plantilla con datos reales>`; el usuario envía manualmente. Registro opcional «enviado» marcado por humano. |
| Correo | Por hacer | Envío de factura y recordatorio de pago; `email_log` con estado. |
| Pasarelas de pago | Por hacer | PSE/tarjeta como método de pago manual primero; API real después. |
| DIAN | Preparado, no activo | Campos UUID/QR y eventos; activar solo con resolución y certificado. |
| Open Finance / bancos | Fase tardía | Conciliación por importación CSV primero. |
| eCommerce | Fase 3 | Sincronización de catálogo y pedidos por API o CSV según canal. |
| IA | Fase 4 | Ver §13. |

---

## 13. IA con human-in-the-loop (sin promesas vacías)

| Caso de uso | Entrada real | Salida | Control humano |
| --- | --- | --- | --- |
| Detectar facturas con riesgo | `supplier_invoices` + OC + recepción | Sugerencia de revisión en `ai_suggestions` | `accounting` acepta o descarta; `ai_feedback` guarda motivo |
| Sugerir reposición | `stock_balances`, `min_stock`, ventas 30 días | Borrador de OC | `purchasing` aprueba antes de enviar |
| Clasificar gasto | Descripción de factura | Cuenta contable propuesta | `accounting` confirma |
| Resumen ejecutivo | KPIs del mes | Texto corto en el panel | Usado solo como resumen, nunca como asiento |
| Redactar mensaje WhatsApp | Cliente + factura vencida | Texto para `wa.me` | Humano pulsa enviar |

**Reglas duras:** la IA nunca crea asientos, nunca emite facturas, nunca ajusta stock, nunca envía mensajes y nunca borra datos. Toda sugerencia lleva `confidence`, `source_refs` y `status[pending|accepted|rejected]`. Si no hay datos reales, no se muestra sugerencia.

---

## 14. Decisiones: estado y pendientes

1. **Modelo («suite modular con complementos internos», §3.4).** **Aprobado y aplicado:** 1 ERP lógico por tenant, un solo panel y un solo libro contable; los módulos se activan/desactivan como complementos dentro de esa suite; solo se recurre a best-of-breed externo si el núcleo no llega.
2. **¿Confirmás el vertical inicial?** Retail/Distribuidora, con Samjuro (`t16`) como referencia de solo lectura y `t17_sandbox` para probar. **Confirmado por el usuario.**
3. **¿Cada empresa jurídica del mismo dueño debe ser otro tenant?** Propuesta: sí, si factura con NIT propio o requiere balance separado; si es solo una sucursal, se modela como almacén/centro de costo dentro del mismo tenant.
4. **¿Valoración de inventario inicial?** Propuesta: promedio ponderado, con opción FIFO en la configuración. El sandbox arranca con el coste actual de `products` copiado desde Samjuro; el tenant real no se modifica.
5. **Facturación electrónica DIAN.** **Confirmado: preparar ahora, activar después.** Estructura, numeración, UUID/QR y eventos listos; envío real solo con resolución/certificado. Mientras tanto, factura interna numerada con PDF/QR.
6. **¿MFA obligatorio para el tenant?** Propuesta: opcional hoy (`tenant_mfa` ya existe), obligatorio para `owner` en Fase 5.
7. **¿Se conservan las tablas operativas actuales?** Propuesta: sí, como compatibilidad; se migran con copia y se dejan de usar cuando la nueva UI esté validada.
8. **Primera fase de implementación.** **Confirmado:** núcleo + contabilidad/facturación/cartera (Fase 2), antes que restaurante u otros verticales.
9. **¿Presupuesto/tiempo objetivo?** Propuesta: fases de 1–2 semanas cada una con criterio de aceptación en Neon; sin fecha «big bang».

---

## 15. Roadmap por fases (con criterios de aceptación)

| Fase | Entregable | Tablas / APIs | Criterio de aceptación real |
| --- | --- | --- | --- |
| **0. Gobernanza ✅** | Plan aprobado + sección Demos vacía + README | — | Build OK; consola con 17 secciones, Demos sin acciones; arquitectura aprobada |
| **1. Núcleo maestro y sequences ✅** | `t17_sandbox` creado por copia; maestros canónicos y numeración atómica sin borrar originales | `items`, `partners`, `sales_orders`, `sequences`, `role_permissions`, `erp_module_settings` | 1.240/480/620/2.168/1.980 filas copiadas; 48 tablas con RLS forzado; `t16` sin cambios |
| **2. Finanzas mínimas ✅** | Factura operativa, cartera, pagos, contabilidad de asientos y pestaña «Finanzas» | `invoices_ops`, `invoice_lines`, `receivables`, `payments_in`, `journal_entries`, `journal_lines`, `accounts`, `periods` | Pedido `PED-2026-00146` → `FV-000001` → `PA-000001` → `AS-000001/000002` balanceados; pago sin aplicar `PA-000002` → `AS-000003` balanceado; cartera en 0; `t16` con 0 documentos financieros |
| **3. Inventario y compras ✅** | Multi-almacén, valoración promedio/FIFO, conteos, OC, recepciones y proveedores; pestañas «Inventario» y «Compras» | `inventory_movements`, `inventory_cost_layers`, `inventory_counts`, `inventory_count_lines`, `purchase_orders`, `purchase_order_lines`, `purchase_receipts`, `purchase_receipt_lines`, `inventory_valuation` | `IM-000001` transferencia (5 und al almacén secundario), `IM-000002` ajuste con `AS-000001`, `IC-000001` con diferencia `-60.000` y `AS-000002`, `OC-000001` → `RC-000001` con `AS-000003`; 0 asientos desbalanceados y 0 líneas inválidas; `t16` sin cambios |
| **4. CRM/WhatsApp y BI** | Leads, oportunidades, `wa.me`, tableros por rol | `leads_ops`, `opportunities`, `whatsapp_links`, `dashboard_widgets`, `report_definitions` | Enlace `wa.me` con datos reales; KPI con drill-down al documento |
| **5. Seguridad avanzada** | Permisos granulares completos, auditoría enriquecida, MFA owner, impersonación | `role_permissions`, `audit_log` extendido, `tenant_mfa` | Matriz RBAC aplicada en API; intento de acción prohibida devuelve 403 y deja auditoría |
| **6. Perfil Restaurante** | Mesas, comandas, recetas, POS, propinas | Tablas del §7 | Pedido de mesa → comanda → factura → asiento; food cost calculado |
| **7. Perfil Servicios/Agencia** | Proyectos, horas, hitos, retainer | Tablas del §7 | Horas → hito facturable → factura → margen por proyecto |
| **8. Perfiles restantes** | Farmacia, eCommerce, construcción, manufactura, logística, clínica, educación, inmobiliaria, profesional | Tablas del §7 | Un flujo completo por perfil con datos semilla **generados bajo demanda, no demos públicas** |
| **9. IA y automatización** | Sugerencias con feedback humano | `ai_suggestions`, `ai_feedback` | 0 acciones automáticas sensibles; 100 % de sugerencias revisadas |

**Regla de paso de fase:** no se inicia la fase N+1 hasta que el criterio de aceptación de N se verifique en Neon y en producción con `t17_sandbox`, y un `db:check` de solo lectura confirme que `t16` sigue con 1.240 / 480 / 620 / 2.168 / 1.980.

---

## 16. Riesgos y mitigación

| Riesgo | Mitigación |
| --- | --- |
| Migrar datos y perder integridad | Copia antes de migrar; migración idempotente; tablas viejas intactas; conteos antes/después |
| Romper RLS con super admin | `FORCE RLS` + `runAsTenant` en cada transacción; nunca consultar con rol BYPASSRLS desde la app |
| Duplicar contabilidad entre `public.invoices` y `invoices_ops` | Documentar la diferencia en código y UI; `public.invoices` solo facturación de plataforma |
| Numeración duplicada por concurrencia | `sequences` con bloqueo y uniqueness `(tenant_id, doc_type, prefix, number)` |
| IA «inventando» datos | Solo sugerencias con `source_refs` reales; sin escritura directa; feedback humano |
| Caer en demos decorativas otra vez | Cada módulo debe tener tabla, rol, flujo y KPI verificables; la sección Demos sigue vacía |
| Sobrepasar presupuesto/tiempo | Fases cortas con criterio observable; nada de big bang |
| Depender de credenciales Meta/DIAN | WhatsApp `wa.me` manual; DIAN preparado pero no activo |

---

## 17. Apéndice: fuentes consultadas

- Odoo, catálogo oficial de apps: https://www.odoo.com/es_ES/apps
- Microsoft Dynamics 365 Business Central: https://www.microsoft.com/en-us/dynamics-365/products/business-central
- Comparativa manufactura 2026 (Odoo / SAP B1 / NetSuite / Dynamics): https://sysgenpro.com/manufacturing-erp-comparison-for-mid-market-odoo-vs-sap-business-one-vs-oracle-netsuite-vs-dynamics
- Estadísticas de implementación ERP: https://flectic.com/blog/erp-implementation-statistics-and-success-rates
- Meta / Kantar, State of Business Messaging: https://whatsappbusiness.com/resources/resource-library/state-of-business-messaging
- Adopción WhatsApp Business en LATAM 2026: https://www.aurorainbox.com/en/2026/03/05/whatsapp-business-latam-adoption/
- Workana, proyecto Odoo + WooCommerce distribución B2B multiempresa (marzo 2026): https://www.workana.com/job/implementacion-de-odoo-erp-integracion-woocommerce-distribucion-b2b-multiempresa
- Fiverr, implementación Odoo: https://www.fiverr.com/muhammadhamz01/do-odoo-accounts-and-finance-implementation
- Meta Ad Library (vía trycrush.ai), Biziverse «ERP & CRM for Every Business»: https://trycrush.ai/ad-library/ad/1003456782031711
- LinkedIn, AIERP Partner (tendencia «system of intelligence»): https://linkedin.com/company/aierp-partner

*Las cifras de Gartner y del panorama 2026 se citan en comparisons/artículos secundarios; tratarlas como direccionales, no como auditoría financiera.*

---

## 18. Estado actual del código relacionado

- Sección «Demos» restaurada en `lib/data.js` (17 secciones) y `app/page.js`; componente vacío `Demos` en `components/sections-config.jsx` sin botones ni enlaces.
- Migración aditiva `database/erp-core.sql` aplicada (`npm run db:erp-core`): 103 sentencias, 48 tablas con RLS forzado.
- Sandbox `t17_sandbox` (`76fa9913-4ee3-40c4-bd43-ff300ad78d61`) clonado desde `t16` (`03dac6f5-e99a-5fce-97f7-d15b9964c09d`) con `npm run db:sandbox`; conteos 1.240/480/620/2.168/1.980 intactos en Samjuro.
- Núcleo financiero: `lib/erp/finance.js`, `lib/erp/permissions.js`, APIs `/negocio/api/finance/*`, pestaña «Finanzas» y selector de empresa con sesión firmada.
- Validación real en Neon: factura `FV-000001`, cobro `PA-000001`, anticipo `PA-000002` y asientos `AS-000001` a `AS-000003` con débito = crédito en cabecera y líneas. `t16` sigue con 0 documentos financieros.
- Migración aditiva `database/erp-inventory.sql` aplicada (`npm run db:erp-inventory`): 56 sentencias, 56 tablas con RLS forzado. Incluye `public.erp_assert` para validaciones que revierten la transacción (sin guards `1 / 0`).
- Inventario y compras: `lib/erp/inventory.js`, `lib/erp/purchases.js`, APIs `/negocio/api/inventory/*` y `/negocio/api/purchases/*`, pestañas «Inventario» y «Compras»; alta y ajuste de productos legacy sincronizados con capas y movimientos ERP.
- Verificación Fase 3 (`npm run db:sandbox && npm run db:verify-phase3`): `IM-000001`, `IM-000002`/`AS-000001`, `IC-000001`/`AS-000002`, `OC-000001` → `RC-000001`/`AS-000003`; `{movements:5, counts:1, orders:1, receipts:1, journal_entries:3, unbalanced:0, bad_lines:0, secondary_qty:5}`; Samjuro `1240/480/620/2168/1980` con 0 documentos financieros y 0 asientos.
- Corrección de seguridad detectada al revisar el login: `state-sync.js` daba de baja al dueño del sandbox porque `t17_sandbox` no vive en `app_state`. Se excluyó al sandbox de esa baja y se resembró; ahora el correo `fenlorastudiovisual@gmail.com` es `owner` activo en `t17_sandbox` y en `t16`, y las sesiones nuevas resuelven primero `Samjuro Piloto`. Ninguna escritura del panel cae en `t16`.
- `npm run build` OK y `npm run deploy` completado: Worker `erp-multitenant`, versión `6d574556-d2e7-45ee-9694-21e6b08e0b57` (membresía del sandbox protegida, PBKDF2 compatible con Workers y endpoint temporal de aprovisionamiento ya retirado); `/api/health` responde 200 en `https://erp-multitenant.fenlorastudiovisual.workers.dev`. Versiones anteriores: `4127e2a3-9658-4ea6-987e-8119d443aa27`, `66df43dc-9aab-4fc2-a673-3e4feda9ad75`, `64fd575e-3a4d-485c-89f5-304552da63ee`, `469d0b5d-9f5b-43f5-b534-fb70df6bf99c` (Fase 3) y `f20dc5de-ba50-42ac-a41e-139f36ce345b` (Fase 2).
- Acceso de prueba creado para `sebasmon1611@gmail.com` como `owner` de `t17_sandbox`, con contraseña hasheada y login verificado contra el Worker: `{ok:true, tenant:"t17_sandbox"}`. Se añadió el script administrativo `database/add-tenant-owner.mjs` (`npm run db:add-owner`). Se bajó PBKDF2 de 600.000 a 100.000 iteraciones porque Cloudflare Workers no admite más; los hashes antiguos se marcan para rehash.
- El sandbox pasa a llamarse **Samjuro Piloto** (solo nombre visible; `source_key` y `slug` no cambian) para dejar claro que Samjuro es el negocio piloto y que sus datos reales siguen intactos. Se añade la pestaña **Utilidades** con API `/negocio/api/margins/overview`: precio final con IVA, precio sin IVA, IVA recaudado, costo de proveedor (último y promedio ponderado), utilidad bruta y margen por producto y por pedido. El margen se calcula sobre el precio **sin IVA** porque el IVA no es ganancia; la tasa se lee de `tenants.settings->>'iva_rate'` (por defecto 19%) y de `items.tax_rate`. Verificado en el Worker: `{ivaRate:19, salesGross:3630286600, salesNet:3050661008.4, cogs:2392878000, grossProfit:657783008.4, marginPct:21.56, orders:558, units:8490}`.
- Deploy posterior: Worker `erp-multitenant`, versión `8590436c-f34c-4d4b-8b25-ab84a20783e2` (aviso visible en el panel de que los datos son sintéticos; versiones intermedias `293bccd1-f169-45a6-82de-3f67f4e07454` y `357c1ed0-42fa-4788-89c3-bbd9f35452ca`). Samjuro `t16` verificado de nuevo en solo lectura: `1240/480/620/2168`, `0` facturas y `0` asientos.
- **Importación de datos reales al piloto (Fase 3, cierre):** se creó el rol `erp_reader` en la Supabase de Samjuro y todas las consultas se hicieron con `begin read only`; **no se escribió nada en Samjuro**. Se exportaron 18 tablas a `SAMJURO-EXPORT/raw/*.json` y se cargaron en `samjuro_stage.raw_tables` de Neon: catálogo y catálogo auxiliar (635/960/1068/27/6/34/93/4/1), clientes y ventas (158/131/5415/103/56), y además `configuracion` (2), `vendedoras` (5, sin `pin`), `promociones` (3) y `eventos` (7355). `oficina_config` se excluyó porque contiene un código de acceso. Todas verificadas con `jsonb_array_length(payload) = rows`. El SKU `CH-ESM-208` fue confirmado por el usuario antes de reemplazar el piloto. `database/import-samjuro.mjs` reemplaza **solo** `t17_sandbox` de forma transaccional y sin credenciales en el código; siembra tablas ERP (`items`, `partners`, `sales_orders`, `sales_order_lines`) y tablas legacy que consume el panel (`products`, `customers`, `orders`, `order_items`) con los mismos IDs deterministas. El aviso del panel pasó de «datos sintéticos» a «datos reales importados; costos de proveedor pendientes».
- Verificación final en el Worker desplegado (`865fa5f3-e1c4-47d5-8888-e48720bd7368`): `/negocio/api/overview` → `{orders:131, products:1595, customers:151, sales:106705621}`; `/negocio/api/margins/overview` → 40 productos con ventas y las mismas ventas brutas; `/negocio/api/products` devuelve SKU reales (`SAM-19`, `SAM-19-1e5c7cb2`, `SAM-215`); `/negocio/api/orders` devuelve `PED-000201`, `PED-000200`, `PED-000199`. `t16` queda intacto y en solo lectura.
- **Cotizaciones y cartera reales importadas:** `database/import-samjuro-extras.mjs` (`npm run db:import-samjuro-extras`) convierte las 103 cotizaciones en documentos `COT-…` de `invoices_ops` con su `receivables`, 56 pagos `PA-COT-…` con `payment_allocations` y 159 asientos contables balanceados (421 líneas, 0 desbalanceados). Totales: cotizado `$75.537.734`, abonado `$36.174.078`, saldo `$39.363.656`. Se creó 1 partner nuevo para el único documento de cotización que no existía en clientes. Los 2 productos con `productos_agotado` quedaron marcados en `items`/`products` sin perder su estado real. Verificado en el Worker: `/negocio/api/finance/overview` → `{invoiced:75537734, collected:36174078, receivable:39363656, open_invoices:48, posted:111711812, invoiceable:131}`.
- **Escritura controlada de precios activada y verificada:** migración `database/samjuro-price-sync.sql` (`npm run db:samjuro-sync`) crea `samjuro_item_map` (960 presentaciones + 635 productos, mapeados por el mismo ID determinista de la importación) y `samjuro_price_sync` con RLS por tenant. `PATCH /negocio/api/products` con `action:"price"` actualiza `products.price`/`items.sale_price` y registra el pendiente con la fila real de destino (`presentaciones.precio` o `productos.precio_referencia`). `GET/POST /negocio/api/samjuro/sync-prices` lista y aplica pendientes en lotes de 50, con `dryRun`, auditoría en `audit_log` y fallos registrados; el destino se elige por whitelist y se actualiza por `id`, nunca por SKU (533 presentaciones tienen SKU nulo). No hay `DELETE`, `TRUNCATE`, DDL ni acceso a pedidos/vendedoras. El rol mínimo `erp_writer` se documenta en `database/samjuro-writer-role.sql` y se verificó en Supabase: `UPDATE` solo en las dos columnas autorizadas, sin `DELETE`/`TRUNCATE` y sin acceso a `pedidos`/`pedido_items`. El Worker usa el binding `SAMJURO_HYPERDRIVE` (Cloudflare termina TLS; `cloudflare:sockets` rechaza el certificado de Supabase) y Node usa el secreto `SUPABASE_WRITE_URL`; sin destino responde 503 y no escribe. Se corrigió el `EPERM` de OpenNext en Windows con `database/patch-opennext-windows.mjs`, aplicado automáticamente por `database/build-worker.mjs`. Verificación final en Worker `26e77480-b6e2-4c8a-84a6-73c8c08f6f35`: `synced: 2`, `failed: 0` para `CH-ESM-208` y `CH-ESM-208-P1`. `CH-ESM-208-P1` sigue en `5190.00`; `CH-ESM-208` tenía `null`, la prueba escribió `5190` y se restauró a `null`. Huella final (`SAMJURO-EXPORT/baseline-final.json`) idéntica en conteos y datos salvo `updated_at` y dos filas de `presentaciones_historial` creadas por triggers; pedidos, catálogo, vendedoras y accesos intactos.
- **Pendiente de datos, no de código:** la Supabase real no tiene ni un solo costo de proveedor (`presentaciones.costo` vacío en 960/960; `presentaciones_historial.fila->>'costo'` vacío en 1068/1068). No se inventó ningún costo: Utilidades muestra $0 en costo y margen completo hasta registrar recepciones de compras en el ERP. `cotizaciones` (103) y `cotizacion_pagos` (56) ya están mapeadas a `invoices_ops`/`receivables`/`payments_in` y sus asientos; siguen disponibles además en staging como fuente original.
