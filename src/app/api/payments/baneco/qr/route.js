import { NextResponse } from "next/server";
import { generateBanecoQr } from "@/lib/baneco";
import {
  APPWRITE_DATABASE_ID,
  Query,
  createAdminDatabases,
} from "@/lib/appwrite-server";

const PAYMENTS_COLLECTION_ID = "payments";

function jsonError(error, status) {
  return NextResponse.json({ error }, { status });
}

function getPaymentBalance(payment) {
  return Math.max(
    Number(payment.montoEsperado || 0) - Number(payment.montoPagado || 0),
    0,
  );
}

function toNumber(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) return Number(value);
  return Number.NaN;
}

async function listEnrollmentPayments(databases, enrollmentId) {
  const documents = [];
  let cursor = null;

  do {
    const queries = [
      Query.equal("enrollmentId", enrollmentId),
      Query.limit(100),
      Query.select([
        "$id",
        "periodo",
        "montoEsperado",
        "montoPagado",
        "estado",
      ]),
    ];

    if (cursor) {
      queries.push(Query.cursorAfter(cursor));
    }

    const response = await databases.listDocuments({
      collectionId: PAYMENTS_COLLECTION_ID,
      databaseId: APPWRITE_DATABASE_ID,
      queries,
      total: false,
    });

    documents.push(...response.documents);
    cursor = response.documents.at(-1)?.$id || null;

    if (response.documents.length < 100) {
      cursor = null;
    }
  } while (cursor);

  return documents;
}

async function resolvePaymentQr(payload) {
  const databases = createAdminDatabases();
  const paymentId =
    typeof payload.paymentId === "string" ? payload.paymentId.trim() : "";

  if (!paymentId) {
    return { error: "No se encontró la mensualidad.", ok: false };
  }

  const payment = await databases.getDocument({
    collectionId: PAYMENTS_COLLECTION_ID,
    databaseId: APPWRITE_DATABASE_ID,
    documentId: paymentId,
  });
  const balance = getPaymentBalance(payment);
  const requestedAmount = toNumber(payload.amount);
  const amount = Number.isFinite(requestedAmount) ? requestedAmount : balance;

  if (balance <= 0) {
    return { error: "La mensualidad no tiene saldo pendiente.", ok: false };
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "Ingresa un monto válido.", ok: false };
  }

  if (amount > balance) {
    return { error: "El monto no puede superar el saldo pendiente.", ok: false };
  }

  return {
    amount: Number(amount.toFixed(2)),
    description: `Mensualidad ${payment.periodo || payment.$id}`,
    ok: true,
    transactionId: payment.$id,
  };
}

async function resolveEnrollmentQr(payload) {
  const databases = createAdminDatabases();
  const enrollmentId =
    typeof payload.enrollmentId === "string" ? payload.enrollmentId.trim() : "";

  if (!enrollmentId) {
    return { error: "No se encontró la inscripción.", ok: false };
  }

  const payments = await listEnrollmentPayments(databases, enrollmentId);
  const pendingPayments = payments.filter((payment) => getPaymentBalance(payment) > 0);
  const amount = pendingPayments.reduce(
    (total, payment) => total + getPaymentBalance(payment),
    0,
  );

  if (amount <= 0) {
    return { error: "La inscripción no tiene saldo pendiente.", ok: false };
  }

  return {
    amount: Number(amount.toFixed(2)),
    description: `Inscripción ${enrollmentId}`,
    ok: true,
    transactionId: enrollmentId,
  };
}

export async function POST(request) {
  let payload;

  try {
    payload = await request.json();
  } catch {
    return jsonError("Solicitud inválida.", 400);
  }

  try {
    const type = typeof payload.type === "string" ? payload.type : "";
    const resolved =
      type === "enrollment"
        ? await resolveEnrollmentQr(payload)
        : await resolvePaymentQr(payload);

    if (!resolved.ok) {
      return jsonError(resolved.error, 400);
    }

    const qr = await generateBanecoQr({
      amount: resolved.amount,
      description: resolved.description,
      transactionId: resolved.transactionId,
    });

    return NextResponse.json({
      amount: resolved.amount,
      qrId: qr.qrId,
      qrImage: qr.qrImage,
    });
  } catch (error) {
    return jsonError(
      error?.message || "No se pudo generar el QR de Banco Económico.",
      400,
    );
  }
}
