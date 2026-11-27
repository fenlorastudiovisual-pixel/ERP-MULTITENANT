"use client";

import { useState } from "react";
import {
  MODULES,
} from "../lib/data";
import {
  Panel, Stat, Btn, Tag, Table, Bars, Donut, Progress, Modal, Drawer, Tabs, Field, Toggle, SectionHead,
} from "./ui";

const money = (n) => "$ " + Number(n).toLocaleString("es-CO");

export function Dashboard({ ctx }) {
  const { tenants, setSection } = ctx;
  const list = Array.isArray(tenants) ? tenants : [];

  const active = list.filter((t) => t.status === "Activo").length;
  const trial = list.filter((t) => t.status === "Prueba").length;
  const mrr = list.reduce((s, t) => s + Number(t.mrr || 0), 0);
  const users = list.reduce((s, t) => s + Number(t.users || 0), 0);

  const alerts = [];
  const inactive = list.filter((t) => t.status !== "Activo");
  if (inactive.length) alerts.push({
    text: `${inactive.length} negocio(s) sin estado Activo: ${inactive.map((t) => t.name).join(", ")}.`,
    action: "Ver tenants", section: "tenants",
  });

  const activity = list.slice(0, 6).map((t) => ({
    icon: "▦", who: "Negocio registrado", target: t.name, when: String(t.created || "").slice(0, 10),
  }));

  const mrrBars = list.map((t) => ({ label: String(t.name).slice(0, 9), value: Number(t.mrr || 0) }));
  const nicheCounts = list.reduce((acc, t) => {
    const key = t.niche || "Sin nicho";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const donut = Object.entries(nicheCounts).map(([label, value]) => ({
    label, value: Math.round((value / (list.length || 1)) * 100),
  }));
  const statusRows = ["Activo", "Prueba", "Suspendido"].map((label) => ({
    label, value: list.filter((t) => t.status === label).length,
    pct: Math.round((list.filter((t) => t.status === label).length / (list.length || 1)) * 100),
  }));

  return (
    <>
      <SectionHead
        eyebrow="Centro de control"
        title="Panel de control"
        description="Vista global de los negocios reales guardados en Neon."
        actions={<Btn tone="primary" icon="◈" onClick={() => setSection("bi")}>Ver reportes</Btn>}
      />
      <div className={"callout" + (alerts.length ? " amber" : " green")}>
        <b>{alerts.length ? alerts.length + " avisos requieren tu atención." : "Sin avisos pendientes."}</b>
        {alerts[0] ? " " + alerts[0].text : ""}{" "}
        <button className="btn btn-xs" onClick={() => setSection(alerts[0]?.section || "tenants")}>Revisar ahora →</button>
      </div>
      <div className="stat-grid">
        <Stat label="Ingresos recurrentes (MRR)" value={money(mrr)} icon="¤" hint="Suma de los tenants" />
        <Stat label="Negocios activos" value={active} delta={`+${trial} en prueba`} icon="▦" tone="green" />
        <Stat label="Usuarios en la plataforma" value={users.toLocaleString("es-CO")} icon="◎" tone="amber" />
        <Stat label="Negocios registrados" value={list.length} icon="▦" tone="rose" hint="Tenants reales en Neon" />
      </div>
      <div className="chart-grid">
        <Panel title="MRR por negocio" subtitle="Suma del plan contratado por tenant">
          {mrrBars.length ? <Bars data={mrrBars} height={168} color="#6366f1" /> : <div className="empty-state"><span>▦</span><b>Sin negocios registrados</b></div>}
        </Panel>
        <Panel title="Negocios por nicho" subtitle="Distribución real de tenants">
          {donut.length
            ? <Donut items={donut.map((n, i) => ({ ...n, color: ["#6366f1", "#22c55e", "#f59e0b", "#ec4899", "#94a3b8"][i % 5] }))} />
            : <div className="empty-state"><span>◈</span><b>Sin datos de nicho</b></div>}
        </Panel>
      </div>
      <div className="two-col">
        <Panel title="Actividad reciente" subtitle="Negocios guardados" actions={<button className="btn btn-sm" onClick={() => setSection("tenants")}>Ver tenants</button>}>
          <div className="activity">
            {activity.length ? activity.map((a, i) => (
              <div className="activity-item" key={i}>
                <span className="activity-dot tenant">{a.icon}</span>
                <div><b>{a.who}</b> · <b>{a.target}</b><p>{a.when}</p></div>
                <time>{a.when}</time>
              </div>
            )) : <div className="empty-state"><span>◷</span><b>Sin actividad registrada</b></div>}
          </div>
        </Panel>
        <div>
          <Panel title="Estado de los negocios" subtitle="Distribución real por estado">
            {statusRows.map((m) => (
              <div key={m.label} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 5 }}>
                  <span>{m.label}</span><b>{m.value} · {m.pct}%</b>
                </div>
                <Progress value={m.pct} />
              </div>
            ))}
          </Panel>
          <Panel title="Alertas">
            {alerts.length ? alerts.map((a, i) => (
              <div className="alert-item medium" key={i}>
                <i className="alert-bar" /><span>{a.text}</span>
                <button className="btn btn-xs" onClick={() => setSection(a.section)}>{a.action}</button>
              </div>
            )) : <div className="callout green">No hay alertas: todos los negocios están activos y no hay leads pendientes.</div>}
          </Panel>
        </div>
      </div>
    </>
  );
}

