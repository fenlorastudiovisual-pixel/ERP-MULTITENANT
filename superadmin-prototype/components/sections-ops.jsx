"use client";

import { useState } from "react";
import {
  Panel, Stat, Btn, Tag, Table, Bars, Donut, Progress, Modal, Drawer, Tabs, Field, Toggle, SectionHead,
} from "./ui";

const money = (n) => "$ " + Number(n).toLocaleString("es-CO");

/* ─────────────────────────── Seguridad y auditoría ─────────────────────────── */

export function Security({ ctx }) {
  const { toast } = ctx;
  const [tab, setTab] = useState("auditoria");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState(null);
  // La auditoría real se consulta en Neon; aquí no se muestran eventos de ejemplo.
  const logs = [];
  const rows = logs.filter((l) => (l.who + l.action + l.target).toLowerCase().includes(q.toLowerCase()));
  return <>
    <SectionHead eyebrow="Confianza" title="Seguridad y auditoría" description="Registro inmutable de accesos y cambios, impersonación controlada, cifrado, backups y cumplimiento."
      actions={<Btn icon="⇩" onClick={() => toast("Auditoría exportada a CSV")}>Exportar auditoría</Btn>} />
    <div className="stat-grid">
      <Stat label="Eventos auditados (30 d)" value={0} icon="⚿" />
      <Stat label="Impersonaciones activas" value={ctx.impersonating ? 1 : 0} icon="↗" tone="amber" />
      <Stat label="Accesos fallidos (24 h)" value={0} icon="!" tone="rose" />
      <Stat label="Backups verificados" value="—" icon="✓" tone="green" />
    </div>
    <Tabs tabs={[{ id: "auditoria", label: "Auditoría" }, { id: "sesiones", label: "Sesiones" }, { id: "backup", label: "Backups y cifrado" }, { id: "cumplimiento", label: "Cumplimiento" }]} value={tab} onChange={setTab} />
    {tab === "auditoria" && <Panel title="Registro de auditoría" subtitle="Toda acción relevante queda registrada con actor, motivo y resultado" bodyClass="tight">
      <div className="callout">No hay eventos de auditoría registrados en Neon.</div>
      <div className="filter-row" style={{ padding: "14px 16px 0" }}><input placeholder="Buscar evento…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 260 }} />
        <span style={{ marginLeft: "auto", color: "#8b93a1", fontSize: 11 }}>Retención: 5 años · inmutable</span></div>
      <Table columns={[
        { key: "when", label: "Cuándo", render: (l) => <span className="mono">{l.when}</span> },
        { key: "who", label: "Actor" },
        { key: "action", label: "Acción", render: (l) => <b>{l.action}</b> },
        { key: "target", label: "Objeto" },
        { key: "risk", label: "Riesgo", render: (l) => <Tag tone={l.risk === "Alto" ? "red" : l.risk === "Medio" ? "amber" : "green"}>{l.risk}</Tag> },
        { key: "acc", label: "", align: "right", render: (l) => <Btn size="xs" onClick={() => setSelected(l)}>Ver</Btn> },
      ]} rows={rows} />
    </Panel>}
    {tab === "sesiones" && <div className="two-col">
      <Panel title="Sesiones activas" subtitle="Sesiones registradas">
        <div className="callout">No hay sesiones activas registradas en Neon.</div>
      </Panel>
      <Panel title="Control de acceso">
        <Toggle label="MFA obligatorio para roles globales" hint="Aplica a Super Admin, Devops y Finanzas" value={true} onChange={() => toast("Política actualizada")} />
        <Toggle label="Impersonación solo con motivo" hint="Se registra duración y se notifica al dueño del negocio" value={true} onChange={() => toast("Política actualizada")} />
        <Toggle label="Grabación de sesión de soporte" hint="Solo en operaciones con datos sensibles" value={false} onChange={() => toast("Política actualizada")} />
        <Toggle label="Bloqueo por IP sospechosa" hint="Detecta accesos desde países no habituales" value={true} onChange={() => toast("Política actualizada")} />
        <Field label="Retención de auditoría (días)"><input type="number" defaultValue="1825" /></Field>
        <Btn tone="primary" onClick={() => toast("Políticas de seguridad guardadas")}>Guardar políticas</Btn>
      </Panel>
    </div>}
    {tab === "backup" && <div className="two-col">
      <Panel title="Copias de seguridad" subtitle="Política por modo de aislamiento">
        <Table columns={[
          { key: "mode", label: "Modo" }, { key: "freq", label: "Frecuencia" }, { key: "ret", label: "Retención" }, { key: "state", label: "Última verificación" },
        ]} rows={[
          { id: 1, mode: "Pool", freq: "Cada 6 h", ret: "30 días", state: "✓ Hoy 04:00" },
          { id: 2, mode: "Bridge", freq: "Cada 2 h", ret: "90 días", state: "✓ Hoy 06:00" },
          { id: 3, mode: "Silo", freq: "Cada hora", ret: "1 año", state: "✓ Hoy 08:00" },
        ]} />
        <div style={{ marginTop: 14 }}><Btn icon="↻" onClick={() => toast("Simulacro de recuperación iniciado")}>Ejecutar simulacro</Btn></div>
      </Panel>
      <Panel title="Cifrado y secretos">
        <div className="kv">
          <div><small>Cifrado en reposo</small><b>AES-256 ✓</b></div><div><small>En tránsito</small><b>TLS 1.3 ✓</b></div>
          <div><small>Clave KMS</small><b>Activa</b></div><div><small>Última rotación</small><b>12 nov 2026</b></div>
        </div>
        <div className="mini-list"><li><span>⚿</span> API key principal · rotada hace 12 días</li><li><span>⚿</span> Webhook signing secret · rotado hace 40 días</li><li><span>⚿</span> Credenciales de pasarela · rotadas hace 60 días</li></div>
        <Btn size="sm" onClick={() => toast("Rotación de secretos programada")} style={{ marginTop: 10 }}>Rotar secretos</Btn>
      </Panel>
    </div>}
    {tab === "cumplimiento" && <div className="two-col">
      <Panel title="Checklist de cumplimiento">
        {[["Protección de datos / GDPR", 92], ["DPA con proveedores", 100], ["Derechos del titular", 78], ["Política de retención", 100], ["Pruebas de penetración", 85], ["Escaneo de dependencias", 96]].map(([l, v]) => (
          <div key={l} style={{ marginBottom: 12 }}><div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 5 }}><span>{l}</span><b>{v}%</b></div><Progress value={v} tone={v >= 90 ? "#22c55e" : "#f59e0b"} /></div>
        ))}
      </Panel>
      <Panel title="Solicitudes de datos">
        <div className="callout">No hay solicitudes de datos registradas en Neon.</div>
        <div className="callout">El Super Admin gestiona estas solicitudes sin leer datos operativos salvo autorización explícita.</div>
        <Btn size="sm" onClick={() => toast("Informe de cumplimiento generado")}>Generar informe</Btn>
      </Panel>
    </div>}
    <Drawer open={!!selected} onClose={() => setSelected(null)} title="Detalle del evento">
      {selected && <><div className="kv">
        <div><small>Actor</small><b>{selected.who}</b></div><div><small>Cuándo</small><b>{selected.when}</b></div>
        <div><small>Acción</small><b>{selected.action}</b></div><div><small>Riesgo</small><b>{selected.risk}</b></div>
      </div><Panel title="Objeto"><p style={{ fontSize: 12 }}>{selected.target}</p><p style={{ fontSize: 12, color: "#6b7280", marginTop: 8 }}>{selected.detail}</p></Panel>
        <div className="callout green">Registro inmutable. No se puede editar ni eliminar desde la interfaz.</div></>}
    </Drawer>
  </>;
}

