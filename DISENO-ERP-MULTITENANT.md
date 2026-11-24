# ERP Multitenant — Diseño de producto (nuevo, sin herencia)

> Diseño desde cero. No se reutiliza ni se toma como base ningún proyecto anterior.
> Público objetivo: pequeñas, medianas, grandes empresas y multinacionales, atendidas desde
> una misma plataforma con un **Super Admin** como centro de control y un ERP propio por negocio.

---

## 0. Principios de diseño

1. **Un solo producto, muchas empresas.** Una instancia, N inquilinos (tenants). Cada negocio
   tiene sus datos, usuarios, configuración, marca y módulos activos aislados.
2. **Configurar antes que programar.** Cambios de proceso, campos, roles, idiomas, impuestos,
   numeración y flujos se hacen desde la interfaz, sin tocar código.
3. **Módulos, no bloques.** El cliente activa lo que necesita. El plan solo define límites y
   permisos; el Super Admin puede ajustar ambos por negocio o por plan.
4. **Demo primero, venta después.** Desde el Super Admin se generan demos completas por nicho,
   con datos realistas, flujos guiados y enlace compartible.
5. **Listo para crecer.** El mismo tenant puede empezar con 3 usuarios y terminar con 3.000,
   con multiples sedes, monedas e idiomas, sin migrar de sistema.
6. **Auditabilidad total.** Toda acción relevante queda registrada y es exportable.

---

## 1. Fuentes consultadas y transparencia

Fuentes que sí pudieron leerse:

| Fuente | Aporte principal |
|---|---|
| Wikipedia — *Enterprise resource planning* | Áreas funcionales canónicas: contabilidad financiera y de gestión, RRHH, manufactura, pedidos, cadena de suministro, proyectos, CRM, SRM, contratos, GRP. Además: ERP II (colaboración con externos), ERP postmoderno (núcleo + especialistas), integración planta–ERP, mejores prácticas y localización. |
| Wikipedia — *Multitenancy* | Modelos de datos (BD separada / esquema separado / esquema compartido con `tenant_id`), modelos de despliegue **Silo / Pool / Bridge**, problema del vecino ruidoso, cuotas y rate limiting, personalización requerida (marca, flujo de trabajo, extensión del modelo de datos, control de acceso), liberación de versiones. |
| Odoo — catálogo de apps e industrias | Checklist de módulos (Finance, Sales, Website, Supply Chain, HR, Marketing, Services, Productivity) y lista de nichos con demo (retail, restaurante, hotel, construcción, farmacia, gimnasio, taller, solar, entre otros). |

Fuentes intentadas sin acceso: Behance (403), Oracle (403), NetSuite (403), LinkedIn/Workana (sin resultado), buscador web (sin resultados). No se inventó contenido atribuido a esas fuentes; el listado inferior complementa con diseño propio y práctica estándar de SaaS.

---

## 2. Arquitectura multitenant

### 2.1 Modelo de aislamiento recomendado: **Pool + Bridge**

| Tipo de negocio | Modo | Justificación |
|---|---|---|
| Pequeño / mediano | **Pool** (esquema compartido con `tenant_id`) | Máxima densidad, coste bajo, actualización única. |
| Grande | **Bridge** (datos compartidos + recursos propios: cola, storage, región) | Aísla carga sin duplicar el producto. |
| Multinacional / regulado | **Silo** (BD o esquema propio, región propia) | Cumplimiento legal, soberanía de datos, backup dedicado. |

El Super Admin decide el modo al crear el tenant y puede promoverlo de Pool → Bridge → Silo
sin cambiar la aplicación: la capa de acceso siempre resuelve el `tenant_id` desde la sesión.

### 2.2 Capas

```
[ Usuario ] → [ Consola Super Admin | Consola Tenant | Portales ]
                        ↓
        [ Router de tenant + Resolve de plan + Feature flags ]
                        ↓
        [ Capa de datos con RLS (tenant_id) + auditoría ]
                        ↓
   [ Pool / Bridge / Silo ] + [ Config por tenant: branding, idioma, moneda, flujos ]
```

### 2.3 Esquema lógico mínimo (entra en el Super Admin)