export function Tenants({ ctx }) {
  const { tenants, setTenants, plans, setSelectedTenant, setSection, toast } = ctx;
  const [q, setQ] = useState("");
  const [plan, setPlan] = useState("todos");
  const [status, setStatus] = useState("todos");
  const [nuevo, setNuevo] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", niche: "Retail", plan: "inicio", country: "Colombia" });

  const rows = tenants.filter((t) => {
    const okQ = (t.name + t.niche + t.city).toLowerCase().includes(q.toLowerCase());
    const okP = plan === "todos" || t.plan === plan;
    const okS = status === "todos" || t.status === status;
    return okQ && okP && okS;
  });
  const create = () => {
    if (!form.name.trim()) return toast("Escribe el nombre del negocio");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) return toast("Escribe el correo del administrador del negocio");
    const t = {
      id: "t" + (tenants.length + 1), name: form.name, email: form.email.trim().toLowerCase(),
      niche: form.niche, plan: form.plan, country: form.country, city: "—", users: 1,
      status: "Prueba", mode: "Pool", mrr: 0, health: 60, color: "#6366f1",
      created: new Date().toISOString().slice(0, 10),
    };
    setTenants([t, ...tenants]); setNuevo(false);
    setForm({ name: "", email: "", niche: "Retail", plan: "inicio", country: "Colombia" });
    toast("Negocio creado con acceso para " + t.email);
  };

  return (
    <>
      <SectionHead eyebrow="Centro de control" title="Tenants" description="Todos los negocios de la plataforma: plan, estado, consumo y acceso."
        actions={<Btn tone="primary" icon="＋" onClick={() => setNuevo(true)}>Nuevo negocio</Btn>} />
      <div className="stat-grid" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
        <Stat label="Total de negocios" value={tenants.length} icon="▦" />
        <Stat label="Activos" value={tenants.filter(t => t.status === "Activo").length} icon="✓" tone="green" />
        <Stat label="En prueba" value={tenants.filter(t => t.status === "Prueba").length} icon="◷" tone="amber" />
        <Stat label="Suspendidos" value={tenants.filter(t => t.status === "Suspendido").length} icon="⊘" tone="rose" />
      </div>
      <Panel title="Directorio de negocios" subtitle="Haz clic en una fila para ver el detalle" bodyClass="tight">
        <div style={{ padding: "14px 16px 0" }} className="filter-row">
          <input placeholder="Buscar negocio, nicho o ciudad…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 280 }} />
          <select value={plan} onChange={(e) => setPlan(e.target.value)}>
            <option value="todos">Todos los planes</option>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="todos">Todos los estados</option><option>Activo</option><option>Prueba</option><option>Suspendido</option>
          </select>
          <span style={{ marginLeft: "auto", color: "#8b93a1", fontSize: 11 }}>{rows.length} resultados</span>
        </div>
        <Table columns={[
          { key: "name", label: "Negocio", render: (t) => <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ width: 28, height: 28, borderRadius: 8, background: t.color, color: "#fff", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 11 }}>{t.name.slice(0, 2).toUpperCase()}</span>
            <div><b>{t.name}</b><div style={{ color: "#8b93a1", fontSize: 10 }}>{t.niche}</div></div></div> },
          { key: "plan", label: "Plan", render: (t) => <Tag tone="indigo">{plans.find(p => p.id === t.plan)?.name || t.plan}</Tag> },
          { key: "country", label: "País / ciudad", render: (t) => <>{t.country}<div style={{ color: "#8b93a1", fontSize: 10 }}>{t.city}</div></> },
          { key: "users", label: "Usuarios", align: "right" },
          { key: "mrr", label: "MRR", align: "right", render: (t) => money(t.mrr) },
          { key: "health", label: "Salud", render: (t) => <div style={{ width: 78 }}><Progress value={t.health} tone={t.health > 75 ? "#22c55e" : t.health > 55 ? "#f59e0b" : "#ef4444"} /><small style={{ fontSize: 9, color: "#8b93a1" }}>{t.health}%</small></div> },
          { key: "mode", label: "Aislamiento", render: (t) => <Tag tone={t.mode === "Silo" ? "violet" : t.mode === "Bridge" ? "blue" : "slate"}>{t.mode}</Tag> },
          { key: "status", label: "Estado", render: (t) => <Tag tone={t.status === "Activo" ? "green" : t.status === "Prueba" ? "amber" : "red"} dot>{t.status}</Tag> },
        ]} rows={rows} onRow={(t) => setSelectedTenant(t)} />
      </Panel>

      <Drawer open={!!ctx.selectedTenant} onClose={() => setSelectedTenant(null)} title="Detalle del negocio">
        {ctx.selectedTenant && (() => {
          const t = ctx.selectedTenant;
          return <>
            <div className="drawer-hero">
              <div className="drawer-logo" style={{ background: t.color }}>{t.name.slice(0, 2).toUpperCase()}</div>
              <div><h3>{t.name}</h3><p>{t.niche} · {t.city}, {t.country}</p></div>
              <div style={{ marginLeft: "auto" }}><Tag tone={t.status === "Activo" ? "green" : "amber"} dot>{t.status}</Tag></div>
            </div>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 14 }}>
              <Btn size="sm" icon="◐" onClick={() => { setSection("plans"); setSelectedTenant(null); }}>Cambiar plan</Btn>
              <Btn size="sm" icon="⧉" onClick={() => { const c = { ...t, id: "t" + (tenants.length + 1), name: t.name + " (copia)", status: "Prueba", mrr: 0 }; setTenants([c, ...tenants]); toast("Negocio clonado"); setSelectedTenant(null); }}>Clonar</Btn>
              <Btn tone="danger" size="sm" onClick={() => { setTenants(tenants.map(x => x.id === t.id ? { ...x, status: x.status === "Suspendido" ? "Activo" : "Suspendido" } : x)); setSelectedTenant(null); toast("Estado actualizado"); }}>
                {t.status === "Suspendido" ? "Reactivar" : "Suspender"}
              </Btn>
            </div>
            <Tabs tabs={[{ id: "res", label: "Resumen" }, { id: "mod", label: "Módulos" }, { id: "usr", label: "Usuarios" }, { id: "aud", label: "Auditoría" }]} value={ctx.detailTab || "res"} onChange={ctx.setDetailTab} />
            {(ctx.detailTab || "res") === "res" && <>
              <div className="kv">
                <div><small>Plan actual</small><b>{plans.find(p => p.id === t.plan)?.name}</b></div>
                <div><small>Aislamiento</small><b>{t.mode}</b></div>
                <div><small>Usuarios</small><b>{t.users}</b></div>
                <div><small>MRR</small><b>{money(t.mrr)}</b></div>
                <div><small>Salud del cliente</small><b>{t.health}%</b></div>
                <div><small>Alta</small><b>{t.created}</b></div>
                <div><small>Correo de acceso</small><b>{t.email || "—"}</b></div>
              </div>
              <Field label="Cambiar correo de acceso del negocio">
                <input
                  type="email"
                  value={t.email || ""}
                  placeholder="administrador@empresa.com"
                  onChange={(e) => {
                    const email = e.target.value.toLowerCase();
                    setTenants(tenants.map((x) => x.id === t.id ? { ...x, email } : x));
                    setSelectedTenant({ ...t, email });
                  }}
                />
              </Field>
              <Panel title="Consumo del periodo"><div className="limit-grid">
                <div className="limit-box"><label>Facturas del mes</label><input value="3.240" readOnly /></div>
                <div className="limit-box"><label>API calls</label><input value="482.100" readOnly /></div>
                <div className="limit-box"><label>Almacenamiento</label><input value="31 GB" readOnly /></div>
              </div></Panel>
            </>}
            {(ctx.detailTab || "res") === "mod" && <Panel title="Módulos activos">
              {MODULES.filter((_, i) => i % 3 !== 0).map((m) => <div className="mini-list" key={m.id}><li><span>✓</span>{m.label}<Tag tone="green" style={{ marginLeft: "auto" }}>Activo</Tag></li></div>)}
            </Panel>}
            {(ctx.detailTab || "res") === "usr" && <Panel title="Últimos accesos"><div className="mini-list">
              <li><span>AM</span> Ana Molina · Admin · hace 12 min</li>
              <li><span>JR</span> Juan Ríos · Ventas · hace 1 h</li>
              <li><span>LP</span> Laura Pérez · Inventario · ayer</li>
            </div></Panel>}
            {(ctx.detailTab || "res") === "aud" && <Panel title="Cambios recientes"><div className="mini-list">
              <li><span>◐</span> Plan cambiado a Empresa · hace 3 días</li>
              <li><span>✦</span> Branding actualizado · hace 8 días</li>
              <li><span>◎</span> 4 usuarios invitados · hace 12 días</li>
            </div></Panel>}
          </>;
        })()}
      </Drawer>

      <Modal open={nuevo} onClose={() => setNuevo(false)} title="Nuevo negocio" subtitle="Alta asistida en 4 pasos (demo simplificada)">
        <div className="wizard-steps"><i className="wizard-step on" /><i className="wizard-step" /><i className="wizard-step" /><i className="wizard-step" /></div>
        <Field label="Nombre del negocio"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej. Distribuidora Sol" /></Field>
        <Field label="Correo del administrador del negocio">
          <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="administrador@empresa.com" />
        </Field>
        <div className="two-col">
          <Field label="Nicho"><select value={form.niche} onChange={(e) => setForm({ ...form, niche: e.target.value })}>
            {["Retail", "Restaurante", "Distribuidora", "Manufactura", "Clínica", "Servicios", "Otro"].map((x) => <option key={x}>{x}</option>)}
          </select></Field>
          <Field label="Plan inicial"><select value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select></Field>
        </div>
        <Field label="País"><input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} /></Field>
        <div className="callout">Al crear el negocio se activarán los módulos del plan y se dará acceso a su panel con <b>este correo</b>. Ese correo debe estar permitido en la política de Access del panel.</div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Btn onClick={() => setNuevo(false)}>Cancelar</Btn><Btn tone="primary" onClick={create}>Crear negocio</Btn>
        </div>
      </Modal>
    </>
  );
}

