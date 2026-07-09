import "server-only";

import {
  APPWRITE_DATABASE_ID,
  Query,
  createAdminDatabases,
} from "@/lib/appwrite-server";
import { registerPublicTransaction } from "@/lib/public-payment-registration";
import { generateBanecoQr } from "@/lib/baneco";

const PAYMENTS_COLLECTION_ID = "payments";
const STUDENTS_COLLECTION_ID = "students";
const COURSES_COLLECTION_ID = "courses";
const BRANCHES_COLLECTION_ID = "branches";

function toCleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isOverdue(payment) {
  return (
    payment.saldo > 0 &&
    payment.fechaVencimiento &&
    payment.fechaVencimiento < new Date().toISOString()
  );
}

function sortByDueDate(payments) {
  return [...payments].sort((left, right) =>
    `${left.fechaVencimiento} ${left.periodo}`.localeCompare(
      `${right.fechaVencimiento} ${right.periodo}`,
      "es",
    ),
  );
}

function getPaymentBalance(payment) {
  return Math.max(
    Number(payment.montoEsperado || 0) - Number(payment.montoPagado || 0),
    0,
  );
}

/**
 * Authorization for everything in this file comes from the student's own
 * document number (CI) — this is the public, anonymous /estudiantes portal,
 * never a staff session. It talks to Appwrite directly with the admin
 * client, scoped only to the matched student's own payments, instead of
 * going through the staff-only Server Actions in src/actions/payments.js.
 */
async function findStudentByDocument(documento) {
  const databases = createAdminDatabases();
  const response = await databases.listDocuments({
    collectionId: STUDENTS_COLLECTION_ID,
    databaseId: APPWRITE_DATABASE_ID,
    queries: [Query.equal("documento", documento), Query.limit(1)],
  });

  return response.documents[0] || null;
}

