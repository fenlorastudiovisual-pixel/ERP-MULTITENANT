// Motor de demos reales. Cada nicho genera datos operativos coherentes:
// catálogo, clientes, pedidos, facturas y datos específicos (agenda, obras,
// habitaciones, guías, lotes, suscripciones...). Determinista por semilla.

export const DEMO_MODULES = {
  resumen: "Resumen",
  productos: "Productos / servicios",
  clientes: "Clientes",
  pedidos: "Pedidos",
  facturas: "Facturación y cobros",
  agenda: "Agenda y reservas",
  proyectos: "Proyectos y obras",
  produccion: "Producción",
  envios: "Envíos y flota",
  fincas: "Fincas y cosechas",
  suscripciones: "Suscripciones",
  alertas: "Alertas",
};

const TEMPLATES = {
  d1: {
    name: "Retail / tienda de belleza", icon: "▣", color: "#f472b6", currency: "COP",
    modules: ["resumen", "productos", "clientes", "pedidos", "facturas", "alertas"],
    catalog: ["Crema hidratante 50ml", "Sérum vitamina C", "Protector solar FPS 50", "Base de maquillaje", "Labial mate", "Mascarilla capilar", "Jabón facial", "Aceite corporal", "Polvo compacto", "Spray fijador", "Kit manicura", "Perfume floral 100ml"],
    categories: ["Cuidado facial", "Maquillaje", "Cabello", "Fragancias", "Accesorios"],
    clients: ["Valeria", "Camila", "Daniela", "Sofía", "Mariana", "Isabella", "Paula", "Andrea"],
    extra: "retail",
  },
  d2: {
    name: "Restaurante / cafetería", icon: "☕", color: "#f59e0b", currency: "COP",
    modules: ["resumen", "productos", "pedidos", "clientes", "facturas", "alertas"],
    catalog: ["Café americano", "Latte de avena", "Croissant de almendra", "Panini de jamón", "Bowl de fruta", "Jugo natural", "Tarta de chocolate", "Huevos benedictinos", "Sandwich de pollo", "Té chai", "Postre de la casa", "Agua con gas"],
    categories: ["Bebidas", "Desayunos", "Platos fuertes", "Postres", "Complementos"],
    clients: ["Mesa 1", "Mesa 2", "Mesa 3", "Mesa 4", "Mesa 5", "Mesa 6", "Mesa 7", "Mesa 8"],
    extra: "restaurant",
  },
  d3: {
    name: "Distribuidora / mayorista", icon: "⇥", color: "#38bdf8", currency: "COP",
    modules: ["resumen", "productos", "clientes", "pedidos", "facturas", "alertas"],
    catalog: ["Arroz 50 lb", "Aceite vegetal 5 L", "Azúcar 50 kg", "Leche en polvo", "Harina de trigo", "Café molido 1 kg", "Fideos 500 g", "Atún en lata", "Jabón líquido 5 L", "Papel higiénico x12", "Galletas x24", "Refresco 1.5 L"],
    categories: ["Granos", "Lácteos", "Abarrotes", "Bebidas", "Limpieza"],
    clients: ["Tienda La Esquina", "Supermercado Norte", "Bodega Central", "Mini Market 24h", "Restaurante El Faro", "Cafetería Uno", "Cooperativa Sur", "Ferretería Paz"],
    extra: "distribution",
  },
  d4: {
    name: "Manufactura textil / metal", icon: "⚙", color: "#a78bfa", currency: "COP",
    modules: ["resumen", "productos", "produccion", "clientes", "pedidos", "facturas", "alertas"],
    catalog: ["Camisa manga larga", "Pantalón de mezclilla", "Chaqueta impermeable", "Playera algodón 180g", "Saco de lino", "Blusa de oficina", "Jeans elasticado", "Uniforme industrial", "Tela denim por metro", "Hilo poliéster 500g"],
    categories: ["Confección", "Telas", "Insumos", "Terminados"],
    clients: ["Marca Andina", "Uniformes del Sur", "Textiles Uno", "Moda Urbana", "Distribuidora Textil", "Talleres del Norte"],
    extra: "manufacturing",
  },
  d5: {
    name: "Construcción", icon: "▤", color: "#fb923c", currency: "COP",
    modules: ["resumen", "proyectos", "productos", "clientes", "facturas", "gastos", "alertas"],
    catalog: ["Cemento 50 kg", "Varilla 12mm", "Arena cubicada", "Gravilla cubicada", "Ladrillo arcilla", "Cal hidratada", "Panel de yeso", "Pintura acrílica 1 gal", "Teja de barro", "Tubo PVC 1/2"],
    categories: ["Materiales", "Herramientas", "Acabados", "Contratos"],
    clients: ["Inversiones del Valle", "Constructora Roma", "Señor Pérez", "Edificio Los Olivos", "Municipio de Ibagué", "Inmobiliaria Central"],
    extra: "construction",
  },
  d6: {
    name: "Clínica / consultorio", icon: "✚", color: "#34d399", currency: "COP",
    modules: ["resumen", "agenda", "clientes", "productos", "facturas", "alertas"],
    catalog: ["Consulta general", "Control de presión", "Electrocardiograma", "Laboratorio básico", "Vacuna influenza", "Consulta pediátrica", "Terapia física", "Ultrasonido", "Examen de sangre", "Consulta ginecológica"],
    categories: ["Consultas", "Laboratorio", "Imágenes", "Terapias", "Vacunas"],
    clients: ["María Rodríguez", "Jorge Ramírez", "Lucía Fernández", "Carlos Torres", "Ana Beltrán", "Pedro Suárez", "Rosa Martínez", "Luis Herrera"],
    extra: "clinic",
  },
  d7: {
    name: "Farmacia", icon: "✚", color: "#22d3ee", currency: "COP",
    modules: ["resumen", "productos", "clientes", "pedidos", "facturas", "alertas"],
    catalog: ["Acetaminofén 500mg", "Ibuprofeno 400mg", "Amoxicilina 500mg", "Vitamina C 1g", "Jarabe para tos", "Protector solar", "Suero fisiológico", "Termómetro digital", "Vendas elásticas", "Omeprazol 20mg", "Loratadina 10mg", "Crema antimicótica"],
    categories: ["Medicamentos", "Vitaminas", "Cuidado personal", "Dispositivos", "Dermocosmética"],
    clients: ["Señora Elvira", "Juan David", "Clínica San Pedro", "Farmacia Norte", "Ana María", "Señor Ramón", "Sofía Ramírez", "Carlos Alberto"],
    extra: "pharmacy",
  },
  d8: {
    name: "Salón de belleza / spa", icon: "✿", color: "#f9a8d4", currency: "COP",
    modules: ["resumen", "agenda", "clientes", "productos", "facturas", "alertas"],
    catalog: ["Corte de cabello", "Coloración", "Manicura", "Pedicura", "Facial profundo", "Masaje relajante", "Depilación", "Peinado para evento", "Tratamiento capilar", "Spa de manos"],
    categories: ["Cabello", "Uñas", "Faciales", "Bienestar"],
    clients: ["Natalia", "Andrea", "Paola", "Diana", "Camilo", "Valentina", "Gabriela", "Lorena"],
    extra: "spa",
  },
  d9: {
    name: "Educación / academia", icon: "▧", color: "#60a5fa", currency: "COP",
    modules: ["resumen", "clientes", "productos", "facturas", "agenda", "alertas"],
    catalog: ["Inglés básico", "Inglés intermedio", "Matemáticas", "Física", "Programación", "Diseño gráfico", "Contabilidad", "Preparación ICFES", "Conversación inglesa", "Excel avanzado"],
    categories: ["Idiomas", "Ciencias", "Tecnología", "Preparación", "Negocios"],
    clients: ["Santiago Ruiz", "Mariana López", "Emilio Castro", "Daniella Peña", "Juan Sebastián", "Isabel Moreno", "Mateo Gil", "Valeria Soto"],
    extra: "education",
  },
  d10: {
    name: "Hotel / hospedaje", icon: "▣", color: "#2dd4bf", currency: "COP",
    modules: ["resumen", "agenda", "clientes", "productos", "facturas", "alertas"],
    catalog: ["Habitación sencilla", "Habitación doble", "Suite familiar", "Cabaña premium", "Desayuno buffet", "Almuerzo", "Tour guiado", "Spa 60 min", "Transporte aeropuerto", "Late check-out"],
    categories: ["Hospedaje", "Alimentos", "Experiencias", "Servicios"],
    clients: ["Familia González", "Empresa Andina", "Señor Petersen", "Agencia Viajes Sol", "María Elena", "Grupo Innovation", "Carlos Ríos", "Señora Duarte"],
    extra: "hotel",
  },
  d11: {
    name: "Logística / transporte", icon: "➤", color: "#facc15", currency: "COP",
    modules: ["resumen", "envios", "clientes", "pedidos", "facturas", "alertas"],
    catalog: ["Flete nacional 1 ton", "Flete nacional 3 ton", "Entrega expresa", "Recolección", "Almacenaje por día", "Guía internacional", "Carga refrigerada", "Grúa 24h", "Mudanza integral", "Descarga en destino"],
    categories: ["Fletes", "Express", "Almacenaje", "Servicios especiales"],
    clients: ["Comercial del Pacifico", "Fábrica Horizonte", "Distribuidora Sur", "Agroverde", "Tienda Online Uno", "Constructora Hito", "Farmacia Central", "Importadora Lima"],
    extra: "logistics",
  },
  d12: {
    name: "Agricultura", icon: "❀", color: "#4ade80", currency: "COP",
    modules: ["resumen", "fincas", "productos", "clientes", "pedidos", "facturas", "alertas"],
    catalog: ["Abono orgánico 50 kg", "Fertilizante NPK", "Plaguicida 1 L", "Semilla de maíz", "Semilla de soja", "Manguera 1 pulgada", "Pala de mano", "Cosechadora", "Sistema de riego", "Guantes de trabajo"],
    categories: ["Insumos", "Semillas", "Herramientas", "Maquinaria", "Riego"],
    clients: ["Cooperativa Agraria", "Mercado de Abastos", "Exportadora Verde", "Supermercado Andes", "Grupo Agroindustrial", "Comercializadora del Sur"],
    extra: "agriculture",
  },
  d13: {
    name: "Servicios profesionales", icon: "§", color: "#94a3b8", currency: "COP",
    modules: ["resumen", "clientes", "proyectos", "facturas", "agenda", "alertas"],
    catalog: ["Consultoría estratégica", "Auditoría financiera", "Asesoría legal", "Diseño de procesos", "Implementación de sistema", "Capacitación", "Due diligence", "Revisión contractual", "Plan de negocio", "Soporte mensual"],
    categories: ["Consultoría", "Legal", "Financiero", "Formación", "Soporte"],
    clients: ["Grupo Empresarial Sur", "Startup Andes", "Fundación Horizonte", "Inversiones del Norte", "Constructora Hito", "Clínica Vida Plena", "Hotel Las Brisas", "Textiles San Roque"],
    extra: "services",
  },
  d14: {
    name: "E-commerce / suscripciones", icon: "◇", color: "#c084fc", currency: "COP",
    modules: ["resumen", "productos", "clientes", "pedidos", "suscripciones", "facturas", "alertas"],
    catalog: ["Plan Básico mensual", "Plan Pro mensual", "Plan Empresa anual", "Kit de bienvenida", "Camiseta personalizada", "Taza térmica", "Cuaderno", "Mochila", "Audífonos", "Tarjeta regalo"],
    categories: ["Suscripciones", "Merchandising", "Accesorios", "Pagos únicos"],
    clients: ["Andrés Vargas", "Claudia Mora", "Fernando Díaz", "Juliana Restrepo", "Sebastián Ochoa", "Mónica Molano", "David Zamora", "Paola Cárdenas"],
    extra: "ecommerce",
  },
};

