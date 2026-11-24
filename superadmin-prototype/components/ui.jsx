"use client";

export function Panel({ title, subtitle, actions, children, className = "", bodyClass = "" }) {
  return (
    <section className={`panel ${className}`}>
      {(title || actions) && (
        <header className="panel-head">
          <div>
            {title && <h3>{title}</h3>}
            {subtitle && <p>{subtitle}</p>}
          </div>
          {actions && <div className="panel-actions">{actions}</div>}
        </header>
      )}
      <div className={`panel-body ${bodyClass}`}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, delta, icon, tone = "indigo", hint }) {
  return (
    <div className={`stat stat-${tone}`}>
      <div className="stat-top">
        <span className="stat-icon">{icon}</span>
        {delta && <span className={`delta ${delta.startsWith("-") ? "down" : "up"}`}>{delta}</span>}
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

export function Btn({ children, onClick, tone = "ghost", size = "md", icon, disabled, title, style }) {
  return (
    <button className={`btn btn-${tone} btn-${size}`} onClick={onClick} disabled={disabled} title={title} style={style}>
      {icon && <span className="btn-icon">{icon}</span>}
      {children}
    </button>
  );
}

export function Tag({ children, tone = "slate", dot = false, style }) {
  return <span className={`tag tag-${tone}`} style={style}>{dot && <i className="tag-dot" />}{children}</span>;
}

export function Toggle({ value, onChange, label, hint }) {
  return (
    <label className="toggle-row">
      <span className="toggle-copy">
        {label && <b>{label}</b>}
        {hint && <small>{hint}</small>}
      </span>
      <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch" />
    </label>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <small className="field-hint">{hint}</small>}
    </label>
  );
}

export function Table({ columns, rows, onRow, empty = "Sin resultados", compact = false }) {
  return (
    <div className={`table-wrap ${compact ? "compact" : ""}`}>
      <table>
        <thead>
          <tr>{columns.map((c) => <th key={c.key} className={c.align || ""}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length} className="empty">{empty}</td></tr>
          ) : rows.map((row, i) => (
            <tr key={row.id || i} onClick={onRow ? () => onRow(row) : undefined} className={onRow ? "clickable" : ""}>
              {columns.map((c) => (
                <td key={c.key} className={c.align || ""}>
                  {c.render ? c.render(row) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Bars({ data, height = 120, color = "#6366f1" }) {
  const max = Math.max(...data.map((d) => typeof d === "number" ? d : d.value), 1);
  return (
    <div className="bars" style={{ height }}>
      {data.map((d, i) => {
        const v = typeof d === "number" ? d : d.value;
        const label = typeof d === "number" ? null : d.label;
        return (
          <div className="bar-col" key={i} title={`${label ? label + ": " : ""}${v}`}>
            <div className="bar" style={{ height: `${Math.max(4, (v / max) * 100)}%`, background: color }} />
            {label && <small>{label}</small>}
          </div>
        );
      })}
    </div>
  );
}

export function Donut({ items, size = 148 }) {
  let acc = 0;
  const stops = items.map((it) => {
    const from = acc;
    acc += it.value;
    return `${it.color || ["#6366f1", "#22c55e", "#f59e0b", "#ec4899", "#94a3b8"][items.indexOf(it) % 5]} ${from}% ${acc}%`;
  }).join(", ");
  return (
    <div className="donut-row">
      <div className="donut" style={{ width: size, height: size, background: `conic-gradient(${stops})` }}>
        <div className="donut-hole" />
      </div>
      <div className="legend">
        {items.map((it) => (
          <div key={it.label}><i style={{ background: it.color || "#6366f1" }} /> <span>{it.label}</span> <b>{it.value}%</b></div>
        ))}
      </div>
    </div>
  );
}

export function Progress({ value, tone = "#6366f1" }) {
  return (
    <div className="progress">
      <div className="progress-fill" style={{ width: `${Math.min(100, value)}%`, background: tone }} />
    </div>
  );
}

export function Modal({ open, onClose, title, subtitle, children, width = 620 }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" style={{ maxWidth: width }} onMouseDown={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Drawer({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div className="drawer-backdrop" onMouseDown={onClose}>
      <aside className="drawer" onMouseDown={(e) => e.stopPropagation()}>
        <header className="drawer-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
        </header>
        <div className="drawer-body">{children}</div>
      </aside>
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button key={t.id} className={value === t.id ? "on" : ""} onClick={() => onChange(t.id)}>
          {t.label}{t.count != null && <span className="tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Empty({ icon = "◇", title, text }) {
  return <div className="empty-state"><span>{icon}</span><b>{title}</b><p>{text}</p></div>;
}

export function SectionHead({ eyebrow, title, description, actions }) {
  return (
    <div className="section-head">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="section-actions">{actions}</div>}
    </div>
  );
}