export function Plans({ ctx }) {
  const { plans, setPlans, toast, tenants } = ctx;
  const [sel, setSel] = useState(plans[1].id);
  const plan = plans.find((p) => p.id === sel) || plans[0];
  const change = (fn) => setPlans(plans.map((p) => p.id === sel ? fn(p) : p));
  const [tab, setTab] = useState("modulos");

  return (
    <>
      <SectionHead eyebrow="Centro de control" title="Planes y funciones" description="Edita módulos incluidos, límites, banderas de funciones y precios. Los cambios impactan a los negocios del plan al instante."
        actions={<Btn icon="＋" onClick={() => { const p = { ...plan, id: "p" + Date.now(), name: "Nuevo plan", price: 49, badge: "Personalizado" }; setPlans([...plans, p]); setSel(p.id); toast("Plan clonado"); }}>Clonar plan</Btn>} />
      <div className="plan-grid">
        {plans.map((p) => (
          <div className={`plan-card ${sel === p.id ? "on" : ""}`} key={p.id} onClick={() => setSel(p.id)}>
            <div className="plan-bar" style={{ background: p.color }} />
            {p.badge && <span className="plan-badge">{p.badge}</span>}
            <h3>{p.name}</h3>
            <div className="price">{p.price ? money(p.price) : "A medida"}{p.price ? <small> /mes</small> : null}</div>
            <p>{p.tagline}</p>
            <div className="plan-mini"><span>◎ {p.limits.users === 999999 ? "∞" : p.limits.users} usuarios</span><span>▦ {p.limits.sites === 999999 ? "∞" : p.limits.sites} sedes</span></div>
            <div style={{ fontSize: 10, color: "#8b93a1", marginTop: 8 }}>
              {tenants.filter((t) => t.plan === p.id).length} negocios en este plan
            </div>
          </div>
        ))}
      </div>
      <Panel title={`Editar plan: ${plan.name}`} subtitle="Los valores se guardan en la configuración global del plan" actions={<Btn tone="primary" icon="✓" onClick={() => toast(`Plan ${plan.name} guardado`)}>Guardar cambios</Btn>}>
        <Tabs tabs={[{ id: "modulos", label: "Módulos", count: MODULES.length }, { id: "limites", label: "Límites" }, { id: "flags", label: "Funciones" }, { id: "precio", label: "Precio y texto" }]} value={tab} onChange={setTab} />
        {tab === "modulos" && <>
          <div className="callout">Define qué módulos trae el plan. <b>Incluido</b> está en el precio; <b>Add-on</b> se puede contratar aparte; <b>No disponible</b> queda oculto para el negocio.</div>
          <div className="matrix">
            {MODULES.map((m) => (
              <div className="matrix-cell" key={m.id}>
                <span>{m.label}<small style={{ display: "block", color: "#9aa1ae", fontSize: 9 }}>{m.group}</small></span>
                <select value={plan.modules[m.id] || "off"} onChange={(e) => change((p) => ({ ...p, modules: { ...p.modules, [m.id]: e.target.value } }))}>
                  <option value="included">Incluido</option><option value="addon">Add-on</option><option value="off">No disponible</option>
                </select>
              </div>
            ))}
          </div>
        </>}
        {tab === "limites" && <div className="limit-grid">
          {[
            ["users", "Usuarios"], ["sites", "Sedes"], ["products", "Productos"], ["invoices", "Facturas / mes"],
            ["storage", "Almacenamiento (GB)"], ["api", "API calls / mes"], ["languages", "Idiomas"], ["currencies", "Monedas"], ["auditDays", "Días de auditoría"],
          ].map(([k, label]) => (
            <div className="limit-box" key={k}><label>{label}</label>
              <input type="number" value={plan.limits[k]} onChange={(e) => change((p) => ({ ...p, limits: { ...p.limits, [k]: Number(e.target.value) } }))} />
            </div>
          ))}
          <div className="limit-box"><label>Soporte</label><input value={plan.limits.support} onChange={(e) => change((p) => ({ ...p, limits: { ...p.limits, support: e.target.value } }))} /></div>
        </div>}
        {tab === "flags" && <div className="two-col">
          {Object.entries(plan.flags).map(([k, v]) => (
            <Toggle key={k} label={({ tours: "Tours guiados", whatsapp: "Integración WhatsApp", einvoice: "Factura electrónica", api: "API y webhooks", whiteLabel: "White-label" })[k] || k}
              hint={`flag: ${k}`} value={v} onChange={(val) => change((p) => ({ ...p, flags: { ...p.flags, [k]: val } }))} />
          ))}
        </div>}
        {tab === "precio" && <>
          <div className="two-col">
            <Field label="Nombre del plan"><input value={plan.name} onChange={(e) => change((p) => ({ ...p, name: e.target.value }))} /></Field>
            <Field label="Precio mensual (COP)"><input type="number" value={plan.price} onChange={(e) => change((p) => ({ ...p, price: Number(e.target.value) }))} /></Field>
          </div>
          <Field label="Descripción"><textarea rows="3" value={plan.tagline} onChange={(e) => change((p) => ({ ...p, tagline: e.target.value }))} /></Field>
          <Field label="Etiqueta visible"><input value={plan.badge} onChange={(e) => change((p) => ({ ...p, badge: e.target.value }))} /></Field>
        </>}
      </Panel>
      <Panel title="Simulador de precio" subtitle="Estima el importe de un negocio con este plan">
        <div className="filter-row">
          <Field label="Usuarios"><input type="number" defaultValue="25" id="simUsers" /></Field>
          <Field label="Add-ons"><input type="number" defaultValue="2" id="simAdd" /></Field>
          <Btn tone="primary" onClick={() => {
            const u = Number(document.getElementById("simUsers").value) || 0;
            const a = Number(document.getElementById("simAdd").value) || 0;
            toast(`Estimado: ${money(plan.price + u * 4 + a * 15)} / mes`);
          }}>Calcular</Btn>
        </div>
      </Panel>
    </>
  );
}