- `tenants` (id, slug, nombre, nicho, modo, región, estado, plan, dueño)
- `tenant_domains` (dominio propio, SSL, white-label)
- `plans` + `plan_modules` + `plan_limits` + `plan_feature_flags`
- `subscriptions` (alta, baja, cambio de plan, prorrateo, renovación)
- `users`, `identities`, `roles`, `permissions`, `role_bindings` (ámbito tenant/sede/equipo)
- `sessions`, `mfa_devices`, `api_tokens`, `webhooks`
- `modules`, `module_versions`, `tenant_modules`
- `custom_fields`, `workflows`, `approvals`, `numbering_series`, `report_templates`
- `i18n_locales`, `i18n_catalog`, `currencies`, `tax_regimes`
- `audit_log`, `login_log`, `change_log`, `job_log`
- `demo_tenants`, `demo_scenarios`, `demo_leads`
- `invoices`, `payments`, `usage_counters`

### 2.4 Aislamiento y seguridad de datos

- `tenant_id` **obligatorio** en toda tabla de negocio, con Row Level Security.
- Ninguna consulta del tenant puede especificar otro `tenant_id`: se inyecta desde la sesión.
- El Super Admin **no lee datos operativos por defecto**: entra a un tenant con sesión temporal,
  registro de motivo y duración (impersonación auditada).
- Diferenciación clara: *soporte ve metadatos*, *ve datos solo con autorización explícita*.

---

## 3. Las tres consolas

| Consola | Quién la usa | Para qué |
|---|---|---|
| **Super Admin** | Dueños del SaaS, soporte, ventas, devops | Control de toda la plataforma, planes, demos, incidencias, facturación de tenants. |
| **Admin de negocio** | Administrador de cada empresa | Configurar su ERP, usuarios, módulos, procesos y ver sus métricas. |
| **Usuario y portales** | Empleados, clientes, proveedores | Trabajar: pedidos, inventario, cobros, RRHH, portal de cliente y proveedor. |

---

## 4. SUPER ADMIN — Centro de control (apartados)

### 4.1 Panel de control
- KPIs globales: MRR/ARR, tenants activos, usuarios activos, churn, expansión, NPS.
- Salud: uptime, errores, latencia, trabajos fallidos, cuotas al 80/90/100 %.
- Actividad reciente: altas, cambios de plan, cancelaciones, incidencias, despliegues.
- Alertas accionables con enlace directo al tenant afectado.
- Ranking de módulos más usados y de nichos con más conversión demo → cliente.

### 4.2 Tenants (negocios)
- Lista/filtros por plan, nicho, país, estado, modo de aislamiento, región.
- Alta asistida en 4 pasos: datos, nicho, plan, branding.
- Detalle del tenant: resumen, módulos, usuarios, consumo, facturas, tickets, notas internas.
- Acciones: suspender, reactivar, cambiar plan, cambiar región, migrar Pool→Silo, eliminar con retención legal.
- ** Entrar al negocio ** (impersonación auditada: motivo, duración, grabación de sesión opcional).
- Clonar tenant (para demo o para nuevo cliente del mismo nicho).
- Auditoría completa de cambios del tenant.

### 4.3 Planes y funciones
- Editor visual de planes: nombre, precio mensual/anual, moneda, descripción, badge, orden.
- **Matriz de módulos** por plan: incluido / add-on / no disponible.
- **Límites** por plan: usuarios, sedes, productos, facturas/mes, almacenamiento, API calls,
  registros de auditoría, retention, número de demos, soporte.
- **Feature flags** por plan y override por tenant: activar/desactivar función sin desplegar.
- Reglas de upgrade/downgrade: prorrateo, bloqueos, avisos al superar cuota.
- Plan personalizado por negocio (precio y módulos a medida).
- Historial de cambios de planes y quién los hizo.
- Simulador: “¿cuánto cobraría este tenant con este plan?”.

### 4.4 Facturación y suscripciones
- Suscripciones, renovaciones, prueba gratuita, prorrateo, descuentos, cupones.
- Facturación al cliente del SaaS, dunning (reintentos, avisos), notas de crédito.
- Pasarelas y métodos de pago por país; facturación electrónica localizada.
- Conciliación de pagos y exportación contable.

### 4.5 Usuarios e identidad
- Usuarios globales del Super Admin y usuarios por tenant (directorio unificado).
- Roles: Super Admin, Soporte, Ventas, Devops, Finanzas, Solo lectura.
- SSO (SAML/OIDC), MFA obligatorio configurable, políticas de contraseña, sesiones, IP permitida.
- Invitaciones, altas/bajas masivas, aprobación de accesos.
- Permisos granulares por módulo y por acción (ver/crear/editar/borrar/exportar/aprobar).

