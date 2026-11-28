"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Panel, Stat, Tag, Table, Btn, Field, Tabs, Modal, Drawer, Bars, Donut,
} from "../../components/ui";
import PasswordInput from "../components/PasswordInput";

const TABS = [
  { id: "resumen", label: "Resumen" },
  { id: "productos", label: "Productos" },
  { id: "clientes", label: "Clientes" },
  { id: "pedidos", label: "Pedidos" },
  { id: "cotizaciones", label: "Cotizar" },
  { id: "facturacion", label: "Finanzas" },
  { id: "inventario", label: "Inventario" },
  { id: "compras", label: "Compras" },
  { id: "utilidades", label: "Utilidades" },
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
const money0 = (value) => money(Math.round(Number(value || 0)));
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
  const [products, setProducts] = useState({ products: [], categories: [], brands: [], total: 0, pages: 1 });
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
  const [margins, setMargins] = useState({ kpis: null, byItem: [], byOrder: [], ivaRate: 19 });
  const [priceTarget, setPriceTarget] = useState(null);
  const [priceForm, setPriceForm] = useState({ price: "" });
  const [priceSync, setPriceSync] = useState({ changes: [], summary: {}, configured: false });
  const [countModal, setCountModal] = useState(false);
  const [countWarehouse, setCountWarehouse] = useState("");
  const [countRows, setCountRows] = useState([]);

  // Filtros y paginación
  const [productQ, setProductQ] = useState("");
  const [productBrand, setProductBrand] = useState("");
  const [productCategory, setProductCategory] = useState("");
  const [productPage, setProductPage] = useState(1);
  const [customerQ, setCustomerQ] = useState("");
  const [customerPage, setCustomerPage] = useState(1);
  const [orderQ, setOrderQ] = useState("");
  const [orderStatus, setOrderStatus] = useState("");
  const [orderPage, setOrderPage] = useState(1);

  // Formularios
  const [modal, setModal] = useState(null);
  const [productForm, setProductForm] = useState({ sku: "", name: "", category: "General", brand: "General", price: "", cost: "", stock: "", min_stock: "", unit: "und", description: "" });
  const [customerForm, setCustomerForm] = useState({ name: "", document: "", email: "", phone: "", city: "", address: "" });
  const [stockTarget, setStockTarget] = useState(null);
  const [stockForm, setStockForm] = useState({ delta: "", reason: "" });
  const [orderCustomers, setOrderCustomers] = useState([]);
  const [orderCustomerId, setOrderCustomerId] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState([]);
  const [cart, setCart] = useState([]);

  // Cotizador masivo (IVA incluido en el precio del catálogo)
  const [quotes, setQuotes] = useState([]);
  const [quoteForm, setQuoteForm] = useState({ partnerId: "", notes: "" });
  const [quoteLines, setQuoteLines] = useState([]);
  const [quoteResults, setQuoteResults] = useState([]);
  const [quoteSearch, setQuoteSearch] = useState("");
  const [quoteBrand, setQuoteBrand] = useState("");
  const [quoteCategory, setQuoteCategory] = useState("");
  const [quoteCustomers, setQuoteCustomers] = useState([]);
  const [quoteFacets, setQuoteFacets] = useState({ brands: [], categories: [] });
  const [bulkQty, setBulkQty] = useState("1");
  const [activeQuote, setActiveQuote] = useState(null);

  const loadOverview = useCallback(async () => {
    const { ok, json } = await jsonRequest("/negocio/api/overview");
    if (ok) setOverview(json);
    else setError(json.error || "No se pudo cargar el resumen");
  }, []);

  const loadProducts = useCallback(async () => {
    const query = new URLSearchParams({
      q: productQ, brand: productBrand, category: productCategory,
      page: String(productPage), limit: "20",
    });
    const { ok, json } = await jsonRequest(`/negocio/api/products?${query}`);
    if (ok) setProducts(json);
    else setError(json.error || "No se pudo cargar el catálogo");
  }, [productQ, productBrand, productCategory, productPage]);

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

  const loadMargins = useCallback(async () => {
    const { ok, json } = await jsonRequest("/negocio/api/margins/overview");
    if (!ok) return setError(json.error || "No se pudo cargar las utilidades");
    setMargins(json);
    setError("");
  }, []);

  const loadPriceSync = useCallback(async () => {
    const { ok, json } = await jsonRequest("/negocio/api/samjuro/sync-prices");
    if (!ok) return setError(json.error || "No se pudo cargar la sincronización de precios");
    setPriceSync(json);
    setError("");
  }, []);

  const loadQuotes = useCallback(async () => {
    const { ok, json } = await jsonRequest("/negocio/api/quotes");
    if (ok) setQuotes(json.quotes || []);
    else setError(json.error || "No se pudieron cargar las cotizaciones");
  }, []);

  const loadQuoteCustomers = useCallback(async () => {
    const { ok, json } = await jsonRequest("/negocio/api/customers?limit=100");
    if (ok) setQuoteCustomers(json.customers || []);
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
    if (tab === "utilidades") { loadMargins(); loadInventory(); loadPriceSync(); }
    if (tab === "productos") { loadProducts(); loadPriceSync(); }
    if (tab === "clientes") loadCustomers();
    if (tab === "pedidos") loadOrders();
    if (tab === "cotizaciones") { loadQuotes(); loadQuoteCustomers(); }
  }, [view, tab, loadOverview, loadFinance, loadInventory, loadPurchases, loadMargins, loadPriceSync, loadProducts, loadCustomers, loadOrders, loadQuotes, loadQuoteCustomers]);

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

  useEffect(() => {
    if (view !== "panel" || tab !== "cotizaciones") return;
    let alive = true;
    const timer = setTimeout(async () => {
      const query = new URLSearchParams({
        q: quoteSearch, brand: quoteBrand, category: quoteCategory, limit: "100",
      });
      const { ok, json } = await jsonRequest(`/negocio/api/products?${query}`);
      if (alive && ok) {
        setQuoteResults(json.products || []);
        setQuoteFacets({ brands: json.brands || [], categories: json.categories || [] });
      }
    }, 220);
    return () => { alive = false; clearTimeout(timer); };
  }, [view, tab, quoteSearch, quoteBrand, quoteCategory]);

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

  async function submitPrice(event) {
    event.preventDefault();
    const ok = await mutate("/negocio/api/products", "PATCH", {
      id: priceTarget.id, action: "price", price: Number(priceForm.price),
    }, (json) => {
      setModal(null);
      setPriceTarget(null);
      setPriceForm({ price: "" });
      loadProducts();
      loadPriceSync();
      setNotice(json.product?.pending_sync
        ? "Precio actualizado en el ERP; pendiente de sincronizar con Samjuro"
        : "Precio actualizado en el ERP");
    });
    if (!ok) setError("No se pudo actualizar el precio");
  }

  async function syncPrices() {
    const ok = await mutate("/negocio/api/samjuro/sync-prices", "POST", {}, (json) => {
      loadPriceSync();
      if (json.error) setError(json.error);
      else setNotice(`${json.synced || 0} precios sincronizados · ${json.failed || 0} con error`);
    });
    if (!ok) setError("No se pudo sincronizar con Supabase");
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

  const makeQuoteLine = (product, quantity) => ({
    key: `${product.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    productId: product.id, sku: product.sku, name: product.name,
    brand: product.brand, category: product.category,
    quantity, price: Number(product.price || 0),
  });

  function addQuoteLine(product, quantity = 1) {
    setQuoteLines((prev) => {
      const index = prev.findIndex((line) => line.productId === product.id);
      if (index < 0) return [...prev, makeQuoteLine(product, quantity)];
      return prev.map((line, i) => i === index ? { ...line, quantity: line.quantity + quantity } : line);
    });
  }

  function addAllQuoteResults() {
    if (!quoteResults.length) return;
    setQuoteLines((prev) => {
      let next = prev;
      for (const product of quoteResults) {
        const index = next.findIndex((line) => line.productId === product.id);
        next = index < 0
          ? [...next, makeQuoteLine(product, 1)]
          : next.map((line, i) => i === index ? { ...line, quantity: line.quantity + 1 } : line);
      }
      return next;
    });
  }

  function updateQuoteLine(key, field, value) {
    const clean = field === "quantity"
      ? Math.max(1, Math.floor(Number(value) || 1))
      : Math.max(0, Number(value) || 0);
    setQuoteLines((prev) => prev.map((line) => line.key === key ? { ...line, [field]: clean } : line));
  }

  function removeQuoteLine(key) {
    setQuoteLines((prev) => prev.filter((line) => line.key !== key));
  }

  function applyBulkQty() {
    const qty = Math.max(1, Math.floor(Number(bulkQty) || 1));
    setQuoteLines((prev) => prev.map((line) => ({ ...line, quantity: qty })));
  }

  function newQuote() {
    setQuoteLines([]);
    setActiveQuote(null);
    setQuoteForm({ partnerId: "", notes: "" });
    setError("");
  }

  async function loadQuote(row) {
    const { ok, json } = await jsonRequest(`/negocio/api/quotes?id=${row.id}`);
    if (!ok) return setError(json.error || "No se pudo cargar la cotización");
    setActiveQuote(json.quote);
    setQuoteForm({ partnerId: json.quote.partner_id || "", notes: json.quote.notes || "" });
    setQuoteLines(json.lines.map((line) => ({
      key: line.id, productId: line.product_id, sku: line.description,
      name: line.description, brand: "", category: "",
      quantity: line.quantity,
      price: Math.round((line.total / line.quantity) * 100) / 100,
    })));
    setNotice(`Cotización ${json.quote.number} cargada · ${json.lines.length} líneas`);
  }

  async function saveQuote() {
    if (!quoteForm.partnerId) return setError("Selecciona un cliente");
    if (!quoteLines.length) return setError("Agrega al menos un producto a la cotización");
    const payload = {
      partnerId: quoteForm.partnerId,
      notes: quoteForm.notes,
      lines: quoteLines.map((line) => ({
        product_id: line.productId, quantity: line.quantity, price: line.price,
      })),
    };
    if (activeQuote) payload.quoteId = activeQuote.id;
    await mutate("/negocio/api/quotes", activeQuote ? "PATCH" : "POST", payload, (json) => {
      setActiveQuote(json.quote);
      loadQuotes();
      setNotice(`Cotización ${json.quote.number} guardada · ${money(json.quote.total)}`);
    });
  }

  async function convertQuote(quoteId) {
    const id = quoteId || activeQuote?.id;
    if (!id) return setError("Guarda la cotización antes de facturarla");
    await mutate("/negocio/api/quotes", "POST", { action: "convert", quoteId: id }, (json) => {
      loadQuotes();
      loadFinance();
      loadOverview();
      setNotice(`Factura ${json.invoice.number} emitida · ${json.invoice.lines} líneas · asiento ${json.invoice.journal_number}`);
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
            <PasswordInput
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
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

  const quoteTotals = quoteLines.reduce((acc, line) => {
    const gross = Number(line.price || 0) * Number(line.quantity || 0);
    const net = gross / 1.19;
    acc.units += Number(line.quantity || 0);
    acc.subtotal += net;
    acc.tax += gross - net;
    acc.total += gross;
    return acc;
  }, { units: 0, subtotal: 0, tax: 0, total: 0 });

  return (
    <main className="tenant-shell">
      <header className="tenant-head">
        <div className="tenant-logo" style={{ background: tenant.color }}>{tenant.name.slice(0, 2).toUpperCase()}</div>
        <div>
          <div className="tenant-eyebrow">ERP operativo</div>
          <h1>{tenant.name}</h1>
          {[tenant.niche, tenant.city, tenant.country].filter(Boolean).length > 0 && (
            <p>{[tenant.niche, tenant.city, tenant.country].filter(Boolean).join(" · ")}</p>
          )}
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <Tag tone={tenant.status === "active" ? "green" : "amber"} dot>{STATUS[tenant.status] || tenant.status}</Tag>
          <button className="btn" onClick={logout}>Salir</button>
        </div>
      </header>

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
            <Bars height={150} data={(overview?.sales || []).map((row) => ({ label: monthLabel(row.month), value: row.total }))} />
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
          <Panel title="Pedidos recientes" subtitle="Haz clic en un pedido para ver su detalle" bodyClass="tight">
            <Table compact columns={[
              { key: "number", label: "Pedido" },
              { key: "customer", label: "Cliente" },
              { key: "total", label: "Total", align: "right", render: (row) => money(row.total) },
              { key: "status", label: "Estado", render: (row) => statusTag(row.status) },
            ]} rows={overview?.recentOrders || []} onRow={openOrder} empty="Todavía no hay pedidos" />
          </Panel>
        </div>
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
          <select value={productBrand} onChange={(e) => { setProductBrand(e.target.value); setProductCategory(""); setProductPage(1); }}>
            <option value="">Todas las marcas</option>
            {(products.brands || []).map((row) => <option key={row.brand} value={row.brand}>{row.brand} ({row.total})</option>)}
          </select>
          <select value={productCategory} onChange={(e) => { setProductCategory(e.target.value); setProductPage(1); }}>
            <option value="">Todas las categorías</option>
            {(products.categories || []).map((cat) => <option key={cat.category} value={cat.category}>{cat.category} ({cat.total})</option>)}
          </select>
          <span style={{ marginLeft: "auto", color: "#8b93a1", fontSize: 11 }}>{Number(products.total || 0).toLocaleString("es-CO")} productos</span>
        </div>
        <Table compact columns={[
          { key: "sku", label: "SKU", render: (row) => <span className="mono">{row.sku}</span> },
          { key: "name", label: "Producto", render: (row) => <div><b>{row.name}</b><div style={{ color: "#8b93a1", fontSize: 10 }}>{row.brand} · {row.category} · {row.unit}</div></div> },
          { key: "price", label: "Precio", align: "right", render: (row) => money(row.price) },
          { key: "cost", label: "Costo", align: "right", render: (row) => money(row.cost) },
          { key: "stock", label: "Stock", align: "right", render: (row) => <Tag tone={row.stock <= row.min_stock ? "amber" : "green"}>{row.stock} / mín. {row.min_stock}</Tag> },
          { key: "active", label: "Estado", render: (row) => <Tag tone={row.active ? "green" : "slate"}>{row.active ? "Activo" : "Inactivo"}</Tag> },
          { key: "actions", label: "", align: "right", render: (row) => <div style={{ display: "flex", gap: 5, justifyContent: "flex-end" }}>
            <Btn size="xs" onClick={() => { setPriceTarget(row); setPriceForm({ price: String(row.price ?? "") }); setModal("price"); }}>Precio</Btn>
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

      {/* ── Cotizador masivo ───────────────────────────────────────────── */}
      {tab === "cotizaciones" && <>
        <Panel title="Cliente y productos" subtitle="Busca por nombre, SKU, marca o categoría y agrega las líneas que necesites">
          <div className="two-col">
            <Field label="Cliente">
              <select value={quoteForm.partnerId} onChange={(e) => setQuoteForm((prev) => ({ ...prev, partnerId: e.target.value }))}>
                <option value="">Selecciona un cliente…</option>
                {quoteCustomers.map((row) => (
                  <option key={row.id} value={row.id}>{row.name}{row.document ? ` · ${row.document}` : ""}</option>
                ))}
              </select>
            </Field>
            <Field label="Notas / referencia" hint="Opcional; viaja en la cotización">
              <input value={quoteForm.notes} onChange={(e) => setQuoteForm((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Ej. Cotización para pedido de octubre" />
            </Field>
          </div>
          <div className="filter-row" style={{ marginTop: 12, marginBottom: 10 }}>
            <input placeholder="Buscar producto o SKU…" value={quoteSearch}
              onChange={(e) => setQuoteSearch(e.target.value)} style={{ width: 280 }} />
            <select value={quoteBrand} onChange={(e) => { setQuoteBrand(e.target.value); setQuoteCategory(""); }}>
              <option value="">Todas las marcas</option>
              {(quoteFacets.brands || []).map((row) => <option key={row.brand} value={row.brand}>{row.brand} ({row.total})</option>)}
            </select>
            <select value={quoteCategory} onChange={(e) => setQuoteCategory(e.target.value)}>
              <option value="">Todas las categorías</option>
              {(quoteFacets.categories || []).map((row) => <option key={row.category} value={row.category}>{row.category} ({row.total})</option>)}
            </select>
            <Btn size="xs" tone="primary" onClick={addAllQuoteResults} disabled={!quoteResults.length}>
              Agregar resultados ({quoteResults.length})
            </Btn>
          </div>
          <div className="result-grid">
            <Table compact columns={[
              { key: "sku", label: "SKU", render: (row) => <span className="mono">{row.sku}</span> },
              { key: "name", label: "Producto", render: (row) => <div><b>{row.name}</b><div style={{ color: "#8b93a1", fontSize: 10 }}>{row.brand} · {row.category}</div></div> },
              { key: "price", label: "Precio c/IVA", align: "right", render: (row) => money(row.price) },
              { key: "stock", label: "Stock", align: "right" },
              { key: "add", label: "", align: "right", render: (row) => <Btn size="xs" onClick={() => addQuoteLine(row)}>＋</Btn> },
            ]} rows={quoteResults} empty="Escribe para buscar productos del catálogo" />
          </div>
        </Panel>

        <Panel title="Líneas de la cotización" subtitle="Precio con IVA incluido · el subtotal sin IVA se calcula automáticamente"
          actions={<Btn onClick={newQuote}>Limpiar</Btn>}>
          <div className="line-grid">
            <Table compact columns={[
              { key: "sku", label: "SKU", render: (row) => <span className="mono">{row.sku}</span> },
              { key: "name", label: "Producto", render: (row) => <div><b>{row.name}</b><div style={{ color: "#8b93a1", fontSize: 10 }}>{[row.brand, row.category].filter(Boolean).join(" · ")}</div></div> },
              { key: "qty", label: "Cant.", align: "right", render: (row) => <input className="cell-input" type="number" min="1" step="1" value={row.quantity} onChange={(e) => updateQuoteLine(row.key, "quantity", e.target.value)} /> },
              { key: "price", label: "P. unit. c/IVA", align: "right", render: (row) => <input className="cell-input" type="number" min="0" step="0.01" value={row.price} onChange={(e) => updateQuoteLine(row.key, "price", e.target.value)} /> },
              { key: "net", label: "Subtotal s/IVA", align: "right", render: (row) => money(row.price * row.quantity / 1.19) },
              { key: "tax", label: "IVA", align: "right", render: (row) => money(row.price * row.quantity - row.price * row.quantity / 1.19) },
              { key: "total", label: "Total", align: "right", render: (row) => <b>{money(row.price * row.quantity)}</b> },
              { key: "remove", label: "", align: "right", render: (row) => <Btn size="xs" onClick={() => removeQuoteLine(row.key)}>×</Btn> },
            ]} rows={quoteLines} empty="Agrega productos desde el buscador de arriba" />
          </div>
          <div className="filter-row" style={{ marginTop: 10, marginBottom: 0 }}>
            <span style={{ color: "#8b93a1", fontSize: 11 }}>Cantidad para todas las líneas</span>
            <input className="cell-input" type="number" min="1" step="1" value={bulkQty} onChange={(e) => setBulkQty(e.target.value)} style={{ width: 90 }} />
            <Btn size="xs" onClick={applyBulkQty} disabled={!quoteLines.length}>Aplicar a todas</Btn>
            <div style={{ marginLeft: "auto", display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
              <span><small style={{ color: "#8b93a1" }}>Líneas</small> <b>{quoteLines.length}</b></span>
              <span><small style={{ color: "#8b93a1" }}>Unidades</small> <b>{quoteTotals.units}</b></span>
              <span><small style={{ color: "#8b93a1" }}>Subtotal</small> <b>{money(quoteTotals.subtotal)}</b></span>
              <span><small style={{ color: "#8b93a1" }}>IVA</small> <b>{money(quoteTotals.tax)}</b></span>
              <span style={{ fontSize: 16 }}><small style={{ color: "#8b93a1", fontSize: 11 }}>Total</small> <b>{money(quoteTotals.total)}</b></span>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
            <Btn onClick={saveQuote} disabled={busy || !quoteLines.length || !quoteForm.partnerId}>
              {activeQuote ? "Guardar cambios" : "Guardar cotización"}
            </Btn>
            <Btn tone="primary" icon="＋" onClick={() => convertQuote()} disabled={busy || !activeQuote || !quoteLines.length}>
              Convertir a factura
            </Btn>
          </div>
          {activeQuote && <div className="callout green" style={{ marginTop: 10 }}>
            Cotización activa: <b>{activeQuote.number}</b> · guarda los cambios antes de facturar.
          </div>}
        </Panel>

        <Panel title="Cotizaciones guardadas" subtitle="Cárgalas para editarlas o factúralas directamente" bodyClass="tight">
          <Table compact columns={[
            { key: "number", label: "Cotización", render: (row) => <span className="mono">{row.number}</span> },
            { key: "partner", label: "Cliente" },
            { key: "lines", label: "Líneas", align: "right" },
            { key: "total", label: "Total", align: "right", render: (row) => money(row.total) },
            { key: "status", label: "Estado", render: (row) => <Tag tone={row.converted_invoice ? "green" : "indigo"} dot>{row.converted_invoice ? `Facturada · ${row.converted_invoice}` : "Borrador"}</Tag> },
            { key: "actions", label: "", align: "right", render: (row) => <div style={{ display: "flex", gap: 5, justifyContent: "flex-end" }}>
              <Btn size="xs" onClick={() => loadQuote(row)}>Cargar</Btn>
              {!row.converted_invoice && <Btn size="xs" tone="primary" onClick={() => convertQuote(row.id)}>Facturar</Btn>}
            </div> },
          ]} rows={quotes} empty="Aún no hay cotizaciones guardadas" />
        </Panel>
      </>}

      {/* ── Finanzas ────────────────────────────────────────────────────── */}
      {tab === "facturacion" && <>
        <div className="stat-grid" style={{ gridTemplateColumns: "repeat(5,1fr)" }}>
          <Stat label="Facturado" value={compact(finance.kpis?.invoiced)} icon="↗" tone="green" hint={`${finance.kpis?.open_invoices || 0} facturas pendientes`} />
          <Stat label="Cobrado" value={compact(finance.kpis?.collected)} icon="◎" tone="indigo" />
          <Stat label="Por cobrar" value={compact(finance.kpis?.receivable)} icon="⏱" tone="amber" />
          <Stat label="Cotizado" value={compact(finance.kpis?.quoted)} icon="▤" tone="amber" hint={`${finance.kpis?.open_quotes || 0} cotizaciones abiertas`} />
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
          <Panel title="Cotizar y facturar" subtitle="Para decenas o cientos de líneas usa el cotizador; el pedido suelto sigue disponible aquí">
            <div className="filter-row">
              <Btn tone="primary" icon="＋" onClick={() => setTab("cotizaciones")}>Abrir cotizador</Btn>
            </div>
            <div className="filter-row" style={{ marginBottom: 0 }}>
              <select value={financeForm.orderId} onChange={(e) => setFinanceForm((prev) => ({ ...prev, orderId: e.target.value }))} style={{ minWidth: 260 }}>
                <option value="">Facturar un pedido suelto…</option>
                {(finance.invoiceableOrders || []).map((row) => (
                  <option key={row.id} value={row.id}>{row.number} · {row.partner} · {money(row.total)}</option>
                ))}
              </select>
              <Btn onClick={issueInvoice} disabled={busy || !financeForm.orderId}>Emitir factura</Btn>
            </div>
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

        <div className="chart-grid">
          <Panel title="Libro contable" subtitle="Cada documento genera débito y crédito" bodyClass="tight">
            <Table compact columns={[
              { key: "number", label: "Asiento", render: (row) => <span className="mono">{row.number}</span> },
              { key: "entry_date", label: "Fecha", render: (row) => dateLabel(row.entry_date) },
              { key: "description", label: "Descripción" },
              { key: "total_debit", label: "Débito", align: "right", render: (row) => money(row.total_debit) },
            ]} rows={finance.entries || []} empty="Aún no hay asientos contables" />
          </Panel>
          <Panel title="Pagos registrados" subtitle="Cobros aplicados a facturas" bodyClass="tight">
            <Table compact columns={[
              { key: "number", label: "Pago", render: (row) => <span className="mono">{row.number}</span> },
              { key: "payment_date", label: "Fecha", render: (row) => dateLabel(row.payment_date) },
              { key: "amount", label: "Valor", align: "right", render: (row) => money(row.amount) },
              { key: "status", label: "Estado", render: (row) => financeTag(row.status) },
            ]} rows={finance.payments || []} empty="Todavía no hay pagos registrados" />
          </Panel>
        </div>
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

      {/* ── Utilidades ──────────────────────────────────────────────────── */}
      {tab === "utilidades" && <>
        <div className="stat-grid" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
          <Stat label="Ventas al cliente" value={money0(margins.kpis?.salesGross)} icon="↗" tone="indigo" hint="Precio final con IVA" />
          <Stat label="Ventas sin IVA" value={money0(margins.kpis?.salesNet)} icon="▤" tone="slate" hint={`IVA ${margins.ivaRate}% incluido`} />
          <Stat label="Costo de proveedor" value={money0(margins.kpis?.cogs)} icon="↙" tone="amber" hint="Sin registro en la fuente; regístralo al recibir compras" />
          <Stat label="Utilidad bruta" value={money0(margins.kpis?.grossProfit)} icon="◎" tone="green" hint={`${Number(margins.kpis?.marginPct || 0).toFixed(1)}% sobre venta neta`} />
        </div>

        <Panel
          title="Sincronización de precios con Samjuro"
          subtitle="Solo escribe el precio autorizado en la fila correspondiente de Supabase"
          actions={<Btn tone="primary" icon="↗" disabled={busy} onClick={syncPrices}>Sincronizar precios</Btn>}
          bodyClass="tight">
          <div className="stat-grid" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
            <Stat label="Pendientes" value={Number(priceSync.summary?.pending || 0)} icon="◷" tone="amber" />
            <Stat label="Sincronizados" value={Number(priceSync.summary?.synced || 0)} icon="✓" tone="green" />
            <Stat label="Con error" value={Number(priceSync.summary?.failed || 0)} icon="!" tone="rose" />
          </div>
          <p style={{ color: "#8b93a1", fontSize: 12, padding: "12px 16px 0" }}>
            {priceSync.configured
              ? "Escritura habilitada: se actualizan únicamente presentaciones.precio y productos.precio_referencia. Nunca se borra nada ni se tocan pedidos."
              : "La credencial de escritura aún no está configurada. Puedes editar precios en Productos; los cambios quedarán pendientes y no se escribirá nada en Supabase."}
          </p>
          <Table compact columns={[
            { key: "sku", label: "SKU", render: (row) => <span className="mono">{row.sku}</span> },
            { key: "change", label: "Cambio", render: (row) => `${money(row.old_price)} → ${money(row.new_price)}` },
            { key: "target", label: "Destino", render: (row) => `${row.source_table}.${row.column_name}` },
            { key: "status", label: "Estado", render: (row) => <Tag tone={{ pending: "amber", synced: "green", failed: "rose" }[row.status] || "slate"}>{row.status}</Tag> },
            { key: "attempts", label: "Intentos", align: "right" },
            { key: "last_error", label: "Detalle", render: (row) => row.last_error || dateLabel(row.synced_at) },
          ]} rows={priceSync.changes || []} empty="No hay cambios de precio registrados" />
        </Panel>

        <Panel title="Cómo se calcula la utilidad" subtitle="El IVA no es ganancia: se resta antes de calcular el margen">
          <div className="kv">
            <div><span>Precio final al cliente</span><strong>{money0(margins.byItem?.[0]?.sale_price)}</strong></div>
            <div><span>Precio sin IVA ({margins.ivaRate}%)</span><strong>{money0(margins.byItem?.[0]?.unitNet)}</strong></div>
            <div><span>IVA recaudado</span><strong>{money0(margins.kpis?.iva)}</strong></div>
            <div><span>Último costo de proveedor</span><strong>{money0(margins.byItem?.[0]?.last_cost)}</strong></div>
            <div><span>Costo promedio ponderado</span><strong>{money0(margins.byItem?.[0]?.average_cost)}</strong></div>
            <div><span>Utilidad bruta total</span><strong>{money0(margins.kpis?.grossProfit)}</strong></div>
          </div>
          <p style={{ color: "#8b93a1", fontSize: 12, marginTop: 12 }}>
            Lo que el cliente paga incluye IVA. Para saber la utilidad real se quita el IVA al precio de venta y se resta el costo que registres al recibir la mercancía del proveedor. La Supabase de Samjuro no tenía costos, por eso aparecen en $0 hasta registrarlos aquí.
          </p>
        </Panel>

        <Panel title="Utilidad por producto" subtitle="Precio final, costo de proveedor y margen por unidad vendida" bodyClass="tight">
          <Table compact columns={[
            { key: "sku", label: "SKU", render: (row) => <span className="mono">{row.sku}</span> },
            { key: "item", label: "Producto" },
            { key: "sale_price", label: "Precio final", align: "right", render: (row) => money(row.sale_price) },
            { key: "unitNet", label: "Sin IVA", align: "right", render: (row) => money(row.unitNet) },
            { key: "last_cost", label: "Costo proveedor", align: "right", render: (row) => money(row.last_cost) },
            { key: "average_cost", label: "Costo promedio", align: "right", render: (row) => money(row.average_cost) },
            { key: "units_sold", label: "Vendidas", align: "right" },
            { key: "profit", label: "Utilidad", align: "right", render: (row) => money(row.profit) },
            { key: "marginPct", label: "Margen", align: "right", render: (row) => `${Number(row.marginPct || 0).toFixed(1)}%` },
          ]} rows={margins.byItem || []} empty="Todavía no hay productos con ventas" />
        </Panel>

        <Panel title="Utilidad por pedido" subtitle="Cada venta con su costo y su margen" bodyClass="tight">
          <Table compact columns={[
            { key: "number", label: "Pedido", render: (row) => <span className="mono">{row.number}</span> },
            { key: "customer", label: "Cliente" },
            { key: "created_at", label: "Fecha", render: (row) => dateLabel(row.created_at) },
            { key: "gross", label: "Cobrado", align: "right", render: (row) => money(row.gross) },
            { key: "net", label: "Sin IVA", align: "right", render: (row) => money(row.net) },
            { key: "cogs", label: "Costo", align: "right", render: (row) => money(row.cogs) },
            { key: "profit", label: "Utilidad", align: "right", render: (row) => money(row.profit) },
            { key: "marginPct", label: "Margen", align: "right", render: (row) => `${Number(row.marginPct || 0).toFixed(1)}%` },
          ]} rows={margins.byOrder || []} empty="Todavía no hay pedidos" />
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
        <Panel title="Empresa activa" subtitle="Las escrituras siempre quedan dentro del tenant seleccionado">
          <div className="callout">
            Las operaciones que registres en este espacio quedan aisladas dentro de Samjuro.
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
          <div className="three-col">
            <Field label="SKU"><input required value={productForm.sku} onChange={(e) => setProductForm({ ...productForm, sku: e.target.value.toUpperCase() })} placeholder="SKU-01241" /></Field>
            <Field label="Marca">
              <select value={productForm.brand} onChange={(e) => setProductForm({ ...productForm, brand: e.target.value, category: "General" })}>
                {(products.brands || []).map((row) => <option key={row.brand}>{row.brand}</option>)}
                <option>General</option>
              </select>
            </Field>
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

      <Modal open={modal === "price"} onClose={() => setModal(null)} title="Editar precio" subtitle={priceTarget ? `${priceTarget.sku} · ${priceTarget.name}` : ""}>
        <form onSubmit={submitPrice}>
          <div className="two-col">
            <Field label="Precio actual en el ERP"><input readOnly value={money(priceTarget?.price)} /></Field>
            <Field label="Nuevo precio (IVA incluido)"><input required type="number" min="1" step="0.01" value={priceForm.price} onChange={(e) => setPriceForm({ ...priceForm, price: e.target.value })} /></Field>
          </div>
          <p style={{ color: "#8b93a1", fontSize: 12, marginTop: 10 }}>
            Samjuro maneja precios con IVA incluido. El cambio queda registrado en el ERP y se aplica a Supabase solo cuando presiones «Sincronizar precios» en Utilidades. No se tocan pedidos ni otras columnas del catálogo.
          </p>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Btn onClick={() => setModal(null)}>Cancelar</Btn><Btn tone="primary" disabled={busy}>Guardar precio</Btn>
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
