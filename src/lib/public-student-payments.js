import "server-only";

import { listPayments, registerTransaction } from "@/actions/payments";
import {
  APPWRITE_DATABASE_ID,
  createAdminDatabases,
} from "@/lib/appwrite-server";
import { generateBanecoQr } from "@/lib/baneco";

const PAYMENTS_COLLECTION_ID = "payments";
const STUDENTS_COLLECTION_ID = "students";
const COURSES_COLLECTION_ID = "courses";

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

  const paymentsResult = await listPayments();

  if (!paymentsResult.ok) {
    return { error: paymentsResult.error, ok: false };
  }

  const studentPayments = paymentsResult.payments.filter(
    (payment) => payment.studentDocument === cleanDocument,
  );

  if (!studentPayments.length) {
    return {
      courses: [],
      error: "No se encontraron inscripciones para ese CI.",
      ok: false,
      student: null,
    };
  }

  const student = {
    documento: studentPayments[0].studentDocument,
    nombre: studentPayments[0].studentName,
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

  const result = await registerTransaction(payment.$id, {
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
