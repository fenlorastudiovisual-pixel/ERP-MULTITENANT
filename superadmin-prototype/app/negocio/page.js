"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Panel, Stat, Tag, Table, Btn, Field, Tabs, Modal, Drawer, Bars, Donut,
} from "../../components/ui";

const TABS = [
  { id: "resumen", label: "Resumen" },
  { id: "productos", label: "Productos" },
  { id: "clientes", label: "Clientes" },
  { id: "pedidos", label: "Pedidos" },
  { id: "facturacion", label: "Facturación" },
  { id: "seguridad", label: "Seguridad" },
  { id: "detalle", label: "Detalle" },
];

const ORDER_STATUS = {
  pending: { label: "Pendiente", tone: "amber", color: "#f59e0b" },
  confirmed: { label: "Confirmado", tone: "indigo", color: "#6366f1" },
  shipped: { label: "Enviado", tone: "blue", color: "#0ea5e9" },
  delivered: { label: "Entregado", tone: "green", color: "#22c55e" },
  cancelled: { label: "Cancelado", tone: "slate", color: "#94a3b8" },
};
const STATUS = { active: "Activo", trial: "Prueba", suspended: "Suspendido", archived: "Archivado" };
const MODE = { pool: "Pool", bridge: "Bridge", silo: "Silo" };

const money = (value) => "$ " + Number(value || 0).toLocaleString("es-CO");
const compact = (value) => {
  const n = Number(value || 0);
  if (n >= 1e9) return `$ ${(n / 1e9).toFixed(1)} mil M`;
  if (n >= 1e6) return `$ ${(n / 1e6).toFixed(1)} M`;
  if (n >= 1e3) return `$ ${(n / 1e3).toFixed(0)} mil`;
  return money(n);
};
const dateLabel = (value) => (value ? String(value).slice(0, 10) : "—");
const monthLabel = (value) => {
  const [year, month] = String(value || "").split("-");
  if (!year || !month) return String(value || "");
  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("es-CO", { month: "short" });
};
const statusTag = (status) => {
  const meta = ORDER_STATUS[status] || { label: status, tone: "slate" };
  return <Tag tone={meta.tone} dot>{meta.label}</Tag>;
};

