"use server";

import { createEnrollment, listEnrollments } from "@/actions/enrollments";
import { listPayments, registerTransaction } from "@/actions/payments";
import { createPaymentLinkRecord } from "@/actions/payment-links";
import { createStudent } from "@/actions/students";
import { createPaymentLinkToken } from "@/lib/payment-links";

function toCleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toNumber(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) return Number(value);
  return Number.NaN;
}

function getTodayDateInput() {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/La_Paz",
    year: "numeric",
  }).format(new Date());
}

function getPaymentBalance(payment) {
  return Math.max(
    Number(payment.montoEsperado || 0) - Number(payment.montoPagado || 0),
    0,
  );
}

function sortPaymentsByDueDate(payments) {
  return [...payments].sort((left, right) =>
    `${left.fechaVencimiento} ${left.periodo}`.localeCompare(
      `${right.fechaVencimiento} ${right.periodo}`,
      "es",
    ),
  );
}

function groupPaymentsByCourse(payments) {
  const courseMap = new Map();

  for (const payment of payments) {
    const group = courseMap.get(payment.courseId) || {
      courseId: payment.courseId,
      courseName: payment.courseName,
      deuda: 0,
      payments: [],
      sucursalNombre: payment.sucursalNombre,
    };

    group.deuda += getPaymentBalance(payment);
    group.payments.push(payment);
    courseMap.set(payment.courseId, group);
  }

  return Array.from(courseMap.values())
    .map((course) => ({
      ...course,
      deuda: Number(course.deuda.toFixed(2)),
      payments: sortPaymentsByDueDate(course.payments),
    }))
    .sort((left, right) =>
      left.courseName.localeCompare(right.courseName, "es"),
    );
}

export async function getDashboardPosData() {
  const result = await listEnrollments({ onlyOpenCourses: true });

  if (!result.ok) {
    return {
      branches: [],
      courses: [],
      error: result.error,
      ok: false,
      students: [],
    };
  }

  return {
    branches: result.branches,
    courses: result.courses,
    ok: true,
    students: result.students,
  };
}

export async function createPosEnrollment(input = {}) {
  const studentInput = {
    apellido: toCleanString(input.apellido),
    courseId: "",
    direccion: "",
    documento: toCleanString(input.documento),
    email: toCleanString(input.email),
    estado: "activo",
    fechaInscripcion: toCleanString(input.fechaInscripcion) || getTodayDateInput(),
    nombre: toCleanString(input.nombre),
    sucursalId: toCleanString(input.sucursalId),
    telefono: toCleanString(input.telefono),
  };
  const courseId = toCleanString(input.courseId);
  const paymentPlan = input.paymentPlan === "contado" ? "contado" : "mensual";
  const paymentMethod = ["qr", "enlace"].includes(input.paymentMethod)
    ? input.paymentMethod
    : "efectivo";
  const existingStudentId = toCleanString(input.existingStudentId);

  if (!courseId) {
    return { error: "Selecciona un curso.", ok: false };
  }

  let studentId = existingStudentId;
  let student = null;

  if (!studentId) {
    const studentResult = await createStudent(studentInput);

    if (!studentResult.ok) {
      return { error: studentResult.error, ok: false };
    }

    student = studentResult.student;
    studentId = student.$id;
  }

  const enrollmentResult = await createEnrollment({
    courseId,
    motivoBeca: toCleanString(input.motivoBeca),
    studentId,
    tipoBeca: toCleanString(input.tipoBeca) || "ninguna",
    valorBeca: toNumber(input.valorBeca || 0),
  });

  if (!enrollmentResult.ok) {
    return { error: enrollmentResult.error, ok: false };
  }

  const paidSummary = {
    count: 0,
    total: 0,
  };

  if (paymentPlan === "contado") {
    const paymentsResult = await listPayments({
      courseId,
      studentId,
    });

    if (!paymentsResult.ok) {
      return { error: paymentsResult.error, ok: false };
    }

    const enrollmentPayments = paymentsResult.payments.filter(
      (payment) => payment.enrollmentId === enrollmentResult.enrollment.$id,
    );

    if (paymentMethod === "qr" || paymentMethod === "enlace") {
      const pendingPayments = enrollmentPayments.filter(
        (payment) => getPaymentBalance(payment) > 0,
      );

      paidSummary.count = pendingPayments.length;
      paidSummary.total = Number(
        pendingPayments
          .reduce((total, payment) => total + getPaymentBalance(payment), 0)
          .toFixed(2),
      );

      const response = {
        enrollment: enrollmentResult.enrollment,
        ok: true,
        paidSummary,
        paymentPlan,
        student,
      };

      if (paymentMethod === "qr") {
        response.pendingQrPayment = {
          amount: paidSummary.total,
          enrollmentId: enrollmentResult.enrollment.$id,
        };
      } else {
        const token = createPaymentLinkToken({
          amount: paidSummary.total,
          id: enrollmentResult.enrollment.$id,
          type: "enrollment",
        });

        await createPaymentLinkRecord({
          amount: paidSummary.total,
          courseName: enrollmentResult.enrollment.courseName,
          referenceId: enrollmentResult.enrollment.$id,
          studentId: enrollmentResult.enrollment.studentId,
          studentName: enrollmentResult.enrollment.studentName,
          sucursalNombre: enrollmentResult.enrollment.sucursalName,
          token,
          type: "enrollment",
        });

        response.paymentLink = { path: `/pagar/${token}` };
      }

      return response;
    }

    for (const payment of enrollmentPayments) {
      const saldo = getPaymentBalance(payment);

      if (saldo <= 0) continue;

      const transactionResult = await registerTransaction(payment.$id, {
        metodoPago: paymentMethod,
        monto: saldo,
        notas: "Pago al contado desde Panel",
        referencia: toCleanString(input.paymentReference),
      });

      if (!transactionResult.ok) {
        return { error: transactionResult.error, ok: false };
      }

      paidSummary.count += 1;
      paidSummary.total += saldo;
    }

    paidSummary.total = Number(paidSummary.total.toFixed(2));
  }

  return {
    enrollment: enrollmentResult.enrollment,
    ok: true,
    paidSummary,
    paymentPlan,
    student,
  };
}

