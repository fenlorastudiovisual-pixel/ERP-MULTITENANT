"use client";

import { useState } from "react";
import {
  USERS_SEED, LANGUAGES, TRANSLATIONS_SEED, MODULES,
} from "../lib/data";
import {
  Panel, Stat, Btn, Tag, Table, Progress, Modal, Drawer, Tabs, Field, Toggle, SectionHead,
} from "./ui";

const money = (n) => "$ " + Number(n).toLocaleString("es-CO");

/* ─────────────────────────── Usuarios e identidad ─────────────────────────── */

export function Users({ ctx }) {
  const { users, setUsers, toast } = ctx;
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("usuarios");
  const [invite, setInvite] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", role: "Soporte", scope: "Global" });

  const rows = users.filter((u) => (u.name + u.email + u.role).toLowerCase().includes(q.toLowerCase()));
  const doInvite = () => {
    if (!form.email.includes("@")) return toast("Escribe un correo válido");
    setUsers([{ ...form, name: form.name || form.email.split("@")[0], mfa: false, state: "Invitado" }, ...users]);
    setInvite(false); setForm({ name: "", email: "", role: "Soporte", scope: "Global" });
    toast("Invitación enviada");
  };
  const toggleMfa = (email) => setUsers(users.map((u) => u.email === email ? { ...u, mfa: !u.mfa } : u));

  return <>
    <SectionHead eyebrow="Configuración" title="Usuarios e identidad" description="Accesos al Super Admin, roles, permisos granulares, SSO y política de autenticación."
      actions={<Btn tone="primary" icon="＋" onClick={() => setInvite(true)}>Invitar usuario</Btn>} />
    <div className="stat-grid">
      <Stat label="Usuarios globales" value={users.length} icon="◎" />
      <Stat label="Con MFA activo" value={users.filter((u) => u.mfa).length} icon="⚿" tone="green" />
      <Stat label="Invitaciones pendientes" value={users.filter((u) => u.state === "Invitado").length} icon="✉" tone="amber" />
      <Stat label="Sesiones activas" value={37} icon="◷" tone="rose" />
    </div>
    <Tabs tabs={[{ id: "usuarios", label: "Usuarios", count: users.length }, { id: "roles", label: "Roles y permisos" }, { id: "auth", label: "Autenticación" }]} value={tab} onChange={setTab} />
    {tab === "usuarios" && <Panel title="Directorio de acceso" bodyClass="tight">
      <div className="filter-row" style={{ padding: "14px 16px 0" }}>
        <input placeholder="Buscar por nombre, correo o rol…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 280 }} />
        <span style={{ marginLeft: "auto", color: "#8b93a1", fontSize: 11 }}>{rows.length} usuarios</span>
      </div>
      <Table columns={[
        { key: "name", label: "Usuario", render: (u) => <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span className="mini-avatar">{u.name.slice(0, 2).toUpperCase()}</span><div><b>{u.name}</b><div style={{ color: "#8b93a1", fontSize: 10 }}>{u.email}</div></div></div> },
        { key: "role", label: "Rol", render: (u) => <Tag tone={u.role === "Super Admin" ? "violet" : "slate"}>{u.role}</Tag> },
        { key: "scope", label: "Alcance" },
        { key: "mfa", label: "MFA", render: (u) => <button className={`mini-check ${u.mfa ? "on" : ""}`} onClick={() => toggleMfa(u.email)}>{u.mfa ? "✓" : "—"}</button> },
        { key: "state", label: "Estado", render: (u) => <Tag tone={u.state === "Activo" ? "green" : "amber"} dot>{u.state}</Tag> },
        { key: "acc", label: "", align: "right", render: () => <Btn size="xs">Editar</Btn> },
      ]} rows={rows} />
    </Panel>}
    {tab === "roles" && <Panel title="Roles y matriz de permisos" subtitle="Permisos por módulo y acción. El super admin puede ajustar cada rol.">
      <div className="matrix role-matrix">
        {["Ver", "Crear", "Editar", "Borrar", "Exportar", "Aprobar"].map((a) => <div className="matrix-head" key={a}>{a}</div>)}
        {["Super Admin", "Soporte", "Ventas", "Finanzas", "Solo lectura"].map((r, i) => (
          <div className="role-row" key={r}>
            <b>{r}</b>
            {["Ver", "Crear", "Editar", "Borrar", "Exportar", "Aprobar"].map((a, j) => (
              <button key={a} className={`perm ${i === 0 || (i === 4 && j === 0) || (j < 3 && i > 0 && i < 4) ? "on" : ""}`}
                onClick={() => toast(`Permiso ${a} · ${r} actualizado`)}>{i === 0 || (i === 4 && j === 0) || (j < 3 && i > 0 && i < 4) ? "✓" : "·"}</button>
            ))}
          </div>
        ))}
      </div>
    </Panel>}
    {tab === "auth" && <div className="two-col">
      <Panel title="Política de autenticación">
        {[
          ["MFA obligatorio para Super Admin", "Todos los accesos globales requieren segundo factor", true],
          ["SSO con SAML / OIDC", "Permite iniciar sesión con el proveedor de identidad corporativo", true],
          ["SCIM para altas y bajas", "Sincronización automática con directorio externo", false],
          ["Expiración de sesión en 8 h", "Cierra sesiones inactivas", true],
          ["Restricción por IP", "Solo rangos permitidos para roles sensibles", false],
          ["Contraseña fuerte", "Mínimo 12 caracteres y rotación cada 90 días", true],
        ].map(([label, hint, val]) => <Toggle key={label} label={label} hint={hint} value={val} onChange={() => toast(`Política "${label}" actualizada`)} />)}
      </Panel>
      <Panel title="Proveedor de identidad">
        <Field label="Proveedor SSO"><select defaultValue="oidc"><option value="oidc">OpenID Connect</option><option>SAML 2.0</option><option>Google Workspace</option><option>Microsoft Entra ID</option></select></Field>
        <Field label="URL del issuer"><input defaultValue="https://id.fenlora.com.co" /></Field>
        <Field label="Cliente ID"><input defaultValue="erp-console" /></Field>
        <div className="callout green">SSO activo para 3 organizaciones. Última sincronización: hoy 06:42.</div>
        <Btn tone="primary" onClick={() => toast("Configuración de identidad guardada")}>Guardar</Btn>
      </Panel>
    </div>}
    <Modal open={invite} onClose={() => setInvite(false)} title="Invitar usuario" subtitle="Se envía un correo con acceso temporal al Super Admin">
      <Field label="Nombre"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nombre completo" /></Field>
      <Field label="Correo electrónico"><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="persona@empresa.com" /></Field>
      <div className="two-col">
        <Field label="Rol"><select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          {["Super Admin", "Soporte", "Ventas", "Devops", "Finanzas", "Solo lectura"].map((r) => <option key={r}>{r}</option>)}
        </select></Field>
        <Field label="Alcance"><select value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })}>
          {["Global", "10 tenants", "Finanzas", "Un tenant"].map((r) => <option key={r}>{r}</option>)}
        </select></Field>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Btn onClick={() => setInvite(false)}>Cancelar</Btn><Btn tone="primary" onClick={doInvite}>Enviar invitación</Btn>
      </div>
    </Modal>
  </>;
}

