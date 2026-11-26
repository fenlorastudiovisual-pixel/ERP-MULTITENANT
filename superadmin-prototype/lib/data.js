// Catálogos base del Super Admin. Los tenants y las demos reales viven en Neon;
// estos datos solo alimentan los selectores y el generador de demos.

export const SECTIONS = [
  { id: "dashboard", label: "Panel de control", icon: "◈", group: "Centro de control" },
  { id: "tenants", label: "Tenants", icon: "▦", group: "Centro de control" },
  { id: "plans", label: "Planes y funciones", icon: "◐", group: "Centro de control" },
  { id: "billing", label: "Facturación", icon: "¤", group: "Centro de control" },
  { id: "users", label: "Usuarios e identidad", icon: "◎", group: "Configuración" },
  { id: "languages", label: "Idiomas", icon: "文", group: "Configuración" },
  { id: "localization", label: "Localización fiscal", icon: "⌘", group: "Configuración" },
  { id: "branding", label: "Marca y white-label", icon: "✦", group: "Configuración" },
  { id: "modules", label: "Módulos y versiones", icon: "▤", group: "Configuración" },
  { id: "demos", label: "Demos", icon: "▶", group: "Configuración" },
  { id: "security", label: "Seguridad y auditoría", icon: "⚿", group: "Confianza" },
  { id: "operations", label: "Operaciones", icon: "⌁", group: "Confianza" },
  { id: "support", label: "Soporte y éxito", icon: "☏", group: "Crecimiento" },
  { id: "integrations", label: "Integraciones", icon: "⤨", group: "Crecimiento" },
  { id: "data", label: "Datos y migración", icon: "⇅", group: "Crecimiento" },
  { id: "bi", label: "Reportes y BI", icon: "▧", group: "Crecimiento" },
  { id: "settings", label: "Configuración del sistema", icon: "⚙", group: "Sistema" },
];

export const GROUPS = ["Centro de control", "Configuración", "Confianza", "Crecimiento", "Sistema"];

export const MODULES = [
  { id: "fin", label: "Contabilidad financiera", group: "Núcleo" },
  { id: "mgmt", label: "Contabilidad de gestión", group: "Núcleo" },
  { id: "buy", label: "Compras y proveedores", group: "Núcleo" },
  { id: "sales", label: "Ventas y pedidos", group: "Núcleo" },
  { id: "stock", label: "Inventario y almacenes", group: "Núcleo" },
  { id: "crm", label: "CRM", group: "Núcleo" },
  { id: "hr", label: "RRHH y nómina", group: "Núcleo" },
  { id: "proj", label: "Proyectos", group: "Núcleo" },
  { id: "bi", label: "Reportes y BI", group: "Núcleo" },
  { id: "mfg", label: "Manufactura y MRP", group: "Extendidos" },
  { id: "pos", label: "POS / Tienda", group: "Extendidos" },
  { id: "ecom", label: "E-commerce", group: "Extendidos" },
  { id: "field", label: "Servicio de campo", group: "Extendidos" },
  { id: "help", label: "Helpdesk", group: "Extendidos" },
  { id: "mkt", label: "Marketing automation", group: "Extendidos" },
  { id: "docs", label: "Documentos y e-firma", group: "Extendidos" },
  { id: "ai", label: "Asistente e IA", group: "Extendidos" },
  { id: "iot", label: "IoT y planta", group: "Extendidos" },
];

const ALL_INCLUDED = Object.fromEntries(MODULES.map((m) => [m.id, "included"]));
const pick = (ids) => Object.fromEntries(MODULES.map((m) => [m.id, ids.includes(m.id) ? "included" : "off"]));