export function demoTemplates() {
  return Object.entries(TEMPLATES).map(([id, template]) => ({ id, ...template }));
}

export function getDemoTemplate(id) {
  return TEMPLATES[id] || TEMPLATES.d1;
}

function hash(text) {
  let value = 2166136261;
  for (const char of String(text)) {
    value ^= char.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (random, list) => list[Math.floor(random() * list.length)];
const between = (random, min, max) => Math.floor(random() * (max - min + 1)) + min;
const money = (value, currency) => `${currency === "COP" ? "$ " : currency === "USD" ? "US$ " : "€ "}${Number(value).toLocaleString("es-CO")}`;
const dateOffset = (random, days) => {
  const date = new Date();
  date.setDate(date.getDate() - Math.floor(random() * days));
  return date.toISOString().slice(0, 10);
};

/** Genera un sandbox completo y coherente para un nicho. */
export function buildDemoData(nicheId, businessName = "Negocio demo", seed = "") {
  const template = getDemoTemplate(nicheId);
  const random = rng(hash(`${nicheId}|${businessName}|${seed}`));
  const currency = template.currency;
  const catalog = template.catalog;
  const products = catalog.concat(
    Array.from({ length: Math.max(10, catalog.length) }, (_, i) => `${pick(random, template.categories)} ${pick(random, ["Plus", "Premium", "Económico", "Edición especial", "Pack x2"])} ${i + 1}`),
  ).map((name, i) => {
    const price = between(random, 18, 480) * (currency === "COP" ? 1000 : 1);
    const stock = between(random, 0, 240);
    return {
      id: `p${i + 1}`,
      name,
      sku: `${nicheId.toUpperCase()}-${String(i + 1).padStart(4, "0")}`,
      category: pick(random, template.categories),
      price,
      stock,
      unit: template.extra === "construct" ? "und" : "und",
      status: stock === 0 ? "Agotado" : stock < 12 ? "Stock bajo" : "Disponible",
    };
  });

  const customers = Array.from({ length: 26 }, (_, i) => {
    const name = `${pick(random, template.clients)} ${String.fromCharCode(65 + (i % 26))}.`;
    return {
      id: `c${i + 1}`,
      name,
      phone: `+57 3${between(random, 10, 99)} ${between(random, 100, 999)} ${between(random, 1000, 9999)}`,
      email: `${name.toLowerCase().replace(/[^a-z]/g, "").slice(0, 12)}@correo.com`,
      city: pick(random, ["Medellín", "Bogotá", "Cali", "Lima", "Santiago", "Monterrey"]),
      balance: between(random, 0, 42) * 100000,
      tier: pick(random, ["Nuevo", "Frecuente", "VIP"]),
    };
  });

  const statuses = ["Pagado", "Pagado", "Pagado", "Pendiente", "En proceso", "Anulado"];
  const orders = Array.from({ length: 42 }, (_, i) => {
    const customer = pick(random, customers);
    const product = pick(random, products);
    const quantity = between(random, 1, 6);
    return {
      id: `o${i + 1}`,
      code: `V-${String(1042 + i)}`,
      customer: customer.name,
      product: product.name,
      quantity,
      total: product.price * quantity,
      status: pick(random, statuses),
      date: dateOffset(random, 45),
      channel: pick(random, ["Mostrador", "WhatsApp", "Web", "Teléfono"]),
    };
  });

  const invoices = Array.from({ length: 24 }, (_, i) => {
    const customer = pick(random, customers);
    const order = pick(random, orders);
    return {
      id: `f${i + 1}`,
      number: `FAC-${String(2201 + i)}`,
      customer: customer.name,
      amount: order.total,
      status: pick(random, ["Pagada", "Pagada", "Pagada", "Pendiente", "Vencida"]),
      date: dateOffset(random, 60),
      due: dateOffset(random, 20),
    };
  });

  const appointments = Array.from({ length: 18 }, (_, i) => ({
    id: `a${i + 1}`,
    date: dateOffset(random, 12),
    time: `${String(between(random, 8, 17)).padStart(2, "0")}:${pick(random, ["00", "30"])}`,
    client: pick(random, customers).name,
    service: pick(random, catalog),
    professional: pick(random, ["Ana", "Carlos", "Lucía", "Javier", "Sofía"]),
    status: pick(random, ["Confirmada", "Confirmada", "Pendiente", "Completada"]),
  }));

  const projects = Array.from({ length: 8 }, (_, i) => ({
    id: `pr${i + 1}`,
    name: `${pick(random, ["Torre", "Residencial", "Obra", "Proyecto", "Edificio"])} ${pick(random, ["Alta Vista", "El Rosal", "La Colina", "Central", "Los Pinos"])}`,
    client: pick(random, customers).name,
    budget: between(random, 80, 900) * 1000000,
    progress: between(random, 12, 96),
    status: pick(random, ["En curso", "En curso", "Planificación", "Cerrado"]),
    manager: pick(random, ["Ing. Pérez", "Ing. Gómez", "Arq. Ruiz", "Ing. Díaz"]),
  }));

  const production = Array.from({ length: 12 }, (_, i) => ({
    id: `op${i + 1}`,
    code: `OT-${String(310 + i)}`,
    product: pick(random, products).name,
    quantity: between(random, 50, 900),
    line: pick(random, ["Línea A", "Línea B", "Corte", "Confección", "Acabados"]),
    status: pick(random, ["Programada", "En proceso", "En calidad", "Terminada"]),
    cost: between(random, 2, 40) * 1000000,
  }));

  const shipments = Array.from({ length: 20 }, (_, i) => ({
    id: `s${i + 1}`,
    guide: `GUIA-${String(78000 + i)}`,
    destination: pick(random, ["Bogotá", "Medellín", "Cali", "Barranquilla", "Lima", "Santiago"]),
    driver: pick(random, ["José García", "Luis Pérez", "Andrés López", "Mario Ruiz"]),
    vehicle: pick(random, ["Camión 3T", "Camión 6T", "Furgón", "Refrigerado"]),
    status: pick(random, ["En ruta", "Entregado", "En destino", "Pendiente"]),
    eta: dateOffset(random, 5),
  }));

  const plots = Array.from({ length: 10 }, (_, i) => ({
    id: `l${i + 1}`,
    name: `Lote ${String.fromCharCode(65 + i)}`,
    farm: pick(random, ["Finca La Esperanza", "Finca El Cedral", "Finca Los Álamos", "Finca San José"]),
    crop: pick(random, ["Maíz", "Soja", "Café", "Banano", "Aguacate", "Trigo"]),
    area: between(random, 3, 80),
    stage: pick(random, ["Preparación", "Siembra", "Crecimiento", "Cosecha"]),
    cost: between(random, 1, 30) * 1000000,
  }));

  const subscriptions = Array.from({ length: 16 }, (_, i) => ({
    id: `sub${i + 1}`,
    customer: pick(random, customers).name,
    plan: pick(random, ["Básico", "Pro", "Empresa"]),
    mrr: pick(random, [29000, 59000, 149000]),
    status: pick(random, ["Activa", "Activa", "Activa", "Por renovar", "Cancelada"]),
    renew: dateOffset(random, 25),
  }));

  const expenses = Array.from({ length: 16 }, (_, i) => ({
    id: `e${i + 1}`,
    date: dateOffset(random, 40),
    category: pick(random, ["Materiales", "Nómina", "Transporte", "Servicios", "Publicidad"]),
    description: pick(random, ["Compra de inventario", "Pago de personal", "Combustible", "Arriendo", "Campaña digital"]),
    amount: between(random, 200, 9000) * 1000,
    status: pick(random, ["Pagado", "Pagado", "Pendiente"]),
  }));

  const batches = Array.from({ length: 14 }, (_, i) => ({
    id: `b${i + 1}`,
    product: pick(random, products).name,
    batch: `L-${String(450 + i)}`,
    quantity: between(random, 20, 400),
    expiry: dateOffset(random, 180),
    status: pick(random, ["Vigente", "Vigente", "Por vencer", "Vencido"]),
  }));

  const salesTotal = orders.filter((o) => o.status !== "Anulado").reduce((sum, o) => sum + o.total, 0);
  const collected = invoices.filter((f) => f.status === "Pagada").reduce((sum, f) => sum + f.amount, 0);
  const pending = invoices.filter((f) => f.status !== "Pagada").reduce((sum, f) => sum + f.amount, 0);
  const lowStock = products.filter((p) => p.status !== "Disponible").length;

  const kpis = [
    { label: "Ventas del periodo", value: money(salesTotal, currency), delta: "+12.4%", tone: "indigo", icon: "↗" },
    { label: "Pedidos", value: orders.length, delta: "+8.2%", tone: "green", icon: "▤" },
    { label: "Clientes", value: customers.length, delta: "+5.1%", tone: "amber", icon: "◎" },
    { label: "Por cobrar", value: money(pending, currency), delta: "-3.6%", tone: "rose", icon: "¤" },
  ];

  const alerts = [
    { id: "al1", level: "Alta", message: `${lowStock} referencias con stock bajo o agotado`, action: "Revisar inventario" },
    { id: "al2", level: "Media", message: `${invoices.filter((f) => f.status === "Vencida").length} facturas vencidas requieren cobro`, action: "Ver cartera" },
    { id: "al3", level: "Media", message: `${appointments.filter((a) => a.status === "Pendiente").length} citas por confirmar`, action: "Ver agenda" },
    { id: "al4", level: "Baja", message: "Resumen semanal listo para enviar", action: "Ver reportes" },
  ];

  return {
    meta: {
      nicheId,
      niche: template.name,
      icon: template.icon,
      color: template.color,
      businessName,
      currency,
      modules: template.modules.map((key) => ({ key, label: DEMO_MODULES[key] || key })),
      generatedAt: new Date().toISOString(),
      seed,
    },
    kpis,
    metrics: { salesTotal, collected, pending, lowStock },
    products,
    customers,
    orders,
    invoices,
    appointments,
    projects,
    production,
    shipments,
    plots,
    subscriptions,
    expenses,
    batches,
    alerts,
  };
}

export function moduleTitle(payload, key) {
  return payload?.meta?.modules?.find((m) => m.key === key)?.label || DEMO_MODULES[key] || key;
}
