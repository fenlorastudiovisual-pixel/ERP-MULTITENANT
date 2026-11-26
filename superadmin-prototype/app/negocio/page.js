"use client";

import { useEffect, useState } from "react";
import { Panel, Stat, Tag, Table } from "../../components/ui";

const STATUS = { active: "Activo", trial: "Prueba", suspended: "Suspendido", archived: "Archivado" };
const MODE = { pool: "Pool", bridge: "Bridge", silo: "Silo" };
const money = (value) => "$ " + Number(value || 0).toLocaleString("es-CO");
const dateLabel = (value) => (value ? String(value).slice(0, 10) : "—");

async function jsonRequest(url, options = {}) {
  const res = await fetch(url, { credentials: "include", ...options });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

export default function BusinessPanel() {
  const [data, setData] = useState(null);
  const [view, setView] = useState("check");
  const [error, setError] = useState("");
  const [form, setForm] = useState({ email: "", password: "", code: "" });
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaSetup, setMfaSetup] = useState(null);
  const [mfaCode, setMfaCode] = useState("");
  const [busy, setBusy] = useState(false);

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
    } finally {
      setBusy(false);
    }
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

  const { tenant, plan, limits, modules, invoices, team, email, role } = data;
  const activeModules = (modules || []).filter((m) => m.access === "included");

  return (
    <main className="tenant-shell">
      <header className="tenant-head">
        <div className="tenant-logo" style={{ background: tenant.color }}>{tenant.name.slice(0, 2).toUpperCase()}</div>
        <div>
          <div className="tenant-eyebrow">Panel del negocio · acceso por contraseña</div>
          <h1>{tenant.name}</h1>
          <p>{tenant.niche} · {tenant.city}, {tenant.country}</p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <Tag tone={tenant.status === "active" ? "green" : "amber"} dot>{STATUS[tenant.status] || tenant.status}</Tag>
          <button className="btn" onClick={logout}>Salir</button>
        </div>
      </header>

      <div className="callout">Sesión de <b>{email}</b> como <b>{role}</b>. Solo ves los datos de <b>{tenant.name}</b>.</div>

      <div className="stat-grid" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
        <Stat label="Tu plan" value={plan?.plan_name || "—"} icon="◐" />
        <Stat label="Usuarios" value={tenant.users} icon="◎" tone="green" />
        <Stat label="Facturación mensual" value={money(tenant.mrr)} icon="¤" tone="amber" />
        <Stat label="Salud del negocio" value={`${tenant.health ?? 0}%`} icon="✦" tone="rose" />
      </div>

      <div className="chart-grid">
        <Panel title="Tus módulos activos" subtitle={`${activeModules.length} de ${(modules || []).length} incluidos en tu plan`}>
          <div className="mini-list">
            {activeModules.length === 0 && <li><span>—</span>Sin módulos asignados</li>}
            {activeModules.map((module) => (
              <li key={module.label}><span>✓</span>{module.label}
                <Tag tone={module.category === "core" ? "indigo" : "violet"} style={{ marginLeft: "auto" }}>{module.category}</Tag>
              </li>
            ))}
          </div>
        </Panel>

        <Panel title="Límites de tu plan" subtitle={plan?.tagline || "Configuración contratada"}>
          <div className="kv">
            <div><small>Usuarios</small><b>{limits?.max_users ?? "—"}</b></div>
            <div><small>Sedes</small><b>{limits?.max_sites ?? "—"}</b></div>
            <div><small>Productos</small><b>{limits?.max_products ?? "—"}</b></div>
            <div><small>Facturas / mes</small><b>{limits?.max_invoices_month ?? "—"}</b></div>
            <div><small>Almacenamiento</small><b>{limits?.storage_gb ?? "—"} GB</b></div>
            <div><small>Llamadas API</small><b>{(limits?.api_calls_month ?? 0).toLocaleString("es-CO")}</b></div>
            <div><small>Idiomas</small><b>{limits?.max_languages ?? "—"}</b></div>
            <div><small>Soporte</small><b>{limits?.support_level ?? "—"}</b></div>
          </div>
        </Panel>
      </div>

      <Panel title="Seguridad de tu cuenta" subtitle="Contraseña y verificación en dos pasos">
        {error && <p className="auth-access-note">{error}</p>}
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
      </Panel>

      <Panel title="Detalle del negocio" subtitle="Datos operativos aislados por tenant">
        <div className="kv">
          <div><small>Identificador</small><b>{tenant.id}</b></div>
          <div><small>Aislamiento</small><b>{MODE[tenant.isolation] || tenant.isolation}</b></div>
          <div><small>Estado de suscripción</small><b>{STATUS[plan?.subscription_status] || tenant.status}</b></div>
          <div><small>Alta</small><b>{dateLabel(tenant.created)}</b></div>
          <div><small>Equipo</small><b>{(team || []).reduce((sum, row) => sum + row.total, 0)} miembros</b></div>
          <div><small>Roles</small><b>{(team || []).map((row) => row.role).join(", ") || "—"}</b></div>
        </div>
      </Panel>

      <Panel title="Tus facturas" subtitle="Últimos movimientos de este negocio" bodyClass="tight">
        <Table
          columns={[
            { key: "number", label: "Factura" },
            { key: "amount", label: "Valor", align: "right", render: (row) => money(row.amount) },
            { key: "status", label: "Estado", render: (row) => <Tag tone={row.status === "paid" ? "green" : "amber"}>{row.status}</Tag> },
            { key: "issued_at", label: "Fecha", render: (row) => dateLabel(row.issued_at) },
          ]}
          rows={invoices || []}
          empty="Todavía no hay facturas emitidas para este negocio"
        />
      </Panel>
    </main>
  );
}