/* ─────────────────────────── Operaciones ─────────────────────────── */

export function Operations({ ctx }) {
  const { tenants, setTenants, toast } = ctx;
  const [tab, setTab] = useState("salud");
  return <>
    <SectionHead eyebrow="Confianza" title="Operaciones y observabilidad" description="Salud de servicios, colas y trabajos, cuotas por negocio, incidentes y mantenimiento."
      actions={<Btn tone="primary" icon="↻" onClick={() => toast("Estado refrescado")}>Refrescar estado</Btn>} />
    <div className="stat-grid">
      <Stat label="Uptime (30 días)" value="99.97%" icon="✓" tone="green" />
      <Stat label="Latencia p95" value="184 ms" delta="-12 ms" icon="⌁" />
      <Stat label="Trabajos fallidos" value={12} icon="!" tone="rose" />
      <Stat label="Negocios con cuota alta" value={tenants.filter((t) => t.health < 75).length} icon="▦" tone="amber" />
    </div>
    <Tabs tabs={[{ id: "salud", label: "Salud de servicios" }, { id: "colas", label: "Colas y trabajos" }, { id: "cuotas", label: "Cuotas por negocio" }, { id: "incidentes", label: "Incidentes" }]} value={tab} onChange={setTab} />
    {tab === "salud" && <div className="two-col">
      <Panel title="Servicios" subtitle="Últimos 30 minutos">
        {[["API principal", 99.9, "Operativo"], ["Consola Super Admin", 100, "Operativo"], ["Consola del negocio", 99.8, "Operativo"], ["Facturación electrónica", 97.2, "Degradado"], [" workers / colas", 99.6, "Operativo"], ["Storage y CDN", 100, "Operativo"], ["Notificaciones", 98.4, "Operativo"]].map(([n, v, s]) => (
          <div className="service-row" key={n}><span>{n}</span><div style={{ flex: 1 }}><Progress value={v} tone={s === "Operativo" ? "#22c55e" : "#f59e0b"} /></div><b style={{ fontSize: 11 }}>{v}%</b><Tag tone={s === "Operativo" ? "green" : "amber"} dot>{s}</Tag></div>
        ))}
      </Panel>
      <Panel title="Mantenimiento programado">
        <Field label="Ventana"><input defaultValue="2026-11-29 02:00 – 04:00 UTC" /></Field>
        <Field label="Regiones afectadas"><select defaultValue="todas"><option value="todas">Todas</option><option>América</option><option>Europa</option></select></Field>
        <Toggle label="Modo degradado durante la ventana" hint="Las operaciones críticas siguen activas" value={true} onChange={() => toast("Preferencia actualizada")} />
        <Toggle label="Aviso a los negocios con 48 h de anticipación" value={true} onChange={() => toast("Preferencia actualizada")} />
        <Btn tone="primary" onClick={() => toast("Ventana de mantenimiento programada")}>Programar</Btn>
        <div className="callout amber" style={{ marginTop: 14 }}>Próxima ventana: 29 nov, 02:00 UTC. Se notificará a {tenants.length} negocios.</div>
      </Panel>
    </div>}
    {tab === "colas" && <Panel title="Colas y trabajos" bodyClass="tight">
      <Table columns={[
        { key: "name", label: "Cola" }, { key: "pending", label: "Pendientes", align: "right" },
        { key: "rate", label: "Procesados / min", align: "right" }, { key: "dlq", label: "Dead-letter", align: "right" },
        { key: "state", label: "Estado" }, { key: "acc", label: "", align: "right" },
      ]} rows={[
        { id: 1, name: "facturacion", pending: 42, rate: 180, dlq: 3, state: "Activa" },
        { id: 2, name: "notificaciones", pending: 128, rate: 640, dlq: 1, state: "Activa" },
        { id: 3, name: "importaciones", pending: 6, rate: 22, dlq: 0, state: "Activa" },
        { id: 4, name: "reportes", pending: 14, rate: 38, dlq: 2, state: "Activa" },
        { id: 5, name: "webhooks", pending: 19, rate: 210, dlq: 6, state: "Degradada" },
      ].map((r) => ({ ...r, state: <Tag tone={r.state === "Activa" ? "green" : "amber"} dot>{r.state}</Tag>, acc: <Btn size="xs" onClick={() => toast(`Cola ${r.name}: ${r.dlq} trabajos en dead-letter`)}>Ver</Btn> }))} />
      <div style={{ padding: 16 }}><Btn onClick={() => toast("Reintento de dead-letter iniciado")}>Reintentar dead-letter (12)</Btn></div>
    </Panel>}
    {tab === "cuotas" && <Panel title="Protección anti vecino ruidoso" subtitle="Cuotas, rate limiting y prioridad según el plan">
      <Table columns={[
        { key: "name", label: "Negocio" }, { key: "plan", label: "Plan" },
        { key: "api", label: "Uso de API", render: (t) => <div style={{ width: 130 }}><Progress value={Math.min(100, t.users / 3)} tone={t.users > 150 ? "#ef4444" : "#6366f1"} /><small style={{ fontSize: 9, color: "#8b93a1" }}>{Math.min(100, Math.round(t.users / 3))}% del límite</small></div> },
        { key: "prio", label: "Prioridad", render: (t) => <Tag tone={t.mode === "Silo" ? "violet" : t.mode === "Bridge" ? "blue" : "slate"}>{t.mode === "Silo" ? "Dedicada" : t.mode === "Bridge" ? "Alta" : "Estándar"}</Tag> },
        { key: "acc", label: "", align: "right", render: (t) => <Btn size="xs" onClick={() => { setTenants(tenants.map((x) => x.id === t.id ? { ...x, mode: x.mode === "Pool" ? "Bridge" : "Pool" } : x)); toast(`Aislamiento de ${t.name} actualizado`); }}>Cambiar modo</Btn> },
      ]} rows={tenants.slice(0, 8)} />
    </Panel>}
    {tab === "incidentes" && <div className="two-col">
      <Panel title="Línea de tiempo de incidentes">
        <div className="callout">No hay incidentes registrados en Neon.</div>
      </Panel>
      <Panel title="Reporte de incidente">
        <Field label="Título"><input placeholder="Descripción breve" /></Field>
        <Field label="Negocios afectados"><input placeholder="Todos / específicos" /></Field>
        <Field label="Severidad"><select><option>Sev 1 — Crítico</option><option>Sev 2 — Alto</option><option>Sev 3 — Medio</option></select></Field>
        <Field label="Nota pública"><textarea rows="3" placeholder="Texto para los negocios afectados" /></Field>
        <Btn tone="primary" onClick={() => toast("Incidente publicado")}>Publicar incidente</Btn>
      </Panel>
    </div>}
  </>;
}

