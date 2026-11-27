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
  { id: "facturacion", label: "Finanzas" },
  { id: "inventario", label: "Inventario" },
  { id: "compras", label: "Compras" },
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
const FINANCE_TONE = {
  draft: "slate", issued: "indigo", partial: "amber", paid: "green",
  open: "amber", overdue: "rose", posted: "green", reversed: "slate",
};
const financeTag = (status) => <Tag tone={FINANCE_TONE[status] || "slate"} dot>{status}</Tag>;
const ERP_TONE = {
  draft: "slate", approved: "indigo", partially_received: "amber", received: "green",
  cancelled: "slate", posted: "green", transfer_in: "green", transfer_out: "amber",
  adjustment: "indigo", purchase_in: "blue", count: "rose", open: "amber",
};
const erpTag = (status) => <Tag tone={ERP_TONE[status] || "slate"} dot>{String(status || "").replaceAll("_", " ")}</Tag>;

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

  // Finanzas del ERP (facturación, cartera y contabilidad)
  const [finance, setFinance] = useState({
    kpis: null, monthly: [], aging: [], invoices: [], journal: [], entries: [],
    invoiceableOrders: [], receivables: [], payments: [], accounts: [],
  });
  const [financeForm, setFinanceForm] = useState({
    orderId: "", partnerId: "", receivableId: "", amount: "", method: "transfer", reference: "",
  });

  // Inventario multi-almacén y compras del ERP
  const [inventory, setInventory] = useState({
    warehouses: [], valuation: [], movements: [], counts: [], kpis: null, items: [],
  });
  const [inventoryForm, setInventoryForm] = useState({
    itemId: "", fromId: "", toId: "", quantity: "", reason: "",
    adjustItemId: "", adjustWarehouseId: "", adjustQuantity: "", adjustReason: "",
  });
  const [purchases, setPurchases] = useState({
    suppliers: [], orders: [], receipts: [], orderLines: [], kpis: null,
  });
  const [purchaseForm, setPurchaseForm] = useState({
    supplierId: "", warehouseId: "", itemId: "", quantity: "", unitCost: "",
    expectedDate: "", notes: "",
  });
  const [purchaseLines, setPurchaseLines] = useState([]);
  const [countModal, setCountModal] = useState(false);
  const [countWarehouse, setCountWarehouse] = useState("");
  const [countRows, setCountRows] = useState([]);

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

  const loadFinance = useCallback(async () => {
    const [overview, payments, journal] = await Promise.all([
      jsonRequest("/negocio/api/finance/overview"),
      jsonRequest("/negocio/api/finance/payments"),
      jsonRequest("/negocio/api/finance/journal"),
    ]);
    if (!overview.ok) return setError(overview.json.error || "No se pudo cargar el resumen financiero");
    if (!payments.ok) return setError(payments.json.error || "No se pudo cargar la cartera");
    if (!journal.ok) return setError(journal.json.error || "No se pudo cargar el libro contable");
    setFinance((prev) => ({
      ...prev,
      kpis: overview.json.kpis,
      monthly: overview.json.monthly || [],
      aging: overview.json.aging || [],
      invoices: overview.json.invoices || [],
      journal: overview.json.journal || [],
      invoiceableOrders: overview.json.invoiceableOrders || [],
      receivables: payments.json.receivables || [],
      payments: payments.json.payments || [],
      entries: journal.json.entries || [],
      accounts: journal.json.accounts || [],
    }));
    setError("");
  }, []);

  const loadInventory = useCallback(async () => {
    const { ok, json } = await jsonRequest("/negocio/api/inventory/overview");
    if (!ok) return setError(json.error || "No se pudo cargar el inventario");
    const items = await jsonRequest("/negocio/api/inventory/items");
    setInventory((prev) => ({
      ...prev,
      warehouses: json.warehouses || [],
      valuation: json.valuation || [],
      movements: json.movements || [],
      counts: json.counts || [],
      kpis: json.kpis,
      items: items.ok ? items.json.items || [] : prev.items,
    }));
    setError("");
  }, []);

  const loadPurchases = useCallback(async () => {
    const { ok, json } = await jsonRequest("/negocio/api/purchases/overview");
    if (!ok) return setError(json.error || "No se pudo cargar compras");
    setPurchases(json);
    setError("");
  }, []);

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
    if (tab === "resumen") loadOverview();
    if (tab === "facturacion") loadFinance();
    if (tab === "inventario") loadInventory();
    if (tab === "compras") { loadPurchases(); loadInventory(); }
    if (tab === "productos") loadProducts();
    if (tab === "clientes") loadCustomers();
    if (tab === "pedidos") loadOrders();
  }, [view, tab, loadOverview, loadFinance, loadInventory, loadPurchases, loadProducts, loadCustomers, loadOrders]);

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

  async function issueInvoice() {
    if (!financeForm.orderId) return setError("Selecciona un pedido confirmado o entregado");
    await mutate("/negocio/api/finance/invoices", "POST", { orderId: financeForm.orderId }, (json) => {
      setFinanceForm((prev) => ({ ...prev, orderId: "" }));
      loadFinance();
      loadOverview();
      setNotice(`Factura ${json.invoice.number} emitida · asiento ${json.invoice.journal_number}`);
    });
  }

  async function submitPayment(event) {
    event.preventDefault();
    const amount = Number(financeForm.amount);
    if (!financeForm.partnerId || !amount) return setError("Selecciona una cuenta por cobrar");
    const allocations = financeForm.receivableId
      ? [{ receivableId: financeForm.receivableId, amount }]
      : [];
    await mutate("/negocio/api/finance/payments", "POST", {
      partnerId: financeForm.partnerId,
      amount,
      method: financeForm.method,
      reference: financeForm.reference,
      allocations,
    }, (json) => {
      setFinanceForm((prev) => ({ ...prev, receivableId: "", partnerId: "", amount: "", reference: "" }));
      loadFinance();
      setNotice(`Pago ${json.payment.number} registrado · asiento ${json.payment.journal_number}`);
    });
  }

  async function transferStock(event) {
    event.preventDefault();
    await mutate("/negocio/api/inventory/transfer", "POST", {
      itemId: inventoryForm.itemId,
      fromWarehouseId: inventoryForm.fromId,
      toWarehouseId: inventoryForm.toId,
      quantity: Number(inventoryForm.quantity),
      reason: inventoryForm.reason,
    }, (json) => {
      setInventoryForm((prev) => ({ ...prev, quantity: "", reason: "" }));
      loadInventory();
      setNotice(`Transferencia ${json.transfer.number} registrada`);
    });
  }

  async function adjustInventory(event) {
    event.preventDefault();
    await mutate("/negocio/api/inventory/adjust", "POST", {
      warehouseId: inventoryForm.adjustWarehouseId,
      itemId: inventoryForm.adjustItemId,
      quantity: Number(inventoryForm.adjustQuantity),
      reason: inventoryForm.adjustReason,
    }, (json) => {
      setInventoryForm((prev) => ({ ...prev, adjustQuantity: "", adjustReason: "" }));
      loadInventory();
      setNotice(`Ajuste ${json.adjustment.number} registrado${json.adjustment.journal_number ? ` · ${json.adjustment.journal_number}` : ""}`);
    });
  }

  function openCountModal() {
    const warehouse = inventoryForm.adjustWarehouseId || inventory.warehouses[0]?.id || "";
    setCountWarehouse(warehouse);
    setCountRows((inventory.items || []).slice(0, 40).map((item) => ({
      itemId: item.id, sku: item.sku, name: item.name, expected: item.stock, counted: String(item.stock || 0),
    })));
    setCountModal(true);
  }

  async function submitCount(event) {
    event.preventDefault();
    const counts = countRows
      .filter((row) => Number(row.counted) !== Number(row.expected))
      .map((row) => ({ itemId: row.itemId, countedQty: Number(row.counted) }));
    if (!counts.length) return setError("No hay diferencias entre esperado y contado");
    await mutate("/negocio/api/inventory/count", "POST", {
      warehouseId: countWarehouse, counts, reason: "Conteo físico de inventario",
    }, (json) => {
      setCountModal(false);
      loadInventory();
      setNotice(`Conteo ${json.count.number} aplicado${json.count.journal_number ? ` · ${json.count.journal_number}` : ""}`);
    });
  }

  function addPurchaseLine() {
    const item = (inventory.items || []).find((row) => row.id === purchaseForm.itemId);
    const quantity = Number(purchaseForm.quantity);
    const unitCost = Number(purchaseForm.unitCost);
    if (!item || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitCost) || unitCost < 0) {
      return setError("Selecciona un ítem y escribe cantidad y costo válidos");
    }
    setPurchaseLines((prev) => [
      ...prev,
      { key: `${item.id}-${Date.now()}`, itemId: item.id, sku: item.sku, name: item.name, quantity, unitCost, taxRate: 0.19 },
    ]);
    setPurchaseForm((prev) => ({ ...prev, itemId: "", quantity: "", unitCost: "" }));
    setError("");
  }

  async function submitPurchase(event) {
    event.preventDefault();
    if (!purchaseForm.supplierId || !purchaseForm.warehouseId || !purchaseLines.length) {
      return setError("Proveedor, almacén y al menos una línea son obligatorios");
    }
    await mutate("/negocio/api/purchases/orders", "POST", {
      supplierId: purchaseForm.supplierId,
      warehouseId: purchaseForm.warehouseId,
      expectedDate: purchaseForm.expectedDate || null,
      notes: purchaseForm.notes,
      lines: purchaseLines.map(({ itemId, quantity, unitCost, taxRate }) => ({ itemId, quantity, unitCost, taxRate })),
    }, (json) => {
      setPurchaseLines([]);
      setPurchaseForm((prev) => ({ ...prev, expectedDate: "", notes: "" }));
      loadPurchases();
      setNotice(`Pedido ${json.order.number} creado por ${money(json.order.total)}`);
    });
  }

  async function approveOrder(row) {
    await mutate("/negocio/api/purchases/orders", "POST", { action: "approve", orderId: row.id }, () => {
      loadPurchases();
      setNotice(`Pedido ${row.number} aprobado`);
    });
  }

  async function receiveOrder(row) {
    await mutate("/negocio/api/purchases/receive", "POST", { orderId: row.id }, (json) => {
      loadPurchases();
      loadInventory();
      setNotice(`Recepción ${json.receipt.number} · asiento ${json.receipt.journal_number}`);
    });
  }

  async function switchTenant(event) {
    const selected = (data.tenants || []).find((row) => row.tenant_key === event.target.value);
    if (!selected) return;
    await mutate("/negocio/api/switch", "POST", { tenantId: selected.tenant_id }, () => {
      load();
      setNotice(`Ahora trabajas en ${selected.tenant_name}`);
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

      {/* ── Finanzas ────────────────────────────────────────────────────── */}
      {tab === "facturacion" && <>
        <div className="stat-grid" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
          <Stat label="Facturado" value={compact(finance.kpis?.invoiced)} icon="↗" tone="green" hint={`${finance.kpis?.open_invoices || 0} facturas pendientes`} />
          <Stat label="Cobrado" value={compact(finance.kpis?.collected)} icon="◎" tone="indigo" />
          <Stat label="Por cobrar" value={compact(finance.kpis?.receivable)} icon="⏱" tone="amber" />
          <Stat label="Libro contable" value={compact(finance.kpis?.posted)} icon="▤" hint="Débito = crédito" />
        </div>

        <div className="chart-grid">
          <Panel title="Facturación mensual" subtitle="Facturas operativas emitidas">
            <Bars height={150} data={(finance.monthly || []).map((row) => ({ label: monthLabel(row.month), value: row.invoiced }))} />
          </Panel>
          <Panel title="Cobros mensuales" subtitle="Pagos aplicados a cartera">
            <Bars height={150} color="#22c55e" data={(finance.monthly || []).map((row) => ({ label: monthLabel(row.month), value: row.collected }))} />
          </Panel>
        </div>

        <div className="chart-grid">
          <Panel title="Emitir factura" subtitle="El pedido pasa a facturado y genera su asiento balanceado">
            <div className="filter-row">
              <select value={financeForm.orderId} onChange={(e) => setFinanceForm((prev) => ({ ...prev, orderId: e.target.value }))} style={{ minWidth: 320 }}>
                <option value="">Selecciona un pedido confirmado…</option>
                {(finance.invoiceableOrders || []).map((row) => (
                  <option key={row.id} value={row.id}>{row.number} · {row.partner} · {money(row.total)}</option>
                ))}
              </select>
              <Btn tone="primary" icon="＋" onClick={issueInvoice} disabled={busy || !financeForm.orderId}>Emitir factura</Btn>
            </div>
            {!finance.invoiceableOrders?.length && <div className="callout" style={{ marginTop: 10 }}>No hay pedidos listos para facturar. Confirma o entrega un pedido primero.</div>}
          </Panel>

          <Panel title="Registrar pago" subtitle="Aplica a la cartera y deja su asiento en el libro único">
            <form onSubmit={submitPayment}>
              <Field label="Cuenta por cobrar" hint="El cliente se toma de la factura seleccionada">
                <select value={financeForm.receivableId} onChange={(e) => {
                  const row = (finance.receivables || []).find((item) => item.id === e.target.value);
                  setFinanceForm((prev) => ({
                    ...prev,
                    receivableId: e.target.value,
                    partnerId: row?.partner_id || "",
                    amount: row ? String(row.balance) : "",
                  }));
                }}>
                  <option value="">Selecciona una factura pendiente…</option>
                  {(finance.receivables || []).map((row) => (
                    <option key={row.id} value={row.id}>{row.invoice} · {row.partner} · {money(row.balance)}</option>
                  ))}
                </select>
              </Field>
              <div className="two-col">
                <Field label="Valor del pago">
                  <input type="number" min="0.01" step="0.01" required value={financeForm.amount}
                    onChange={(e) => setFinanceForm((prev) => ({ ...prev, amount: e.target.value }))} />
                </Field>
                <Field label="Método">
                  <select value={financeForm.method} onChange={(e) => setFinanceForm((prev) => ({ ...prev, method: e.target.value }))}>
                    <option value="transfer">Transferencia</option>
                    <option value="bank">Banco</option>
                    <option value="cash">Efectivo</option>
                    <option value="card">Tarjeta</option>
                    <option value="pse">PSE</option>
                  </select>
                </Field>
              </div>
              <Field label="Referencia">
                <input value={financeForm.reference} onChange={(e) => setFinanceForm((prev) => ({ ...prev, reference: e.target.value }))} placeholder="Comprobante, transacción…" />
              </Field>
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
                <Btn tone="primary" disabled={busy || !financeForm.receivableId}>Registrar pago</Btn>
              </div>
            </form>
          </Panel>
        </div>

        <Panel title="Facturas operativas" subtitle="Emitidas desde pedidos · separadas de la facturación de la plataforma" bodyClass="tight">
          <Table compact columns={[
            { key: "number", label: "Factura", render: (row) => <span className="mono">{row.number}</span> },
            { key: "partner", label: "Cliente" },
            { key: "issue_date", label: "Emisión", render: (row) => dateLabel(row.issue_date) },
            { key: "total", label: "Total", align: "right", render: (row) => money(row.total) },
            { key: "balance", label: "Saldo", align: "right", render: (row) => money(row.balance) },
            { key: "status", label: "Estado", render: (row) => financeTag(row.status) },
            { key: "journal_number", label: "Asiento", render: (row) => <span className="mono">{row.journal_number}</span> },
          ]} rows={finance.invoices || []} empty="Todavía no hay facturas operativas" />
        </Panel>

        <div className="chart-grid">
          <Panel title="Cartera pendiente" subtitle="Facturas con saldo abierto" bodyClass="tight">
            <Table compact columns={[
              { key: "invoice", label: "Factura", render: (row) => <span className="mono">{row.invoice}</span> },
              { key: "partner", label: "Cliente" },
              { key: "balance", label: "Saldo", align: "right", render: (row) => money(row.balance) },
              { key: "due_date", label: "Vence", render: (row) => dateLabel(row.due_date) },
              { key: "status", label: "Estado", render: (row) => financeTag(row.status) },
            ]} rows={finance.receivables || []} empty="Cartera al día" />
          </Panel>
          <Panel title="Antigüedad de cartera" subtitle="Saldo por rango de días" bodyClass="tight">
            <Table compact columns={[
              { key: "bucket", label: "Rango" },
              { key: "invoices", label: "Facturas", align: "right" },
              { key: "amount", label: "Saldo", align: "right", render: (row) => money(row.amount) },
            ]} rows={finance.aging || []} empty="Sin saldos pendientes" />
          </Panel>
        </div>

        <Panel title="Libro contable" subtitle="Un solo libro por negocio: cada documento genera débito y crédito" bodyClass="tight">
          <Table compact columns={[
            { key: "number", label: "Asiento", render: (row) => <span className="mono">{row.number}</span> },
            { key: "entry_date", label: "Fecha", render: (row) => dateLabel(row.entry_date) },
            { key: "description", label: "Descripción" },
            { key: "source_type", label: "Origen" },
            { key: "total_debit", label: "Débito", align: "right", render: (row) => money(row.total_debit) },
            { key: "status", label: "Estado", render: (row) => financeTag(row.status) },
          ]} rows={finance.entries || []} empty="Aún no hay asientos contables" />
        </Panel>

        <Panel title="Pagos registrados" subtitle="Cobros y su aplicación a facturas" bodyClass="tight">
          <Table compact columns={[
            { key: "number", label: "Pago", render: (row) => <span className="mono">{row.number}</span> },
            { key: "payment_date", label: "Fecha", render: (row) => dateLabel(row.payment_date) },
            { key: "method", label: "Método" },
            { key: "amount", label: "Valor", align: "right", render: (row) => money(row.amount) },
            { key: "unapplied", label: "Sin aplicar", align: "right", render: (row) => money(row.unapplied) },
            { key: "status", label: "Estado", render: (row) => financeTag(row.status) },
          ]} rows={finance.payments || []} empty="Todavía no hay pagos registrados" />
        </Panel>
      </>}

      {/* ── Inventario ──────────────────────────────────────────────────── */}
      {tab === "inventario" && <>
        <div className="stat-grid" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
          <Stat label="Unidades en stock" value={Number(inventory.kpis?.units || 0).toLocaleString("es-CO")} icon="▣" tone="indigo" />
          <Stat label="Valor promedio" value={compact(inventory.kpis?.average_value)} icon="◎" tone="green" hint="Costo promedio ponderado" />
          <Stat label="Valor FIFO" value={compact(inventory.kpis?.fifo_value)} icon="▤" tone="blue" hint="Capas de entrada pendientes" />
          <Stat label="Ubicaciones" value={`${inventory.kpis?.stocked_items || 0}/${(inventory.kpis?.stocked_items || 0) + (inventory.kpis?.empty_locations || 0)}`} icon="⌂" tone="amber" hint="Ítems con existencias / total" />
        </div>

        <div className="chart-grid">
          <Panel title="Transferir entre almacenes" subtitle="Consume capas FIFO y ajusta costo promedio">
            <form onSubmit={transferStock}>
              <Field label="Ítem">
                <select value={inventoryForm.itemId} onChange={(e) => setInventoryForm((prev) => ({ ...prev, itemId: e.target.value }))} required>
                  <option value="">Selecciona un ítem…</option>
                  {(inventory.items || []).map((row) => (
                    <option key={row.id} value={row.id}>{row.sku} · {row.name} · {row.stock} und</option>
                  ))}
                </select>
              </Field>
              <div className="two-col">
                <Field label="Origen">
                  <select value={inventoryForm.fromId} onChange={(e) => setInventoryForm((prev) => ({ ...prev, fromId: e.target.value }))} required>
                    <option value="">Almacén…</option>
                    {(inventory.warehouses || []).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
                  </select>
                </Field>
                <Field label="Destino">
                  <select value={inventoryForm.toId} onChange={(e) => setInventoryForm((prev) => ({ ...prev, toId: e.target.value }))} required>
                    <option value="">Almacén…</option>
                    {(inventory.warehouses || []).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
                  </select>
                </Field>
              </div>
              <div className="two-col">
                <Field label="Cantidad">
                  <input type="number" min="0.001" step="0.001" required value={inventoryForm.quantity}
                    onChange={(e) => setInventoryForm((prev) => ({ ...prev, quantity: e.target.value }))} />
                </Field>
                <Field label="Motivo">
                  <input required value={inventoryForm.reason} placeholder="Traslado entre tiendas…"
                    onChange={(e) => setInventoryForm((prev) => ({ ...prev, reason: e.target.value }))} />
                </Field>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
                <Btn tone="primary" disabled={busy}>Transferir</Btn>
              </div>
            </form>
          </Panel>

          <Panel title="Ajustar con motivo" subtitle="Pérdidas y sobrantes generan asiento balanceado">
            <form onSubmit={adjustInventory}>
              <div className="two-col">
                <Field label="Ítem">
                  <select value={inventoryForm.adjustItemId} onChange={(e) => setInventoryForm((prev) => ({ ...prev, adjustItemId: e.target.value }))} required>
                    <option value="">Selecciona un ítem…</option>
                    {(inventory.items || []).map((row) => (
                      <option key={row.id} value={row.id}>{row.sku} · {row.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Almacén">
                  <select value={inventoryForm.adjustWarehouseId} onChange={(e) => setInventoryForm((prev) => ({ ...prev, adjustWarehouseId: e.target.value }))} required>
                    <option value="">Almacén…</option>
                    {(inventory.warehouses || []).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
                  </select>
                </Field>
              </div>
              <div className="two-col">
                <Field label="Cantidad" hint="Negativo para pérdida, positivo para sobrante">
                  <input type="number" step="0.001" required value={inventoryForm.adjustQuantity}
                    onChange={(e) => setInventoryForm((prev) => ({ ...prev, adjustQuantity: e.target.value }))} />
                </Field>
                <Field label="Motivo">
                  <input required value={inventoryForm.adjustReason} placeholder="Merma, daño, sobrante…"
                    onChange={(e) => setInventoryForm((prev) => ({ ...prev, adjustReason: e.target.value }))} />
                </Field>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
                <Btn tone="primary" disabled={busy}>Aplicar ajuste</Btn>
              </div>
            </form>
          </Panel>
        </div>

        <div className="chart-grid">
          <Panel title="Conteos físicos" subtitle="Diferencias aplicadas y contabilizadas" bodyClass="tight" actions={<Btn onClick={openCountModal} disabled={busy || !inventory.items?.length}>Nuevo conteo</Btn>}>
            <Table compact columns={[
              { key: "number", label: "Conteo", render: (row) => <span className="mono">{row.number}</span> },
              { key: "warehouse", label: "Almacén" },
              { key: "counted_at", label: "Fecha", render: (row) => dateLabel(row.counted_at) },
              { key: "difference_total", label: "Diferencia", align: "right", render: (row) => money(row.difference_total) },
              { key: "journal_number", label: "Asiento", render: (row) => <span className="mono">{row.journal_number || "—"}</span> },
            ]} rows={inventory.counts || []} empty="Sin conteos registrados" />
          </Panel>
          <Panel title="Valoración por almacén" subtitle="Promedio ponderado vs. capas FIFO" bodyClass="tight">
            <Table compact columns={[
              { key: "warehouse", label: "Almacén" },
              { key: "sku", label: "SKU" },
              { key: "name", label: "Ítem" },
              { key: "quantity", label: "Und", align: "right" },
              { key: "average_value", label: "Promedio", align: "right", render: (row) => money(row.average_value) },
              { key: "fifo_value", label: "FIFO", align: "right", render: (row) => money(row.fifo_value) },
            ]} rows={inventory.valuation || []} empty="No hay existencias registradas" />
          </Panel>
        </div>

        <Panel title="Movimientos de inventario" subtitle="Transferencias, ajustes, conteos y recepciones" bodyClass="tight">
          <Table compact columns={[
            { key: "number", label: "Número", render: (row) => <span className="mono">{row.number}</span> },
            { key: "movement_type", label: "Tipo", render: (row) => erpTag(row.movement_type) },
            { key: "item", label: "Ítem" },
            { key: "from_code", label: "Origen", render: (row) => row.from_code || "—" },
            { key: "to_code", label: "Destino", render: (row) => row.to_code || "—" },
            { key: "quantity", label: "Cant.", align: "right" },
            { key: "reason", label: "Motivo" },
            { key: "occurred_at", label: "Fecha", render: (row) => dateLabel(row.occurred_at) },
          ]} rows={inventory.movements || []} empty="Aún no hay movimientos de inventario" />
        </Panel>
      </>}

      {/* ── Compras ──────────────────────────────────────────────────────── */}
      {tab === "compras" && <>
        <div className="stat-grid" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
          <Stat label="Pedidos abiertos" value={money(purchases.kpis?.open_orders)} icon="▤" tone="indigo" />
          <Stat label="Recibido" value={money(purchases.kpis?.received)} icon="↙" tone="green" />
          <Stat label="Por pagar" value={money(purchases.kpis?.payables)} icon="⏱" tone="amber" hint="Cuenta 2405 Proveedores" />
          <Stat label="Borradores" value={purchases.kpis?.drafts || 0} icon="◇" tone="slate" />
        </div>

        <Panel title="Nuevo pedido de compra" subtitle="Los proveedores son partners del mismo maestro canónico">
          <form onSubmit={submitPurchase}>
            <div className="two-col">
              <Field label="Proveedor">
                <select value={purchaseForm.supplierId} onChange={(e) => setPurchaseForm((prev) => ({ ...prev, supplierId: e.target.value }))} required>
                  <option value="">Selecciona un proveedor…</option>
                  {(purchases.suppliers || []).map((row) => <option key={row.id} value={row.id}>{row.name} · {row.document}</option>)}
                </select>
              </Field>
              <Field label="Almacén de recepción">
                <select value={purchaseForm.warehouseId} onChange={(e) => setPurchaseForm((prev) => ({ ...prev, warehouseId: e.target.value }))} required>
                  <option value="">Almacén…</option>
                  {(inventory.warehouses || []).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
                </select>
              </Field>
            </div>
            <div className="filter-row">
              <select value={purchaseForm.itemId} onChange={(e) => setPurchaseForm((prev) => ({ ...prev, itemId: e.target.value }))}>
                <option value="">Ítem a comprar…</option>
                {(inventory.items || []).map((row) => <option key={row.id} value={row.id}>{row.sku} · {row.name}</option>)}
              </select>
              <input type="number" min="0.001" step="0.001" placeholder="Cantidad" value={purchaseForm.quantity}
                onChange={(e) => setPurchaseForm((prev) => ({ ...prev, quantity: e.target.value }))} />
              <input type="number" min="0" step="0.01" placeholder="Costo unitario" value={purchaseForm.unitCost}
                onChange={(e) => setPurchaseForm((prev) => ({ ...prev, unitCost: e.target.value }))} />
              <Btn onClick={addPurchaseLine} disabled={busy}>Agregar línea</Btn>
            </div>
            {purchaseLines.length > 0 && <div className="table-wrap compact" style={{ marginTop: 12 }}>
              <table><thead><tr><th>Ítem</th><th>Cant.</th><th>Costo</th><th>Subtotal</th><th></th></tr></thead>
                <tbody>{purchaseLines.map((line) => (
                  <tr key={line.key}>
                    <td>{line.sku} · {line.name}</td>
                    <td>{line.quantity}</td>
                    <td>{money(line.unitCost)}</td>
                    <td>{money(line.quantity * line.unitCost)}</td>
                    <td><button type="button" className="icon-btn" onClick={() => setPurchaseLines((prev) => prev.filter((item) => item.key !== line.key))}>✕</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>}
            <div className="two-col" style={{ marginTop: 12 }}>
              <Field label="Fecha esperada"><input type="date" value={purchaseForm.expectedDate}
                onChange={(e) => setPurchaseForm((prev) => ({ ...prev, expectedDate: e.target.value }))} /></Field>
              <Field label="Notas"><input value={purchaseForm.notes}
                onChange={(e) => setPurchaseForm((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Observaciones…" /></Field>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
              <Btn tone="primary" disabled={busy || !purchaseLines.length}>Crear pedido</Btn>
            </div>
          </form>
        </Panel>

        <Panel title="Pedidos de compra" subtitle="Aprueba y recibe; la recepción genera entrada y asiento" bodyClass="tight">
          <Table compact columns={[
            { key: "number", label: "Pedido", render: (row) => <span className="mono">{row.number}</span> },
            { key: "supplier", label: "Proveedor" },
            { key: "warehouse", label: "Almacén" },
            { key: "total", label: "Total", align: "right", render: (row) => money(row.total) },
            { key: "received_total", label: "Recibido", align: "right", render: (row) => money(row.received_total) },
            { key: "status", label: "Estado", render: (row) => erpTag(row.status) },
            { key: "actions", label: "", render: (row) => <div style={{ display: "flex", gap: 6 }}>
              {row.status === "draft" && <Btn size="sm" onClick={() => approveOrder(row)} disabled={busy}>Aprobar</Btn>}
              {["approved", "partially_received"].includes(row.status) && <Btn size="sm" tone="primary" onClick={() => receiveOrder(row)} disabled={busy}>Recibir todo</Btn>}
            </div> },
          ]} rows={purchases.orders || []} empty="No hay pedidos de compra" />
        </Panel>

        <div className="chart-grid">
          <Panel title="Recepciones" subtitle="Cada recepción deja su asiento en el libro único" bodyClass="tight">
            <Table compact columns={[
              { key: "number", label: "Recepción", render: (row) => <span className="mono">{row.number}</span> },
              { key: "purchase_order", label: "Pedido" },
              { key: "supplier", label: "Proveedor" },
              { key: "total", label: "Total", align: "right", render: (row) => money(row.total) },
              { key: "journal_number", label: "Asiento", render: (row) => <span className="mono">{row.journal_number || "—"}</span> },
            ]} rows={purchases.receipts || []} empty="Todavía no hay recepciones" />
          </Panel>
          <Panel title="Pendiente por recibir" subtitle="Líneas con saldo abierto" bodyClass="tight">
            <Table compact columns={[
              { key: "sku", label: "SKU" },
              { key: "item", label: "Ítem" },
              { key: "quantity", label: "Pedido", align: "right" },
              { key: "received_qty", label: "Recibido", align: "right" },
              { key: "unit_cost", label: "Costo", align: "right", render: (row) => money(row.unit_cost) },
            ]} rows={purchases.orderLines || []} empty="Todo ha sido recibido" />
          </Panel>
        </div>
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
        <Panel title="Empresa activa" subtitle="Las escrituras siempre quedan dentro del tenant seleccionado">
          <div className="callout">
            {tenant.id === "t17_sandbox"
              ? "Estás en Samjuro Sandbox. Las facturas, pagos e inventario que registres aquí no afectan los datos reales."
              : "Estás en el negocio real. Evita registrar operaciones hasta terminar la validación."}
          </div>
          {(data.tenants || []).length > 1 && (
            <Field label="Cambiar de empresa" hint="La sesión se vuelve a firmar con la empresa elegida">
              <select value={tenant.id} onChange={switchTenant} disabled={busy}>
                {(data.tenants || []).map((row) => (
                  <option key={row.tenant_id} value={row.tenant_key}>
                    {row.tenant_name} · {row.role}
                  </option>
                ))}
              </select>
            </Field>
          )}
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

      <Modal open={countModal} onClose={() => setCountModal(false)} title="Nuevo conteo físico"
        subtitle="Compara el stock teórico con lo contado y aplica las diferencias" width={760}>
        <form onSubmit={submitCount}>
          <Field label="Almacén">
            <select value={countWarehouse} onChange={(e) => setCountWarehouse(e.target.value)} required>
              {(inventory.warehouses || []).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
            </select>
          </Field>
          <div className="table-wrap compact" style={{ marginTop: 12, maxHeight: 360, overflow: "auto" }}>
            <table><thead><tr><th>Ítem</th><th>Esperado</th><th>Contado</th></tr></thead>
              <tbody>{countRows.map((row, index) => (
                <tr key={row.itemId}>
                  <td>{row.sku} · {row.name}</td>
                  <td>{row.expected}</td>
                  <td><input type="number" min="0" step="0.001" value={row.counted}
                    onChange={(e) => setCountRows((prev) => prev.map((item, i) => i === index ? { ...item, counted: e.target.value } : item))} /></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
            <Btn onClick={() => setCountModal(false)}>Cancelar</Btn>
            <Btn tone="primary" disabled={busy}>Aplicar conteo</Btn>
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
