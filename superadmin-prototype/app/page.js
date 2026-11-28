"use client";

import { useEffect, useMemo, useState } from "react";
import { SECTIONS, GROUPS, TENANTS_SEED, PLAN_SEED, USERS_SEED, LANGUAGES, TRANSLATIONS_SEED } from "../lib/data";
import { Dashboard, Tenants, Plans, Billing } from "../components/sections-core";
import { Users, Languages, Localization, Branding, Modules, Demos } from "../components/sections-config";
import { Security, Operations, Support, Integrations, Data, BI, Settings } from "../components/sections-ops";
import PasswordInput from "./components/PasswordInput";

const STORAGE_KEY = "erp-multitenant-superadmin-v1";
const STATE_VERSION = 2;
const PRODUCT_NAME = "ERP Multitenant";

const COMPONENTS = {
  dashboard: Dashboard, tenants: Tenants, plans: Plans, billing: Billing,
  users: Users, languages: Languages, localization: Localization, branding: Branding,
  modules: Modules, security: Security, operations: Operations,
  support: Support, demos: Demos, integrations: Integrations, data: Data, bi: BI, settings: Settings,
};

// Solo el tenant de prueba real se mantiene como respaldo local cuando no hay Neon.
const REAL_TENANT_SEED = TENANTS_SEED.filter((t) => t.id === "t16");
const SEED_TENANT_IDS = new Set(TENANTS_SEED.filter((t) => t.id !== "t16").map((t) => t.id));

const initialData = () => ({
  tenants: REAL_TENANT_SEED,
  plans: PLAN_SEED,
  users: USERS_SEED,
  languages: LANGUAGES,
  translations: TRANSLATIONS_SEED,
  leads: [],
  branding: {
    product: "ERP Multitenant", color: "#6366f1", accent: "#22c55e", font: "Inter", mode: "Claro",
    domain: "erp.tuempresa.com", whiteLabel: true, brandedEmails: true,
  },
  settings: { platform: "ERP Multitenant", currency: "COP", language: "es", signup: true },
  __stateVersion: STATE_VERSION,
});

// Los estados guardados por el prototipo mezclaban negocios semilla con tenants reales.
// Al cargar, se descarta todo lo que no viene de Neon ni de una demo convertida.
const normalizeState = (saved) => {
  const base = initialData();
  if (!saved || typeof saved !== "object") return base;
  const state = { ...base, ...saved };

  state.branding = { ...base.branding, ...(saved.branding || {}), product: PRODUCT_NAME };
  state.settings = { ...base.settings, ...(saved.settings || {}), platform: PRODUCT_NAME };

  const savedTenants = Array.isArray(saved.tenants) ? saved.tenants : [];
  const realTenants = savedTenants.filter((t) => !SEED_TENANT_IDS.has(String(t?.id)));
  const hasSamjuro = realTenants.some((t) => String(t?.id) === "t16");
  state.tenants = hasSamjuro ? realTenants : [...REAL_TENANT_SEED, ...realTenants];
  state.tenants = state.tenants.map((tenant) => ({
    ...tenant,
    email: tenant.email || base.tenants.find((item) => item.id === tenant.id)?.email || "",
  }));

  // Los leads reales viven en Neon, no en este JSON.
  state.leads = [];
  state.__stateVersion = STATE_VERSION;
  return state;
};