/* ─────────────────────────── Idiomas ─────────────────────────── */

export function Languages({ ctx }) {
  const { languages, setLanguages, translations, setTranslations, toast } = ctx;
  const [lang, setLang] = useState("pt");
  const [newLang, setNewLang] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", native: "" });

  const add = () => {
    if (!form.code || !form.name) return toast("Completa código y nombre");
    setLanguages([...languages, { ...form, translated: 0, state: "Pendiente" }]);
    setNewLang(false); setForm({ code: "", name: "", native: "" }); toast("Idioma agregado al catálogo");
  };
  const editTranslation = (key, code, value) => setTranslations(translations.map((t) => t.key === key ? { ...t, [code]: value } : t));

  return <>
    <SectionHead eyebrow="Configuración" title="Idiomas e internacionalización" description="Idiomas globales y por negocio, catálogo de traducciones, formatos y traducción asistida."
      actions={<>
        <Btn icon="⇩" onClick={() => toast("Catálogo exportado a CSV")}>Exportar CSV</Btn>
        <Btn icon="⇧" onClick={() => toast("Selecciona un archivo CSV para importar")}>Importar</Btn>
        <Btn tone="primary" icon="＋" onClick={() => setNewLang(true)}>Nuevo idioma</Btn>
      </>} />
    <div className="stat-grid">
      <Stat label="Idiomas activos" value={languages.length} icon="文" />
      <Stat label="Claves traducidas (es)" value="100%" icon="✓" tone="green" />
      <Stat label="Claves pendientes (pt)" value="28%" icon="!" tone="amber" />
      <Stat label="Negocios multilingües" value={9} icon="▦" tone="rose" />
    </div>
    <div className="two-col">
      <Panel title="Idiomas disponibles" subtitle="Activa o desactiva idiomas para todos los negocios">
        {languages.map((l) => (
          <div className="lang-row" key={l.code}>
            <span className="lang-code">{l.code.toUpperCase()}</span>
            <div className="lang-copy"><b>{l.name}</b><small>{l.native}</small></div>
            <div className="lang-progress"><Progress value={l.translated} tone={l.translated === 100 ? "#22c55e" : l.translated > 60 ? "#6366f1" : "#f59e0b"} /><small>{l.translated}%</small></div>
            <Tag tone={l.state === "Completo" ? "green" : l.state === "En revisión" ? "blue" : "amber"}>{l.state}</Tag>
            <button className={`mini-check ${l.state !== "Pendiente" ? "on" : ""}`} onClick={() => {
              setLanguages(languages.map((x) => x.code === l.code ? { ...x, state: x.state === "Pendiente" ? "Completo" : "Pendiente" } : x));
              toast(`Idioma ${l.name} actualizado`);
            }}>{l.state !== "Pendiente" ? "✓" : "—"}</button>
          </div>
        ))}
      </Panel>
      <Panel title="Formatos y regionalización">
        <Field label="Formato de fecha"><select defaultValue="dd/mm/yyyy"><option>dd/mm/yyyy</option><option>mm/dd/yyyy</option><option>yyyy-mm-dd</option></select></Field>
        <Field label="Separador decimal"><select defaultValue="comma"><option value="comma">, (coma)</option><option value="dot">. (punto)</option></select></Field>
        <Field label="Zona horaria por defecto"><select defaultValue="America/Bogota"><option>America/Bogota</option><option>America/Mexico_City</option><option>Europe/Madrid</option><option>America/Sao_Paulo</option></select></Field>
        <Toggle label="Soporte RTL (árabe / hebreo)" hint="Invierte el sentido de la interfaz cuando el idioma lo requiera" value={false} onChange={() => toast("Soporte RTL actualizado")} />
        <Toggle label="Detección automática del idioma" hint="Usuario → sede → negocio → plataforma" value={true} onChange={() => toast("Preferencia actualizada")} />
        <Btn tone="primary" onClick={() => toast("Formatos guardados")}>Guardar formatos</Btn>
      </Panel>
    </div>
    <Panel title="Catálogo de traducciones" subtitle={`Editando ${languages.find((l) => l.code === lang)?.name || lang}`}
      actions={<>
        <select value={lang} onChange={(e) => setLang(e.target.value)} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "6px 9px", fontSize: 11 }}>
          {languages.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
        </select>
        <Btn size="sm" icon="✦" onClick={() => toast("Traducción asistida aplicada a las claves vacías")}>Autocompletar con IA</Btn>
      </>}>
      <div className="table-wrap"><table>
        <thead><tr><th>Clave</th><th>Español</th><th>Inglés</th><th>{lang.toUpperCase()}</th><th>Estado</th></tr></thead>
        <tbody>{translations.map((t) => (
          <tr key={t.key}>
            <td className="mono">{t.key}</td><td>{t.es}</td><td>{t.en}</td>
            <td><input className="cell-input" value={t[lang] || ""} placeholder="Sin traducir" onChange={(e) => editTranslation(t.key, lang, e.target.value)} /></td>
            <td><Tag tone={t[lang] ? "green" : "amber"} dot>{t[lang] ? "Traducido" : "Pendiente"}</Tag></td>
          </tr>
        ))}</tbody>
      </table></div>
    </Panel>
    <Modal open={newLang} onClose={() => setNewLang(false)} title="Nuevo idioma" subtitle="Se agrega al catálogo global y podrá activarse por negocio">
      <Field label="Código (ISO 639-1)"><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="ej. fr" /></Field>
      <Field label="Nombre"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Francés" /></Field>
      <Field label="Nombre nativo"><input value={form.native} onChange={(e) => setForm({ ...form, native: e.target.value })} placeholder="Français" /></Field>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}><Btn onClick={() => setNewLang(false)}>Cancelar</Btn><Btn tone="primary" onClick={add}>Agregar</Btn></div>
    </Modal>
  </>;
}

