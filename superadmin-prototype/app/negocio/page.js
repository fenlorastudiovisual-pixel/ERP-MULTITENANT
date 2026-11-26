"use client";

import { useEffect, useState } from "react";
import { Panel, Stat, Tag, Table } from "../../components/ui";

const STATUS = { active: "Activo", trial: "Prueba", suspended: "Suspendido", archived: "Archivado" };
const MODE = { pool: "Pool", bridge: "Bridge", silo: "Silo" };
const money = (value) => "$ " + Number(value || 0).toLocaleString("es-CO");
const dateLabel = (value) => (value ? String(value).slice(0, 10) : "—");

export default function BusinessPanel() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/negocio/api/me", { credentials: "include" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
        if (alive) setData(json);
      } catch (err) {
        if (alive) setError(err.message || "No se pudo cargar tu negocio");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  if (loading) {
    return <div className="auth-screen"><div className="auth-card"><span className="brand-mark">E</span>
      <h1>Cargando tu negocio…</h1><p className="auth-subtitle">Verificando tu correo y tu permiso.</p></div></div>;
  }

  if (error) {
    return <div className="auth-screen"><div className="auth-card"><span className="brand-mark">E</span>
      <h1>Panel del negocio</h1><p className="auth-subtitle">ERP Multitenant</p>
      <p className="auth-access-note">{error}</p>
      <button className="btn btn-primary" onClick={() => window.location.reload()}>Reintentar</button>
    </div></div>;
  }

  const { tenant, plan, limits, modules, invoices, team, email, role } = data;
  const activeModules = (modules || []).filter((m) => m.access === "included");

  return (
    <main className="tenant-shell">
      <header className="tenant-head">
        <div className="tenant-logo" style={{ background: tenant.color }}>{tenant.name.slice(0, 2).toUpperCase()}</div>
        <div>
          <div className="tenant-eyebrow">Panel del negocio · acceso por tu correo</div>
          <h1>{tenant.name}</h1>
          <p>{tenant.niche} · {tenant.city}, {tenant.country}</p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <Tag tone={tenant.status === "active" ? "green" : "amber"} dot>{STATUS[tenant.status] || tenant.status}</Tag>
          <a className="btn" href={data.logoutUrl}>Salir</a>
        </div>
      </header>

      <div className="callout">Sesión de <b>{email}</b> como <b>{role}</b>. Solo ves los datos de <b>{tenant.name}</b>; el Super Admin no tiene acceso a este panel.</div>

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