export const PLAN_SEED = [
  {
    id: "inicio",
    name: "Inicio",
    tagline: "Para pequeños negocios que empiezan a ordenar su operación.",
    price: 29,
    color: "#0ea5a4",
    badge: "Popular",
    limits: { users: 5, sites: 1, products: 500, invoices: 100, storage: 1, api: 10000, languages: 1, currencies: 1, auditDays: 30, support: "Comunidad" },
    modules: pick(["fin", "sales", "stock", "crm", "bi"]),
    flags: { tours: true, whatsapp: true, einvoice: false, api: false, whiteLabel: false },
  },
  {
    id: "crecimiento",
    name: "Crecimiento",
    tagline: "Para medianas empresas con varias sedes y más proceso.",
    price: 99,
    color: "#6366f1",
    badge: "Más elegido",
    limits: { users: 50, sites: 10, products: 10000, invoices: 5000, storage: 50, api: 500000, languages: 2, currencies: 5, auditDays: 365, support: "Correo 24 h" },
    modules: pick(["fin", "mgmt", "sales", "stock", "crm", "buy", "hr", "proj", "bi", "pos", "ecom", "mkt"]),
    flags: { tours: true, whatsapp: true, einvoice: true, api: true, whiteLabel: true },
  },
  {
    id: "empresa",
    name: "Empresa",
    tagline: "Operación completa, multi-sede y control avanzado.",
    price: 299,
    color: "#8b5cf6",
    badge: "",
    limits: { users: 500, sites: 100, products: 200000, invoices: 100000, storage: 1000, api: 10000000, languages: 10, currencies: 999, auditDays: 1825, support: "Prioritario 4 h" },
    modules: ALL_INCLUDED,
    flags: { tours: true, whatsapp: true, einvoice: true, api: true, whiteLabel: true },
  },
  {
    id: "global",
    name: "Global",
    tagline: "Multinacionales: multi-región, silos y soporte dedicado.",
    price: 0,
    color: "#0f172a",
    badge: "A medida",
    limits: { users: 999999, sites: 999999, products: 9999999, invoices: 9999999, storage: 99999, api: 999999999, languages: 40, currencies: 999, auditDays: 99999, support: "Dedicado + SLA" },
    modules: ALL_INCLUDED,
    flags: { tours: true, whatsapp: true, einvoice: true, api: true, whiteLabel: true },
  },
];