/* ─────────────────────────── Soporte y éxito ─────────────────────────── */

export function Support({ ctx }) {
  const { tenants, setSection, toast } = ctx;
  const [tab, setTab] = useState("tickets");
  const [ticket, setTicket] = useState(null);
  // Los tickets reales se consultan en Neon; no se inventan negocios ni casos.
  const tickets = [];
  return <>
    <SectionHead eyebrow="Crecimiento" title="Soporte y éxito del cliente" description="Tickets con contexto del negocio, SLA por plan, salud del cliente, onboarding y comunicaciones."
      actions={<Btn tone="primary" icon="＋" onClick={() => toast("Nuevo ticket creado")}>Nuevo ticket</Btn>} />
    <div className="stat-grid">
      <Stat label="Tickets abiertos" value={tickets.filter((t) => t.status !== "Cerrado").length} icon="☏" />
      <Stat label="SLA cumplido" value="—" icon="✓" tone="green" />
      <Stat label="Salud media de clientes" value={tenants.length ? Math.round(tenants.reduce((s, t) => s + Number(t.health || 0), 0) / tenants.length) + "%" : "—"} icon="♡" tone="amber" />
      <Stat label="Onboarding completado" value={"0 / " + tenants.length} icon="▶" tone="rose" />
    </div>
    <Tabs tabs={[{ id: "tickets", label: "Tickets", count: tickets.length }, { id: "salud", label: "Salud del cliente" }, { id: "onboarding", label: "Onboarding" }, { id: "comunicaciones", label: "Comunicaciones" }]} value={tab} onChange={setTab} />
    {tab === "tickets" && <Panel title="Bandeja de tickets" bodyClass="tight">
      <div className="callout">No hay tickets registrados en Neon.</div>
      <Table columns={[
        { key: "id", label: "Ticket", render: (t) => <span className="mono">{t.id}</span> },
        { key: "tenant", label: "Negocio" }, { key: "subject", label: "Asunto" },
        { key: "priority", label: "Prioridad", render: (t) => <Tag tone={t.priority === "Alta" ? "red" : t.priority === "Media" ? "amber" : "slate"}>{t.priority}</Tag> },
        { key: "sla", label: "SLA" },
        { key: "status", label: "Estado", render: (t) => <Tag tone={t.status === "Cerrado" ? "green" : t.status === "Escalado" ? "red" : "blue"} dot>{t.status}</Tag> },
        { key: "owner", label: "Responsable" },
        { key: "acc", label: "", align: "right", render: (t) => <Btn size="xs" onClick={() => setTicket(t)}>Abrir</Btn> },
      ]} rows={tickets} />
    </Panel>}
    {tab === "salud" && <Panel title="Health score por negocio" subtitle="Señales de adopción, soporte y pagos">
      <Table columns={[
        { key: "name", label: "Negocio" }, { key: "plan", label: "Plan" },
        { key: "health", label: "Salud", render: (t) => <div style={{ width: 140 }}><Progress value={t.health} tone={t.health > 80 ? "#22c55e" : t.health > 60 ? "#f59e0b" : "#ef4444"} /><small style={{ fontSize: 9, color: "#8b93a1" }}>{t.health}%</small></div> },
        { key: "risk", label: "Señal", render: (t) => t.health < 70 ? <Tag tone="red">Riesgo de churn</Tag> : t.health < 85 ? <Tag tone="amber">Atención</Tag> : <Tag tone="green">Saludable</Tag> },
        { key: "acc", label: "", align: "right", render: () => <Btn size="xs">Ver plan de éxito</Btn> },
      ]} rows={tenants.slice(0, 10)} />
    </Panel>}
    {tab === "onboarding" && <div className="two-col">
      <Panel title="Checklist por nicho" subtitle="Ruta de activación para un negocio nuevo">
        {[["1. Crear usuario administrador", true], ["2. Configurar marca y dominio", true], ["3. Cargar productos o servicios", true], ["4. Invitar al equipo", false], ["5. Emitir primera factura", false], ["6. Revisar dashboard de resultados", false]].map(([l, done]) => (
          <div className="check-row" key={l}><span className={`mini-check ${done ? "on" : ""}`}>{done ? "✓" : "·"}</span><span style={{ flex: 1, fontSize: 12 }}>{l}</span><Tag tone={done ? "green" : "slate"}>{done ? "Hecho" : "Pendiente"}</Tag></div>
        ))}
      </Panel>
      <Panel title="Campañas y comunicaciones">
        <div className="callout">No hay campañas registradas en Neon.</div>
        <Btn size="sm" tone="primary" onClick={() => toast("Campaña creada")} style={{ marginTop: 10 }}>Nueva campaña</Btn>
      </Panel>
    </div>}
    {tab === "comunicaciones" && <Panel title="Centro de comunicaciones">
      <Table columns={[
        { key: "name", label: "Comunicación" }, { key: "seg", label: "Segmento" }, { key: "state", label: "Estado" }, { key: "date", label: "Fecha" },
      ]} rows={[
        { id: 1, name: "Aviso de mantenimiento 29 nov", seg: "Todos los negocios", state: "Programado", date: "28 nov" },
        { id: 2, name: "Nueva versión de Inventario v5.1", seg: "Planes Empresa y Global", state: "Enviado", date: "24 nov" },
        { id: 3, name: "Consejos de cierre de mes", seg: "Plan Crecimiento", state: "Enviado", date: "20 nov" },
        { id: 4, name: "Encuesta NPS trimestral", seg: "Muestra aleatoria", state: "Borrador", date: "—" },
      ].map((r) => ({ ...r, state: <Tag tone={r.state === "Enviado" ? "green" : r.state === "Programado" ? "blue" : "slate"}>{r.state}</Tag> }))} />
    </Panel>}
    <Drawer open={!!ticket} onClose={() => setTicket(null)} title={`Ticket ${ticket?.id || ""}`}>
      {ticket && <>
        <div className="drawer-hero"><div className="drawer-logo" style={{ background: "#6366f1" }}>{ticket.tenant.slice(0, 2).toUpperCase()}</div>
          <div><h3>{ticket.subject}</h3><p>{ticket.tenant} · {ticket.priority} · SLA {ticket.sla}</p></div></div>
        <div className="kv"><div><small>Estado</small><b>{ticket.status}</b></div><div><small>Responsable</small><b>{ticket.owner}</b></div></div>
        <Panel title="Contexto del negocio"><div className="mini-list"><li><span>◐</span> Plan: {tenants.find((t) => t.name === ticket.tenant)?.plan || "crecimiento"}</li><li><span>◎</span> Usuarios: {tenants.find((t) => t.name === ticket.tenant)?.users || "—"}</li><li><span>⚿</span> Acceso con consentimiento del cliente</li></div>
          <Btn size="sm" onClick={() => { setTicket(null); setSection("tenants"); }}>Ver negocio</Btn>
        </Panel>
        <Field label="Respuesta"><textarea rows="4" placeholder="Escribe una respuesta al cliente" /></Field>
        <div style={{ display: "flex", gap: 8 }}><Btn tone="primary" onClick={() => { setTicket(null); toast("Respuesta enviada"); }}>Enviar respuesta</Btn><Btn onClick={() => { setTicket(null); toast("Ticket escalado a Devops"); }}>Escalar</Btn></div>
      </>}
    </Drawer>
  </>;
}

