import "server-only";

import {
  APPWRITE_DATABASE_ID,
  ID,
  Query,
  createAdminDatabases,
} from "@/lib/appwrite-server";
import { invokeSecureOperation } from "@/lib/secure-operations";

const PAYMENTS_COLLECTION_ID = "payments";
const TRANSACTIONS_COLLECTION_ID = "transactions";
const SYSTEM_CASHIER_ID = "sistema";

function getPaymentBalance(payment) {
  return Math.max(
    Number(payment.montoEsperado || 0) - Number(payment.montoPagado || 0),
    0,
  );
}

function calculatePaymentStatus({ fechaVencimiento, montoEsperado, montoPagado }) {
  const balance = Math.max(
    Number(montoEsperado || 0) - Number(montoPagado || 0),
    0,
  );

  if (balance <= 0) return "pagado";
  if (Number(montoPagado || 0) > 0) return "parcial";
  if (fechaVencimiento && fechaVencimiento < new Date().toISOString()) {
    return "vencido";
  }

  return "pendiente";
}

async function registerPublicTransactionLocally(paymentId, input) {
  const databases = createAdminDatabases();
  const payment = await databases.getDocument({
    collectionId: PAYMENTS_COLLECTION_ID,
    databaseId: APPWRITE_DATABASE_ID,
    documentId: paymentId,
  });
  const saldo = getPaymentBalance(payment);
  const amount = Number(input.monto);

  if (!Number.isFinite(amount) || amount <= 0 || amount > saldo) {
    return { error: "Monto inválido para esta mensualidad.", ok: false };
  }

  await databases.createDocument({
    collectionId: TRANSACTIONS_COLLECTION_ID,
    databaseId: APPWRITE_DATABASE_ID,
    data: {
      estado: "valida",
      fecha: new Date().toISOString(),
      metodoPago: input.metodoPago || "qr",
      monto: Number(amount.toFixed(2)),
      notas: input.notas || "",
      paymentId: payment.$id,
      referencia: input.referencia || "",
      registradoPor: SYSTEM_CASHIER_ID,
      studentId: payment.studentId,
      sucursalId: payment.sucursalId,
    },
    documentId: ID.unique(),
    permissions: [],
  });

  const transactionsResponse = await databases.listDocuments({
    collectionId: TRANSACTIONS_COLLECTION_ID,
    databaseId: APPWRITE_DATABASE_ID,
    queries: [Query.equal("paymentId", payment.$id), Query.limit(100)],
  });
  const montoPagado = transactionsResponse.documents
    .filter((transaction) => transaction.estado !== "anulada")
    .reduce((total, transaction) => total + Number(transaction.monto || 0), 0);
  const estado = calculatePaymentStatus({
    fechaVencimiento: payment.fechaVencimiento,
    montoEsperado: payment.montoEsperado,
    montoPagado,
  });

  await databases.updateDocument({
    collectionId: PAYMENTS_COLLECTION_ID,
    databaseId: APPWRITE_DATABASE_ID,
    documentId: payment.$id,
    data: { estado, montoPagado: Number(montoPagado.toFixed(2)) },
  });

  return { ok: true };
}

/**
 * Registers a payment transaction for callers that are NOT a staff session —
 * the public payment-link page and the public /estudiantes self-service
 * portal. Authorization is whatever the caller already verified (an
 * HMAC-signed payment-link token, or a document-number lookup scoped to a
 * single student/payment) — never call this from a path that hasn't
 * independently verified the caller is allowed to touch that paymentId.
 */
export async function registerPublicTransaction(paymentId, input) {
  const result = await invokeSecureOperation("registerTransaction", {
    input,
    paymentId,
  });

  return result.useLocalFallback
    ? registerPublicTransactionLocally(paymentId, input)
    : result;
}