export function Billing({ ctx }) {
  const { tenants, toast } = ctx;
  // No hay tabla de facturación en Neon: no se inventan cobros.
  const invoices = [];
  return <>
    <SectionHead eyebrow="Centro de control" title="Facturación y suscripciones" description="Cobro a los negocios: suscripciones, renovaciones, prorrateo, dunning y conciliación."
      actions={<Btn tone="primary" icon="↻" onClick={() => toast("Ciclo de facturación ejecutado")}>Ejecutar ciclo</Btn>} />
    <div className="stat-grid">
      <Stat label="MRR" value={money(tenants.reduce((s, t) => s + t.mrr, 0))} delta="+12.4%" icon="¤" />
      <Stat label="ARR proyectado" value={money(tenants.reduce((s, t) => s + t.mrr, 0) * 12)} delta="+18.2%" icon="↗" tone="green" />
      <Stat label="Facturas vencidas" value={0} icon="!" tone="rose" />
      <Stat label="Churn mensual" value="—" icon="⇣" tone="amber" />
    </div>
    <div className="chart-grid">
      <Panel title="Facturas recientes" bodyClass="tight">
        <div className="callout">No hay facturas registradas en Neon.</div>
        <Table columns={[
          { key: "id", label: "Factura", render: (r) => <span className="mono">{r.id}</span> },
          { key: "tenant", label: "Negocio" }, { key: "date", label: "Fecha" },
          { key: "amount", label: "Valor", align: "right", render: (r) => money(r.amount) },
          { key: "state", label: "Estado", render: (r) => <Tag tone={r.state === "Pagado" ? "green" : r.state === "Pendiente" ? "amber" : "red"} dot>{r.state}</Tag> },
        ]} rows={invoices} />
      </Panel>
      <div>
        <Panel title="Dunning / reintentos"><div className="callout">No hay reintentos de cobro registrados en Neon.</div></Panel>
        <Panel title="Métodos de pago"><div className="mini-list">
          <li><span>✓</span> Tarjeta de crédito / débito</li><li><span>✓</span> Transferencia bancaria</li>
          <li><span>✓</span> PSE / pasarelas locales</li><li><span>✓</span> Factura electrónica</li>
        </div></Panel>
      </div>
    </div>
  </>;
}