/* ─────────────────────────── Localización fiscal ─────────────────────────── */

export function Localization({ ctx }) {
  const { toast } = ctx;
  const [rates, setRates] = useState([
    { code: "COP", name: "Peso colombiano", rate: 1, symbol: "$", decimals: 0 },
    { code: "USD", name: "Dólar estadounidense", rate: 3980, symbol: "US$", decimals: 2 },
    { code: "EUR", name: "Euro", rate: 4320, symbol: "€", decimals: 2 },
    { code: "MXN", name: "Peso mexicano", rate: 215, symbol: "MX$", decimals: 2 },
  ]);
  const [tab, setTab] = useState("monedas");
  return <>
    <SectionHead eyebrow="Configuración" title="Localización fiscal y monetaria" description="Monedas, tasas, regímenes de impuestos, series de numeración y plantillas legales por país."
      actions={<Btn tone="primary" icon="✓" onClick={() => toast("Configuración fiscal guardada")}>Guardar cambios</Btn>} />
    <Tabs tabs={[{ id: "monedas", label: "Monedas y tasas" }, { id: "impuestos", label: "Regímenes fiscales" }, { id: "series", label: "Numeración" }, { id: "plantillas", label: "Plantillas legales" }]} value={tab} onChange={setTab} />
    {tab === "monedas" && <Panel title="Monedas y tasas de cambio" subtitle="La tasa se guarda en cada comprobante para conservar el valor histórico">
      <Table columns={[
        { key: "code", label: "Código", render: (r) => <b className="mono">{r.code}</b> },
        { key: "name", label: "Nombre" },
        { key: "symbol", label: "Símbolo" },
        { key: "rate", label: "Tasa vs COP", align: "right", render: (r) => <input className="cell-input right" type="number" value={r.rate} onChange={(e) => setRates(rates.map((x) => x.code === r.code ? { ...x, rate: Number(e.target.value) } : x))} /> },
        { key: "decimals", label: "Decimales", align: "right", render: (r) => <input className="cell-input right" type="number" value={r.decimals} onChange={(e) => setRates(rates.map((x) => x.code === r.code ? { ...x, decimals: Number(e.target.value) } : x))} /> },
      ]} rows={rates} />
      <div style={{ marginTop: 14 }}><Btn icon="＋" onClick={() => setRates([...rates, { code: "NUEVA", name: "Nueva moneda", rate: 1, symbol: "$", decimals: 2 }])}>Agregar moneda</Btn></div>
    </Panel>}
    {tab === "impuestos" && <div className="three-col">
      {[
        { country: "Colombia", flag: "🇨🇴", taxes: ["IVA 19%", "Retención en la fuente 2.5%", "ICA"], regime: "Facturación electrónica DIAN" },
        { country: "México", flag: "🇲🇽", taxes: ["IVA 16%", "ISR retención", "CFDI 4.0"], regime: "SAT — Comprobante fiscal digital" },
        { country: "España", flag: "🇪🇸", taxes: ["IVA 21%", "IRPF", "Impuesto de sociedades"], regime: "Veri*factu / AEAT" },
        { country: "Chile", flag: "🇨🇱", taxes: ["IVA 19%", "Retención honorarios"], regime: "SII — DTE" },
        { country: "Perú", flag: "🇵🇪", taxes: ["IGV 18%", "Percepción", "Retención"], regime: "SUNAT — Facturación electrónica" },
        { country: "Brasil", flag: "🇧🇷", taxes: ["ICMS", "PIS/COFINS", "ISS"], regime: "SEFAZ — NF-e" },
      ].map((c) => <Panel key={c.country} title={`${c.flag} ${c.country}`}>
        <div className="callout" style={{ marginBottom: 10 }}>{c.regime}</div>
        {c.taxes.map((t) => <div className="mini-list" key={t}><li><span>⌘</span>{t}</li></div>)}
        <Btn size="sm" onClick={() => toast(`Régimen de ${c.country} abierto para edición`)} style={{ marginTop: 10 }}>Editar régimen</Btn>
      </Panel>)}
    </div>}
    {tab === "series" && <Panel title="Series de numeración" subtitle="Secuencias por documento, sede y año">
      <Table columns={[
        { key: "doc", label: "Documento" }, { key: "series", label: "Serie" }, { key: "site", label: "Sede" },
        { key: "next", label: "Próximo número", align: "right" }, { key: "state", label: "Estado" },
      ]} rows={[
        { id: 1, doc: "Factura de venta", series: "FV-2026", site: "Medellín", next: "1.284", state: "Activa" },
        { id: 2, doc: "Factura de venta", series: "FV-2026", site: "Bogotá", next: "892", state: "Activa" },
        { id: 3, doc: "Orden de compra", series: "OC-2026", site: "Todas", next: "417", state: "Activa" },
        { id: 4, doc: "Nota crédito", series: "NC-2026", site: "Todas", next: "38", state: "Activa" },
        { id: 5, doc: "Remisión", series: "RM-2025", site: "Medellín", next: "2.091", state: "Cerrada" },
      ].map((r) => ({ ...r, state: <Tag tone={r.state === "Activa" ? "green" : "slate"}>{r.state}</Tag> }))} />
    </Panel>}
    {tab === "plantillas" && <Panel title="Plantillas de documentos legales">
      <div className="three-col">
        {["Factura electrónica", "Cotización", "Nota de crédito", "Contrato", "Recibo de pago", "Certificado tributario"].map((t) => (
          <div className="template-card" key={t}><span>▤</span><b>{t}</b><small>4 variantes de idioma</small>
            <div style={{ display: "flex", gap: 6, marginTop: 10 }}><Btn size="xs" onClick={() => toast(`${t}: vista previa`)}>Ver</Btn><Btn size="xs" onClick={() => toast(`${t}: editor abierto`)}>Editar</Btn></div>
          </div>
        ))}
      </div>
    </Panel>}
  </>;
}