### 4.6 Idiomas e internacionalización
- Idiomas disponibles (es, en, pt, etc.) con activación global y por tenant.
- Editor de catálogos de traducción, estados (traducido / pendiente / revisado).
- Import/export CSV/JSON, detección de claves huérfanas, traducción asistida por IA.
- Formatos de fecha, hora, número, separador decimal y sentido de lectura (RTL).
- Zonas horarias por tenant, sede y usuario.

### 4.7 Localización fiscal y monetaria
- Monedas, tasas de cambio, redondeo y decimales por moneda.
- Regímenes fiscales por país: IVA, ISR, retenciones, impuestos por producto/servicio.
- Series de numeración de facturas por país y por sede; cumplementos de factura electrónica.
- Plantillas de factura, reportes legales y cierre fiscal.

### 4.8 Marca y personalización (white-label)
- Logo, favicon, colores, tipografía, modo oscuro, imágenes de fondo.
- Nombre del producto por tenant, dominio propio, correo de remitente.
- Plantillas de correo, SMS y WhatsApp con la marca del negocio.
- Campos personalizados por módulo, vistas guardadas, dashboards propios.

### 4.9 Módulos y versiones
- Catálogo de módulos del ERP (núcleo + extendidos + de industria).
- Versionado, notas de versión, compatibilidad, activación por tenant.
- Marketplace interno: módulos propios y de terceros, instalación/desinstalación.
- Pruebas A/B de funcionalidades y despliegue progresivo por porcentaje de tenants.

### 4.10 Demos (centro de demostración) — ver sección 9
- Fábrica de demos por nicho, enrollable en segundos.
- Guiones de venta, datos semilla, enlaces con expiración, captura de lead.

### 4.11 Seguridad, cumplimiento y auditoría
- Registro de accesos, cambios y exportaciones; retención configurable.
- Cifrado en reposo y en tránsito, secretos y rotación de claves.
- Política de backup por tenant, restore point y simulacro de recuperación.
- Cumplimiento: GDPR / protección de datos, derechos del titular, DPA.
- Escaneo de dependencias, revisión de permisos, alertas de anomalías.

### 4.12 Operaciones y observabilidad
- Logs, métricas, trazas, health checks por servicio y por tenant.
- Colas y trabajos: reintentos, dead-letter, estado.
- Límites y protección anti “vecino ruidoso”: rate limit, cuotas, prioridad por plan.
- Mantenimiento programado, ventanas por región, modo degradado.

### 4.13 Soporte y éxito del cliente
- Tickets con contexto del tenant, SLA por plan, chat, base de conocimiento.
- Onboarding checklist por nicho, health score del cliente, señales de churn.
- Comunicaciones: avisos de producto, mantenimiento, campañas por segmento.

### 4.14 Integraciones
- Claves API, webhooks, OAuth apps, catálogo de conectores.
- Registro de intentos, replay de webhooks, sandbox.
- Integraciones típicas: pasarelas de pago, banca, contabilidad, mensajería, marketplaces,
  shipping, CRM externo, biometría, IoT.

### 4.15 Datos y migración
- Importadores masivos (CSV/Excel) con plantillas por nicho y validación.
- Exportación completa del tenant (portabilidad), anonymización.
- Copias, restauración puntual, migración entre modos de aislamiento.

### 4.16 Reportes y BI global
- Reportes cruzados de todos los tenants (agregados y anonimizados).
- Embudos demo → alta → activación → retención → expansión.
- Exportación a hoja de cálculo y programación de reportes por correo.

### 4.17 Configuración del sistema
- Parámetros globales, colas de correo/SMS, almacenamiento, CDN.
- Variable de entorno segura, feature flags globales, modo mantenimiento.
- Versiones y despliegues: historial, rollback, changelog.

---

## 5. Catálogo de módulos ERP

### Núcleo (imprescindible en cualquier negocio)

