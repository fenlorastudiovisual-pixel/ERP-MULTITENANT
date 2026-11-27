# Plan ultra detallado de los ERP — ERP Multitenant / Fenlora Visual Studio

**Estado:** propuesta para aprobación. **No implementar más ERP hasta que confirms las decisiones del §14.**
**Fecha:** 2026-11-26.
**Alcance:** plataforma `ERP-MULTITENANT` (proyecto independiente), tenant real de prueba `t16` = Samjuro, producción `https://erp.fenloravisual.com`.

---

## 0. Resumen ejecutivo (la decisión que se propone)

**Propuesta central: un ERP lógico por negocio (tenant), con un núcleo común y «perfiles verticales» activables. No un ERP distinto por cada nicho, ni varios ERP dentro del mismo negocio.**

| Pregunta del usuario | Respuesta concreta propuesta |
| --- | --- |
| ¿Qué tipos de ERP? | 1 plataforma, 1 núcleo transaccional y 12 perfiles verticales (retail/distribución, restaurante, farmacia, e-commerce, servicios/agencia, construcción, manufactura, logística, clínica/salud, educación, inmobiliaria, profesionales independientes). Cada perfil activa módulos y tablas específicas sobre el mismo núcleo. |
| ¿Cada negocio manejaría un ERP? | Sí: cada **tenant** tiene su propio ERP (sus datos, su configuración, sus usuarios, su numeración y su RLS). Hoy existe 1 tenant real: Samjuro (`t16`). |
| ¿Varios ERP para cada negocio? | No. Varios ERP para el mismo negocio romperían la fuente de verdad, duplicarían contabilidad y stock y multiplicarían integraciones. Solo se crea un tenant adicional cuando hay una **persona jurídica o unidad operativa realmente separada** que requiere balances propios. |
| ¿Qué tendrá cada ERP? | Núcleo: maestros, inventario/valoración, compras, ventas, facturación, cartera, contabilidad, tesorería, BI y auditoría. Módulos verticales según perfil. Todo con roles, permisos, flujos, KPIs e integraciones. |
| ¿Por dónde empezar? | Perfil **Retail/Distribuidora** sobre Samjuro: ya hay 1.240 productos, 480 clientes, 620 pedidos, 2.168 líneas y 1.980 movimientos reales en Neon. Es el único vertical con datos reales verificados. |

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

1. **Retail / Distribuidora** (Samjuro, inicial). Catálogo, stock multi-almacén, pedidos, facturación, cartera, rutas, WhatsApp. KPI: rotación, quiebre, Margen por línea.
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
- Criterio de aceptación: emitir factura desde un pedido real de Samjuro y ver el asiento contable generado.

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

## 14. Decisiones que necesito que confirmes antes de seguir

1. **¿Aprobás el modelo?** 1 ERP lógico por tenant con perfiles verticales, no un ERP separado por nicho ni varios por negocio. (Recomendado.)
2. **¿Confirmás el vertical inicial?** Retail/Distribuidora con Samjuro (`t16`). (Recomendado: es el único con datos reales.)
3. **¿Cada empresa jurídica del mismo dueño debe ser otro tenant?** Propuesta: sí, si factura con NIT propio o requiere balance separado; si es solo una sucursal, se modela como almacén/centro de costo dentro del mismo tenant.
4. **¿Valoración de inventario inicial?** Propuesta: promedio ponderado, con opción FIFO en la configuración. Samjuro arranca con el coste actual de `products`.
5. **¿Facturación electrónica DIAN ahora o después?** Propuesta: estructura lista ahora, envío real después de tener resolución/certificado. Mientras tanto, factura interna numerada con PDF/QR.
6. **¿MFA obligatorio para el tenant?** Propuesta: opcional hoy (`tenant_mfa` ya existe), obligatorio para `owner` en Fase 5.
7. **¿Se conservan las tablas operativas actuales?** Propuesta: sí, como compatibilidad; se migran con copia y se dejan de usar cuando la nueva UI esté validada.
8. **¿Qué sección se implementa primero después del núcleo?** Propuesta: contabilidad + facturación operativa + cartera (Fase 2), antes que restaurante u otros verticales.
9. **¿Presupuesto/tiempo objetivo?** Propuesta: fases de 1–2 semanas cada una con criterio de aceptación en Neon; sin fecha «big bang».

---

## 15. Roadmap por fases (con criterios de aceptación)

| Fase | Entregable | Tablas / APIs | Criterio de aceptación real |
| --- | --- | --- | --- |
| **0. Gobernanza (actual)** | Este plan + sección Demos vacía + README | — | Plan aprobado; build OK; consola con 17 secciones, Demos sin acciones |
| **1. Núcleo maestro y sequences** | Migración de `products/customers/orders/items/movimientos` a nuevo modelo sin borrar originales; `sequences`; `role_permissions` | `items`, `partners`, `sales_orders`, `sequences`, `role_permissions` | 1.240/480/620/2.168/1.980 filas migradas y contadas en Neon; numeración concurrente sin duplicados |
| **2. Finanzas mínimas** | Factura operativa, cartera, pagos, contabilidad de asientos y reportes básicos | `invoices_ops`, `invoice_lines`, `receivables`, `payments_in`, `journal_entries`, `journal_lines`, `accounts`, `periods` | Pedido real → factura → pago → asiento balanceado → P&L; cartera por edades consultable |
| **3. Inventario y compras** | Multi-almacén, valoración, conteos, OC, recepciones, proveedores | `warehouses`, `stock_balances`, `stock_movements_v2`, `purchase_orders`, `purchase_receipts`, `payables` | Transferencia entre almacenes; ajuste con motivo; recepción que genera entrada + asiento |
| **4. CRM/WhatsApp y BI** | Leads, oportunidades, `wa.me`, tableros por rol | `leads_ops`, `opportunities`, `whatsapp_links`, `dashboard_widgets`, `report_definitions` | Enlace `wa.me` con datos reales; KPI con drill-down al documento |
| **5. Seguridad avanzada** | Permisos granulares completos, auditoría enriquecida, MFA owner, impersonación | `role_permissions`, `audit_log` extendido, `tenant_mfa` | Matriz RBAC aplicada en API; intento de acción prohibida devuelve 403 y deja auditoría |
| **6. Perfil Restaurante** | Mesas, comandas, recetas, POS, propinas | Tablas del §7 | Pedido de mesa → comanda → factura → asiento; food cost calculado |
| **7. Perfil Servicios/Agencia** | Proyectos, horas, hitos, retainer | Tablas del §7 | Horas → hito facturable → factura → margen por proyecto |
| **8. Perfiles restantes** | Farmacia, eCommerce, construcción, manufactura, logística, clínica, educación, inmobiliaria, profesional | Tablas del §7 | Un flujo completo por perfil con datos semilla **generados bajo demanda, no demos públicas** |
| **9. IA y automatización** | Sugerencias con feedback humano | `ai_suggestions`, `ai_feedback` | 0 acciones automáticas sensibles; 100 % de sugerencias revisadas |

**Regla de paso de fase:** no se inicia la fase N+1 hasta que el criterio de aceptación de N se verifique en Neon y en producción con el tenant `t16`.

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
- `README.md` actualizado para reflejar 17 secciones y Demos en pausa.
- **Pendiente:** build, commit, push y deploy de ese cambio; no se ejecuta hasta que confirmes el plan y el vertical inicial.
