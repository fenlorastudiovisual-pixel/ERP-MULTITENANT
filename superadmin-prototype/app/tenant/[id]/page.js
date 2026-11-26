"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Panel, Stat, Tag, Table } from "../../../components/ui";

const STATUS = { active: "Activo", trial: "Prueba", suspended: "Suspendido", archived: "Archivado" };
const MODE = { pool: "Pool", bridge: "Bridge", silo: "Silo" };
const money = (value) => "$ " + Number(value || 0).toLocaleString("es-CO");
const dateLabel = (value) => (value ? String(value).slice(0, 10) : "—");

export default function TenantPage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/tenant/${id}`, { credentials: "include" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
        if (alive) setData(json);
      } catch (err) {
        if (alive) setError(err.message || "No se pudo cargar el negocio");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id]);

  if (loading) {
    return <div className="auth-screen"><div className="auth-card"><span className="brand-mark">E</span>
      <h1>Cargando negocio…</h1><p className="auth-subtitle">Leyendo datos aislados por tenant.</p></div></div>;
  }

  if (error) {
    return <div className="auth-screen"><div className="auth-card"><span className="brand-mark">E</span>
      <h1>ERP Multitenant</h1><p className="auth-subtitle">Vista del cliente</p>
      <p className="auth-access-note">{error}</p>
      <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>Reintentar</button>
        <Link className="btn" href="/">Volver al panel</Link>
      </div></div></div>;
  }

  const { tenant, plan, limits, modules, invoices, team } = data;
  const activeModules = (modules || []).filter((m) => m.access === "included");

  return (
    <main className="tenant-shell">
      <header className="tenant-head">
        <div className="tenant-logo" style={{ background: tenant.color }}>{tenant.name.slice(0, 2).toUpperCase()}</div>
        <div>
          <div className="tenant-eyebrow">Vista del cliente · acceso aislado por RLS</div>
          <h1>{tenant.name}</h1>
          <p>{tenant.niche} · {tenant.city}, {tenant.country}</p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <Tag tone={tenant.status === "active" ? "green" : "amber"} dot>{STATUS[tenant.status] || tenant.status}</Tag>
          <Link className="btn btn-primary" href="/">Volver al panel</Link>
        </div>
      </header>

      <div className="callout">Estás viendo <b>solo los datos de {tenant.name}</b>. La consulta se ejecutó con su contexto de tenant; el Super Admin queda registrado en auditoría.</div>

      <div className="stat-grid" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
        <Stat label="Plan contratado" value={plan?.plan_name || "—"} icon="◐" />
        <Stat label="Usuarios" value={tenant.users} icon="◎" tone="green" />
        <Stat label="Facturación mensual" value={money(tenant.mrr)} icon="¤" tone="amber" />
        <Stat label="Salud del negocio" value={`${tenant.health ?? 0}%`} icon="✦" tone="rose" />
      </div>

      <div className="chart-grid">
        <Panel title="Módulos activos" subtitle={`${activeModules.length} de ${(modules || []).length} incluidos en el plan`}>
          <div className="mini-list">
            {activeModules.length === 0 && <li><span>—</span>Sin módulos asignados</li>}
            {activeModules.map((module) => (
              <li key={module.label}><span>✓</span>{module.label}
                <Tag tone={module.category === "core" ? "indigo" : "violet"} style={{ marginLeft: "auto" }}>{module.category}</Tag>
              </li>
            ))}
          </div>
        </Panel>

        <Panel title="Límites del plan" subtitle={plan?.tagline || "Configuración contratada"}>
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

      <Panel title="Detalle del negocio" subtitle="Datos operativos de este tenant en Neon">
        <div className="kv">
          <div><small>Identificador</small><b>{tenant.id}</b></div>
          <div><small>Aislamiento</small><b>{MODE[tenant.isolation] || tenant.isolation}</b></div>
          <div><small>Estado de suscripción</small><b>{STATUS[plan?.subscription_status] || tenant.status}</b></div>
          <div><small>Alta</small><b>{dateLabel(tenant.created)}</b></div>
          <div><small>Equipo</small><b>{(team || []).reduce((sum, row) => sum + row.total, 0)} miembros</b></div>
          <div><small>Roles</small><b>{(team || []).map((row) => row.role).join(", ") || "—"}</b></div>
        </div>
      </Panel>

      <Panel title="Facturación" subtitle="Últimas facturas del negocio" bodyClass="tight">
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