| Módulo | Funciones clave |
|---|---|
| Contabilidad financiera | Libro mayor, activos fijos, cuentas por pagar/cobrar,conciliación bancaria, caja, consolidación multiempresa, cierre fiscal. |
| Contabilidad de gestión | Presupuestos, costos, costeo por actividad, centro de costo, facturación. |
| Compras / SRM | Solicitudes, cotizaciones, órdenes de compra, recepciones, facturas de proveedor, evaluación de proveedores. |
| Ventas / Pedidos | Preventa, pedidos, precios y listas, descuentos, crédito, disponibilidad, facturación, comisiones. |
| Inventario / Almacén | Productos y variantes, stock por sede, movimientos, transferencias, inventario físico, picking/packing, alertas, lotes y vencimientos. |
| CRM | Leads, oportunidades, contactos, actividades, segmentación, campañas, postventa. |
| RRHH y nómina | Empleados, contratos, asistencia, turnos, vacaciones, evaluaciones, nómina, beneficios, selección. |
| Proyectos | Planificación, tareas, tiempo y gastos, WBS, costos, facturación de proyectos. |
| Reportes / BI | Dashboards, reportes personalizados, programados, exportables, cubos, alertas. |

### Extendidos (según tamaño o industria)

Manufactura (BOM, órdenes de trabajo, capacitación, MRP, calidad, PLM, IoT), POS (tienda,
restaurante, delivery), e-commerce, suscripciones, renta, mantenimiento, calidad,
_field service/helpdesk_, marketing automation, email/SMS/WhatsApp, eventos, encuestas,
fleet, documents/e-firma, knowledge, VoIP/chat, IA (asistente, predicciones, OCR),
contratos, cumplimiento, seguridad laboral, sostenibilidad, gestión educativa,
salud/historia clínica, inmobiliario, hotelería, logística y transporte, agricultura.

> Resultado: el mismo ERP sirve para una peluquería de 2 sillas y para una multinacional con
> 20 filiales, 6 monedas y 4 idiomas, activando distinto conjunto de módulos.

---

## 6. Planes y límites (configurables en Super Admin)

| | **Inicio** (pequeña) | **Crecimiento** (mediana) | **Empresa** (gran) | **Global** (multinacional) |
|---|---|---|---|---|
| Usuarios | 5 | 50 | 500 | Ilimitados |
| Sedes | 1 | 10 | 100 | Ilimitadas |
| Módulos | Núcleo | Núcleo + 5 | Todos | Todos + industria |
| Facturas/mes | 100 | 5.000 | 100.000 | Ilimitadas |
| Almacenamiento | 1 GB | 50 GB | 1 TB | Según acuerdo |
| API calls/mes | 10k | 500k | 10 M | Ilimitadas / dedicadas |
| Idiomas | 1 | 2 | 10 | Todos |
| Monedas | 1 | 5 | Todas | Todas + multi-región |
| Aislamiento | Pool | Pool | Bridge | Silo |
| Soporte | Comunidad | Correo 24 h | Prioritario 4 h | Dedicado + SLA |
| Auditoría | 30 días | 1 año | 5 años | Personalizado |
| Demo/Onboarding | Demo estándar | Demo por nicho | Demo a medida | Demo + piloto |

Todo esto se edita en **4.3**: el Super Admin cambia un valor y el cambio aplica al instante
a los tenants del plan. Se pueden crear **planes personalizados** por negocio.

---

## 7. Idiomas, monedas y personalización

- Idioma por usuario, con fallback: usuario → sede → tenant → global.
- Moneda por tenant/sede/documento; conversión con tasa histórica guardada en el comprobante.
- Formatos y fiscalidad por país; plantillas de documentos por idioma.
- Temas y white-label por tenant; campos y flujos propios por módulo.
- Permisos por rol y equipo, herencia entre sedes.
- Numeración de documentos, series y secuencias por sede/año.

---

## 8. Fábrica de demos por nicho (el argumento de venta)

### 8.1 Cómo funciona

1. En Super Admin → **Demos** → *Nueva demo*.
2. Elegir **nicho** y **tamaño** (pequeña / mediana / grande).
3. El sistema crea un tenant efímero con:
   - datos semilla realistas (productos, clientes, proveedores, empleados, pedidos),
   - módulos activos del plan que se quiere mostrar,
   - branding del cliente prospecto si se sube su logo,
   - guion de recorrido (tour) de 6–10 pasos.
4. Se genera un **enlace compartible** con caducidad (7/30 días) y captura de lead.
5. Se puede **clonar**, **reiniciar** o **convertir en tenant real** con un clic.
6. Métricas de la demo: visitas, pasos vistos, tiempo, interés por módulo, lead capturado.

### 8.2 Demos incluidas (ultra completas, una por nicho)

