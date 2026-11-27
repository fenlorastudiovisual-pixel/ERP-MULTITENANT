"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Panel, Tag, Btn } from "../../components/ui";

const dateLabel = (value) => (value ? String(value).slice(0, 10) : "—");

export default function DemoCenter() {
  const [rows, setRows] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({ nicheId: "d1", businessName: "", days: 14 });
  const [phones, setPhones] = useState({});
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const res = await fetch("/api/demos", { credentials: "include" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return setError(json.error || "No se pudieron cargar las demos");
      setRows(json.demos || []);
      setTemplates(json.templates || []);
      setError("");
    } catch (err) {
      setError(err.message || "No se pudieron cargar las demos");
    }
  }

  useEffect(() => { load(); }, []);

  async function create(items) {
    setBusy(true);
    setNotice("");
    try {
      const res = await fetch("/api/demos", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(items ? { items, days: form.days } : form),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return setNotice(json.error || "No se pudo crear la demo");
      setNotice(`${json.created.length} demo(s) creada(s) con datos reales.`);
      if (!items) setForm({ ...form, businessName: "" });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function convert(token) {
    setBusy(true);
    try {
      const res = await fetch(`/api/demo/${token}/convert`, { method: "POST", credentials: "include" });
      const json = await res.json().catch(() => ({}));
      setNotice(res.ok ? `Convertida en tenant ${json.tenant}` : json.error || "No se pudo convertir");
      await load();
    } finally {
      setBusy(false);
    }
  }

  function absolute(token) {
    return `${window.location.origin}/demo/${token}`;
  }

  function share(token, row) {
    const phone = String(phones[token] || "").replace(/[^\d+]/g, "");
    if (!phone || phone.length < 8) return setNotice("Escribe el WhatsApp del cliente con código de país");
    const message = `Hola 👋, te comparto una demo interactiva de ${row.niche_name || "tu negocio"}. Puedes recorrer el panel completo con datos reales: ${absolute(token)}`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank", "noopener");
  }

  const totalVisits = useMemo(() => rows.reduce((sum, row) => sum + Number(row.visits || 0), 0), [rows]);
  const totalLeads = useMemo(() => rows.filter((row) => row.lead).length, [rows]);

  return (
    <main className="tenant-shell">
      <header className="tenant-head">
        <div className="tenant-logo" style={{ background: "#6366f1" }}>D</div>
        <div>
          <div className="tenant-eyebrow">Super Admin · fábrica de demos</div>
          <h1>Centro de demos reales</h1>
          <p>Crea demos completas por nicho, envíalas por WhatsApp y conviértelas en clientes.</p>
        </div>
        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          <Link className="btn" href="/">Volver a la consola</Link>
        </div>
      </header>

      {error && <div className="callout amber">{error}</div>}
      {notice && <div className="callout">{notice}</div>}

      <div className="stat-grid" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
        <div className="stat stat-indigo"><div className="stat-label">Demos creadas</div><div className="stat-value">{rows.length}</div></div>
        <div className="stat stat-green"><div className="stat-label">Visitas totales</div><div className="stat-value">{totalVisits}</div></div>
        <div className="stat stat-amber"><div className="stat-label">Leads capturados</div><div className="stat-value">{totalLeads}</div></div>
        <div className="stat stat-rose"><div className="stat-label">Plantillas de nicho</div><div className="stat-value">{templates.length}</div></div>
      </div>

      <Panel title="Crear una demo" subtitle="Se generan productos, clientes, pedidos, facturas y módulos propios del nicho.">
        <div className="demo-create">
          <label className="field">Nicho
            <select value={form.nicheId} onChange={(e) => setForm({ ...form, nicheId: e.target.value })}>
              {templates.map((item) => <option key={item.id} value={item.id}>{item.icon} {item.name}</option>)}
            </select>
          </label>
          <label className="field">Nombre de la demo
            <input value={form.businessName} placeholder="Ej. Demo Farmacia"
              onChange={(e) => setForm({ ...form, businessName: e.target.value })} />
          </label>
          <label className="field">Días activa
            <input type="number" min="1" max="90" value={form.days}
              onChange={(e) => setForm({ ...form, days: e.target.value })} />
          </label>
          <Btn tone="primary" onClick={() => create()} disabled={busy || !form.businessName.trim()}>
            Crear demo
          </Btn>
        </div>
        <p className="auth-subtitle" style={{ marginTop: 10 }}>
          Cada demo se crea solo con el nicho y el nombre que indiques. No hay generación masiva de negocios de ejemplo.
        </p>
      </Panel>

      <Panel title="Demos creadas" subtitle="Cada tarjeta es una URL pública independiente con datos guardados en Neon." bodyClass="tight">
        {rows.length === 0 && <div className="callout">Todavía no hay demos. Crea la primera arriba.</div>}
        <div className="demo-card-grid">
          {rows.map((row) => (
            <div className="demo-card" key={row.token}>
              <div className="demo-card-head">
                <div className="tenant-logo" style={{ background: row.color || "#6366f1", width: 40, height: 40, fontSize: 16 }}>
                  {row.icon || "▣"}
                </div>
                <div style={{ minWidth: 0 }}>
                  <b>{row.business_name}</b>
                  <small>{row.niche_name || row.niche_id}</small>
                </div>
                <Tag tone={row.converted_tenant ? "green" : row.lead ? "indigo" : "slate"}>
                  {row.converted_tenant ? "Convertida" : row.lead ? "Con lead" : row.status}
                </Tag>
              </div>
              <div className="demo-card-stats">
                <span>{row.products} productos</span><span>{row.customers} clientes</span>
                <span>{row.orders} pedidos</span><span>{row.visits} visitas</span>
              </div>
              <div className="demo-card-meta">
                Creada {dateLabel(row.created_at)} · expira {dateLabel(row.expires_at)}
                {row.lead && <><br />Lead: <b>{row.lead.name}</b> · {row.lead.phone}</>}
              </div>
              <div className="demo-card-actions">
                <a className="btn btn-mini" href={`/demo/${row.token}`} target="_blank" rel="noreferrer">Abrir</a>
                <Btn size="sm" onClick={() => {
                  navigator.clipboard?.writeText(absolute(row.token));
                  setNotice("Enlace copiado al portapapeles");
                }}>Copiar enlace</Btn>
              </div>
              <div className="demo-card-share">
                <input placeholder="WhatsApp del cliente (+57…)" value={phones[row.token] || ""}
                  onChange={(e) => setPhones({ ...phones, [row.token]: e.target.value })} />
                <Btn tone="primary" size="sm" onClick={() => share(row.token, row)}>Enviar por WhatsApp</Btn>
              </div>
              {!row.converted_tenant && (
                <Btn size="sm" onClick={() => convert(row.token)} disabled={busy}>Convertir en tenant</Btn>
              )}
            </div>
          ))}
        </div>
      </Panel>
    </main>
  );
}