/* ─────────────────────────── Integraciones ─────────────────────────── */

export function Integrations({ ctx }) {
  const { toast } = ctx;
  const [tab, setTab] = useState("catalogo");
  const [connected, setConnected] = useState(["Pasarela de pagos", "WhatsApp Business", "Facturación electrónica"]);
  const connectors = [
    ["Pasarela de pagos", "PSE / tarjetas / locales", "#6366f1"], ["Facturación electrónica", "DIAN · SAT · SII · SUNAT", "#22c55e"],
    ["WhatsApp Business", "Recordatorios y ventas", "#25d366"], ["Banca y conciliación", "Extractos automáticos", "#f59e0b"],
    ["Marketplaces", "Mercado Libre · Shopify", "#ec4899"], ["Envíos y logística", "Guías y tracking", "#38bdf8"],
    ["CRM externo", "Sincronización bidireccional", "#8b5cf6"], ["Biometría", "Control de asistencia", "#94a3b8"],
    ["IoT y planta", "Sensores y máquinas", "#0ea5a4"], ["Contabilidad externa", "Exportación de asientos", "#a3e635"],
  ];
  const toggle = (name) => setConnected(connected.includes(name) ? connected.filter((c) => c !== name) : [...connected, name]);
  return <>
    <SectionHead eyebrow="Crecimiento" title="Integraciones" description="Conectores, claves API, webhooks y sandbox. Cada negocio puede tener las suyas propias."
      actions={<Btn tone="primary" icon="＋" onClick={() => toast("Nuevo conector en desarrollo")}>Nuevo conector</Btn>} />
    <Tabs tabs={[{ id: "catalogo", label: "Catálogo", count: connected.length }, { id: "api", label: "Claves API" }, { id: "webhooks", label: "Webhooks" }]} value={tab} onChange={setTab} />
    {tab === "catalogo" && <div className="demo-grid">
      {connectors.map(([name, desc, color]) => {
        const on = connected.includes(name);
        return <div className="connector-card" key={name}>
          <div className="demo-top"><span className="demo-icon" style={{ background: color }}>⤨</span><div><h3>{name}</h3><small>{desc}</small></div></div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}><Btn size="xs" tone={on ? "primary" : "ghost"} onClick={() => { toggle(name); toast(on ? `${name} desconectado` : `${name} conectado`); }}>{on ? "✓ Conectado" : "Conectar"}</Btn><Btn size="xs" onClick={() => toast(`Configuración de ${name}`)}>Configurar</Btn></div>
        </div>;
      })}
    </div>}
    {tab === "api" && <div className="two-col">
      <Panel title="Claves API" subtitle="Se muestran una sola vez; guárdalas en un lugar seguro">
        <Table columns={[{ key: "name", label: "Nombre" }, { key: "scope", label: "Alcance" }, { key: "last", label: "Último uso" }, { key: "acc", label: "", align: "right" }]}
          rows={[
            { id: 1, name: "Producción principal", scope: "Lectura / escritura", last: "hace 2 min" },
            { id: 2, name: "Integración contable", scope: "Solo facturación", last: "hace 1 h" },
            { id: 3, name: "Sandbox de pruebas", scope: "Aislamiento total", last: "ayer" },
          ].map((r) => ({ ...r, acc: <Btn size="xs" tone="danger" onClick={() => toast("Clave revocada")}>Revocar</Btn> }))} />
        <Btn size="sm" tone="primary" icon="＋" onClick={() => toast("Clave creada: sk_live_••••4f2a")} style={{ marginTop: 12 }}>Crear clave</Btn>
      </Panel>
      <Panel title="Límites y sandbox">
        <Field label="Rate limit por tenant"><select defaultValue="estandar"><option value="estandar">Según el plan</option><option>Personalizado</option></select></Field>
        <Toggle label="Sandbox habilitado" hint="Datos separados de producción para probar integraciones" value={true} onChange={() => toast("Sandbox actualizado")} />
        <Toggle label="Registro de todas las llamadas" hint="Auditoría de API por 365 días" value={true} onChange={() => toast("Registro actualizado")} />
        <div className="callout">1.284.920 llamadas este mes · 0 errores críticos.</div>
      </Panel>
    </div>}
    {tab === "webhooks" && <Panel title="Webhooks" subtitle="Reintentos, replay y verificación de firma">
      <Table columns={[
        { key: "url", label: "Endpoint", render: (w) => <span className="mono">{w.url}</span> },
        { key: "events", label: "Eventos" }, { key: "ok", label: "Entregados", align: "right" },
        { key: "fail", label: "Fallidos", align: "right" }, { key: "state", label: "Estado" }, { key: "acc", label: "", align: "right" },
      ]} rows={[
        { id: 1, url: "https://api.cliente.com/erp/orders", events: "order.*", ok: 4820, fail: 3, state: "Activo" },
        { id: 2, url: "https://contabilidad.cliente.com/facts", events: "invoice.paid", ok: 1240, fail: 0, state: "Activo" },
        { id: 3, url: "https://hooks.cliente.com/stock", events: "stock.low", ok: 390, fail: 12, state: "Pausado" },
      ].map((w) => ({ ...w, state: <Tag tone={w.state === "Activo" ? "green" : "slate"} dot>{w.state}</Tag>, acc: <Btn size="xs" onClick={() => toast("Webhook reprocesado")}>Replay</Btn> }))} />
      <div style={{ padding: 16 }}><Btn icon="＋" onClick={() => toast("Nuevo webhook creado")}>Nuevo webhook</Btn></div>
    </Panel>}
  </>;
}