export default function Page() {
  const [data, setData] = useState(initialData);
  const [hydrated, setHydrated] = useState(false);
  const [dbMode, setDbMode] = useState(false);
  const [dbError, setDbError] = useState("");
  const [section, setSection] = useState("dashboard");
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [detailTab, setDetailTab] = useState("res");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [sessionUser, setSessionUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [accessMode, setAccessMode] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  // Cargar estado: primero localStorage (respaldo inmediato), luego Neon si hay sesión.
  useEffect(() => {
    let alive = true;
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setData(normalizeState(JSON.parse(saved)));
    } catch (e) { /* almacenamiento no disponible */ }

    (async () => {
      try {
        const config = await fetch("/api/auth/config").catch(() => null);
        if (config?.ok) {
          const cfg = await config.json();
          if (alive) setAccessMode(Boolean(cfg.access));
        }

        const me = await fetch("/api/auth/me", { credentials: "include" });
        if (!alive) return;
        if (!me.ok) return;
        const meJson = await me.json();
        setSessionUser(meJson.user);

        const res = await fetch("/api/state", { credentials: "include" });
        if (!alive) return;
        if (res.ok) {
          const json = await res.json();
          if (json.state && typeof json.state === "object") setData(normalizeState(json.state));
          setDbMode(true);
          setDbError("");
        } else if (res.status === 401) {
          setSessionUser(null);
        } else if (res.status >= 500) {
          let message = "BD no disponible; se usa almacenamiento local.";
          try { message = (await res.json()).error || message; } catch (e) { /* noop */ }
          setDbError(message);
        }
      } catch (e) {
        if (alive) setLoginError("No se pudo verificar la sesión.");
      } finally {
        if (alive) { setAuthReady(true); setHydrated(true); }
      }
    })();
    return () => { alive = false; };
  }, []);

  // Persistir cambios: Neon cuando hay conexión, localStorage como respaldo.
  useEffect(() => {
    if (!hydrated) return;
    if (!dbMode) {
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) { /* sin espacio o bloqueado */ }
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/state", {
          method: "PUT",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ state: data }),
        });
        if (!res.ok) {
          let message = `HTTP ${res.status}`;
          try { message = (await res.json()).error || message; } catch (e) { /* noop */ }
          throw new Error(message);
        }
        setDbError("");
      } catch (e) {
        setDbError(`No se pudo guardar en Neon: ${e.message}`);
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [data, hydrated, dbMode]);

  const toast = (msg) => setNotice(msg);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(""), 3200);
    return () => clearTimeout(id);
  }, [notice]);

  const setValue = (key) => (value) => setData((prev) => ({ ...prev, [key]: value }));
  const resetData = () => {
    setData(initialData());
    setSelectedTenant(null);
    setSection("dashboard");
    try { window.localStorage.removeItem(STORAGE_KEY); } catch (e) { /* noop */ }
    if (dbMode) {
      fetch("/api/state", { method: "DELETE", credentials: "include" }).catch((e) => setDbError(`No se pudo reiniciar en Neon: ${e.message}`));
    }
  };

  const submitLogin = async (event) => {
    event.preventDefault();
    setLoginError("");
    setLoggingIn(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setSessionUser(json.user);
      setLoginPassword("");
      setDbMode(false);
      setHydrated(false);

      const stateRes = await fetch("/api/state", { credentials: "include" });
      if (stateRes.ok) {
        const saved = await stateRes.json();
        if (saved.state && typeof saved.state === "object") setData(normalizeState(saved.state));
        setDbMode(true);
        setDbError("");
      }
      setHydrated(true);
      setNotice(`Bienvenido, ${json.user.email}`);
    } catch (error) {
      setLoginError(error.message || "No se pudo iniciar sesión");
    } finally {
      setLoggingIn(false);
    }
  };

  const logout = async () => {
    if (accessMode) {
      window.location.href = "/cdn-cgi/access/logout";
      return;
    }
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
    setSessionUser(null);
    setDbMode(false);
    setData(initialData());
    try { window.localStorage.removeItem(STORAGE_KEY); } catch (e) { /* noop */ }
    setNotice("Sesión cerrada");
  };

  const current = SECTIONS.find((s) => s.id === section) || SECTIONS[0];
  const Active = COMPONENTS[section] || Dashboard;

  const ctx = useMemo(() => ({
    ...data,
    section, setSection,
    tenants: data.tenants, setTenants: setValue("tenants"),
    plans: data.plans, setPlans: setValue("plans"),
    users: data.users, setUsers: setValue("users"),
    languages: data.languages, setLanguages: setValue("languages"),
    translations: data.translations, setTranslations: setValue("translations"),
    leads: data.leads, setLeads: setValue("leads"),
    branding: data.branding, setBranding: setValue("branding"),
    settings: data.settings, setSettings: setValue("settings"),
    selectedTenant, setSelectedTenant,
    detailTab, setDetailTab,
    toast, resetData,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [data, section, selectedTenant, detailTab]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const secs = SECTIONS.filter((s) => s.label.toLowerCase().includes(q)).map((s) => ({ id: s.id, label: s.label, kind: "Sección", icon: s.icon }));
    const tnts = data.tenants.filter((t) => t.name.toLowerCase().includes(q) || t.niche.toLowerCase().includes(q)).slice(0, 5)
      .map((t) => ({ id: t.id, label: t.name, kind: "Negocio", icon: "▦" }));
    return [...secs, ...tnts].slice(0, 8);
  }, [query, data.tenants]);

  const go = (id, kind) => {
    setQuery("");
    if (kind === "Negocio") {
      const t = data.tenants.find((x) => x.id === id);
      setSection("tenants"); setSelectedTenant(t || null);
    } else setSection(id);
  };

  if (!authReady) {
    return <div className="auth-screen"><div className="auth-card auth-loading"><span className="brand-mark">E</span><p>Verificando sesión…</p></div></div>;
  }

  if (!sessionUser) {
    if (accessMode) {
      return (
        <div className="auth-screen">
          <div className="auth-card">
            <span className="brand-mark">E</span>
            <h1>ERP Multitenant</h1>
            <p className="auth-subtitle">Acceso protegido por Cloudflare Access</p>
            <p className="auth-access-note">Tu sesión no está activa. Recarga la página para entrar con tu cuenta de Google o con el código enviado a tu correo.</p>
            <button className="btn btn-primary auth-submit" onClick={() => window.location.reload()}>Volver a entrar</button>
          </div>
        </div>
      );
    }
    return (
      <div className="auth-screen">
        <form className="auth-card" onSubmit={submitLogin}>
          <span className="brand-mark">E</span>
          <h1>ERP Multitenant</h1>
          <p className="auth-subtitle">Panel del Super Admin</p>
          <label className="field">
            <span className="field-label">Correo electrónico</span>
            <input type="email" autoComplete="username" required value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} placeholder="admin@tudominio.com" />
          </label>
          <label className="field">
            <span className="field-label">Contraseña</span>
            <PasswordInput
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              placeholder="Mínimo 12 caracteres"
            />
          </label>
          {loginError && <div className="auth-error">{loginError}</div>}
          <button className="btn btn-primary auth-submit" type="submit" disabled={loggingIn}>
            {loggingIn ? "Entrando…" : "Entrar al panel"}
          </button>
          <p className="auth-foot">Acceso restringido al Super Admin</p>
        </form>
      </div>
    );
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">E</span>
          <div><b>ERP Multitenant</b><small>Super Admin</small></div>
        </div>
        <nav className="nav">
          {GROUPS.map((group) => (
            <div key={group}>
              <div className="nav-group">{group}</div>
              {SECTIONS.filter((s) => s.group === group).map((s) => (
                <button key={s.id} className={`nav-item ${section === s.id ? "on" : ""}`} onClick={() => { setSection(s.id); setSelectedTenant(null); }}>
                  <i>{s.icon}</i><span>{s.label}</span>
                  {s.id === "support" && <span className="nav-badge">4</span>}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">ERP v0.2.0 · {dbMode ? "Neon conectado" : "Datos locales"}<br />{SECTIONS.length} secciones · tenants reales</div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="crumb">Super Admin <span style={{ margin: "0 7px" }}>/</span> <b>{current.label}</b></div>
          <div className="topbar-right">
            <div className="searchbox">
              <span>⌕</span>
              <input placeholder="Buscar sección o negocio…" value={query} onChange={(e) => setQuery(e.target.value)} />
              {results.length > 0 && <div className="search-results">
                {results.map((r) => <button key={r.kind + r.id} onClick={() => go(r.id, r.kind)}>
                  <i>{r.icon}</i><span>{r.label}</span><small>{r.kind}</small>
                </button>)}
              </div>}
            </div>
            <button className="icon-btn" title="Ayuda" onClick={() => toast("Guía rápida: elige una sección en el menú lateral")}>?</button>
            <button className="icon-btn" title="Notificaciones" onClick={() => setSection("operations")}>🔔<span className="notif-dot" /></button>
            <div className="user-chip" title={`${sessionUser.email} · Super Admin`}>
              <span className="avatar">{(sessionUser.email || "SA").slice(0, 2).toUpperCase()}</span>
              <button className="btn btn-sm" onClick={logout}>Salir</button>
            </div>
          </div>
        </header>
        <div className="content">
          {dbError && <div className="impersonate" style={{ borderColor: "#f59e0b" }}>⚠ {dbError}</div>}
          <Active ctx={ctx} />
        </div>
      </main>

      {notice && <div className="toast"><i>✓</i>{notice}</div>}
    </div>
  );
}
