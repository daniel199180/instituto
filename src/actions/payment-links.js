"use server";

import { revalidatePath } from "next/cache";
import {
  APPWRITE_DATABASE_ID,
  ID,
  Query,
  createAdminDatabases,
} from "@/lib/appwrite-server";
import { requireStaffSession } from "@/lib/auth-guard";

const PAYMENT_LINKS_COLLECTION_ID = "paymentLinks";
const PAYMENTS_COLLECTION_ID = "payments";
const LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function getActionError(error) {
  return error?.message || "No se pudo completar la operación.";
}

function serializePaymentLink(link) {
  return {
    $createdAt: link.$createdAt,
    $id: link.$id,
    amount: Number(link.amount || 0),
    courseName: link.courseName || "",
    estado: link.estado || "pendiente",
    expiresAt: link.expiresAt || "",
    path: `/pagar/${link.token}`,
    referenceId: link.referenceId || "",
    studentName: link.studentName || "",
    sucursalNombre: link.sucursalNombre || "",
    type: link.type || "payment",
  };
}

/**
 * Called right after a payment link token is created (POS charge or
 * enrollment flow) so it shows up as "pendiente" in the staff dashboard.
 * Guarded like every other staff action even though it's only ever invoked
 * in-process from src/actions/dashboard-pos.js.
 */
export async function createPaymentLinkRecord({
  amount,
  courseName,
  referenceId,
  studentId,
  studentName,
  sucursalNombre,
  token,
  type,
}) {
  try {
    await requireStaffSession();

    const databases = createAdminDatabases();
    const expiresAt = new Date(Date.now() + LINK_TTL_MS).toISOString();
    const link = await databases.createDocument({
      collectionId: PAYMENT_LINKS_COLLECTION_ID,
      databaseId: APPWRITE_DATABASE_ID,
      data: {
        amount: Number(amount || 0),
        courseName: courseName || "",
        estado: "pendiente",
        expiresAt,
        referenceId,
        studentId: studentId || "",
        studentName: studentName || "",
        sucursalNombre: sucursalNombre || "",
        token,
        type,
      },
      documentId: ID.unique(),
      permissions: [],
    });

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/pagos");

    return { link: serializePaymentLink(link), ok: true };
  } catch (error) {
    return { error: getActionError(error), ok: false };
  }
}

export async function listPendingPaymentLinks() {
  try {
    await requireStaffSession();

    const databases = createAdminDatabases();
    const response = await databases.listDocuments({
      collectionId: PAYMENT_LINKS_COLLECTION_ID,
      databaseId: APPWRITE_DATABASE_ID,
      queries: [
        Query.equal("estado", "pendiente"),
        Query.orderDesc("$createdAt"),
        Query.limit(100),
      ],
    });

    return {
      links: response.documents.map(serializePaymentLink),
      ok: true,
    };
  } catch (error) {
    return { error: getActionError(error), links: [], ok: false };
  }
}

async function isReferenceFullyPaid(databases, link) {
  if (link.type === "enrollment") {
    const response = await databases.listDocuments({
      collectionId: PAYMENTS_COLLECTION_ID,
      databaseId: APPWRITE_DATABASE_ID,
      queries: [
        Query.equal("enrollmentId", link.referenceId),
        Query.limit(100),
      ],
    });

    if (!response.documents.length) return false;

    return response.documents.every(
      (payment) =>
        Number(payment.montoEsperado || 0) - Number(payment.montoPagado || 0) <=
        0,
    );
  }

  const payment = await databases
    .getDocument({
      collectionId: PAYMENTS_COLLECTION_ID,
      databaseId: APPWRITE_DATABASE_ID,
      documentId: link.referenceId,
    })
    .catch(() => null);

  if (!payment) return false;

  return (
    Number(payment.montoEsperado || 0) - Number(payment.montoPagado || 0) <= 0
  );
}

/**
 * The "Actualizar" button: re-checks whether the referenced payment(s) are
 * now fully paid, or whether the link expired. When a student pays and
 * confirms on the public /pagar page, confirmPaymentLink() already marks
 * this record "pagado" directly — this is the manual fallback (e.g. the
 * cashier collected the same cuota another way while the link was open).
 */
export async function refreshPaymentLinkStatus(linkId) {
  try {
    await requireStaffSession();

    const databases = createAdminDatabases();
    const link = await databases.getDocument({
      collectionId: PAYMENT_LINKS_COLLECTION_ID,
      databaseId: APPWRITE_DATABASE_ID,
      documentId: linkId,
    });

    if (link.estado !== "pendiente") {
      return { link: serializePaymentLink(link), ok: true };
    }

    if (new Date(link.expiresAt).getTime() < Date.now()) {
      const updated = await databases.updateDocument({
        collectionId: PAYMENT_LINKS_COLLECTION_ID,
        databaseId: APPWRITE_DATABASE_ID,
        documentId: linkId,
        data: { estado: "expirado" },
      });

      revalidatePath("/dashboard");
      revalidatePath("/dashboard/pagos");

      return { link: serializePaymentLink(updated), ok: true };
    }

    const isPaid = await isReferenceFullyPaid(databases, link);

    if (!isPaid) {
      return { link: serializePaymentLink(link), ok: true };
    }

    const updated = await databases.updateDocument({
      collectionId: PAYMENT_LINKS_COLLECTION_ID,
      databaseId: APPWRITE_DATABASE_ID,
      documentId: linkId,
      data: { estado: "pagado", paidAt: new Date().toISOString() },
    });

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/pagos");

    return { link: serializePaymentLink(updated), ok: true };
  } catch (error) {
    return { error: getActionError(error), ok: false };
  }
}
