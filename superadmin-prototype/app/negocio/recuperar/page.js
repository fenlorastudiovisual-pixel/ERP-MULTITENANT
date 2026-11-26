"use client";

import { useEffect, useState } from "react";

export default function RecoverPassword() {
  const [account, setAccount] = useState(null);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/negocio/recuperar/api", { credentials: "include" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) return setError(json.error || "No se pudo verificar tu correo");
        setAccount(json);
      } catch (err) {
        setError(err.message || "No se pudo verificar tu correo");
      }
    })();
  }, []);

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (password !== confirm) return setError("Las contraseñas no coinciden");
    if (password.length < 12) return setError("La contraseña debe tener al menos 12 caracteres");
    setBusy(true);
    try {
      const res = await fetch("/negocio/recuperar/api", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return setError(json.error || "No se pudo guardar la contraseña");
      setDone(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen"><div className="auth-card">
      <span className="brand-mark">E</span>
      <h1>{done ? "Contraseña lista" : "Crear o cambiar contraseña"}</h1>
      <p className="auth-subtitle">ERP Multitenant · acceso del negocio</p>

      {done ? (
        <>
          <p className="auth-access-note" style={{ borderColor: "#10b981" }}>
            Ya puedes entrar con tu contraseña. Las sesiones anteriores quedaron cerradas.
          </p>
          <a className="btn btn-primary" href="/negocio">Ir al panel</a>
        </>
      ) : error && !account ? (
        <>
          <p className="auth-access-note">{error}</p>
          <a className="btn btn-primary" href="/negocio">Volver</a>
        </>
      ) : (
        <form onSubmit={submit} style={{ display: "grid", gap: 12, marginTop: 22, textAlign: "left" }}>
          {account && <p className="auth-subtitle" style={{ margin: 0 }}>
            Correo verificado: <b>{account.email}</b> · {account.tenant}
          </p>}
          <label className="field">Nueva contraseña
            <input type="password" autoComplete="new-password" required minLength={12}
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <label className="field">Repite la contraseña
            <input type="password" autoComplete="new-password" required minLength={12}
              value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </label>
          {error && <p className="auth-access-note">{error}</p>}
          <button className="btn btn-primary" type="submit" disabled={busy || !account}>
            {busy ? "Guardando…" : "Guardar contraseña"}
          </button>
          <a className="btn" href="/negocio" style={{ textAlign: "center" }}>Cancelar</a>
        </form>
      )}
    </div></div>
  );
}