| Demo | Datos semilla | Flujo estrella que se muestra |
|---|---|---|
| **Retail / tienda de belleza** | 300 productos, 4 marcas, presentaciones, stock por sede, clientes | Pedido → picking → factura → cobro → reposición automática. |
| **Restaurante / cafetería** | Menú, mesas, combinables, reservas | Pedido en mesa/QR → cocina → factura → propina → cierre de caja. |
| **Distribuidora / mayorista** | 500 SKU, 20 clientes, 10 proveedores, listas de precios | Pedido → crédito → picking → despacho → cuenta por cobrar. |
| **Manufactura (textil/metal)** | BOM, rutas, máquinas, turnos | Orden de trabajo → consumo de materiales → calidad → producto terminado → costo real. |
| **Construcción** | Proyectos, obras, cuadrillas, materiales | Presupuesto → avance → gastos → facturación por hito → margen por obra. |
| **Clínica / consultorio** | Pacientes, citas, profesionales, historia clínica | Agenda → consulta → facturación / EPS → recordatorio WhatsApp. |
| **Farmacia** | Medicamentos, lotes, vencimientos, reglas | Venta → descuento de lote → alerta de vencimiento → pedido a proveedor. |
| **Salón de belleza / spa** | Servicios, profesionales, turnos, comisiones | Reserva → ficha cliente → servicio → cobro → comisión → reagenda. |
| **Educación / academia** | Estudiantes, cursos, matrícula, asistencia | Inscripción → cuota → asistencia → calificación → certificado. |
| **Hotel / hospedaje** | Habitaciones, tarifas, reservas, huéspedes | Reserva → check-in → consumos → factura → check-out → limpieza. |
| **Logística / transporte** | Vehículos, rutas, guías, choferes | Guía → ruta → entrega → firma digital → liquidación. |
| **Agricultura** | Fincas, cultivos, insumos, cosechas | Siembra → insumos → cosecha → stock → venta → costos por lote. |
| **Servicios profesionales** | Clientes, horas, hitos, contratos | Propuesta → contrato → tiempo → factura → renovación. |
| **E-commerce / suscripciones** | Catálogo, carrito, cupones, planes | Compra → pago → envío → renovación → churn. |

Cada demo termina en un **panel de resultados** (ventas, stock, cobros, utilidad) para que el
cliente vea el impacto, no solo formularios.

---

## 9. Seguridad y cumplimiento

- Aislamiento por `tenant_id` + RLS, impersonación auditada, RBAC/ABAC.
- MFA, SSO, SCIM para altas/bajas, sesiones con expiración, IP y dispositivo.
- Cifrado en reposo/ tránsito, secretos rotatorios, backups cifrados.
- Auditoría inmutable de cambios; exportación para auditoría externa.
- Retención y borrado conforme a política; portabilidad de datos del tenant.
- Protección de cuotas y rate limiting por tenant (vecino ruidoso).
- Pruebas de penetración, escaneo de dependencias, revisión de permisos.

---

## 10. Roadmap sugerido

| Fase | Entregable |
|---|---|
| 1 — Cimiento | Modelo multitenant, Super Admin (tenants, planes, usuarios, auditoría), consola tenant base. |
| 2 — Núcleo ERP | Contabilidad, compras, ventas, inventario, CRM, reportes. |
| 3 — Personalización | Idiomas, monedas, branding, campos, flujos, roles, feature flags. |
| 4 — Fábrica de demos | Primeros 5 nichos con guion y captura de lead. |
| 5 — Escala | Módulos de manufactura/industria, Bridge/Silo, BI global, marketplace. |
| 6 — IA | Asistente, OCR de facturas, predicción de demanda, recomendaciones. |

---

## 11. Decisiones que necesito de ti para pasar a prototipo/MVP

1. **Stack:** ¿web (React/Next + Supabase/Postgres), o prefieres otro? ¿Mobile nativo desde el inicio o PWA?
2. **Primer alcance:** ¿quieres primero el **Super Admin completo** (es lo que más enfatizas),
   o un **ERP funcional** de un nicho para validar?
3. **Idiomas iniciales:** ¿español + inglés + portugués?
4. **Facturación:** ¿el SaaS cobra a los tenants (stripe/pasarela local) o solo control interno?
5. **Demos:** ¿cuáles 3 nichos quieres primero terminados ultra completos?
6. **Entregable ahora:** ¿documento (ya listo), **prototipo navegable** del Super Admin, o ambos?