export const TENANTS_SEED = [
  { id: "t1", name: "Belleza del Valle", niche: "Retail / belleza", plan: "crecimiento", country: "Colombia", city: "Medellín", users: 34, status: "Activo", mode: "Pool", mrr: 99, health: 92, color: "#f472b6", created: "2026-03-14" },
  { id: "t2", name: "Café Aurora", niche: "Restaurante", plan: "inicio", country: "Colombia", city: "Bogotá", users: 8, status: "Activo", mode: "Pool", mrr: 29, health: 87, color: "#f59e0b", created: "2026-05-02" },
  { id: "t3", name: "Distribuidora Norte", niche: "Distribuidora", plan: "empresa", country: "México", city: "Monterrey", users: 218, status: "Activo", mode: "Bridge", mrr: 299, health: 78, color: "#38bdf8", created: "2025-11-20" },
  { id: "t4", name: "Textiles San Roque", niche: "Manufactura", plan: "empresa", country: "Colombia", city: "Barranquilla", users: 145, status: "Activo", mode: "Bridge", mrr: 299, health: 84, color: "#a78bfa", created: "2026-01-09" },
  { id: "t5", name: "Constructora Hito", niche: "Construcción", plan: "empresa", country: "España", city: "Valencia", users: 96, status: "Activo", mode: "Bridge", mrr: 329, health: 71, color: "#fb923c", created: "2026-02-18" },
  { id: "t6", name: "Clínica Vida Plena", niche: "Clínica", plan: "crecimiento", country: "Chile", city: "Santiago", users: 62, status: "Activo", mode: "Pool", mrr: 99, health: 89, color: "#34d399", created: "2026-04-27" },
  { id: "t7", name: "Farmacia Central", niche: "Farmacia", plan: "crecimiento", country: "Perú", city: "Lima", users: 41, status: "Activo", mode: "Pool", mrr: 99, health: 81, color: "#22d3ee", created: "2026-06-11" },
  { id: "t8", name: "Spa Arena", niche: "Salón y spa", plan: "inicio", country: "Colombia", city: "Cali", users: 12, status: "Activo", mode: "Pool", mrr: 29, health: 95, color: "#f9a8d4", created: "2026-07-03" },
  { id: "t9", name: "Academia Horizonte", niche: "Educación", plan: "crecimiento", country: "Argentina", city: "Córdoba", users: 55, status: "Activo", mode: "Pool", mrr: 99, health: 76, color: "#60a5fa", created: "2026-01-30" },
  { id: "t10", name: "Hotel Las Brisas", niche: "Hotel", plan: "empresa", country: "Rep. Dominicana", city: "Punta Cana", users: 120, status: "Activo", mode: "Bridge", mrr: 299, health: 83, color: "#2dd4bf", created: "2025-12-12" },
  { id: "t11", name: "TransAndes", niche: "Logística", plan: "empresa", country: "Colombia", city: "Bogotá", users: 188, status: "Activo", mode: "Bridge", mrr: 299, health: 68, color: "#facc15", created: "2026-03-22" },
  { id: "t12", name: "Agroverde S.A.", niche: "Agricultura", plan: "global", country: "Brasil", city: "São Paulo", users: 640, status: "Activo", mode: "Silo", mrr: 1450, health: 90, color: "#4ade80", created: "2025-09-08" },
  { id: "t13", name: "Estudio Legal Sigma", niche: "Servicios profesionales", plan: "crecimiento", country: "Uruguay", city: "Montevideo", users: 28, status: "Activo", mode: "Pool", mrr: 99, health: 93, color: "#94a3b8", created: "2026-08-01" },
  { id: "t14", name: "Moda Ébano", niche: "E-commerce", plan: "crecimiento", country: "Colombia", city: "Medellín", users: 37, status: "Prueba", mode: "Pool", mrr: 0, health: 64, color: "#c084fc", created: "2026-10-19" },
  { id: "t15", name: "Ferretería Unión", niche: "Retail", plan: "inicio", country: "Guatemala", city: "Guatemala", users: 6, status: "Suspendido", mode: "Pool", mrr: 0, health: 41, color: "#fb7185", created: "2026-02-05" },
  { id: "t16", name: "Samjuro", niche: "Cliente de prueba", plan: "crecimiento", country: "Colombia", city: "Bogotá", users: 18, status: "Activo", mode: "Pool", mrr: 99, health: 88, color: "#6366f1", created: "2026-11-01", email: "fenlorastudiovisual@gmail.com" },
];