async function jsonRequest(url, options = {}) {
  const res = await fetch(url, { credentials: "include", ...options });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

function Pager({ page, pages, total, onChange }) {
  return (
    <div className="filter-row" style={{ marginTop: 12, marginBottom: 0 }}>
      <span style={{ color: "#8b93a1", fontSize: 11 }}>
        Página {page} de {pages} · {Number(total || 0).toLocaleString("es-CO")} registros
      </span>
      <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
        <Btn size="xs" disabled={page <= 1} onClick={() => onChange(page - 1)}>← Anterior</Btn>
        <Btn size="xs" disabled={page >= pages} onClick={() => onChange(page + 1)}>Siguiente →</Btn>
      </div>
    </div>
  );
}

export default function BusinessPanel() {
  const [data, setData] = useState(null);
  const [view, setView] = useState("check");
  const [tab, setTab] = useState("resumen");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  // Acceso
  const [form, setForm] = useState({ email: "", password: "", code: "" });
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaSetup, setMfaSetup] = useState(null);
  const [mfaCode, setMfaCode] = useState("");

  // Datos operativos
  const [overview, setOverview] = useState(null);
  const [products, setProducts] = useState({ products: [], categories: [], total: 0, pages: 1 });
  const [customers, setCustomers] = useState({ customers: [], total: 0, pages: 1 });
  const [orders, setOrders] = useState({ orders: [], total: 0, pages: 1 });
  const [orderDetail, setOrderDetail] = useState(null);

  // Filtros y paginación
  const [productQ, setProductQ] = useState("");
  const [productCategory, setProductCategory] = useState("");
  const [productPage, setProductPage] = useState(1);
  const [customerQ, setCustomerQ] = useState("");
  const [customerPage, setCustomerPage] = useState(1);
  const [orderQ, setOrderQ] = useState("");
  const [orderStatus, setOrderStatus] = useState("");
  const [orderPage, setOrderPage] = useState(1);

  // Formularios
  const [modal, setModal] = useState(null);
  const [productForm, setProductForm] = useState({ sku: "", name: "", category: "General", price: "", cost: "", stock: "", min_stock: "", unit: "und", description: "" });
  const [customerForm, setCustomerForm] = useState({ name: "", document: "", email: "", phone: "", city: "", address: "" });
  const [stockTarget, setStockTarget] = useState(null);
  const [stockForm, setStockForm] = useState({ delta: "", reason: "" });
  const [orderCustomers, setOrderCustomers] = useState([]);
  const [orderCustomerId, setOrderCustomerId] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState([]);
  const [cart, setCart] = useState([]);

  const loadOverview = useCallback(async () => {
    const { ok, json } = await jsonRequest("/negocio/api/overview");
    if (ok) setOverview(json);
    else setError(json.error || "No se pudo cargar el resumen");
  }, []);

  const loadProducts = useCallback(async () => {
    const query = new URLSearchParams({
      q: productQ, category: productCategory, page: String(productPage), limit: "20",
    });
    const { ok, json } = await jsonRequest(`/negocio/api/products?${query}`);
    if (ok) setProducts(json);
    else setError(json.error || "No se pudo cargar el catálogo");
  }, [productQ, productCategory, productPage]);

  const loadCustomers = useCallback(async () => {
    const query = new URLSearchParams({ q: customerQ, page: String(customerPage), limit: "20" });
    const { ok, json } = await jsonRequest(`/negocio/api/customers?${query}`);
    if (ok) setCustomers(json);
    else setError(json.error || "No se pudo cargar los clientes");
  }, [customerQ, customerPage]);

  const loadOrders = useCallback(async () => {
    const query = new URLSearchParams({ q: orderQ, status: orderStatus, page: String(orderPage), limit: "20" });
    const { ok, json } = await jsonRequest(`/negocio/api/orders?${query}`);
    if (ok) setOrders(json);
    else setError(json.error || "No se pudo cargar los pedidos");
  }, [orderQ, orderStatus, orderPage]);

  async function load() {
    const { ok, status, json } = await jsonRequest("/negocio/api/me");
    if (ok) {
      setData(json);
      setView("panel");
      setError("");
      return;
    }
    if (status === 401) {
      setView("login");
      return;
    }
    setError(json.error || `HTTP ${status}`);
    setView("error");
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (view !== "panel") return;
    if (tab === "resumen" || tab === "facturacion") loadOverview();
    if (tab === "productos") loadProducts();
    if (tab === "clientes") loadCustomers();
    if (tab === "pedidos") loadOrders();
  }, [view, tab, loadOverview, loadProducts, loadCustomers, loadOrders]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 3200);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (modal !== "order" || !productSearch.trim()) {
      setProductResults([]);
      return;
    }
    let alive = true;
    const timer = setTimeout(async () => {
      const { ok, json } = await jsonRequest(`/negocio/api/products?q=${encodeURIComponent(productSearch)}&limit=8`);
      if (alive && ok) setProductResults(json.products);
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [modal, productSearch]);

  async function submitLogin(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { ok, json } = await jsonRequest("/negocio/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (json.mfaRequired) {
        setMfaRequired(true);
        setForm((prev) => ({ ...prev, code: "" }));
        setError("Escribe el código de 6 dígitos de tu app de autenticación.");
        return;
      }
      if (!ok) {
        setError(json.error || "No se pudo iniciar sesión");
        return;
      }
      setMfaRequired(false);
      setForm({ email: "", password: "", code: "" });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await jsonRequest("/negocio/api/logout", { method: "POST" });
    setData(null);
    setMfaSetup(null);
    setView("login");
  }

  async function setupMfa() {
    setBusy(true);
    setError("");
    try {
      const { ok, json } = await jsonRequest("/negocio/api/mfa");
      if (!ok) return setError(json.error || "No se pudo preparar el MFA");
      setMfaSetup(json);
    } finally {
      setBusy(false);
    }
  }

  async function saveMfa(action) {
    setBusy(true);
    setError("");
    try {
      const { ok, json } = await jsonRequest("/negocio/api/mfa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, code: mfaCode }),
      });
      if (!ok) return setError(json.error || "No se pudo guardar el MFA");
      setMfaCode("");
      setMfaSetup(null);
      await load();
      setNotice(action === "enable" ? "Verificación en dos pasos activada" : "Verificación desactivada");
    } finally {
      setBusy(false);
    }
  }

  async function mutate(url, method, body, onSuccess) {
    setBusy(true);
    setError("");
    try {
      const { ok, json } = await jsonRequest(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!ok) {
        setError(json.error || "No se pudo guardar el cambio");
        return false;
      }
      if (onSuccess) onSuccess(json);
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function submitProduct(event) {
    event.preventDefault();
    const ok = await mutate("/negocio/api/products", "POST", productForm, () => {
      setModal(null);
      setProductForm({ sku: "", name: "", category: productCategory || "General", price: "", cost: "", stock: "", min_stock: "", unit: "und", description: "" });
      setProductPage(1);
      loadProducts();
      loadOverview();
      setNotice("Producto creado en el catálogo");
    });
    if (ok) setProductQ("");
  }

  async function submitCustomer(event) {
    event.preventDefault();
    await mutate("/negocio/api/customers", "POST", customerForm, () => {
      setModal(null);
      setCustomerForm({ name: "", document: "", email: "", phone: "", city: "", address: "" });
      setCustomerPage(1);
      loadCustomers();
      loadOverview();
      setNotice("Cliente registrado");
    });
  }

  async function adjustStock(event) {
    event.preventDefault();
    await mutate("/negocio/api/products", "PATCH", {
      id: stockTarget.id, action: "stock",
      delta: Number(stockForm.delta), reason: stockForm.reason,
    }, () => {
      setModal(null);
      setStockTarget(null);
      setStockForm({ delta: "", reason: "" });
      loadProducts();
      loadOverview();
      setNotice("Inventario ajustado y movimiento registrado");
    });
  }

  async function toggleProduct(row) {
    await mutate("/negocio/api/products", "PATCH", { id: row.id, action: "toggle" }, () => {
      loadProducts();
      loadOverview();
      setNotice(row.active ? "Producto desactivado" : "Producto activado");
    });
  }

  async function openOrderModal() {
    setModal("order");
    setCart([]);
    setOrderNotes("");
    setProductSearch("");
    setProductResults([]);
    setError("");
    const { ok, json } = await jsonRequest("/negocio/api/customers?limit=50");
    if (ok) {
      setOrderCustomers(json.customers);
      setOrderCustomerId(json.customers[0]?.id || "");
    }
  }

  async function openOrder(row) {
    const { ok, json } = await jsonRequest(`/negocio/api/orders/${row.id}`);
    if (ok) setOrderDetail(json);
    else setError(json.error || "No se pudo abrir el pedido");
  }

  async function updateOrderStatus() {
    if (!orderDetail) return;
    await mutate(`/negocio/api/orders/${orderDetail.order.id}`, "PATCH",
      { status: orderDetail.nextStatus || orderDetail.order.status },
      (json) => {
        setOrderDetail((prev) => ({ ...prev, order: json.order }));
        loadOrders();
        loadOverview();
        setNotice("Estado del pedido actualizado");
      });
  }

  async function submitOrder(event) {
    event.preventDefault();
    if (!cart.length) return setError("Agrega al menos un producto al pedido");
    await mutate("/negocio/api/orders", "POST", {
      customer_id: orderCustomerId,
      notes: orderNotes,
      items: cart.map((item) => ({ product_id: item.id, quantity: item.quantity })),
    }, (json) => {
      setModal(null);
      setCart([]);
      setOrderPage(1);
      loadOrders();
      loadOverview();
      setNotice(`Pedido ${json.order.number} creado por ${money(json.order.total)}`);
    });
  }

  if (view === "check") {
    return <div className="auth-screen"><div className="auth-card"><span className="brand-mark">E</span>
      <h1>Cargando tu negocio…</h1><p className="auth-subtitle">Verificando tu sesión.</p></div></div>;
  }

  if (view === "error") {
    return <div className="auth-screen"><div className="auth-card"><span className="brand-mark">E</span>
      <h1>Panel del negocio</h1><p className="auth-subtitle">ERP Multitenant</p>
      <p className="auth-access-note">{error}</p>
      <button className="btn btn-primary" onClick={() => { setError(""); setView("login"); }}>Ir a iniciar sesión</button>
    </div></div>;
  }

  if (view === "login") {
    return (
      <div className="auth-screen"><div className="auth-card">
        <span className="brand-mark">E</span>
        <h1>Panel del negocio</h1>
        <p className="auth-subtitle">Entra con el correo y la contraseña de tu negocio.</p>
        <form onSubmit={submitLogin} style={{ display: "grid", gap: 12, marginTop: 22, textAlign: "left" }}>
          <label className="field">Correo
            <input type="email" autoComplete="username" required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value.toLowerCase() })} />
          </label>
          <label className="field">Contraseña
            <input type="password" autoComplete="current-password" required
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </label>
          {mfaRequired && <label className="field">Código de autenticación (6 dígitos)
            <input inputMode="numeric" autoComplete="one-time-code" required maxLength={6}
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.replace(/\D/g, "") })} />
          </label>}
          {error && <p className="auth-access-note">{error}</p>}
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "Entrando…" : mfaRequired ? "Verificar código" : "Entrar"}
          </button>
        </form>
        <p className="auth-subtitle" style={{ marginTop: 20 }}>
          ¿No tienes contraseña o la olvidaste?{' '}
          <a href="/negocio/recuperar">Crear o cambiar contraseña</a>
        </p>
      </div></div>
    );
  }

  const { tenant, plan, limits, modules, team, email, role } = data;
  const kpis = overview?.kpis || {};
  const statuses = overview?.statuses || [];
  const statusTotal = statuses.reduce((sum, row) => sum + row.total, 0) || 1;
  const donutItems = statuses
    .filter((row) => ORDER_STATUS[row.status])
    .map((row) => ({
      label: ORDER_STATUS[row.status].label,
      value: Math.round((row.total / statusTotal) * 100),
      color: ORDER_STATUS[row.status].color,
    }));
  const cartSubtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const cartTax = Math.round(cartSubtotal * 0.19 * 100) / 100;

  return (
    <main className="tenant-shell">
      <header className="tenant-head">
        <div className="tenant-logo" style={{ background: tenant.color }}>{tenant.name.slice(0, 2).toUpperCase()}</div>
        <div>
          <div className="tenant-eyebrow">ERP operativo · datos reales en Neon</div>
          <h1>{tenant.name}</h1>
          <p>{tenant.niche} · {tenant.city}, {tenant.country}</p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <Tag tone={tenant.status === "active" ? "green" : "amber"} dot>{STATUS[tenant.status] || tenant.status}</Tag>
          <button className="btn" onClick={logout}>Salir</button>
        </div>
      </header>

      <div className="callout">Sesión de <b>{email}</b> como <b>{role}</b>. Productos, clientes, pedidos e inventario de <b>{tenant.name}</b> en tiempo real.</div>
      {(error || notice) && <div className={`callout ${error ? "amber" : "green"}`}>{error || notice}</div>}

      <Tabs tabs={TABS} value={tab} onChange={setTab} />

      {/* ── Resumen ─────────────────────────────────────────────────────── */}
      {tab === "resumen" && <>
        <div className="stat-grid" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
          <Stat label="Ventas acumuladas" value={compact(kpis.sales)} icon="↗" delta="Pedidos vigentes" />
          <Stat label="Pedidos" value={Number(kpis.orders || 0).toLocaleString("es-CO")} icon="▤" tone="green" hint={`${kpis.delivered || 0} entregados · ${kpis.pending || 0} pendientes`} />
          <Stat label="Productos activos" value={Number(kpis.products || 0).toLocaleString("es-CO")} icon="▣" tone="amber" hint={`${kpis.low_stock || 0} con stock bajo`} />
          <Stat label="Clientes" value={Number(kpis.customers || 0).toLocaleString("es-CO")} icon="◎" tone="rose" />
        </div>

        <div className="chart-grid">
          <Panel title="Ventas de los últimos 6 meses" subtitle="Total de pedidos vigentes por mes">
            <Bars height={170} data={(overview?.sales || []).map((row) => ({ label: monthLabel(row.month), value: row.total }))} />
            <div className="callout" style={{ marginTop: 12 }}>Valor del inventario activo: <b>{money(kpis.inventory_value)}</b> al costo.</div>
          </Panel>
          <Panel title="Estado de los pedidos" subtitle={`${statusTotal.toLocaleString("es-CO")} pedidos registrados`}>
            {donutItems.length ? <Donut items={donutItems} /> : <div className="empty-state"><span>◇</span><b>Sin pedidos</b></div>}
          </Panel>
        </div>

        <div className="chart-grid">
          <Panel title="Productos más vendidos" subtitle="Ingresos por línea de producto" bodyClass="tight">
            <Table compact columns={[
              { key: "name", label: "Producto", render: (row) => <div><b>{row.name}</b><div style={{ color: "#8b93a1", fontSize: 10 }}>{row.sku} · {row.category}</div></div> },
              { key: "units", label: "Unidades", align: "right" },
              { key: "revenue", label: "Ingresos", align: "right", render: (row) => money(row.revenue) },
            ]} rows={overview?.topProducts || []} empty="Todavía no hay ventas" />
          </Panel>
          <Panel title="Inventario por reponer" subtitle="Productos con stock en o por debajo del mínimo" bodyClass="tight">
            <div className="mini-list">
              {(overview?.lowStock || []).map((row) => (
                <li key={row.sku}><span>!</span><div style={{ flex: 1 }}><b>{row.name}</b><div style={{ color: "#8b93a1", fontSize: 10 }}>{row.sku} · mín. {row.min_stock}</div></div>
                  <Tag tone="amber">{row.stock}</Tag></li>
              ))}
              {!overview?.lowStock?.length && <li><span>✓</span>Stock dentro de los mínimos</li>}
            </div>
          </Panel>
        </div>

        <Panel title="Pedidos recientes" subtitle="Haz clic en un pedido para ver su detalle" bodyClass="tight">
          <Table columns={[
            { key: "number", label: "Pedido" },
            { key: "customer", label: "Cliente" },
            { key: "total", label: "Total", align: "right", render: (row) => money(row.total) },
            { key: "status", label: "Estado", render: (row) => statusTag(row.status) },
            { key: "created_at", label: "Fecha", render: (row) => dateLabel(row.created_at) },
          ]} rows={overview?.recentOrders || []} onRow={openOrder} empty="Todavía no hay pedidos" />
        </Panel>

        <Panel title="Catálogo por categoría" subtitle="Distribución real del inventario" bodyClass="tight">
          <Table compact columns={[
            { key: "category", label: "Categoría" },
            { key: "products", label: "Productos", align: "right" },
            { key: "units", label: "Unidades en stock", align: "right", render: (row) => Number(row.units).toLocaleString("es-CO") },
          ]} rows={overview?.categories || []} empty="Sin categorías" />
        </Panel>
      </>}

      {/* ── Productos ───────────────────────────────────────────────────── */}
      {tab === "productos" && <Panel
        title="Catálogo de productos"
        subtitle="Alta, búsqueda, activación y ajustes de inventario sobre Neon"
        actions={<Btn tone="primary" icon="＋" onClick={() => { setProductForm((prev) => ({ ...prev, category: products.categories[0]?.category || "General" })); setModal("product"); }}>Nuevo producto</Btn>}
        bodyClass="tight">
        <div className="filter-row" style={{ padding: "14px 16px 0" }}>
          <input placeholder="Buscar por nombre o SKU…" value={productQ}
            onChange={(e) => { setProductQ(e.target.value); setProductPage(1); }} style={{ width: 280 }} />
          <select value={productCategory} onChange={(e) => { setProductCategory(e.target.value); setProductPage(1); }}>
            <option value="">Todas las categorías</option>
            {(products.categories || []).map((cat) => <option key={cat.category} value={cat.category}>{cat.category} ({cat.total})</option>)}
          </select>
          <span style={{ marginLeft: "auto", color: "#8b93a1", fontSize: 11 }}>{Number(products.total || 0).toLocaleString("es-CO")} productos</span>
        </div>
        <Table compact columns={[
          { key: "sku", label: "SKU", render: (row) => <span className="mono">{row.sku}</span> },
          { key: "name", label: "Producto", render: (row) => <div><b>{row.name}</b><div style={{ color: "#8b93a1", fontSize: 10 }}>{row.category} · {row.unit}</div></div> },
          { key: "price", label: "Precio", align: "right", render: (row) => money(row.price) },
          { key: "cost", label: "Costo", align: "right", render: (row) => money(row.cost) },
          { key: "stock", label: "Stock", align: "right", render: (row) => <Tag tone={row.stock <= row.min_stock ? "amber" : "green"}>{row.stock} / mín. {row.min_stock}</Tag> },
          { key: "active", label: "Estado", render: (row) => <Tag tone={row.active ? "green" : "slate"}>{row.active ? "Activo" : "Inactivo"}</Tag> },
          { key: "actions", label: "", align: "right", render: (row) => <div style={{ display: "flex", gap: 5, justifyContent: "flex-end" }}>
            <Btn size="xs" onClick={() => { setStockTarget(row); setModal("stock"); }}>Ajustar</Btn>
            <Btn size="xs" onClick={() => toggleProduct(row)}>{row.active ? "Desactivar" : "Activar"}</Btn>
          </div> },
        ]} rows={products.products || []} empty="No hay productos para esos filtros" />
        <Pager page={products.page || 1} pages={products.pages || 1} total={products.total} onChange={setProductPage} />
      </Panel>}

      {/* ── Clientes ────────────────────────────────────────────────────── */}
      {tab === "clientes" && <Panel
        title="Clientes"
        subtitle="Directorio real con pedidos y valor facturado por cliente"
        actions={<Btn tone="primary" icon="＋" onClick={() => setModal("customer")}>Nuevo cliente</Btn>}
        bodyClass="tight">
        <div className="filter-row" style={{ padding: "14px 16px 0" }}>
          <input placeholder="Buscar por nombre, documento o correo…" value={customerQ}
            onChange={(e) => { setCustomerQ(e.target.value); setCustomerPage(1); }} style={{ width: 320 }} />
          <span style={{ marginLeft: "auto", color: "#8b93a1", fontSize: 11 }}>{Number(customers.total || 0).toLocaleString("es-CO")} clientes</span>
        </div>
        <Table compact columns={[
          { key: "name", label: "Cliente", render: (row) => <div><b>{row.name}</b><div style={{ color: "#8b93a1", fontSize: 10 }}>{row.email || "Sin correo"}</div></div> },
          { key: "document", label: "Documento" },
          { key: "city", label: "Ciudad" },
          { key: "phone", label: "Teléfono" },
          { key: "orders", label: "Pedidos", align: "right" },
          { key: "spent", label: "Facturado", align: "right", render: (row) => money(row.spent) },
          { key: "created_at", label: "Alta", render: (row) => dateLabel(row.created_at) },
        ]} rows={customers.customers || []} empty="No hay clientes para ese filtro" />
        <Pager page={customers.page || 1} pages={customers.pages || 1} total={customers.total} onChange={setCustomerPage} />
      </Panel>}

      {/* ── Pedidos ─────────────────────────────────────────────────────── */}
      {tab === "pedidos" && <Panel
        title="Pedidos"
        subtitle="Cada pedido descuenta stock y deja su movimiento de inventario"
        actions={<Btn tone="primary" icon="＋" onClick={openOrderModal}>Nuevo pedido</Btn>}
        bodyClass="tight">
        <div className="filter-row" style={{ padding: "14px 16px 0" }}>
          <input placeholder="Buscar por número o cliente…" value={orderQ}
            onChange={(e) => { setOrderQ(e.target.value); setOrderPage(1); }} style={{ width: 280 }} />
          <select value={orderStatus} onChange={(e) => { setOrderStatus(e.target.value); setOrderPage(1); }}>
            <option value="">Todos los estados</option>
            {Object.entries(ORDER_STATUS).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
          </select>
          <span style={{ marginLeft: "auto", color: "#8b93a1", fontSize: 11 }}>{Number(orders.total || 0).toLocaleString("es-CO")} pedidos</span>
        </div>
        <Table columns={[
          { key: "number", label: "Pedido", render: (row) => <span className="mono">{row.number}</span> },
          { key: "customer", label: "Cliente" },
          { key: "items", label: "Ítems", align: "right" },
          { key: "subtotal", label: "Subtotal", align: "right", render: (row) => money(row.subtotal) },
          { key: "tax", label: "IVA", align: "right", render: (row) => money(row.tax) },
          { key: "total", label: "Total", align: "right", render: (row) => <b>{money(row.total)}</b> },
          { key: "status", label: "Estado", render: (row) => statusTag(row.status) },
          { key: "created_at", label: "Fecha", render: (row) => dateLabel(row.created_at) },
        ]} rows={orders.orders || []} onRow={openOrder} empty="No hay pedidos para esos filtros" />
        <Pager page={orders.page || 1} pages={orders.pages || 1} total={orders.total} onChange={setOrderPage} />
      </Panel>}

      {/* ── Facturación ─────────────────────────────────────────────────── */}
      {tab === "facturacion" && <>
        <div className="stat-grid" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
          <Stat label="Facturación por pedidos" value={compact(kpis.sales)} icon="↗" tone="green" />
          <Stat label="Facturas de servicio" value={(overview?.invoices || []).length} icon="▤" />
          <Stat label="Inventario al costo" value={compact(kpis.inventory_value)} icon="▣" tone="amber" />
        </div>
        <Panel title="Facturas del servicio" subtitle="Suscripción y cargos de la plataforma para este negocio" bodyClass="tight">
          <Table columns={[
            { key: "number", label: "Factura", render: (row) => <span className="mono">{row.number}</span> },
            { key: "amount", label: "Valor", align: "right", render: (row) => money(row.amount) },
            { key: "currency", label: "Moneda" },
            { key: "status", label: "Estado", render: (row) => <Tag tone={row.status === "paid" ? "green" : "amber"}>{row.status}</Tag> },
            { key: "issued_at", label: "Emisión", render: (row) => dateLabel(row.issued_at) },
          ]} rows={overview?.invoices || []} empty="Todavía no hay facturas emitidas" />
        </Panel>
        <Panel title="Ingresos mensuales" subtitle="Ventas reales registradas en pedidos">
          <Bars height={150} data={(overview?.sales || []).map((row) => ({ label: monthLabel(row.month), value: row.total }))} />
        </Panel>
      </>}

      {/* ── Seguridad ───────────────────────────────────────────────────── */}
      {tab === "seguridad" && <Panel title="Seguridad de tu cuenta" subtitle="Contraseña y verificación en dos pasos">
        <div className="kv">
          <div><small>Correo de acceso</small><b>{email}</b></div>
          <div><small>Contraseña</small><b>{data.hasPassword ? "Configurada" : "Sin configurar"}</b></div>
          <div><small>Verificación en dos pasos</small><b>{data.mfaEnabled ? "Activada" : "Desactivada"}</b></div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <a className="btn" href="/negocio/recuperar">Cambiar contraseña</a>
          {!data.mfaEnabled && !mfaSetup && <button className="btn" onClick={setupMfa} disabled={busy}>Activar verificación en dos pasos</button>}
          {data.mfaEnabled && <label className="field" style={{ minWidth: 240 }}>Código para desactivar
            <input inputMode="numeric" maxLength={6} value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))} />
            <button className="btn" style={{ marginTop: 6 }} onClick={() => saveMfa("disable")} disabled={busy}>Desactivar</button>
          </label>}
        </div>
        {mfaSetup && !mfaSetup.enabled && (
          <div className="callout" style={{ marginTop: 14, textAlign: "left" }}>
            <p>Escanea este código con Google Authenticator, Authy o 1Password:</p>
            <code style={{ display: "block", wordBreak: "break-all", margin: "8px 0" }}>{mfaSetup.uri}</code>
            <p>También puedes copiar la clave: <b>{mfaSetup.secret}</b></p>
            <label className="field" style={{ maxWidth: 240, marginTop: 10 }}>Código de 6 dígitos
              <input inputMode="numeric" maxLength={6} value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))} />
            </label>
            <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={() => saveMfa("enable")} disabled={busy}>Activar verificación</button>
          </div>
        )}
      </Panel>}

      {/* ── Detalle ─────────────────────────────────────────────────────── */}
      {tab === "detalle" && <>
        <Panel title="Detalle del negocio" subtitle="Datos de suscripción y acceso aislados por tenant">
          <div className="kv">
            <div><small>Identificador</small><b>{tenant.id}</b></div>
            <div><small>Aislamiento</small><b>{MODE[tenant.isolation] || tenant.isolation}</b></div>
            <div><small>Plan</small><b>{plan?.plan_name || "—"}</b></div>
            <div><small>Estado de suscripción</small><b>{STATUS[plan?.subscription_status] || tenant.status}</b></div>
            <div><small>Alta</small><b>{dateLabel(tenant.created)}</b></div>
            <div><small>Equipo</small><b>{(team || []).reduce((sum, row) => sum + row.total, 0)} miembros</b></div>
          </div>
        </Panel>
        <div className="chart-grid">
          <Panel title="Módulos activos" subtitle="Incluidos en tuplan">
            <div className="mini-list">
              {(modules || []).filter((m) => m.access === "included").map((module) => (
                <li key={module.label}><span>✓</span>{module.label}<Tag tone="indigo" style={{ marginLeft: "auto" }}>{module.category}</Tag></li>
              ))}
            </div>
          </Panel>
          <Panel title="Límites contratados" subtitle={plan?.tagline || "Configuración del plan"}>
            <div className="kv">
              <div><small>Usuarios</small><b>{limits?.max_users ?? "—"}</b></div>
              <div><small>Productos</small><b>{limits?.max_products ?? "—"}</b></div>
              <div><small>Facturas / mes</small><b>{limits?.max_invoices_month ?? "—"}</b></div>
              <div><small>Almacenamiento</small><b>{limits?.storage_gb ?? "—"} GB</b></div>
            </div>
          </Panel>
        </div>
      </>}

      {/* ── Modales ─────────────────────────────────────────────────────── */}
      <Modal open={modal === "product"} onClose={() => setModal(null)} title="Nuevo producto" subtitle="Se agrega al catálogo de este negocio">
        <form onSubmit={submitProduct}>
          <div className="two-col">
            <Field label="SKU"><input required value={productForm.sku} onChange={(e) => setProductForm({ ...productForm, sku: e.target.value.toUpperCase() })} placeholder="SKU-01241" /></Field>
            <Field label="Categoría">
              <select value={productForm.category} onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}>
                {(products.categories || []).map((cat) => <option key={cat.category}>{cat.category}</option>)}
                <option>General</option>
              </select>
            </Field>
          </div>
          <Field label="Nombre"><input required value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} placeholder="Nombre del producto" /></Field>
          <div className="three-col">
            <Field label="Precio de venta"><input required type="number" min="0" step="0.01" value={productForm.price} onChange={(e) => setProductForm({ ...productForm, price: e.target.value })} /></Field>
            <Field label="Costo"><input type="number" min="0" step="0.01" value={productForm.cost} onChange={(e) => setProductForm({ ...productForm, cost: e.target.value })} /></Field>
            <Field label="Unidad"><input value={productForm.unit} onChange={(e) => setProductForm({ ...productForm, unit: e.target.value })} /></Field>
          </div>
          <div className="two-col">
            <Field label="Stock inicial"><input type="number" min="0" step="1" value={productForm.stock} onChange={(e) => setProductForm({ ...productForm, stock: e.target.value })} /></Field>
            <Field label="Stock mínimo"><input type="number" min="0" step="1" value={productForm.min_stock} onChange={(e) => setProductForm({ ...productForm, min_stock: e.target.value })} /></Field>
          </div>
          <Field label="Descripción"><textarea rows={2} value={productForm.description} onChange={(e) => setProductForm({ ...productForm, description: e.target.value })} /></Field>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Btn onClick={() => setModal(null)}>Cancelar</Btn><Btn tone="primary" disabled={busy}>Guardar producto</Btn>
          </div>
        </form>
      </Modal>

      <Modal open={modal === "stock"} onClose={() => setModal(null)} title="Ajustar inventario" subtitle={stockTarget ? `${stockTarget.name} · stock actual ${stockTarget.stock}` : ""}>
        <form onSubmit={adjustStock}>
          <div className="two-col">
            <Field label="Ajuste (+ entry / - salida)"><input required type="number" step="1" value={stockForm.delta} onChange={(e) => setStockForm({ ...stockForm, delta: e.target.value })} placeholder="Ej. -5" /></Field>
            <Field label="Motivo"><input value={stockForm.reason} onChange={(e) => setStockForm({ ...stockForm, reason: e.target.value })} placeholder="Conteo físico, daño, entrada…" /></Field>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Btn onClick={() => setModal(null)}>Cancelar</Btn><Btn tone="primary" disabled={busy}>Registrar movimiento</Btn>
          </div>
        </form>
      </Modal>

      <Modal open={modal === "customer"} onClose={() => setModal(null)} title="Nuevo cliente" subtitle="Queda registrado en la base de datos del negocio">
        <form onSubmit={submitCustomer}>
          <Field label="Nombre"><input required value={customerForm.name} onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })} /></Field>
          <div className="two-col">
            <Field label="Documento"><input value={customerForm.document} onChange={(e) => setCustomerForm({ ...customerForm, document: e.target.value })} /></Field>
            <Field label="Correo"><input type="email" value={customerForm.email} onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })} /></Field>
          </div>
          <div className="two-col">
            <Field label="Teléfono"><input value={customerForm.phone} onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })} /></Field>
            <Field label="Ciudad"><input value={customerForm.city} onChange={(e) => setCustomerForm({ ...customerForm, city: e.target.value })} /></Field>
          </div>
          <Field label="Dirección"><input value={customerForm.address} onChange={(e) => setCustomerForm({ ...customerForm, address: e.target.value })} /></Field>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Btn onClick={() => setModal(null)}>Cancelar</Btn><Btn tone="primary" disabled={busy}>Guardar cliente</Btn>
          </div>
        </form>
      </Modal>

      <Modal open={modal === "order"} onClose={() => setModal(null)} title="Nuevo pedido" subtitle="Los precios se toman del catálogo y el stock se descuenta al guardar" width={760}>
        <form onSubmit={submitOrder}>
          <div className="two-col">
            <Field label="Cliente">
              <select required value={orderCustomerId} onChange={(e) => setOrderCustomerId(e.target.value)}>
                {orderCustomers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
              </select>
            </Field>
            <Field label="Notas"><input value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} placeholder="Entrega prioritaria, observaciones…" /></Field>
          </div>
          <Field label="Agregar productos" hint="Busca por nombre o SKU y pulsa Agregar">
            <input value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="Buscar en el catálogo…" />
          </Field>
          {productResults.length > 0 && <div className="mini-list" style={{ marginBottom: 12 }}>
            {productResults.map((product) => (
              <li key={product.id}><span>▣</span><div style={{ flex: 1 }}><b>{product.name}</b><div style={{ color: "#8b93a1", fontSize: 10 }}>{product.sku} · {money(product.price)} · stock {product.stock}</div></div>
                <Btn size="xs" onClick={() => setCart((prev) => prev.some((item) => item.id === product.id) ? prev : [...prev, { ...product, quantity: 1 }])}>Agregar</Btn>
              </li>
            ))}
          </div>}
          <Table compact columns={[
            { key: "name", label: "Producto" },
            { key: "price", label: "Precio", align: "right", render: (row) => money(row.price) },
            { key: "quantity", label: "Cantidad", align: "right", render: (row) => <input type="number" min="1" max={row.stock} value={row.quantity}
              onChange={(e) => setCart((prev) => prev.map((item) => item.id === row.id ? { ...item, quantity: Math.max(1, Math.min(row.stock, Number(e.target.value) || 1)) } : item))}
              style={{ width: 70, border: "1px solid var(--line)", borderRadius: 6, padding: 4 }} /> },
            { key: "total", label: "Total", align: "right", render: (row) => money(row.price * row.quantity) },
            { key: "remove", label: "", align: "right", render: (row) => <Btn size="xs" onClick={() => setCart((prev) => prev.filter((item) => item.id !== row.id))}>Quitar</Btn> },
          ]} rows={cart} empty="Aún no hay productos en este pedido" />
          <div className="callout" style={{ marginTop: 12 }}>
            Subtotal <b>{money(cartSubtotal)}</b> · IVA 19% <b>{money(cartTax)}</b> · Total <b>{money(cartSubtotal + cartTax)}</b>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
            <Btn onClick={() => setModal(null)}>Cancelar</Btn><Btn tone="primary" disabled={busy || !cart.length}>Crear pedido</Btn>
          </div>
        </form>
      </Modal>

      <Drawer open={!!orderDetail} onClose={() => setOrderDetail(null)} title={orderDetail ? `Pedido ${orderDetail.order.number}` : "Pedido"}>
        {orderDetail && <>
          <div className="kv">
            <div><small>Estado</small><b>{ORDER_STATUS[orderDetail.order.status]?.label || orderDetail.order.status}</b></div>
            <div><small>Cliente</small><b>{orderDetail.order.customer}</b></div>
            <div><small>Documento</small><b>{orderDetail.order.document || "—"}</b></div>
            <div><small>Fecha</small><b>{dateLabel(orderDetail.order.created_at)}</b></div>
            <div><small>Subtotal</small><b>{money(orderDetail.order.subtotal)}</b></div>
            <div><small>IVA</small><b>{money(orderDetail.order.tax)}</b></div>
            <div><small>Total</small><b>{money(orderDetail.order.total)}</b></div>
            <div><small>Ítems</small><b>{orderDetail.items.length}</b></div>
          </div>
          {orderDetail.order.notes && <div className="callout">{orderDetail.order.notes}</div>}
          <h4 style={{ margin: "14px 0 8px", fontSize: 12 }}>Productos del pedido</h4>
          <Table compact columns={[
            { key: "name", label: "Producto", render: (row) => <div><b>{row.name}</b><div style={{ color: "#8b93a1", fontSize: 10 }}>{row.sku} · {row.category}</div></div> },
            { key: "quantity", label: "Cant.", align: "right" },
            { key: "unit_price", label: "Precio", align: "right", render: (row) => money(row.unit_price) },
            { key: "total", label: "Total", align: "right", render: (row) => money(row.total) },
          ]} rows={orderDetail.items} empty="Sin productos" />
          <h4 style={{ margin: "14px 0 8px", fontSize: 12 }}>Movimientos de inventario</h4>
          <div className="mini-list">
            {orderDetail.movements.map((row, index) => <li key={index}><span>{row.quantity > 0 ? "＋" : "−"}</span>{row.reason} · {Math.abs(row.quantity)} und</li>)}
            {!orderDetail.movements.length && <li><span>—</span>Sin movimientos registrados</li>}
          </div>
          <h4 style={{ margin: "14px 0 8px", fontSize: 12 }}>Cambiar estado</h4>
          <Field label="Nuevo estado">
            <select value={orderDetail.nextStatus || orderDetail.order.status}
              onChange={(e) => setOrderDetail((prev) => ({ ...prev, nextStatus: e.target.value }))}>
              {Object.entries(ORDER_STATUS).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
            </select>
          </Field>
          <Btn tone="primary" onClick={updateOrderStatus} disabled={busy}>Guardar estado</Btn>
        </>}
      </Drawer>
    </main>
  );
}