export async function registerPosEnrollmentQrPayment(enrollmentId, qrId = "") {
  const cleanEnrollmentId = toCleanString(enrollmentId);
  const cleanQrId = toCleanString(qrId);

  if (!cleanEnrollmentId) {
    return { error: "No se encontró la inscripción.", ok: false };
  }

  const paymentsResult = await listPayments();

  if (!paymentsResult.ok) {
    return { error: paymentsResult.error, ok: false };
  }

  const enrollmentPayments = paymentsResult.payments.filter(
    (payment) => payment.enrollmentId === cleanEnrollmentId,
  );
  const paidSummary = { count: 0, total: 0 };

  for (const payment of enrollmentPayments) {
    const saldo = getPaymentBalance(payment);

    if (saldo <= 0) continue;

    const transactionResult = await registerTransaction(payment.$id, {
      metodoPago: "qr",
      monto: saldo,
      notas: "Pago al contado por QR desde Panel",
      referencia: cleanQrId,
    });

    if (!transactionResult.ok) {
      return { error: transactionResult.error, ok: false };
    }

    paidSummary.count += 1;
    paidSummary.total += saldo;
  }

  paidSummary.total = Number(paidSummary.total.toFixed(2));

  return { ok: true, paidSummary };
}

export async function findStudentLedgerByDocument(documento) {
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
  const firstPayment = studentPayments[0];
  const student = firstPayment
    ? {
        documento: firstPayment.studentDocument,
        email: firstPayment.studentEmail,
        nombre: firstPayment.studentName,
        studentId: firstPayment.studentId,
        telefono: firstPayment.studentPhone,
      }
    : paymentsResult.students.find(
        (studentOption) => studentOption.documento === cleanDocument,
      );

  if (!student) {
    return {
      courses: [],
      error: "No se encontró un estudiante con ese CI.",
      ok: false,
      payments: [],
      student: null,
    };
  }

  return {
    courses: groupPaymentsByCourse(studentPayments),
    ok: true,
    payments: sortPaymentsByDueDate(studentPayments),
    student,
  };
}

export async function registerPosPayment(paymentId, method, amount) {
  const cleanPaymentId = toCleanString(paymentId);
  const metodoPago = method === "qr" ? "qr" : "efectivo";
  const requestedAmount = toNumber(amount);

  if (!cleanPaymentId) {
    return { error: "Selecciona una cuota.", ok: false };
  }

  const paymentsResult = await listPayments();

  if (!paymentsResult.ok) {
    return { error: paymentsResult.error, ok: false };
  }

  const payment = paymentsResult.payments.find(
    (item) => item.$id === cleanPaymentId,
  );

  if (!payment) {
    return { error: "No se encontró la cuota seleccionada.", ok: false };
  }

  const saldo = getPaymentBalance(payment);

  if (saldo <= 0) {
    return { error: "La cuota seleccionada ya está pagada.", ok: false };
  }

  if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
    return { error: "Ingresa un monto válido para cobrar.", ok: false };
  }

  if (requestedAmount > saldo) {
    return { error: "El monto a cobrar no puede superar el saldo.", ok: false };
  }

  return registerTransaction(payment.$id, {
    metodoPago,
    monto: Number(requestedAmount.toFixed(2)),
    notas: "Registro desde Panel",
    referencia: "",
  });
}

export async function createPosPaymentLink(paymentId, amount) {
  const cleanPaymentId = toCleanString(paymentId);
  const requestedAmount = toNumber(amount);

  if (!cleanPaymentId) {
    return { error: "Selecciona una cuota.", ok: false };
  }

  const paymentsResult = await listPayments();

  if (!paymentsResult.ok) {
    return { error: paymentsResult.error, ok: false };
  }

  const payment = paymentsResult.payments.find(
    (item) => item.$id === cleanPaymentId,
  );

  if (!payment) {
    return { error: "No se encontró la cuota seleccionada.", ok: false };
  }

  const saldo = getPaymentBalance(payment);

  if (saldo <= 0) {
    return { error: "La cuota seleccionada ya está pagada.", ok: false };
  }

  if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
    return { error: "Ingresa un monto válido para cobrar.", ok: false };
  }

  if (requestedAmount > saldo) {
    return { error: "El monto a cobrar no puede superar el saldo.", ok: false };
  }

  const token = createPaymentLinkToken({
    amount: requestedAmount,
    id: payment.$id,
    type: "payment",
  });

  await createPaymentLinkRecord({
    amount: requestedAmount,
    courseName: payment.courseName,
    referenceId: payment.$id,
    studentId: payment.studentId,
    studentName: payment.studentName,
    sucursalNombre: payment.sucursalNombre,
    token,
    type: "payment",
  });

  return {
    ok: true,
    path: `/pagar/${token}`,
  };
}