export const DEMOS = [
  { id: "d1", name: "Retail / tienda de belleza", icon: "▣", color: "#f472b6", size: "todos", modules: ["Ventas", "Inventario", "CRM", "POS", "Facturación"], seed: "300 productos · 4 marcas · 2 sedes · 800 clientes", flow: "Pedido → picking → factura → cobro → reposición", kpi: "$ 18.4 M ventas/mes", notes: "Ideal para catálogos con presentaciones y stock por sede." },
  { id: "d2", name: "Restaurante / cafetería", icon: "☕", color: "#f59e0b", size: "pequeña", modules: ["POS", "Mesas", "Cocina", "Facturación", "Caja"], seed: "48 platillos · 18 mesas · 6 combinables", flow: "Pedido QR → cocina → factura → propina → cierre", kpi: "92% mesas rotadas", notes: "Muestra pedidos por QR y control de cocina en vivo." },
  { id: "d3", name: "Distribuidora / mayorista", icon: "⇥", color: "#38bdf8", size: "mediana", modules: ["Ventas", "Crédito", "Listas de precios", "Despacho", "Cobros"], seed: "500 SKU · 20 clientes · 10 proveedores", flow: "Pedido → crédito → picking → despacho → cartera", kpi: "$ 42 M cartera", notes: "Listas de precios por cliente y control de cartera." },
  { id: "d4", name: "Manufactura (textil / metal)", icon: "⚙", color: "#a78bfa", size: "grande", modules: ["BOM", "Orden de trabajo", "MRP", "Calidad", "Costos"], seed: "12 BOM · 8 máquinas · 3 turnos", flow: "Orden → consumo → calidad → terminado → costo real", kpi: "94% cumplimiento", notes: "Costo real por orden y trazabilidad de materiales." },
  { id: "d5", name: "Construcción", icon: "▤", color: "#fb923c", size: "grande", modules: ["Proyectos", "Presupuesto", "Avances", "Gastos", "Facturación"], seed: "6 obras · 40 cuadrillas · 900 materiales", flow: "Presupuesto → avance → gasto → hito → margen", kpi: "18.6% margen/obra", notes: "Margen por obra y facturación por hitos." },
  { id: "d6", name: "Clínica / consultorio", icon: "✚", color: "#34d399", size: "mediana", modules: ["Agenda", "Pacientes", "Historia clínica", "Facturación", "WhatsApp"], seed: "1.200 pacientes · 8 profesionales", flow: "Cita → consulta → factura → recordatorio", kpi: "87% asistencia", notes: "Agenda multiprofesional y recordatorios automáticos." },
  { id: "d7", name: "Farmacia", icon: "✚", color: "#22d3ee", size: "mediana", modules: ["Ventas", "Lotes", "Vencimientos", "Compras", "Reglas"], seed: "2.400 medicamentos · 300 lotes", flow: "Venta → lote → alerta vencimiento → pedido", kpi: "0 productos vencidos", notes: "Control de lotes, vencimientos y reposición." },
  { id: "d8", name: "Salón de belleza / spa", icon: "✿", color: "#f9a8d4", size: "pequeña", modules: ["Reservas", "Ficha cliente", "Servicios", "Comisiones", "Cobros"], seed: "350 clientes · 12 servicios · 6 profesionales", flow: "Reserva → ficha → servicio → cobro → comisión", kpi: "+24% reagenda", notes: "Comisiones por profesional y fidelización." },
  { id: "d9", name: "Educación / academia", icon: "▧", color: "#60a5fa", size: "mediana", modules: ["Matrícula", "Cuotas", "Asistencia", "Notas", "Certificados"], seed: "480 estudiantes · 22 cursos", flow: "Inscripción → cuota → asistencia → nota → certificado", kpi: "91% pagos a tiempo", notes: "Ciclo completo del estudiante y facturación recurrente." },
  { id: "d10", name: "Hotel / hospedaje", icon: "▣", color: "#2dd4bf", size: "grande", modules: ["Reservas", "Habitaciones", "Consumos", "Factura", "Limpieza"], seed: "60 habitaciones · 5 tarifas", flow: "Reserva → check-in → consumos → factura → limpieza", kpi: "78% ocupación", notes: "Integra habitaciones, consumo y limpieza." },
  { id: "d11", name: "Logística / transporte", icon: "➤", color: "#facc15", size: "grande", modules: ["Guías", "Rutas", "Flota", "Entrega", "Liquidación"], seed: "24 vehículos · 90 guías/día", flow: "Guía → ruta → entrega → firma → liquidación", kpi: "96% entregas a tiempo", notes: "Firma digital y control de choferes." },
  { id: "d12", name: "Agricultura", icon: "❀", color: "#4ade80", size: "grande", modules: ["Fincas", "Cultivos", "Insumos", "Cosecha", "Costos"], seed: "8 fincas · 30 lotes · 60 insumos", flow: "Siembra → insumo → cosecha → stock → venta", kpi: "$ 3.2 M / hectárea", notes: "Costo por lote y trazabilidad de cosecha." },
  { id: "d13", name: "Servicios profesionales", icon: "§", color: "#94a3b8", size: "mediana", modules: ["Propuesta", "Contrato", "Tiempo", "Factura", "Renovación"], seed: "40 clientes · 18 contratos", flow: "Propuesta → contrato → horas → factura → renovación", kpi: "86% renovación", notes: "Facturación por horas y gestión de contratos." },
  { id: "d14", name: "E-commerce / suscripciones", icon: "◇", color: "#c084fc", size: "mediana", modules: ["Catálogo", "Carrito", "Pagos", "Envíos", "Suscripciones"], seed: "700 SKU · 3 planes de suscripción", flow: "Compra → pago → envío → renovación → churn", kpi: "6.2% churn", notes: "Venta recurrente y métricas de retención." },
];

