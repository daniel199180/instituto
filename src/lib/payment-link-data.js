import "server-only";

import { listPayments, registerTransaction } from "@/actions/payments";
import { generateBanecoQr } from "@/lib/baneco";
import { parsePaymentLinkToken } from "@/lib/payment-links";

function getPaymentBalance(payment) {
  return Math.max(
    Number(payment.montoEsperado || 0) - Number(payment.montoPagado || 0),
    0,
  );
}

function formatLinkPayments(payments) {
  return payments
    .filter((payment) => getPaymentBalance(payment) > 0)
    .sort((left, right) =>
      `${left.fechaVencimiento} ${left.periodo}`.localeCompare(
        `${right.fechaVencimiento} ${right.periodo}`,
        "es",
      ),
    );
}

export async function getPaymentLinkData(token) {
  const link = parsePaymentLinkToken(token);
  const paymentsResult = await listPayments();

  if (!paymentsResult.ok) {
    return { error: paymentsResult.error, ok: false };
  }

  const payments =
    link.type === "enrollment"
      ? paymentsResult.payments.filter(
          (payment) => payment.enrollmentId === link.id,
        )
      : paymentsResult.payments.filter((payment) => payment.$id === link.id);
  const pendingPayments = formatLinkPayments(payments);
  const referencePayment = pendingPayments[0] || payments[0];

  if (!referencePayment) {
    return { error: "No se encontró la mensualidad del enlace.", ok: false };
  }

  const amount = Number(
    pendingPayments
      .reduce((total, payment) => total + getPaymentBalance(payment), 0)
      .toFixed(2),
  );
  const requestedAmount =
    Number.isFinite(link.amount) && link.amount > 0 ? link.amount : null;
  const linkAmount =
    requestedAmount && requestedAmount <= amount ? requestedAmount : amount;

  return {
    amount: Number(linkAmount.toFixed(2)),
    courseName: referencePayment.courseName,
    dueDate: referencePayment.fechaVencimiento,
    id: link.id,
    isPaid: amount <= 0,
    ok: true,
    payments: pendingPayments.map((payment) => ({
      amount: getPaymentBalance(payment),
      id: payment.$id,
      period: payment.periodo,
    })),
    period:
      link.type === "enrollment"
        ? "Inscripción"
        : referencePayment.periodo || "Mensualidad",
    studentName: referencePayment.studentName,
    sucursalNombre: referencePayment.sucursalNombre,
    title:
      link.type === "enrollment"
        ? "Inscripción al curso"
        : `Mensualidad ${referencePayment.periodo}`,
    type: link.type,
  };
}

export async function generatePaymentLinkQr(token) {
  const data = await getPaymentLinkData(token);

  if (!data.ok) return data;

  if (data.isPaid) {
    return { error: "Este pago ya fue confirmado.", ok: false };
  }

  const qr = await generateBanecoQr({
    amount: data.amount,
    description: `${data.title} - ${data.studentName}`,
    transactionId: `${data.type}:${data.id}`,
  });

  return {
    amount: data.amount,
    ok: true,
    qrId: qr.qrId,
    qrImage: qr.qrImage,
  };
}

export async function confirmPaymentLink(token, qrId = "") {
  const cleanQrId = typeof qrId === "string" ? qrId.trim() : "";
  const data = await getPaymentLinkData(token);

  if (!data.ok) return data;

  if (data.isPaid) {
    return {
      ok: true,
      paid: true,
      studentName: data.studentName,
    };
  }

  let remainingAmount = data.amount;

  for (const payment of data.payments) {
    if (remainingAmount <= 0) break;

    const amountToRegister = Math.min(payment.amount, remainingAmount);
    const result = await registerTransaction(payment.id, {
      metodoPago: "qr",
      monto: Number(amountToRegister.toFixed(2)),
      notas: "Pago por enlace de pago",
      referencia: cleanQrId,
    });

    if (!result.ok) {
      return { error: result.error, ok: false };
    }

    remainingAmount = Number((remainingAmount - amountToRegister).toFixed(2));
  }

  return {
    amount: data.amount,
    ok: true,
    paid: true,
    studentName: data.studentName,
  };
}
