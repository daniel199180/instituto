"use client";

import { useState, useTransition } from "react";
import { Check, Download, Loader2, QrCode, Search } from "lucide-react";

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

export function PublicStudentsClient() {
  const [documento, setDocumento] = useState("");
  const [result, setResult] = useState(null);
  const [qrDialog, setQrDialog] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [qrGeneratingPaymentId, setQrGeneratingPaymentId] = useState("");
  const [isPending, startTransition] = useTransition();

  function searchStudent(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    setConfirmation(null);
    setQrDialog(null);

    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/public-students?documento=${encodeURIComponent(documento)}`,
        );
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "No se pudo buscar el estudiante.");
        }

        setResult(data);
      } catch (searchError) {
        setResult(null);
        setError(searchError.message || "No se pudo buscar el estudiante.");
      }
    });
  }

  function generateQr(payment) {
    setError("");
    setNotice("");
    setQrGeneratingPaymentId(payment.id);

    startTransition(async () => {
      try {
        const response = await fetch("/api/public-students/qr", {
          body: JSON.stringify({ paymentId: payment.id }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "No se pudo generar el QR.");
        }

        setQrDialog(data);
      } catch (qrError) {
        setError(qrError.message || "No se pudo generar el QR.");
      } finally {
        setQrGeneratingPaymentId("");
      }
    });
  }

  function confirmPayment() {
    if (!qrDialog?.qrId || !qrDialog?.paymentId) return;

    setError("");
    setNotice("");

    startTransition(async () => {
      try {
        const statusResponse = await fetch(
          `/api/payments/baneco/status?qrId=${encodeURIComponent(qrDialog.qrId)}`,
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

        const response = await fetch("/api/public-students/confirm", {
          body: JSON.stringify({
            paymentId: qrDialog.paymentId,
            qrId: qrDialog.qrId,
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "No se pudo confirmar el pago.");
        }

        setQrDialog(null);
        setConfirmation(`Gracias ${data.studentName}, tu pago fue confirmado.`);
        setNotice("");
        if (documento) {
          const refreshResponse = await fetch(
            `/api/public-students?documento=${encodeURIComponent(documento)}`,
          );
          const refreshData = await refreshResponse.json();

          if (refreshResponse.ok) {
            setResult(refreshData);
          }
        }
      } catch (confirmError) {
        setError(confirmError.message || "No se pudo confirmar el pago.");
      }
    });
  }

  return (
    <main className="public-students-page">
      <section className="public-students-shell">
        <header className="public-students-header">
          <p className="eyebrow">Portal de estudiantes</p>
          <h1>Consulta de cuotas</h1>
        </header>

        <form className="public-students-search" onSubmit={searchStudent}>
          <label className="search-control">
            <Search size={18} strokeWidth={1.8} />
            <input
              onChange={(event) => setDocumento(event.target.value)}
              placeholder="Ingresa tu CI"
              required
              value={documento}
            />
          </label>
          <button className="primary-action" disabled={isPending} type="submit">
            {isPending ? (
              <Loader2 className="spin-icon" size={18} />
            ) : (
              <Search size={18} />
            )}
            <span>Buscar</span>
          </button>
        </form>

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        {notice ? <p className="form-note">{notice}</p> : null}

        {confirmation ? (
          <div className="public-students-success">
            <Check size={22} />
            <strong>{confirmation}</strong>
          </div>
        ) : null}

        {result ? (
          <section className="public-students-result">
            <div className="public-student-strip">
              <strong>{result.student.nombre}</strong>
              <span>CI {result.student.documento}</span>
            </div>

            <div className="public-course-grid">
              {result.courses.map((course) => (
                <article className="public-course-card" key={course.courseId}>
                  <div>
                    <span className="eyebrow">Curso</span>
                    <h2>{course.courseName}</h2>
                    <p>{course.sucursalNombre}</p>
                  </div>

                  {course.isUpToDate ? (
                    <div className="public-course-ok">
                      <Check size={20} />
                      <strong>Estás al día</strong>
                    </div>
                  ) : (
                    <div className="public-payment-due">
                      <div className="public-payment-due-copy">
                        <span>Cuota vencida</span>
                        <strong>{course.pendingPayment.period}</strong>
                        <small>
                          Venció el {formatDate(course.pendingPayment.dueDate)}
                        </small>
                      </div>
                      <b>{formatMoney(course.pendingPayment.amount)}</b>
                      <button
                        className="primary-action public-payment-button"
                        disabled={isPending}
                        onClick={() => generateQr(course.pendingPayment)}
                        type="button"
                      >
                        {qrGeneratingPaymentId ===
                        course.pendingPayment.id ? (
                          <Loader2 className="spin-icon" size={18} />
                        ) : (
                          <QrCode size={18} />
                        )}
                        <span>
                          {qrGeneratingPaymentId === course.pendingPayment.id
                            ? "Generando QR..."
                            : "Pagar cuota"}
                        </span>
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </section>

      {qrDialog ? (
        <div className="pos-confirmation-layer" role="presentation">
          <div
            aria-labelledby="public-student-qr-title"
            aria-modal="true"
            className="pos-confirmation-dialog public-student-qr-dialog"
            role="dialog"
          >
            <div>
              <p className="eyebrow">Banco Económico</p>
              <h2 id="public-student-qr-title">Pagar cuota pendiente</h2>
              <p>
                {qrDialog.period} · {qrDialog.courseName} ·{" "}
                {formatMoney(qrDialog.amount)}
              </p>
            </div>
            <img
              alt={`QR Baneco ${qrDialog.qrId}`}
              className="baneco-qr-image"
              src={`data:image/png;base64,${qrDialog.qrImage}`}
            />
            <small>QR: {qrDialog.qrId}</small>
            <div className="payment-link-modal-actions">
              <button
                className="secondary-action"
                onClick={() =>
                  downloadQrAsJpg(
                    qrDialog.qrImage,
                    `qr-${qrDialog.studentName}-${qrDialog.period}.jpg`,
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
                onClick={() => setQrDialog(null)}
                type="button"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