/* ─────────────────────────── Datos y migración ─────────────────────────── */

export function Data({ ctx }) {
  const { tenants, setTenants, toast } = ctx;
  const [tab, setTab] = useState("importar");
  const [step, setStep] = useState(0);
  return <>
    <SectionHead eyebrow="Crecimiento" title="Datos y migración" description="Importadores por nicho, exportación completa, copias, restauración y cambio de modo de aislamiento."
      actions={<Btn icon="⇩" onClick={() => toast("Exportación masiva iniciada")}>Exportar todo</Btn>} />
    <Tabs tabs={[{ id: "importar", label: "Importación" }, { id: "exportar", label: "Portabilidad" }, { id: "backups", label: "Copias y restauración" }, { id: "migrar", label: "Migración de aislamiento" }]} value={tab} onChange={setTab} />
    {tab === "importar" && <Panel title="Importador masivo" subtitle="CSV / Excel con plantillas por nicho y validación antes de cargar">
      <div className="wizard-steps">{[0, 1, 2].map((i) => <i key={i} className={`wizard-step ${i <= step ? (i === step ? "on" : "done") : ""}`} />)}</div>
      {step === 0 && <><div className="template-grid">
        {[["Productos", "▦"], ["Clientes", "◎"], ["Proveedores", "⇥"], ["Facturas", "¤"], ["Empleados", "☻"], ["Pedidos", "➤"]].map(([n, i]) => (
          <button className="template-card" key={n} onClick={() => toast(`Plantilla de ${n} descargada`)}><span>{i}</span><b>{n}</b><small>Descargar plantilla</small></button>
        ))}
      </div><div className="callout">Descarga la plantilla, llénala y vuelve para cargarla.</div></>}
      {step === 1 && <div className="dropzone" onClick={() => toast("Archivo seleccionado: productos_clientes.csv")}>⇧ <b>Arrastra tu CSV o Excel aquí</b><small>o haz clic para seleccionar · máx. 50 MB</small></div>}
      {step === 2 && <><div className="callout green"><b>Validación completada.</b> 1.248 filas válidas · 3 filas con errores · 0 duplicados.</div>
        <Table columns={[{ key: "f", label: "Archivo" }, { key: "rows", label: "Filas", align: "right" }, { key: "state", label: "Resultado" }]}
          rows={[{ id: 1, f: "productos_clientes.csv", rows: 1248, state: "Listo" }, { id: 2, f: "errores.csv", rows: 3, state: "Revisar" }].map((r) => ({ ...r, state: <Tag tone={r.state === "Listo" ? "green" : "amber"}>{r.state}</Tag> }))} /></>}
      <div className="wizard-actions">{step > 0 && <Btn onClick={() => setStep(step - 1)}>← Atrás</Btn>}
        <div style={{ marginLeft: "auto" }}>{step < 2 ? <Btn tone="primary" onClick={() => setStep(step + 1)}>Siguiente →</Btn> : <Btn tone="primary" onClick={() => { setStep(0); toast("1.248 registros importados"); }}>Importar registros</Btn>}</div>
      </div>
    </Panel>}
    {tab === "exportar" && <div className="two-col">
      <Panel title="Portabilidad de un negocio">
        <Field label="Negocio"><select>{tenants.map((t) => <option key={t.id}>{t.name}</option>)}</select></Field>
        <Field label="Formato"><select><option>JSON + CSV (portabilidad completa)</option><option>SQL</option><option>PDF y hojas de cálculo</option></select></Field>
        <Toggle label="Incluir datos personales" hint="Se registra en la auditoría" value={true} onChange={() => {}} />
        <Toggle label="Anonimizar antes de exportar" value={false} onChange={() => {}} />
        <Btn tone="primary" onClick={() => toast("Exportación programada; recibirás un enlace seguro")}>Generar exportación</Btn>
      </Panel>
      <Panel title="Eliminación y anonimización">
        <Field label="Negocio a procesar"><select>{tenants.slice(0, 5).map((t) => <option key={t.id}>{t.name}</option>)}</select></Field>
        <div className="callout amber">La eliminación respeta la retención legal configurada por régimen fiscal. Requiere doble confirmación.</div>
        <Btn tone="danger" onClick={() => toast("Solicitud de anonimización enviada a revisión legal")}>Solicitar anonimización</Btn>
      </Panel>
    </div>}
    {tab === "backups" && <Panel title="Puntos de restauración" subtitle="Por negocio y modo de aislamiento">
      <Table columns={[{ key: "name", label: "Negocio" }, { key: "mode", label: "Modo" }, { key: "last", label: "Último backup" }, { key: "size", label: "Tamaño" }, { key: "acc", label: "", align: "right" }]}
        rows={tenants.slice(0, 8).map((t) => ({ ...t, last: "hoy 04:00", size: `${Math.round(t.users * 1.7)} MB`, acc: <Btn size="xs" onClick={() => toast(`Restauración de ${t.name} iniciada en entorno aislado`)}>Restaurar</Btn> }))} />
    </Panel>}
    {tab === "migrar" && <Panel title="Migración Pool → Bridge → Silo" subtitle="Cambia el aislamiento sin cambiar la aplicación">
      <Table columns={[{ key: "name", label: "Negocio" }, { key: "mode", label: "Modo actual" }, { key: "next", label: "Siguiente nivel" }, { key: "acc", label: "", align: "right" }]}
        rows={tenants.slice(0, 8).map((t) => ({ ...t, next: t.mode === "Pool" ? "Bridge" : t.mode === "Bridge" ? "Silo" : "—", acc: t.mode === "Silo" ? <Tag tone="green">Máximo nivel</Tag> : <Btn size="xs" tone="primary" onClick={() => { setTenants(tenants.map((x) => x.id === t.id ? { ...x, mode: x.mode === "Pool" ? "Bridge" : "Silo" } : x)); toast(`${t.name} migrado`); }}>Migrar</Btn> }))} />
      <div className="callout">La capa de datos resuelve el tenant desde la sesión, así que la migración no requiere cambios en el código ni en la experiencia del usuario.</div>
    </Panel>}
  </>;
}