export const ACTIVITY = [
  { who: "María Gómez", what: "creó el tenant", target: "Moda Ébano", when: "hace 8 min", type: "tenant" },
  { who: "Sistema", what: "detectó cuota al 92% en", target: "TransAndes", when: "hace 24 min", type: "alert" },
  { who: "Andrés Ruiz", what: "cambió el plan de", target: "Constructora Hito", when: "hace 1 h", type: "plan" },
  { who: "Demo Factory", what: "generó demo de", target: "Farmacia · 14 visitas", when: "hace 2 h", type: "demo" },
  { who: "Soporte", what: "cerró ticket #4821 de", target: "Café Aurora", when: "hace 3 h", type: "support" },
  { who: "Sistema", what: "desplegó versión", target: "v2.14.0 a producción", when: "hace 5 h", type: "deploy" },
];

export const ALERTS = [
  { level: "high", text: "TransAndes superó el 92% de su cuota de API.", action: "Ver tenant" },
  { level: "medium", text: "3 tenants con pago fallido en facturación.", action: "Ir a facturación" },
  { level: "low", text: "7 traducciones pendientes en portugués.", action: "Revisar idiomas" },
];

export const REVENUE = [42, 48, 45, 55, 61, 58, 67, 72, 70, 81, 88, 96];
export const NICHE_REVENUE = [
  { label: "Retail", value: 32 }, { label: "Manufactura", value: 24 },
  { label: "Servicios", value: 18 }, { label: "Salud", value: 14 }, { label: "Otros", value: 12 },
];
export const MODULE_USAGE = [
  { label: "Ventas", value: 94 }, { label: "Inventario", value: 87 },
  { label: "Facturación", value: 81 }, { label: "CRM", value: 68 }, { label: "Manufactura", value: 41 },
];

export const USERS_SEED = [
  { name: "María Gómez", email: "maria@fenlora.com", role: "Super Admin", scope: "Global", mfa: true, state: "Activo" },
  { name: "Andrés Ruiz", email: "andres@fenlora.com", role: "Ventas", scope: "Global", mfa: true, state: "Activo" },
  { name: "Lucía Herrera", email: "lucia@fenlora.com", role: "Soporte", scope: "10 tenants", mfa: true, state: "Activo" },
  { name: "Carlos Pineda", email: "carlos@fenlora.com", role: "Devops", scope: "Global", mfa: false, state: "Activo" },
  { name: "Sofía Marín", email: "sofia@fenlora.com", role: "Solo lectura", scope: "Finanzas", mfa: true, state: "Invitado" },
];

export const LANGUAGES = [
  { code: "es", name: "Español", native: "Español", translated: 100, state: "Completo" },
  { code: "en", name: "Inglés", native: "English", translated: 96, state: "En revisión" },
  { code: "pt", name: "Portugués", native: "Português", translated: 72, state: "Pendiente" },
  { code: "fr", name: "Francés", native: "Français", translated: 18, state: "Pendiente" },
];

export const TRANSLATIONS_SEED = [
  { key: "nav.dashboard", es: "Panel de control", en: "Dashboard", pt: "Painel de controle" },
  { key: "nav.tenants", es: "Tenants", en: "Tenants", pt: "Inquilinos" },
  { key: "action.save", es: "Guardar", en: "Save", pt: "" },
  { key: "order.new", es: "Nuevo pedido", en: "New order", pt: "Novo pedido" },
  { key: "stock.low", es: "Stock bajo", en: "Low stock", pt: "" },
  { key: "invoice.overdue", es: "Factura vencida", en: "Overdue invoice", pt: "Fatura vencida" },
];
