"use client";

import { useState } from "react";

// Campo de contraseña con botón «ojito» para mostrar/ocultar el valor.
export default function PasswordInput({ value, onChange, autoComplete = "current-password", placeholder, minLength, required = true }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="password-wrap">
      <input
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        placeholder={placeholder}
        minLength={minLength}
        required={required}
        value={value}
        onChange={onChange}
      />
      <button
        type="button"
        className="password-toggle"
        aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        aria-pressed={visible}
        title={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        onClick={() => setVisible((current) => !current)}
      >
        <span className={visible ? "eye-off" : ""}>👁</span>
      </button>
    </div>
  );
}
