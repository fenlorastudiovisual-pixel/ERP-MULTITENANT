"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Panel, Stat, Tag, Table, Bars } from "../../../components/ui";

const money = (value, currency = "COP") =>
  `${currency === "COP" ? "$ " : currency === "USD" ? "US$ " : "€ "}${Number(value || 0).toLocaleString("es-CO")}`;
const tone = (status) => {
  const value = String(status || "").toLowerCase();
  if (/pagad|disponible|activa|entregado|confirmada|terminada|completada|vigente/.test(value)) return "green";
  if (/pendiente|proceso|en curso|por vencer|por renovar|bajo/.test(value)) return "amber";
  if (/vencid|agotado|anulad|cancelad|alta/.test(value)) return "rose";
  return "slate";
};
const dateLabel = (value) => (value ? String(value).slice(0, 10) : "—");

const TABLES = {
  productos: {
    key: "products", title: "Catálogo e inventario",
    columns: [
      { key: "name", label: "Producto / servicio" },
      { key: "sku", label: "SKU" },
      { key: "category", label: "Categoría" },
      { key: "price", label: "Precio", align: "right", render: (r, c) => money(r.price, c) },
      { key: "stock", label: "Stock", align: "right" },
      { key: "status", label: "Estado", render: (r) => <Tag tone={tone(r.status)}>{r.status}</Tag> },
    ],
  },
  clientes: {
    key: "customers", title: "Clientes y cartera",
    columns: [
      { key: "name", label: "Cliente" },
      { key: "phone", label: "WhatsApp" },
      { key: "city", label: "Ciudad" },
      { key: "tier", label: "Tipo", render: (r) => <Tag tone={r.tier === "VIP" ? "violet" : "slate"}>{r.tier}</Tag> },
      { key: "balance", label: "Saldo", align: "right", render: (r, c) => money(r.balance, c) },
    ],
  },
  pedidos: {
    key: "orders", title: "Pedidos y ventas",
    columns: [
      { key: "code", label: "Pedido" },
      { key: "date", label: "Fecha", render: (r) => dateLabel(r.date) },
      { key: "customer", label: "Cliente" },
      { key: "product", label: "Producto" },
      { key: "quantity", label: "Cant.", align: "right" },
      { key: "total", label: "Total", align: "right", render: (r, c) => money(r.total, c) },
      { key: "status", label: "Estado", render: (r) => <Tag tone={tone(r.status)}>{r.status}</Tag> },
    ],
  },
  facturas: {
    key: "invoices", title: "Facturación y cobros",
    columns: [
      { key: "number", label: "Factura" },
      { key: "date", label: "Emisión", render: (r) => dateLabel(r.date) },
      { key: "customer", label: "Cliente" },
      { key: "amount", label: "Valor", align: "right", render: (r, c) => money(r.amount, c) },
      { key: "status", label: "Estado", render: (r) => <Tag tone={tone(r.status)}>{r.status}</Tag> },
    ],
  },
  agenda: {
    key: "appointments", title: "Agenda y reservas",
    columns: [
      { key: "date", label: "Fecha", render: (r) => dateLabel(r.date) },
      { key: "time", label: "Hora" },
      { key: "client", label: "Cliente" },
      { key: "service", label: "Servicio" },
      { key: "professional", label: "Profesional" },
      { key: "status", label: "Estado", render: (r) => <Tag tone={tone(r.status)}>{r.status}</Tag> },
    ],
  },
  proyectos: {
    key: "projects", title: "Proyectos y obras",
    columns: [
      { key: "name", label: "Proyecto" },
      { key: "client", label: "Cliente" },
      { key: "manager", label: "Responsable" },
      { key: "budget", label: "Presupuesto", align: "right", render: (r, c) => money(r.budget, c) },
      { key: "progress", label: "Avance", align: "right", render: (r) => `${r.progress}%` },
      { key: "status", label: "Estado", render: (r) => <Tag tone={tone(r.status)}>{r.status}</Tag> },
    ],
  },
  produccion: {
    key: "production", title: "Órdenes de trabajo",
    columns: [
      { key: "code", label: "Orden" },
      { key: "product", label: "Producto" },
      { key: "line", label: "Línea" },
      { key: "quantity", label: "Cantidad", align: "right" },
      { key: "cost", label: "Costo", align: "right", render: (r, c) => money(r.cost, c) },
      { key: "status", label: "Estado", render: (r) => <Tag tone={tone(r.status)}>{r.status}</Tag> },
    ],
  },
  envios: {
    key: "shipments", title: "Guías, rutas y flota",
    columns: [
      { key: "guide", label: "Guía" },
      { key: "destination", label: "Destino" },
      { key: "driver", label: "Conductor" },
      { key: "vehicle", label: "Vehículo" },
      { key: "eta", label: "Entrega", render: (r) => dateLabel(r.eta) },
      { key: "status", label: "Estado", render: (r) => <Tag tone={tone(r.status)}>{r.status}</Tag> },
    ],
  },
  fincas: {
    key: "plots", title: "Fincas y cosechas",
    columns: [
      { key: "name", label: "Lote" },
      { key: "farm", label: "Finca" },
      { key: "crop", label: "Cultivo" },
      { key: "area", label: "Hectáreas", align: "right" },
      { key: "cost", label: "Costo", align: "right", render: (r, c) => money(r.cost, c) },
      { key: "stage", label: "Etapa", render: (r) => <Tag tone="green">{r.stage}</Tag> },
    ],
  },
  suscripciones: {
    key: "subscriptions", title: "Suscripciones recurrentes",
    columns: [
      { key: "customer", label: "Cliente" },
      { key: "plan", label: "Plan" },
      { key: "mrr", label: "Mensualidad", align: "right", render: (r, c) => money(r.mrr, c) },
      { key: "renew", label: "Renovación", render: (r) => dateLabel(r.renew) },
      { key: "status", label: "Estado", render: (r) => <Tag tone={tone(r.status)}>{r.status}</Tag> },
    ],
  },
  alertas: {
    key: "alerts", title: "Centro de alertas",
    columns: [
      { key: "message", label: "Situación detectada" },
      { key: "level", label: "Prioridad", render: (r) => <Tag tone={tone(r.level)}>{r.level}</Tag> },
      { key: "action", label: "Acción sugerida" },
    ],
  },
};