/* ─────────────────────────── Marca y white-label ─────────────────────────── */

export function Branding({ ctx }) {
  const { branding, setBranding, toast } = ctx;
  const set = (k, v) => setBranding({ ...branding, [k]: v });
  return <>
    <SectionHead eyebrow="Configuración" title="Marca y white-label" description="Personaliza la experiencia de los negocios: logo, colores, tipografía, dominio propio y comunicaciones."
      actions={<Btn tone="primary" icon="✓" onClick={() => toast("Marca guardada y aplicada a la vista previa")}>Guardar marca</Btn>} />
    <div className="two-col">
      <Panel title="Identidad visual">
        <Field label="Nombre del producto"><input value={branding.product} onChange={(e) => set("product", e.target.value)} /></Field>
        <Field label="Color principal" hint="Se aplica a botones, enlaces y gráficos"><input type="color" value={branding.color} onChange={(e) => set("color", e.target.value)} style={{ height: 38, padding: 3 }} /></Field>
        <Field label="Color de acento"><input type="color" value={branding.accent} onChange={(e) => set("accent", e.target.value)} style={{ height: 38, padding: 3 }} /></Field>
        <Field label="Tipografía"><select value={branding.font} onChange={(e) => set("font", e.target.value)}>
          <option>Inter</option><option>Segoe UI</option><option>Roboto</option><option>Poppins</option><option>Georgia</option>
        </select></Field>
        <Field label="Modo inicial"><select value={branding.mode} onChange={(e) => set("mode", e.target.value)}><option>Claro</option><option>Oscuro</option><option>Según el dispositivo</option></select></Field>
        <Field label="Dominio propio"><input value={branding.domain} onChange={(e) => set("domain", e.target.value)} placeholder="erp.tuempresa.com" /></Field>
        <Toggle label="Ocultar marca de la plataforma" hint="White-label completo para el negocio" value={branding.whiteLabel} onChange={(v) => set("whiteLabel", v)} />
        <Toggle label="Correos con la marca del negocio" hint="Remitente, plantillas y firma personalizadas" value={branding.brandedEmails} onChange={(v) => set("brandedEmails", v)} />
      </Panel>
      <div>
        <Panel title="Vista previa en vivo" subtitle="Así se verá el ERP del negocio">
          <div className="brand-preview" style={{ "--brand": branding.color, "--accent": branding.accent }}>
            <div className="bp-top"><span className="bp-logo" style={{ background: branding.color }}>S</span><b>{branding.product}</b><small>{branding.domain}</small></div>
            <div className="bp-side"><i style={{ background: branding.color }} /><i /><i /><i /></div>
            <div className="bp-main">
              <div className="bp-kpis"><div><small>Ventas hoy</small><b>{money(4820000)}</b></div><div><small>Pedidos</small><b>38</b></div></div>
              <div className="bp-chart">{[38, 52, 44, 68, 61, 79, 72, 88].map((h, i) => <i key={i} style={{ height: `${h}%`, background: i > 5 ? branding.accent : branding.color }} />)}</div>
              <div className="bp-table">{[1, 2, 3].map((i) => <div key={i}><span /><span /><span /></div>)}</div>
            </div>
          </div>
          <div className="callout green">La vista previa refleja los cambios al instante. Cada negocio puede tener su propia marca.</div>
        </Panel>
        <Panel title="Campos y vistas personalizadas">
          <div className="mini-list">
            <li><span>＋</span> Cliente: "NIT / RUC" <Tag tone="indigo" style={{ marginLeft: "auto" }}>Activo</Tag></li>
            <li><span>＋</span> Producto: "Talla" y "Color" <Tag tone="indigo" style={{ marginLeft: "auto" }}>Activo</Tag></li>
            <li><span>＋</span> Pedido: "Sede de despacho" <Tag tone="indigo" style={{ marginLeft: "auto" }}>Activo</Tag></li>
          </div>
          <Btn size="sm" icon="＋" onClick={() => toast("Editor de campos abierto")} style={{ marginTop: 10 }}>Nuevo campo</Btn>
        </Panel>
      </div>
    </div>
  </>;
}