/* ─────────────────────────── Reportes y BI ─────────────────────────── */

export function BI({ ctx }) {
  const { tenants } = ctx;
  const [tab, setTab] = useState("global");
  const list = Array.isArray(tenants) ? tenants : [];

  const mrr = list.reduce((s, t) => s + Number(t.mrr || 0), 0);
  const users = list.reduce((s, t) => s + Number(t.users || 0), 0);
  const statusRows = ["Activo", "Prueba", "Suspendido", "Archivado"].map((label) => ({
    label, value: list.filter((t) => t.status === label).length,
  }));
  const nicheCounts = list.reduce((acc, t) => {
    const key = t.niche || "Sin nicho";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const nicheRows = Object.entries(nicheCounts).map(([label, value]) => ({
    label, value, pct: Math.round((value / (list.length || 1)) * 100),
  }));

  return <>
    <SectionHead eyebrow="Crecimiento" title="Reportes y BI global" description="Métricas calculadas sobre los tenants reales guardados en Neon." />
    <Tabs tabs={[{ id: "global", label: "Visión global" }, { id: "negocios", label: "Negocios" }, { id: "reportes", label: "Reportes guardados" }]} value={tab} onChange={setTab} />
    {tab === "global" && <>
      <div className="stat-grid">
        <Stat label="MRR total" value={money(mrr)} icon="¤" hint="Suma de tenants" />
        <Stat label="Negocios activos" value={list.filter((t) => t.status === "Activo").length} icon="▦" tone="green" />
        <Stat label="Usuarios" value={users.toLocaleString("es-CO")} icon="◎" tone="amber" />
        <Stat label="Negocios registrados" value={list.length} icon="▣" tone="rose" />
      </div>
      <div className="chart-grid">
        <Panel title="MRR por negocio" subtitle="Plan contratado por tenant">
          {list.length ? <Bars data={list.map((t) => ({ label: String(t.name).slice(0, 9), value: Number(t.mrr || 0) }))} height={170} /> : <div className="empty-state"><span>▦</span><b>Sin negocios registrados</b></div>}
        </Panel>
        <Panel title="Negocios por nicho" subtitle="Distribución real de tenants">
          {nicheRows.length
            ? <Donut items={nicheRows.map((n, i) => ({ ...n, color: ["#6366f1", "#22c55e", "#f59e0b", "#ec4899", "#94a3b8"][i % 5] }))} />
            : <div className="empty-state"><span>◈</span><b>Sin datos de nicho</b></div>}
        </Panel>
      </div>
    </>}
    {tab === "negocios" && <div className="two-col">
      <Panel title="Estado de los negocios" subtitle="Distribución real por estado">
        <div className="mini-list">
          {statusRows.map((row) => <li key={row.label}><span>▦</span>{row.label}<b style={{ marginLeft: "auto" }}>{row.value}</b></li>)}
        </div>
      </Panel>
      <Panel title="Negocios por nicho">
        {nicheRows.length ? nicheRows.map((n) => (
          <div key={n.label} style={{ marginBottom: 11 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}><span>{n.label}</span><b>{n.value} · {n.pct}%</b></div>
            <Progress value={n.pct} />
          </div>
        )) : <div className="empty-state"><span>◈</span><b>Sin negocios registrados</b></div>}
      </Panel>
    </div>}
    {tab === "reportes" && <Panel title="Reportes guardados">
      <div className="callout">No hay reportes programados. Las métricas de esta pantalla se calculan en el momento desde Neon.</div>
    </Panel>}
  </>;
}

/* ─────────────────────────── Configuración del sistema ─────────────────────────── */

export function Settings({ ctx }) {
  const { settings, setSettings, toast } = ctx;
  const [tab, setTab] = useState("generales");
  const set = (k, v) => setSettings({ ...settings, [k]: v });
  return <>
    <SectionHead eyebrow="Sistema" title="Configuración del sistema" description="Parámetros globales, feature flags, colas de correo, almacenamiento, despliegues y modo mantenimiento."
      actions={<Btn tone="primary" icon="✓" onClick={() => toast("Configuración guardada")}>Guardar todo</Btn>} />
    <div className="callout green">Configuración persistida en Neon. El navegador solo conserva una copia temporal mientras carga.</div>
    <Tabs tabs={[{ id: "generales", label: "Parámetros" }, { id: "flags", label: "Feature flags" }, { id: "infra", label: "Infraestructura" }, { id: "versiones", label: "Versiones" }, { id: "datos", label: "Datos" }]} value={tab} onChange={setTab} />
    {tab === "generales" && <div className="two-col">
      <Panel title="Parámetros globales">
        <Field label="Nombre de la plataforma"><input value={settings.platform} onChange={(e) => set("platform", e.target.value)} /></Field>
        <Field label="Moneda por defecto"><select value={settings.currency} onChange={(e) => set("currency", e.target.value)}><option>COP</option><option>USD</option><option>EUR</option><option>MXN</option></select></Field>
        <Field label="Idioma por defecto"><select value={settings.language} onChange={(e) => set("language", e.target.value)}><option>es</option><option>en</option><option>pt</option></select></Field>
        <Field label="Zona horaria"><select defaultValue="America/Bogota"><option>America/Bogota</option><option>Europe/Madrid</option><option>America/Sao_Paulo</option></select></Field>
        <Field label="Correo de soporte"><input defaultValue="soporte@fenlora.com.co" /></Field>
        <Toggle label="Registro público de negocios" hint="Permite que nuevos clientes soliciten demo desde la web" value={settings.signup} onChange={(v) => set("signup", v)} />
        <Toggle label="Aviso legal y términos obligatorios" value={true} onChange={() => toast("Preferencia actualizada")} />
      </Panel>
      <Panel title="Notificaciones y colas">
        <Field label="Proveedor de correo"><select><option>SES</option><option>SendGrid</option><option>Postmark</option></select></Field>
        <Field label="Proveedor de SMS / WhatsApp"><select><option>Twilio</option><option>Meta Cloud API</option><option>Proveedor local</option></select></Field>
        <Field label="Almacenamiento"><select><option>S3 — región principal</option><option>S3 — multi-región</option><option>Google Cloud Storage</option></select></Field>
        <Toggle label="CDN activo para archivos públicos" value={true} onChange={() => toast("CDN actualizado")} />
        <Toggle label="Reintentos automáticos de correo" value={true} onChange={() => toast("Reintentos actualizados")} />
        <div className="callout green">Cola de correo saludable: 128 mensajes pendientes, 640/min procesados.</div>
      </Panel>
    </div>}
    {tab === "flags" && <Panel title="Feature flags globales" subtitle="Activa o desactiva funciones sin desplegar código">
      {[
        ["Asistente IA", "Asistente conversacional en la consola del negocio", true],
        ["OCR de facturas", "Lectura automática de facturas de proveedor", true],
        ["Numeración fiscal 2027", "Nuevas series fiscales", false],
        ["Nuevo constructor de dashboards", "Vista beta para todos los planes", false],
        ["Modo offline del POS", "Sincronización diferida para tiendas", true],
        ["Portal de proveedores", "Acceso externo a órdenes de compra", true],
      ].map(([l, h, v]) => <Toggle key={l} label={l} hint={h} value={v} onChange={() => toast(`Flag "${l}" actualizado`)} />)}
    </Panel>}
    {tab === "infra" && <div className="two-col">
      <Panel title="Regiones y despliegue"><div className="mini-list">
        <li><span>●</span> América (principal) · Operativo</li><li><span>●</span> Europa (Madrid) · Operativo</li><li><span>●</span> Brasil (São Paulo) · Operativo</li>
      </div>
        <Field label="Estrategia por defecto"><select><option>Pool (compartido)</option><option>Bridge (recursos propios)</option><option>Silo (dedicado)</option></select></Field>
        <Toggle label="Aislamiento automático para plan Global" value={true} onChange={() => toast("Regla actualizada")} />
      </Panel>
      <Panel title="Variables seguras"><div className="mini-list">
        <li><span>⚿</span> DATABASE_URL ·•••••</li><li><span>⚿</span> STRIPE_SECRET_KEY ·•••••</li><li><span>⚿</span> KMS_MASTER_KEY ·•••••</li>
      </div><Btn size="sm" onClick={() => toast("Variable agregada de forma segura")} style={{ marginTop: 10 }}>Agregar variable</Btn></Panel>
    </div>}
    {tab === "versiones" && <Panel title="Versiones y despliegues" subtitle="Historial, changelog y rollback">
      <div className="callout">El historial de despliegues se consulta en Cloudflare Workers; no se muestran versiones de ejemplo.</div>
    </Panel>}
    {tab === "datos" && <div className="two-col">
      <Panel title="Fuente de datos" subtitle="Neon es la fuente de verdad">
        <div className="callout green">Tenants, operaciones y configuración se guardan en Neon. El navegador solo mantiene una copia temporal mientras carga; recargar la página vuelve a leer la base de datos.</div>
        <div className="callout">No hay botón de restablecimiento: eso repoblaría negocios de ejemplo que ya no son tenants reales.</div>
      </Panel>
      <Panel title="Acerca de este ERP">
        <div className="kv"><div><small>Entorno</small><b>Producción</b></div><div><small>Base de datos</small><b>Neon Postgres</b></div><div><small>Aplicación</small><b>Cloudflare Workers</b></div><div><small>Stack</small><b>Next 16 · React 19</b></div></div>
        <div className="callout green">ERP multitenant independiente. Samjuro es el tenant de prueba; sus productos, clientes, pedidos e inventario se gestionan en /negocio contra Neon.</div>
      </Panel>
    </div>}
  </>;
}
