import "server-only";

import {
  APPWRITE_DATABASE_ID,
  Query,
  createAdminDatabases,
} from "@/lib/appwrite-server";
import { registerPublicTransaction } from "@/lib/public-payment-registration";
import { generateBanecoQr } from "@/lib/baneco";
import { parsePaymentLinkToken } from "@/lib/payment-links";
import { PAYMENT_LINK_NOTE } from "@/lib/payment-constants";

const PAYMENTS_COLLECTION_ID = "payments";
const STUDENTS_COLLECTION_ID = "students";
const COURSES_COLLECTION_ID = "courses";
const BRANCHES_COLLECTION_ID = "branches";
const PAYMENT_LINKS_COLLECTION_ID = "paymentLinks";

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

/**
 * Authorization for everything in this file comes from the HMAC-signed
 * payment-link token (see payment-links.js), never from a staff session —
 * this flow is used by anonymous students/guardians. It talks to Appwrite
 * directly with the admin client, scoped to only the payment(s) named in
 * the token, instead of going through the staff-only Server Actions in
 * src/actions/payments.js.
 */
async function fetchLinkPayments(link) {
  const databases = createAdminDatabases();

  if (link.type === "enrollment") {
    const response = await databases.listDocuments({
      collectionId: PAYMENTS_COLLECTION_ID,
      databaseId: APPWRITE_DATABASE_ID,
      queries: [Query.equal("enrollmentId", link.id), Query.limit(100)],
    });

    return response.documents;
  }

  try {
    const payment = await databases.getDocument({
      collectionId: PAYMENTS_COLLECTION_ID,
      databaseId: APPWRITE_DATABASE_ID,
      documentId: link.id,
    });

    return [payment];
  } catch {
    return [];
  }
}

async function getDocumentOrNull(collectionId, documentId) {
  if (!documentId) return null;

  try {
    const databases = createAdminDatabases();

    return await databases.getDocument({
      collectionId,
      databaseId: APPWRITE_DATABASE_ID,
      documentId,
    });
  } catch {
    return null;
  }
}

async function serializeLinkPayment(payment) {
  const [student, course] = await Promise.all([
    getDocumentOrNull(STUDENTS_COLLECTION_ID, payment.studentId),
    getDocumentOrNull(COURSES_COLLECTION_ID, payment.courseId),
  ]);
  const branch = await getDocumentOrNull(
    BRANCHES_COLLECTION_ID,
    course?.sucursalId,
  );

  return {
    $id: payment.$id,
    courseName: course?.nombre || "Curso no encontrado",
    enrollmentId: payment.enrollmentId || "",
    fechaVencimiento: payment.fechaVencimiento || "",
    montoEsperado: Number(payment.montoEsperado || 0),
    montoPagado: Number(payment.montoPagado || 0),
    periodo: payment.periodo || "",
    studentName:
      `${student?.nombre || ""} ${student?.apellido || ""}`.trim() ||
      "Estudiante no encontrado",
    sucursalNombre: branch?.nombre || "Sin sucursal",
  };
}

export async function getPaymentLinkData(token) {
  const link = parsePaymentLinkToken(token);
  const rawPayments = await fetchLinkPayments(link);

  if (!rawPayments.length) {
    return { error: "No se encontró la mensualidad del enlace.", ok: false };
  }

  const payments = await Promise.all(rawPayments.map(serializeLinkPayment));
  const pendingPayments = formatLinkPayments(payments);
  const referencePayment = pendingPayments[0] || payments[0];

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

async function markPaymentLinkPaid(token) {
  try {
    const databases = createAdminDatabases();
    const response = await databases.listDocuments({
      collectionId: PAYMENT_LINKS_COLLECTION_ID,
      databaseId: APPWRITE_DATABASE_ID,
      queries: [Query.equal("token", token), Query.limit(1)],
    });
    const link = response.documents[0];

    if (!link || link.estado === "pagado") return;

    await databases.updateDocument({
      collectionId: PAYMENT_LINKS_COLLECTION_ID,
      databaseId: APPWRITE_DATABASE_ID,
      documentId: link.$id,
      data: { estado: "pagado", paidAt: new Date().toISOString() },
    });
  } catch {
    // Best-effort bookkeeping only — the actual payment already succeeded
    // above, so a tracking-record hiccup here must never fail the request.
  }
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
    const result = await registerPublicTransaction(payment.id, {
      metodoPago: "qr",
      monto: Number(amountToRegister.toFixed(2)),
      notas: PAYMENT_LINK_NOTE,
      referencia: cleanQrId,
    });

    if (!result.ok) {
      return { error: result.error, ok: false };
    }

    remainingAmount = Number((remainingAmount - amountToRegister).toFixed(2));
  }

  await markPaymentLinkPaid(token);

  return {
    amount: data.amount,
    ok: true,
    paid: true,
    studentName: data.studentName,
  };
}