/* ─────────────────────────── Módulos y versiones ─────────────────────────── */

export function Modules({ ctx }) {
  const { toast } = ctx;
  const [tab, setTab] = useState("catalogo");
  const [rollout, setRollout] = useState(25);
  const [selected, setSelected] = useState(null);
  const versions = { fin: "v4.2.1", mgmt: "v3.8.0", buy: "v4.0.3", sales: "v5.1.0", stock: "v5.0.2", crm: "v3.6.4", hr: "v2.9.1", proj: "v2.4.0", bi: "v4.1.2", mfg: "v3.2.0", pos: "v4.7.1", ecom: "v3.5.0", field: "v2.1.3", help: "v2.0.8", mkt: "v2.3.1", docs: "v1.9.0", ai: "v1.2.0", iot: "v1.0.4" };
  return <>
    <SectionHead eyebrow="Configuración" title="Módulos y versiones" description="Catálogo del ERP, versionado, compatibilidad, adopción por negocio y despliegue progresivo."
      actions={<Btn tone="primary" icon="＋" onClick={() => toast("Editor de módulo abierto")}>Nuevo módulo</Btn>} />
    <Tabs tabs={[{ id: "catalogo", label: "Catálogo", count: MODULES.length }, { id: "despliegue", label: "Despliegue progresivo" }, { id: "market", label: "Marketplace" }]} value={tab} onChange={setTab} />
    {tab === "catalogo" && <Panel title="Módulos disponibles" subtitle="Haz clic en un módulo para ver notas de versión" bodyClass="tight">
      <Table columns={[
        { key: "label", label: "Módulo", render: (m) => <div style={{ display: "flex", alignItems: "center", gap: 9 }}><span className="module-icon">{m.label.slice(0, 1)}</span><div><b>{m.label}</b><div style={{ color: "#8b93a1", fontSize: 10 }}>{m.group}</div></div></div> },
        { key: "version", label: "Versión", render: (m) => <span className="mono">{versions[m.id]}</span> },
        { key: "group", label: "Categoría", render: (m) => <Tag tone={m.group === "Núcleo" ? "indigo" : "violet"}>{m.group}</Tag> },
        { key: "adoption", label: "Adopción", render: (m) => `${20 + (m.id.charCodeAt(0) % 7) * 11}%` },
        { key: "state", label: "Estado", render: () => <Tag tone="green" dot>Estable</Tag> },
        { key: "acc", label: "", align: "right", render: (m) => <Btn size="xs" onClick={(e) => { e.stopPropagation(); setSelected(m); }}>Ver</Btn> },
      ]} rows={MODULES} />
    </Panel>}
    {tab === "despliegue" && <div className="two-col">
      <Panel title="Despliegue progresivo" subtitle="Libera una nueva versión por porcentaje de negocios">
        <Field label="Módulo"><select defaultValue="stock"><option value="stock">Inventario y almacenes</option><option>sales</option><option>crm</option></select></Field>
        <Field label="Versión"><input value="v5.1.0-beta" readOnly /></Field>
        <div style={{ margin: "16px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 8 }}><span>Porcentaje de negocios</span><b>{rollout}%</b></div>
          <input type="range" min="0" max="100" value={rollout} onChange={(e) => setRollout(Number(e.target.value))} style={{ width: "100%" }} />
        </div>
        <div className="callout">Aproximadamente {Math.round(rollout * 0.31)} negocios recibirán esta versión. El resto permanece en v5.0.2.</div>
        <Btn tone="primary" onClick={() => toast(`Despliegue iniciado al ${rollout}% de los negocios`)}>Iniciar despliegue</Btn>
      </Panel>
      <Panel title="Versiones recientes"><div className="mini-list">
        <li><span>v2.14.0</span> Plataforma · producción · hoy</li>
        <li><span>v5.1.0</span> Ventas · 80% de negocios</li>
        <li><span>v4.2.1</span> Contabilidad · estable</li>
        <li><span>v1.2.0</span> Asistente IA · beta cerrada</li>
      </div><Btn size="sm" onClick={() => toast("Historial completo abierto")} style={{ marginTop: 10 }}>Ver historial y rollback</Btn></Panel>
    </div>}
    {tab === "market" && <Panel title="Marketplace interno" subtitle="Módulos propios y de terceros instalables por negocio">
      <div className="three-col">
        {[["OCR de facturas", "Propio", "✓"], ["Pasarela local", "Tercero", "✓"], ["Firma digital", "Tercero", "✓"], ["Predicción de demanda", "Propio", "β"], ["Integración WhatsApp", "Propio", "✓"], ["Biometría", "Tercero", "·"]].map(([n, owner, s]) => (
          <div className="template-card" key={n}><span>{s}</span><b>{n}</b><small>Por {owner}</small>
            <div style={{ marginTop: 10 }}><Btn size="xs" tone="primary" onClick={() => toast(`${n} agregado al catálogo`)}>Instalar</Btn></div>
          </div>
        ))}
      </div>
    </Panel>}
    <Modal open={!!selected} onClose={() => setSelected(null)} title={selected?.label || ""} subtitle={selected ? `${versions[selected.id]} · ${selected.group}` : ""}>
      {selected && <>
        <div className="callout green">Módulo estable. Compatible con las versiones v2.12.0 en adelante.</div>
        <h4 style={{ margin: "12px 0 8px", fontSize: 12 }}>Notas de versión</h4>
        <div className="mini-list"><li><span>＋</span> Mejoras de rendimiento en listados</li><li><span>＋</span> Nuevos campos personalizados</li><li><span>＋</span> Corrección de permisos por sede</li></div>
        <h4 style={{ margin: "14px 0 8px", fontSize: 12 }}>Negocios con el módulo activo</h4>
        <div className="mini-list"><li><span>▦</span> Belleza del Valle · Crecimiento</li><li><span>▦</span> Distribuidora Norte · Empresa</li><li><span>▦</span> Agroverde S.A. · Global</li></div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}><Btn tone="primary" onClick={() => { setSelected(null); toast("Módulo actualizado"); }}>Guardar cambios</Btn></div>
      </>}
    </Modal>
  </>;
}

/* ─────────────────────────── Demos reales ─────────────────────────── */

export function Demos({ ctx }) {
  const { demoLinks, refreshDemoLinks } = ctx;
  const [q, setQ] = useState("");

  const all = Array.isArray(demoLinks) ? demoLinks : [];
  const rows = all.filter((d) =>
    `${d.business_name} ${d.niche_name || ""} ${d.token}`.toLowerCase().includes(q.toLowerCase())
  );
  const visits = all.reduce((sum, d) => sum + Number(d.visits || 0), 0);
  const withLead = all.filter((d) => d.lead).length;
  const converted = all.filter((d) => d.status === "Convertida").length;

  return <>
    <SectionHead
      eyebrow="Configuración"
      title="Demos"
      description="Enlaces públicos creados en Neon con datos operativos por nicho. Cada enlace abre un panel interactivo; aquí no hay catálogo decorativo."
      actions={<>
        <Btn icon="↻" onClick={refreshDemoLinks}>Actualizar</Btn>
        <a className="btn btn-primary" href="/demos">Crear y gestionar demos</a>
      </>}
    />
    <div className="stat-grid">
      <Stat label="Demos creadas" value={all.length} icon="▶" />
      <Stat label="Visitas registradas" value={visits} icon="◎" tone="green" />
      <Stat label="Con lead" value={withLead} icon="✉" tone="amber" />
      <Stat label="Convertidas a negocio" value={converted} icon="↗" tone="rose" />
    </div>
    <Panel title="Demos publicadas" subtitle="Eliminar, crear y convertir se hace en el centro de demos" bodyClass="tight">
      <div className="filter-row" style={{ padding: "14px 16px 0" }}>
        <input placeholder="Buscar por negocio, nicho o token…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 320 }} />
        <span style={{ marginLeft: "auto", color: "#8b93a1", fontSize: 11 }}>{rows.length} demos</span>
      </div>
      {rows.length === 0
        ? <div className="empty-state"><span>▶</span><b>Aún no hay demos creadas</b><p>Crea la primera desde el centro de demos.</p></div>
        : <Table columns={[
          { key: "business", label: "Negocio", render: (d) => <div><b>{d.business_name}</b><div style={{ color: "#8b93a1", fontSize: 10 }}>{d.niche_name || d.niche_id}</div></div> },
          { key: "data", label: "Datos", render: (d) => `${d.products ?? 0} productos · ${d.customers ?? 0} clientes · ${d.orders ?? 0} pedidos` },
          { key: "link", label: "Enlace", render: (d) => <a className="mono link-btn" href={`/demo/${d.token}`} target="_blank" rel="noreferrer">/demo/{d.token} ⧉</a> },
          { key: "visits", label: "Visitas", align: "right" },
          { key: "lead", label: "Lead", render: (d) => d.lead ? <Tag tone="green" dot>{d.lead.name}</Tag> : <span style={{ color: "#8b93a1" }}>—</span> },
          { key: "status", label: "Estado", render: (d) => <Tag tone={d.status === "Activa" ? "green" : "indigo"} dot>{d.status}</Tag> },
          { key: "expires", label: "Caduca", render: (d) => String(d.expires_at || "").slice(0, 10) },
        ]} rows={rows} />}
    </Panel>
  </>;
}
