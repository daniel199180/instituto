"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Check, Download, Loader2, QrCode, WalletCards } from "lucide-react";

function formatMoney(value) {
  return `Bs ${Number(value || 0).toLocaleString("es-BO", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;
}

function formatDate(value) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("es-BO", {
    day: "2-digit",
    month: "short",
    timeZone: "America/La_Paz",
    year: "numeric",
  }).format(new Date(value));
}

function downloadQrAsJpg(qrImage, fileName) {
  const image = new Image();

  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0);

    const link = document.createElement("a");
    link.download = fileName;
    link.href = canvas.toDataURL("image/jpeg", 0.92);
    link.click();
  };

  image.src = `data:image/png;base64,${qrImage}`;
}

export function PaymentLinkClient({ token }) {
  const [data, setData] = useState(null);
  const [qr, setQr] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      try {
        const response = await fetch(`/api/payment-links/${token}`);
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "No se pudo abrir el enlace.");
        }

        setData(result);
      } catch (loadError) {
        setError(loadError.message || "No se pudo abrir el enlace.");
      }
    });
  }, [token]);

  async function generateQr() {
    setError("");
    setNotice("");

    startTransition(async () => {
      try {
        const response = await fetch(`/api/payment-links/${token}/qr`, {
          method: "POST",
        });
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "No se pudo generar el QR.");
        }

        setQr(result);
      } catch (qrError) {
        setError(qrError.message || "No se pudo generar el QR.");
      }
    });
  }

  async function confirmPayment() {
    if (!qr?.qrId) {
      setError("Genera el QR antes de confirmar el pago.");
      return;
    }

    setError("");
    setNotice("");

    startTransition(async () => {
      try {
        const statusResponse = await fetch(
          `/api/payments/baneco/status?qrId=${encodeURIComponent(qr.qrId)}`,
        );
        const statusResult = await statusResponse.json();

        if (!statusResponse.ok) {
          throw new Error(statusResult.error || "No se pudo verificar el QR.");
        }

        if (statusResult.status === "pending") {
          setNotice("El QR sigue pendiente de pago.");
          return;
        }

        if (statusResult.status === "cancelled") {
          throw new Error("Banco Económico reportó el QR como cancelado.");
        }

        const response = await fetch(`/api/payment-links/${token}/confirm`, {
          body: JSON.stringify({ qrId: qr.qrId }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "No se pudo confirmar el pago.");
        }

        setData((currentData) =>
          currentData ? { ...currentData, isPaid: true } : currentData,
        );
        setQr(null);
        setConfirmation({
          message: `Gracias ${result.studentName}, tu pago fue confirmado.`,
          title: "Pago confirmado",
        });
      } catch (confirmError) {
        setError(confirmError.message || "No se pudo confirmar el pago.");
      }
    });
  }

  return (
    <main className="payment-link-page">
      <section className="payment-link-card">
        <h1>Enlace de pago</h1>

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        {notice ? <p className="form-note">{notice}</p> : null}

        {!data && !error ? (
          <div className="table-state compact-state">
            <Loader2 className="spin-icon" size={22} />
            <span>Cargando enlace</span>
          </div>
        ) : null}

        {data ? (
          <>
            <div className="payment-link-summary">
              <div>
                <span>Estudiante</span>
                <strong>{data.studentName}</strong>
              </div>
              <div>
                <span>Curso</span>
                <strong>{data.courseName}</strong>
              </div>
              <div>
                <span>Cuota</span>
                <strong>
                  {data.period} · {formatDate(data.dueDate)}
                </strong>
              </div>
              <div className="payment-link-amount">
                <span>Monto a pagar</span>
                <strong>{formatMoney(data.amount)}</strong>
              </div>
            </div>

            {data.isPaid ? (
              <div className="payment-link-success">
                <Check size={24} />
                <strong>Gracias {data.studentName}, el pago está confirmado.</strong>
              </div>
            ) : (
              <div className="payment-link-actions">
                <button
                  className="primary-action"
                  disabled={isPending}
                  onClick={generateQr}
                  type="button"
                >
                  {isPending && !qr ? (
                    <Loader2 className="spin-icon" size={18} />
                  ) : (
                    <QrCode size={18} />
                  )}
                  <span>Pagar con QR</span>
                </button>

                {qr ? <p className="form-note">QR generado.</p> : null}
              </div>
            )}
          </>
        ) : null}
      </section>

      {qr && data && !data.isPaid ? (
        <div className="pos-confirmation-layer" role="presentation">
          <div
            aria-labelledby="payment-link-qr-title"
            aria-modal="true"
            className="pos-confirmation-dialog payment-link-qr-dialog"
            role="dialog"
          >
            <div>
              <p className="eyebrow">Banco Económico</p>
              <h2 id="payment-link-qr-title">Pagar con QR</h2>
              <p>
                Escanea el QR por {formatMoney(qr.amount)} para pagar la cuota{" "}
                {data.period}.
              </p>
            </div>
            <img
              alt={`QR Baneco ${qr.qrId}`}
              className="baneco-qr-image"
              src={`data:image/png;base64,${qr.qrImage}`}
            />
            <small>QR: {qr.qrId}</small>
            <div className="payment-link-modal-actions">
              <button
                className="secondary-action"
                onClick={() =>
                  downloadQrAsJpg(
                    qr.qrImage,
                    `qr-${data.studentName}-${data.period}.jpg`,
                  )
                }
                type="button"
              >
                <Download size={18} />
                <span>Descargar QR</span>
              </button>
              <button
                className="primary-action"
                disabled={isPending}
                onClick={confirmPayment}
                type="button"
              >
                {isPending ? (
                  <Loader2 className="spin-icon" size={18} />
                ) : (
                  <Check size={18} />
                )}
                <span>Confirmar pago</span>
              </button>
              <button
                className="secondary-action"
                disabled={isPending}
                onClick={() => setQr(null)}
                type="button"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmation ? (
        <div className="pos-confirmation-layer" role="presentation">
          <div
            aria-labelledby="payment-link-confirmation-title"
            aria-modal="true"
            className="pos-confirmation-dialog payment-link-confirmation-dialog"
            role="dialog"
          >
            <span className="pos-confirmation-icon">
              <Check size={24} strokeWidth={2} />
            </span>
            <div>
              <p className="eyebrow">Confirmación</p>
              <h2 id="payment-link-confirmation-title">
                {confirmation.title}
              </h2>
              <p>{confirmation.message}</p>
            </div>
            <div className="payment-link-modal-actions">
              <Link className="primary-action" href="/estudiantes">
                <WalletCards size={18} />
                <span>Consulta tus pagos aquí</span>
              </Link>
              <button
                className="secondary-action"
                onClick={() => setConfirmation(null)}
                type="button"
              >
                <Check size={18} />
                <span>Aceptar</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
