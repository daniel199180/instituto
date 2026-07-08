"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Loader2, PlugZap, RefreshCw, Save } from "lucide-react";
import {
  getPaymentSettings,
  updateBanecoSettings,
  validateBanecoAccess,
} from "@/actions/payment-settings";

const emptyForm = {
  accountCredit: "",
  aesKey: "",
  enabled: true,
  password: "",
  username: "",
};

function formFromSettings(settings) {
  return {
    accountCredit: "",
    aesKey: "",
    enabled: settings?.enabled !== false,
    password: "",
    username: settings?.username || "",
  };
}

export function SettingsClient() {
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    refreshSettings();
  }, []);

  function refreshSettings() {
    setIsLoading(true);
    setError("");
    setNotice("");

    startTransition(async () => {
      const result = await getPaymentSettings();

      if (!result.ok) {
        setError(result.error);
        setSettings(null);
        setForm(emptyForm);
      } else {
        setSettings(result.settings);
        setForm(formFromSettings(result.settings));
      }

      setIsLoading(false);
    });
  }

  function handleFieldChange(event) {
    const { checked, name, type, value } = event.target;

    setForm((currentForm) => ({
      ...currentForm,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setNotice("");

    startTransition(async () => {
      const result = await updateBanecoSettings(form);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setSettings(result.settings);
      setForm(formFromSettings(result.settings));
      setNotice("Configuración Baneco guardada.");
    });
  }

  function handleValidateAccess() {
    setError("");
    setNotice("");

    startTransition(async () => {
      const result = await validateBanecoAccess(form);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setNotice("Accesos de Banco Económico verificados correctamente.");
    });
  }

  return (
    <div className="branches-page">
      <section className="branch-toolbar" aria-label="Resumen de configuración">
        <div className="branch-stat">
          <span>Proveedor QR</span>
          <strong>Baneco</strong>
        </div>
        <div className="branch-stat">
          <span>Estado</span>
          <strong>{settings?.enabled ? "Activo" : "Inactivo"}</strong>
        </div>
        <div className="branch-stat">
          <span>Credenciales</span>
          <strong>
            {settings?.passwordConfigured &&
            settings?.aesKeyConfigured &&
            settings?.accountCreditConfigured
              ? "Guardadas"
              : "Pendientes"}
          </strong>
        </div>
        <div className="branch-stat">
          <span>Moneda</span>
          <strong>BOB</strong>
        </div>
      </section>

      {error ? (
        <p className="form-error branch-error" role="alert">
          {error}
        </p>
      ) : null}

      {notice ? <p className="form-note branch-error">{notice}</p> : null}

      <section className="branch-table-shell settings-shell">
        {isLoading ? (
          <div className="table-state">
            <Loader2 className="spin-icon" size={22} />
            <span>Cargando configuración</span>
          </div>
        ) : (
          <form className="drawer-form settings-form" onSubmit={handleSubmit}>
            <header className="settings-header">
              <div>
                <p className="eyebrow">Banco Económico</p>
                <h2>Credenciales QR</h2>
              </div>
              <label className="settings-toggle">
                <input
                  checked={form.enabled}
                  name="enabled"
                  onChange={handleFieldChange}
                  type="checkbox"
                />
                <span>Habilitar QR</span>
              </label>
            </header>

            <div className="pos-form-grid">
              <label className="field-group">
                <span>Usuario</span>
                <input
                  className="control-input"
                  name="username"
                  onChange={handleFieldChange}
                  required
                  value={form.username}
                />
              </label>

              <label className="field-group">
                <span>Contraseña</span>
                <input
                  className="control-input"
                  name="password"
                  onChange={handleFieldChange}
                  placeholder={
                    settings?.passwordConfigured
                      ? "Guardada. Escribe para reemplazar."
                      : ""
                  }
                  type="password"
                  value={form.password}
                />
              </label>

              <label className="field-group">
                <span>Llave AES</span>
                <input
                  className="control-input"
                  name="aesKey"
                  onChange={handleFieldChange}
                  placeholder={
                    settings?.aesKeyConfigured
                      ? "Guardada. Escribe para reemplazar."
                      : ""
                  }
                  type="password"
                  value={form.aesKey}
                />
              </label>

              <label className="field-group">
                <span>Cuenta de abono</span>
                <input
                  className="control-input"
                  name="accountCredit"
                  onChange={handleFieldChange}
                  placeholder={
                    settings?.accountCreditConfigured
                      ? "Guardada. Escribe para reemplazar."
                      : ""
                  }
                  value={form.accountCredit}
                />
              </label>
            </div>

            <div className="drawer-actions settings-actions">
              <button
                className="secondary-action"
                disabled={isPending}
                onClick={refreshSettings}
                type="button"
              >
                <RefreshCw size={18} />
                <span>Recargar</span>
              </button>
              <button
                className="secondary-action"
                disabled={isPending}
                onClick={handleValidateAccess}
                type="button"
              >
                <PlugZap size={18} />
                <span>Validar accesos</span>
              </button>
              <button className="primary-action" disabled={isPending} type="submit">
                {isPending ? (
                  <Loader2 className="spin-icon" size={18} />
                ) : (
                  <Save size={18} />
                )}
                <span>Guardar</span>
              </button>
            </div>

            {settings?.passwordConfigured ? (
              <p className="form-note">
                <Check size={16} /> Las credenciales secretas están cifradas y
                no se muestran nuevamente.
              </p>
            ) : null}
          </form>
        )}
      </section>
    </div>
  );
}
