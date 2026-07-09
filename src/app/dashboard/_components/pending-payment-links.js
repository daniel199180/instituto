"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Link as LinkIcon, Loader2, RefreshCw } from "lucide-react";
import {
  listPendingPaymentLinks,
  refreshPaymentLinkStatus,
} from "@/actions/payment-links";

function formatMoney(value) {
  return `Bs ${Number(value || 0).toLocaleString("es-BO", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;
}

function formatDateTime(value) {
  if (!value) return "Sin fecha";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Sin fecha";

  return new Intl.DateTimeFormat("es-BO", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZone: "America/La_Paz",
    year: "numeric",
  }).format(date);
}

function buildLinkUrl(path) {
  if (typeof window === "undefined") return path;

  return new URL(path, window.location.origin).toString();
}

export function PendingPaymentLinksSection() {
  const [links, setLinks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyLinkId, setBusyLinkId] = useState("");

  const load = useCallback(() => {
    setIsLoading(true);
    setError("");

    listPendingPaymentLinks().then((result) => {
      if (!result.ok) {
        setError(result.error);
      } else {
        setLinks(result.links);
      }

      setIsLoading(false);
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCopy(path) {
    try {
      await navigator.clipboard.writeText(buildLinkUrl(path));
      setNotice("Enlace copiado.");
    } catch {
      setError("No se pudo copiar el enlace.");
    }
  }

  async function handleRefresh(linkId) {
    setBusyLinkId(linkId);
    setError("");
    setNotice("");

    try {
      const result = await refreshPaymentLinkStatus(linkId);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      if (result.link.estado !== "pendiente") {
        setLinks((currentLinks) =>
          currentLinks.filter((link) => link.$id !== linkId),
        );
        setNotice(
          result.link.estado === "pagado"
            ? `${result.link.studentName} ya pagó.`
            : "El enlace expiró.",
        );
      } else {
        setNotice("Sigue pendiente de pago.");
      }
    } finally {
      setBusyLinkId("");
    }
  }

  return (
    <section className="report-section" aria-label="Enlaces de pago pendientes">
      <header className="report-section-header">
        <div>
          <span className="branch-icon">
            <LinkIcon size={20} />
          </span>
          <h2>Enlaces de pago pendientes</h2>
        </div>
        <button
          className="secondary-action"
          disabled={isLoading}
          onClick={load}
          type="button"
        >
          <RefreshCw className={isLoading ? "spin-icon" : ""} size={17} />
          <span>Actualizar lista</span>
        </button>
      </header>

      {error ? (
        <p className="form-error branch-error" role="alert">
          {error}
        </p>
      ) : null}

      {notice ? <p className="form-note branch-error">{notice}</p> : null}

      <div className="branch-table-shell report-table-shell">
        {isLoading ? (
          <div className="table-state">
            <Loader2 className="spin-icon" size={22} />
            <span>Cargando</span>
          </div>
        ) : links.length ? (
          <>
            <div className="desktop-table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Estudiante</th>
                    <th>Curso</th>
                    <th>Monto</th>
                    <th>Creado</th>
                    <th>Vence</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {links.map((link) => (
                    <tr key={link.$id}>
                      <td>{link.studentName}</td>
                      <td>
                        <div className="compact-cell">
                          <span>
                            {link.type === "enrollment"
                              ? "Inscripción"
                              : link.courseName}
                          </span>
                          <span>{link.sucursalNombre}</span>
                        </div>
                      </td>
                      <td>{formatMoney(link.amount)}</td>
                      <td>{formatDateTime(link.$createdAt)}</td>
                      <td>{formatDateTime(link.expiresAt)}</td>
                      <td>
                        <span className="status-badge is-pendiente">
                          Pendiente de pago
                        </span>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            className="icon-action"
                            onClick={() => handleCopy(link.path)}
                            title="Copiar enlace"
                            type="button"
                          >
                            <Copy size={16} />
                          </button>
                          <button
                            className="icon-action"
                            disabled={busyLinkId === link.$id}
                            onClick={() => handleRefresh(link.$id)}
                            title="Ver si ya pagó"
                            type="button"
                          >
                            {busyLinkId === link.$id ? (
                              <Loader2 className="spin-icon" size={16} />
                            ) : (
                              <RefreshCw size={16} />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mobile-branch-list">
              {links.map((link) => (
                <article className="branch-mobile-card" key={link.$id}>
                  <div className="branch-mobile-heading">
                    <div>
                      <h2>{link.studentName}</h2>
                      <span>{formatDateTime(link.$createdAt)}</span>
                    </div>
                    <span className="status-badge is-pendiente">
                      {formatMoney(link.amount)}
                    </span>
                  </div>
                  <dl>
                    <div>
                      <dt>Curso</dt>
                      <dd>
                        {link.type === "enrollment"
                          ? "Inscripción"
                          : link.courseName}
                      </dd>
                    </div>
                    <div>
                      <dt>Sucursal</dt>
                      <dd>{link.sucursalNombre}</dd>
                    </div>
                    <div>
                      <dt>Vence</dt>
                      <dd>{formatDateTime(link.expiresAt)}</dd>
                    </div>
                  </dl>
                  <div className="mobile-card-actions">
                    <button
                      className="secondary-action"
                      onClick={() => handleCopy(link.path)}
                      type="button"
                    >
                      <Copy size={16} />
                      <span>Copiar</span>
                    </button>
                    <button
                      className="secondary-action"
                      disabled={busyLinkId === link.$id}
                      onClick={() => handleRefresh(link.$id)}
                      type="button"
                    >
                      {busyLinkId === link.$id ? (
                        <Loader2 className="spin-icon" size={16} />
                      ) : (
                        <RefreshCw size={16} />
                      )}
                      <span>Actualizar</span>
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : (
          <div className="table-state">
            <LinkIcon size={22} />
            <span>Sin enlaces pendientes</span>
          </div>
        )}
      </div>
    </section>
  );
}