export default function DemoPage() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(false);
  const [active, setActive] = useState("resumen");
  const [query, setQuery] = useState("");
  const [leadOpen, setLeadOpen] = useState(false);
  const [leadDone, setLeadDone] = useState(false);
  const [lead, setLead] = useState({ name: "", phone: "", email: "", company: "", interest: "" });
  const [order, setOrder] = useState({ customer: "", product: "", quantity: 1 });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/demo/${token}`, { credentials: "include" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) return setError(json.error || "No se pudo abrir la demo");
        setData(json.demo.payload);
        setExpired(Boolean(json.expired));
      } catch (err) {
        setError(err.message || "No se pudo abrir la demo");
      }
    })();
  }, [token]);

  async function save(next) {
    setData(next);
    setSaving(true);
    setNotice("Guardando cambios…");
    try {
      const res = await fetch(`/api/demo/${token}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload: next }),
      });
      const json = await res.json().catch(() => ({}));
      setNotice(res.ok ? "Cambios guardados en esta demo" : json.error || "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  function changeStatus(rowsKey, id, options) {
    if (!data) return;
    const rows = (data[rowsKey] || []).map((row) =>
      row.id === id ? { ...row, status: options[Math.floor(Math.random() * options.length)] } : row);
    save({ ...data, [rowsKey]: rows });
  }

  function addOrder(event) {
    event.preventDefault();
    if (!data) return;
    const product = (data.products || []).find((p) => p.name === order.product) || data.products?.[0];
    if (!product) return;
    const quantity = Math.max(1, Number(order.quantity) || 1);
    const next = {
      ...data,
      orders: [{
        id: `o${Date.now()}`,
        code: `V-${String(1100 + (data.orders || []).length)}`,
        customer: order.customer || "Cliente nuevo",
        product: product.name,
        quantity,
        total: product.price * quantity,
        status: "En proceso",
        date: new Date().toISOString().slice(0, 10),
        channel: "Demo",
      }, ...(data.orders || [])],
    };
    setOrder({ customer: "", product: "", quantity: 1 });
    save(next);
  }

  async function submitLead(event) {
    event.preventDefault();
    setSaving(true);
    setNotice("");
    try {
      const res = await fetch(`/api/demo/${token}/lead`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...lead, interest: data?.meta?.niche || "" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return setNotice(json.error || "No se pudo enviar");
      setLeadDone(true);
    } finally {
      setSaving(false);
    }
  }

  const modules = useMemo(() => data?.meta?.modules || [], [data]);
  const currency = data?.meta?.currency || "COP";
  const current = TABLES[active];
  const rows = useMemo(() => {
    const list = data?.[current?.key] || [];
    const term = query.trim().toLowerCase();
    if (!term) return list;
    return list.filter((row) => JSON.stringify(row).toLowerCase().includes(term));
  }, [data, current, query]);

  const chart = useMemo(() => {
    if (!data?.orders?.length) return [];
    return data.orders.slice(0, 8).reverse().map((order) => ({
      label: String(order.date).slice(5), value: order.total,
    }));
  }, [data]);

  if (error) {
    return <div className="auth-screen"><div className="auth-card"><span className="brand-mark">E</span>
      <h1>Demo no disponible</h1><p className="auth-access-note">{error}</p></div></div>;
  }
  if (!data) {
    return <div className="auth-screen"><div className="auth-card"><span className="brand-mark">E</span>
      <h1>Abriendo tu demo…</h1><p className="auth-subtitle">Cargando datos reales del negocio.</p></div></div>;
  }

  return (
    <main className="tenant-shell">
      <header className="tenant-head">
        <div className="tenant-logo" style={{ background: data.meta.color }}>{data.meta.icon}</div>
        <div>
          <div className="tenant-eyebrow">Demo interactiva · {data.meta.niche}</div>
          <h1>{data.meta.businessName}</h1>
          <p>Explora el panel completo. Los cambios se guardan en esta demostración.</p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {expired && <Tag tone="amber">Demo vencida</Tag>}
          <Tag tone="green" dot>Activa</Tag>
          <button className="btn btn-primary" onClick={() => { setLeadOpen(true); setLeadDone(false); }}>
            Solicitar mi acceso
          </button>
        </div>
      </header>

      {notice && <div className="callout">{notice}</div>}

      <div className="demo-layout">
        <nav className="demo-nav" aria-label="Módulos de la demo">
          <div className="demo-nav-title">Módulos incluidos</div>
          {modules.map((module) => (
            <button key={module.key} className={active === module.key ? "active" : ""}
              onClick={() => { setActive(module.key); setQuery(""); }}>
              <span>{module.key === "resumen" ? "◈" : "▤"}</span>{module.label}
            </button>
          ))}
          <div className="demo-nav-foot">{data.products.length} productos · {data.customers.length} clientes · {data.orders.length} pedidos</div>
        </nav>

        <div className="demo-content">
          {active === "resumen" ? (
            <>
              <div className="stat-grid">
                {(data.kpis || []).map((kpi) => (
                  <Stat key={kpi.label} label={kpi.label} value={kpi.value} delta={kpi.delta}
                    icon={kpi.icon} tone={kpi.tone} />
                ))}
              </div>
              <div className="chart-grid">
                <Panel title="Ventas recientes" subtitle="Últimos pedidos registrados">
                  <Bars data={chart} color={data.meta.color} />
                </Panel>
                <Panel title="Alertas del negocio" subtitle="Lo que el sistema detecta automáticamente">
                  <ul className="mini-list">
                    {(data.alerts || []).map((alert) => (
                      <li key={alert.id}><Tag tone={tone(alert.level)}>{alert.level}</Tag>
                        <span>{alert.message}</span></li>
                    ))}
                  </ul>
                </Panel>
              </div>
              <Panel title="Lo que puedes hacer en este panel" subtitle="Prueba las acciones reales de cada módulo">
                <div className="kv">
                  <div><small>Inventario</small><b>{data.products.length} referencias con stock y estado</b></div>
                  <div><small>Ventas</small><b>{data.orders.length} pedidos con canal y estado</b></div>
                  <div><small>Cobros</small><b>{money(data.metrics.collected, currency)} recaudados</b></div>
                  <div><small>Clientes</small><b>{data.customers.length} fichas con WhatsApp y cartera</b></div>
                </div>
                <form onSubmit={addOrder} className="demo-form">
                  <b>Registrar un pedido nuevo</b>
                  <input placeholder="Cliente" value={order.customer}
                    onChange={(e) => setOrder({ ...order, customer: e.target.value })} />
                  <select value={order.product} onChange={(e) => setOrder({ ...order, product: e.target.value })}>
                    <option value="">Elige un producto…</option>
                    {data.products.slice(0, 40).map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
                  </select>
                  <input type="number" min="1" value={order.quantity}
                    onChange={(e) => setOrder({ ...order, quantity: e.target.value })} />
                  <button className="btn btn-primary" type="submit">Crear pedido</button>
                </form>
              </Panel>
            </>
          ) : (
            <Panel title={current.title}
              subtitle={`${rows.length} registros · ${data.meta.businessName}`}
              actions={<input className="searchbox-input" placeholder="Buscar en este módulo…" value={query}
                onChange={(e) => setQuery(e.target.value)} />}>
              <Table columns={[
                ...current.columns,
                ...(current.key === "invoices" ? [{
                  key: "action", label: "Acción",
                  render: (row) => row.status === "Pagada" ? "—" : (
                    <button className="btn btn-mini" onClick={() => changeStatus("invoices", row.id, ["Pagada"])}>
                      Marcar pagada
                    </button>),
                }] : []),
                ...(current.key === "orders" ? [{
                  key: "action", label: "Acción",
                  render: (row) => (
                    <button className="btn btn-mini" onClick={() => changeStatus("orders", row.id, ["En proceso", "Pagado", "Entregado"])}>
                      Avanzar
                    </button>),
                }] : []),
              ]} rows={rows} empty="No hay registros para este filtro" compact />
            </Panel>
          )}
          <Panel title="Esta demo incluye datos de verdad" subtitle="No es una imagen ni un texto: puedes recorrer cada módulo y modificarlo.">
            <ul className="mini-list">
              <li><span>✓</span>Catálogo con {data.products.length} productos, precios, stock y alertas</li>
              <li><span>✓</span>{data.customers.length} clientes con teléfono, ciudad y saldo pendiente</li>
              <li><span>✓</span>{data.orders.length} pedidos con estado, canal y total calculado</li>
              <li><span>✓</span>{data.invoices.length} facturas con cobros pendientes y vencidas</li>
              <li><span>✓</span>Módulos específicos de {data.meta.niche.toLowerCase()}</li>
            </ul>
          </Panel>
        </div>
      </div>

      {leadOpen && (
        <div className="modal-backdrop" onClick={() => setLeadOpen(false)}>
          <div className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><div>
              <h2>{leadDone ? "¡Listo!" : "Solicitar acceso completo"}</h2>
              <p>Demo de {data.meta.businessName}</p>
            </div>
            <button className="icon-btn" onClick={() => setLeadOpen(false)}>✕</button></div>
            <div className="modal-body">
              {leadDone ? (
                <>
                  <p className="callout green">Gracias, {lead.name}. Recibimos tu interés en {data.meta.niche}. Te contactaremos por WhatsApp al {lead.phone}.</p>
                  <button className="btn btn-primary" onClick={() => setLeadOpen(false)}>Seguir explorando</button>
                </>
              ) : (
                <form onSubmit={submitLead} style={{ display: "grid", gap: 12 }}>
                  <label className="field">Nombre y apellido
                    <input required value={lead.name} onChange={(e) => setLead({ ...lead, name: e.target.value })} />
                  </label>
                  <label className="field">WhatsApp
                    <input required placeholder="+57 300 000 0000" value={lead.phone}
                      onChange={(e) => setLead({ ...lead, phone: e.target.value })} />
                  </label>
                  <label className="field">Correo (opcional)
                    <input type="email" value={lead.email} onChange={(e) => setLead({ ...lead, email: e.target.value })} />
                  </label>
                  <label className="field">Empresa (opcional)
                    <input value={lead.company} onChange={(e) => setLead({ ...lead, company: e.target.value })} />
                  </label>
                  {notice && <p className="auth-access-note">{notice}</p>}
                  <button className="btn btn-primary" type="submit" disabled={saving}>
                    {saving ? "Enviando…" : "Enviar solicitud"}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