async function listPaymentsByStudent(studentId) {
  const databases = createAdminDatabases();
  const documents = [];
  let cursor = null;

  do {
    const queries = [Query.equal("studentId", studentId), Query.limit(100)];

    if (cursor) queries.push(Query.cursorAfter(cursor));

    const response = await databases.listDocuments({
      collectionId: PAYMENTS_COLLECTION_ID,
      databaseId: APPWRITE_DATABASE_ID,
      queries,
    });

    documents.push(...response.documents);
    cursor = response.documents.at(-1)?.$id || null;

    if (response.documents.length < 100) cursor = null;
  } while (cursor);

  return documents;
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

async function buildCourseContext(payments) {
  const courseIds = [
    ...new Set(payments.map((payment) => payment.courseId).filter(Boolean)),
  ];
  const courses = await Promise.all(
    courseIds.map((id) => getDocumentOrNull(COURSES_COLLECTION_ID, id)),
  );
  const courseMap = new Map(
    courses.filter(Boolean).map((course) => [course.$id, course]),
  );
  const branchIds = [
    ...new Set(
      [...courseMap.values()].map((course) => course.sucursalId).filter(Boolean),
    ),
  ];
  const branches = await Promise.all(
    branchIds.map((id) => getDocumentOrNull(BRANCHES_COLLECTION_ID, id)),
  );
  const branchMap = new Map(
    branches.filter(Boolean).map((branch) => [branch.$id, branch]),
  );

  return { branchMap, courseMap };
}

function serializePublicPayment(payment, context) {
  const course = context.courseMap.get(payment.courseId);
  const branch = course ? context.branchMap.get(course.sucursalId) : null;

  return {
    $id: payment.$id,
    courseId: payment.courseId || "",
    courseName: course?.nombre || "Curso no encontrado",
    fechaVencimiento: payment.fechaVencimiento || "",
    periodo: payment.periodo || "",
    saldo: getPaymentBalance(payment),
    sucursalNombre: branch?.nombre || "Sin sucursal",
  };
}

async function getPublicPaymentById(paymentId) {
  const databases = createAdminDatabases();
  const payment = await databases.getDocument({
    collectionId: PAYMENTS_COLLECTION_ID,
    databaseId: APPWRITE_DATABASE_ID,
    documentId: paymentId,
  });
  const [student, course] = await Promise.all([
    databases.getDocument({
      collectionId: STUDENTS_COLLECTION_ID,
      databaseId: APPWRITE_DATABASE_ID,
      documentId: payment.studentId,
    }),
    databases.getDocument({
      collectionId: COURSES_COLLECTION_ID,
      databaseId: APPWRITE_DATABASE_ID,
      documentId: payment.courseId,
    }),
  ]);

  return {
    $id: payment.$id,
    courseName: course.nombre || "Curso no encontrado",
    fechaVencimiento: payment.fechaVencimiento || "",
    periodo: payment.periodo || "",
    saldo: getPaymentBalance(payment),
    studentName: `${student.nombre || ""} ${student.apellido || ""}`.trim(),
  };
}

export async function findPublicStudentByDocument(documento) {
  const cleanDocument = toCleanString(documento);

  if (!cleanDocument) {
    return { error: "Ingresa el CI del estudiante.", ok: false };
  }

  const studentDoc = await findStudentByDocument(cleanDocument);

  if (!studentDoc) {
    return {
      courses: [],
      error: "No se encontraron inscripciones para ese CI.",
      ok: false,
      student: null,
    };
  }

  const rawPayments = await listPaymentsByStudent(studentDoc.$id);

  if (!rawPayments.length) {
    return {
      courses: [],
      error: "No se encontraron inscripciones para ese CI.",
      ok: false,
      student: null,
    };
  }

  const context = await buildCourseContext(rawPayments);
  const studentPayments = rawPayments.map((payment) =>
    serializePublicPayment(payment, context),
  );
  const student = {
    documento: studentDoc.documento || cleanDocument,
    nombre: `${studentDoc.nombre || ""} ${studentDoc.apellido || ""}`.trim(),
  };
  const courseMap = new Map();

  for (const payment of studentPayments) {
    const course = courseMap.get(payment.courseId) || {
      courseId: payment.courseId,
      courseName: payment.courseName,
      overduePayments: [],
      sucursalNombre: payment.sucursalNombre,
    };

    if (isOverdue(payment)) {
      course.overduePayments.push(payment);
    }

    courseMap.set(payment.courseId, course);
  }

  const courses = Array.from(courseMap.values())
    .map((course) => {
      const overduePayments = sortByDueDate(course.overduePayments);
      const pendingPayment = overduePayments[0] || null;

      return {
        courseId: course.courseId,
        courseName: course.courseName,
        isUpToDate: !pendingPayment,
        pendingPayment: pendingPayment
          ? {
              amount: pendingPayment.saldo,
              dueDate: pendingPayment.fechaVencimiento,
              id: pendingPayment.$id,
              period: pendingPayment.periodo,
            }
          : null,
        sucursalNombre: course.sucursalNombre,
      };
    })
    .sort((left, right) =>
      left.courseName.localeCompare(right.courseName, "es"),
    );

  return { courses, ok: true, student };
}

export async function generatePublicStudentQr(paymentId) {
  const cleanPaymentId = toCleanString(paymentId);

  if (!cleanPaymentId) {
    return { error: "Selecciona una cuota pendiente.", ok: false };
  }

  const payment = await getPublicPaymentById(cleanPaymentId);

  if (!payment || !isOverdue(payment)) {
    return { error: "La cuota ya no está pendiente de pago.", ok: false };
  }

  const qr = await generateBanecoQr({
    amount: payment.saldo,
    description: `Cuota ${payment.periodo} - ${payment.studentName}`,
    transactionId: `student:${payment.$id}`,
  });

  return {
    amount: payment.saldo,
    courseName: payment.courseName,
    ok: true,
    paymentId: payment.$id,
    period: payment.periodo,
    qrId: qr.qrId,
    qrImage: qr.qrImage,
    studentName: payment.studentName,
  };
}

export async function confirmPublicStudentPayment(paymentId, qrId = "") {
  const cleanPaymentId = toCleanString(paymentId);
  const cleanQrId = toCleanString(qrId);

  if (!cleanPaymentId) {
    return { error: "No se encontró la cuota.", ok: false };
  }

  const payment = await getPublicPaymentById(cleanPaymentId);

  if (!payment) {
    return { error: "No se encontró la cuota.", ok: false };
  }

  if (payment.saldo <= 0) {
    return {
      ok: true,
      paid: true,
      studentName: payment.studentName,
    };
  }

  const result = await registerPublicTransaction(payment.$id, {
    metodoPago: "qr",
    monto: payment.saldo,
    notas: "Pago público desde /estudiantes",
    referencia: cleanQrId,
  });

  if (!result.ok) {
    return { error: result.error, ok: false };
  }

  return {
    amount: payment.saldo,
    ok: true,
    paid: true,
    studentName: payment.studentName,
  };
}
