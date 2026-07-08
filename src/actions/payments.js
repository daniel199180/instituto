"use server";

import { revalidatePath } from "next/cache";
import {
  APPWRITE_DATABASE_ID,
  ID,
  Query,
  createAdminDatabases,
} from "@/lib/appwrite-server";
import { invokeSecureOperation } from "@/lib/secure-operations";

const PAYMENTS_COLLECTION_ID = "payments";
const TRANSACTIONS_COLLECTION_ID = "transactions";
const STUDENTS_COLLECTION_ID = "students";
const COURSES_COLLECTION_ID = "courses";
const BRANCHES_COLLECTION_ID = "branches";
const CAREERS_COLLECTION_ID = "careers";
const SYSTEM_CASHIER_ID = "sistema";
const VALID_PAYMENT_STATUSES = new Set([
  "pendiente",
  "parcial",
  "pagado",
  "vencido",
]);
const DEBT_STATUSES = ["pendiente", "parcial", "vencido"];
const VALID_TRANSACTION_STATUSES = new Set(["valida", "anulada"]);
const VALID_PAYMENT_METHODS = new Set(["efectivo", "qr"]);

function toCleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toNumber(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) return Number(value);
  return Number.NaN;
}

function getActionError(error) {
  return error?.message || "No se pudo completar la operación.";
}

function getLaPazDateParts(value) {
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/La_Paz",
    year: "numeric",
  }).formatToParts(date);
  const partMap = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );

  return {
    day: Number(partMap.day),
    month: Number(partMap.month),
    year: Number(partMap.year),
  };
}

function toLaPazDateIso(year, month, day, endOfDay = false) {
  const base = new Date(
    Date.UTC(
      year,
      month - 1,
      day,
      endOfDay ? 27 : 4,
      endOfDay ? 59 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 999 : 0,
    ),
  );

  return base.toISOString();
}

function getDateRangeForInput(dateInput) {
  const cleanDate = toCleanString(dateInput);
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(cleanDate)
    ? new Date(`${cleanDate}T04:00:00.000Z`)
    : new Date();
  const parts = getLaPazDateParts(parsed);

  return {
    date: `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(
      parts.day,
    ).padStart(2, "0")}`,
    end: toLaPazDateIso(parts.year, parts.month, parts.day, true),
    start: toLaPazDateIso(parts.year, parts.month, parts.day),
  };
}

function parseDateBoundary(value, fallbackDate, endOfDay = false) {
  const cleanValue = toCleanString(value);

  if (/^\d{4}-\d{2}-\d{2}$/.test(cleanValue)) {
    const [year, month, day] = cleanValue.split("-").map(Number);

    return toLaPazDateIso(year, month, day, endOfDay);
  }

  const fallback = getLaPazDateParts(fallbackDate);

  return toLaPazDateIso(fallback.year, fallback.month, fallback.day, endOfDay);
}

function normalizePaymentStatus(status) {
  return VALID_PAYMENT_STATUSES.has(status) ? status : "pendiente";
}

function normalizeTransactionStatus(status) {
  return VALID_TRANSACTION_STATUSES.has(status) ? status : "valida";
}

function getPaymentBalance(payment) {
  return Math.max(
    Number(payment.montoEsperado || 0) - Number(payment.montoPagado || 0),
    0,
  );
}

function calculatePaymentStatus({
  fechaVencimiento,
  montoEsperado,
  montoPagado,
}) {
  const balance = Math.max(
    Number(montoEsperado || 0) - Number(montoPagado || 0),
    0,
  );

  if (balance <= 0) {
    return "pagado";
  }

  if (Number(montoPagado || 0) > 0) {
    return "parcial";
  }

  if (fechaVencimiento && fechaVencimiento < new Date().toISOString()) {
    return "vencido";
  }

  return "pendiente";
}

async function listAllDocuments(collectionId, queries = []) {
  const databases = createAdminDatabases();
  const documents = [];
  let cursor = null;

  do {
    const pageQueries = [...queries, Query.limit(100)];

    if (cursor) {
      pageQueries.push(Query.cursorAfter(cursor));
    }

    const response = await databases.listDocuments({
      collectionId,
      databaseId: APPWRITE_DATABASE_ID,
      queries: pageQueries,
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

function sortByName(items) {
  return items.sort((left, right) =>
    left.nombre.localeCompare(right.nombre, "es"),
  );
}

function serializeBranch(branch) {
  return {
    $id: branch.$id,
    estado: branch.estado || "activo",
    nombre: branch.nombre || "",
    tipo: branch.tipo || "presencial",
  };
}

function serializeCareer(career) {
  return {
    $id: career.$id,
    estado: career.estado || "activo",
    nombre: career.nombre || "",
    sucursalId: career.sucursalId || "",
  };
}

function serializeCourse(course, context = {}) {
  const branch = context.branchMap?.get(course.sucursalId);
  const career = context.careerMap?.get(course.carreraId);

  return {
    $id: course.$id,
    carreraId: course.carreraId || "",
    carreraNombre: career?.nombre || "Curso independiente",
    estado: course.estado || "cerrado",
    nombre: course.nombre || "",
    sucursalId: course.sucursalId || "",
    sucursalNombre: branch?.nombre || "Sin sucursal",
  };
}

function serializeStudent(student) {
  return {
    $id: student.$id,
    documento: student.documento || "",
    email: student.email || "",
    estado: student.estado || "activo",
    nombre: `${student.nombre || ""} ${student.apellido || ""}`.trim(),
    telefono: student.telefono || "",
  };
}

function serializePayment(payment, context = {}) {
  const student = context.studentMap?.get(payment.studentId);
  const course = context.courseMap?.get(payment.courseId);
  const branch = context.branchMap?.get(payment.sucursalId);
  const balance = getPaymentBalance(payment);

  return {
    $createdAt: payment.$createdAt,
    $id: payment.$id,
    $updatedAt: payment.$updatedAt,
    carreraId: course?.carreraId || "",
    carreraNombre: course?.carreraNombre || "",
    courseId: payment.courseId || "",
    courseName: course?.nombre || "Curso no encontrado",
    enrollmentId: payment.enrollmentId || "",
    estado: normalizePaymentStatus(payment.estado),
    fechaVencimiento: payment.fechaVencimiento || "",
    montoEsperado: Number(payment.montoEsperado || 0),
    montoPagado: Number(payment.montoPagado || 0),
    notas: payment.notas || "",
    periodo: payment.periodo || "",
    saldo: balance,
    studentDocument: student?.documento || "",
    studentEmail: student?.email || "",
    studentId: payment.studentId || "",
    studentName: student?.nombre || "Estudiante no encontrado",
    studentPhone: student?.telefono || "",
    sucursalId: payment.sucursalId || "",
    sucursalNombre: branch?.nombre || course?.sucursalNombre || "Sin sucursal",
  };
}

function serializeTransaction(transaction, context = {}) {
  const student = context.studentMap?.get(transaction.studentId);
  const payment = context.paymentMap?.get(transaction.paymentId);
  const course = payment ? context.courseMap?.get(payment.courseId) : null;
  const branch = context.branchMap?.get(transaction.sucursalId);

  return {
    $createdAt: transaction.$createdAt,
    $id: transaction.$id,
    anuladoPor: transaction.anuladoPor || "",
    courseId: course?.$id || payment?.courseId || "",
    courseName: course?.nombre || "Curso no encontrado",
    estado: normalizeTransactionStatus(transaction.estado),
    fecha: transaction.fecha || "",
    fechaAnulacion: transaction.fechaAnulacion || "",
    metodoPago: transaction.metodoPago || "efectivo",
    monto: Number(transaction.monto || 0),
    motivoAnulacion: transaction.motivoAnulacion || "",
    notas: transaction.notas || "",
    paymentId: transaction.paymentId || "",
    periodo: payment?.periodo || "",
    referencia: transaction.referencia || "",
    registradoPor: transaction.registradoPor || "",
    studentDocument: student?.documento || "",
    studentId: transaction.studentId || "",
    studentName: student?.nombre || "Estudiante no encontrado",
    sucursalId: transaction.sucursalId || "",
    sucursalNombre: branch?.nombre || course?.sucursalNombre || "Sin sucursal",
  };
}

async function getFinancialContext() {
  const [branches, careers, courses, students] = await Promise.all([
    listAllDocuments(BRANCHES_COLLECTION_ID, [
      Query.select(["$id", "nombre", "tipo", "estado"]),
    ]),
    listAllDocuments(CAREERS_COLLECTION_ID, [
      Query.select(["$id", "nombre", "sucursalId", "estado"]),
    ]),
    listAllDocuments(COURSES_COLLECTION_ID, [
      Query.select(["$id", "nombre", "sucursalId", "carreraId", "estado"]),
    ]),
    listAllDocuments(STUDENTS_COLLECTION_ID, [
      Query.select([
        "$id",
        "nombre",
        "apellido",
        "documento",
        "email",
        "telefono",
        "estado",
      ]),
    ]),
  ]);
  const serializedBranches = sortByName(branches.map(serializeBranch));
  const serializedCareers = sortByName(careers.map(serializeCareer));
  const branchMap = new Map(
    serializedBranches.map((branch) => [branch.$id, branch]),
  );
  const careerMap = new Map(
    serializedCareers.map((career) => [career.$id, career]),
  );
  const serializedCourses = sortByName(
    courses.map((course) => serializeCourse(course, { branchMap, careerMap })),
  );
  const serializedStudents = sortByName(students.map(serializeStudent));

  return {
    branchMap,
    branches: serializedBranches,
    careerMap,
    careers: serializedCareers,
    courseMap: new Map(serializedCourses.map((course) => [course.$id, course])),
    courses: serializedCourses,
    studentMap: new Map(
      serializedStudents.map((student) => [student.$id, student]),
    ),
    students: serializedStudents,
  };
}

async function listPaymentTransactions(paymentId) {
  return listAllDocuments(TRANSACTIONS_COLLECTION_ID, [
    Query.equal("paymentId", paymentId),
    Query.select([
      "$id",
      "$createdAt",
      "paymentId",
      "studentId",
      "sucursalId",
      "monto",
      "metodoPago",
      "referencia",
      "fecha",
      "registradoPor",
      "estado",
      "anuladoPor",
      "motivoAnulacion",
      "fechaAnulacion",
      "notas",
    ]),
  ]);
}

async function recalculatePayment(paymentId) {
  const databases = createAdminDatabases();
  const [payment, transactions] = await Promise.all([
    databases.getDocument({
      collectionId: PAYMENTS_COLLECTION_ID,
      databaseId: APPWRITE_DATABASE_ID,
      documentId: paymentId,
    }),
    listPaymentTransactions(paymentId),
  ]);
  const montoPagado = transactions
    .filter((transaction) => transaction.estado !== "anulada")
    .reduce((total, transaction) => total + Number(transaction.monto || 0), 0);
  const estado = calculatePaymentStatus({
    fechaVencimiento: payment.fechaVencimiento,
    montoEsperado: payment.montoEsperado,
    montoPagado,
  });

  return databases.updateDocument({
    collectionId: PAYMENTS_COLLECTION_ID,
    databaseId: APPWRITE_DATABASE_ID,
    data: {
      estado,
      montoPagado: Number(montoPagado.toFixed(2)),
    },
    documentId: paymentId,
  });
}

function sortPayments(payments) {
  return payments.sort((left, right) => {
    const byStatus = left.estado.localeCompare(right.estado, "es");

    if (byStatus !== 0) return byStatus;

    return `${left.fechaVencimiento} ${left.studentName}`.localeCompare(
      `${right.fechaVencimiento} ${right.studentName}`,
      "es",
    );
  });
}

function buildPaymentQueries(filters = {}) {
  const queries = [
    Query.select([
      "$id",
      "$createdAt",
      "$updatedAt",
      "enrollmentId",
      "studentId",
      "courseId",
      "sucursalId",
      "periodo",
      "montoEsperado",
      "montoPagado",
      "fechaVencimiento",
      "estado",
      "notas",
    ]),
  ];
  const status = toCleanString(filters.status);
  const studentId = toCleanString(filters.studentId);
  const courseId = toCleanString(filters.courseId);
  const sucursalId = toCleanString(filters.sucursalId);

  if (status && status !== "todos") {
    queries.push(Query.equal("estado", status));
  }

  if (studentId && studentId !== "todos") {
    queries.push(Query.equal("studentId", studentId));
  }

  if (courseId && courseId !== "todos") {
    queries.push(Query.equal("courseId", courseId));
  }

  if (sucursalId && sucursalId !== "todos") {
    queries.push(Query.equal("sucursalId", sucursalId));
  }

  return queries;
}

function validateRegisterTransactionInput(payment, input = {}) {
  const amount = toNumber(input.monto);
  const metodoPago = toCleanString(input.metodoPago);
  const referencia = toCleanString(input.referencia);
  const notas = toCleanString(input.notas);
  const saldo = getPaymentBalance(payment);

  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "Ingresa un monto válido." };
  }

  if (amount > saldo) {
    return { error: "El monto no puede superar el saldo pendiente." };
  }

  if (!VALID_PAYMENT_METHODS.has(metodoPago)) {
    return { error: "Selecciona un método de pago válido." };
  }

  if (referencia.length > 128) {
    return { error: "La referencia no puede superar 128 caracteres." };
  }

  if (notas.length > 256) {
    return { error: "Las notas no pueden superar 256 caracteres." };
  }

  return {
    transaction: {
      estado: "valida",
      fecha: new Date().toISOString(),
      metodoPago,
      monto: Number(amount.toFixed(2)),
      notas,
      referencia,
      registradoPor: SYSTEM_CASHIER_ID,
    },
  };
}

function summarizeTransactions(transactions) {
  return transactions.reduce(
    (summary, transaction) => {
      if (transaction.estado !== "valida") {
        return summary;
      }

      summary.total += transaction.monto;
      summary.count += 1;

      if (transaction.metodoPago === "qr") {
        summary.qr += transaction.monto;
      } else {
        summary.efectivo += transaction.monto;
      }

      return summary;
    },
    { count: 0, efectivo: 0, qr: 0, total: 0 },
  );
}

async function registerTransactionLocally(paymentId, input = {}) {
  const databases = createAdminDatabases();
  const payment = await databases.getDocument({
    collectionId: PAYMENTS_COLLECTION_ID,
    databaseId: APPWRITE_DATABASE_ID,
    documentId: paymentId,
  });
  const validation = validateRegisterTransactionInput(payment, input);

  if (validation.error) {
    return { error: validation.error, ok: false };
  }

  await databases.createDocument({
    collectionId: TRANSACTIONS_COLLECTION_ID,
    databaseId: APPWRITE_DATABASE_ID,
    data: {
      ...validation.transaction,
      paymentId: payment.$id,
      studentId: payment.studentId,
      sucursalId: payment.sucursalId,
    },
    documentId: ID.unique(),
    permissions: [],
  });
  const updatedPayment = await recalculatePayment(payment.$id);
  const context = await getFinancialContext();

  return {
    ok: true,
    payment: serializePayment(updatedPayment, context),
  };
}

export async function listPayments(filters = {}) {
  try {
    const [context, payments] = await Promise.all([
      getFinancialContext(),
      listAllDocuments(PAYMENTS_COLLECTION_ID, buildPaymentQueries(filters)),
    ]);
    const serializedPayments = sortPayments(
      payments.map((payment) => serializePayment(payment, context)),
    );

    return {
      branches: context.branches,
      careers: context.careers,
      courses: context.courses,
      ok: true,
      payments: serializedPayments,
      students: context.students,
    };
  } catch (error) {
    return {
      branches: [],
      careers: [],
      courses: [],
      error: getActionError(error),
      ok: false,
      payments: [],
      students: [],
    };
  }
}

export async function registerTransaction(paymentId, input = {}) {
  const cleanPaymentId = toCleanString(paymentId);

  if (!cleanPaymentId) {
    return { error: "No se encontró la mensualidad.", ok: false };
  }

  try {
    const result = await invokeSecureOperation("registerTransaction", {
      input,
      paymentId: cleanPaymentId,
    });
    const finalResult = result.useLocalFallback
      ? await registerTransactionLocally(cleanPaymentId, input)
      : result;

    revalidatePath("/dashboard/mensualidades");
    revalidatePath("/dashboard/deudores");
    revalidatePath("/dashboard/reportes");
    revalidatePath("/dashboard/estudiantes");

    return finalResult;
  } catch (error) {
    return { error: getActionError(error), ok: false };
  }
}

export async function listDebtors(filters = {}) {
  try {
    const context = await getFinancialContext();
    const now = new Date().toISOString();
    const payments = await listAllDocuments(PAYMENTS_COLLECTION_ID, [
      Query.equal("estado", DEBT_STATUSES),
      Query.lessThan("fechaVencimiento", now),
      Query.select([
        "$id",
        "$createdAt",
        "$updatedAt",
        "enrollmentId",
        "studentId",
        "courseId",
        "sucursalId",
        "periodo",
        "montoEsperado",
        "montoPagado",
        "fechaVencimiento",
        "estado",
        "notas",
      ]),
    ]);
    const courseId = toCleanString(filters.courseId);
    const sucursalId = toCleanString(filters.sucursalId);
    const carreraId = toCleanString(filters.carreraId);
    const grouped = new Map();

    for (const payment of payments) {
      const serialized = serializePayment(payment, context);

      if (serialized.saldo <= 0) {
        continue;
      }

      if (
        courseId &&
        courseId !== "todos" &&
        serialized.courseId !== courseId
      ) {
        continue;
      }

      if (
        sucursalId &&
        sucursalId !== "todos" &&
        serialized.sucursalId !== sucursalId
      ) {
        continue;
      }

      if (
        carreraId &&
        carreraId !== "todos" &&
        serialized.carreraId !== carreraId
      ) {
        continue;
      }

      const debtor = grouped.get(serialized.studentId) || {
        cursos: new Set(),
        cuotasVencidas: 0,
        deudaTotal: 0,
        mensualidadMasAntigua: null,
        payments: [],
        studentDocument: serialized.studentDocument,
        studentId: serialized.studentId,
        studentName: serialized.studentName,
        studentPhone: serialized.studentPhone,
        sucursales: new Set(),
      };

      debtor.cursos.add(serialized.courseName);
      debtor.sucursales.add(serialized.sucursalNombre);
      debtor.cuotasVencidas += 1;
      debtor.deudaTotal += serialized.saldo;
      debtor.payments.push(serialized);

      if (
        !debtor.mensualidadMasAntigua ||
        serialized.fechaVencimiento <
          debtor.mensualidadMasAntigua.fechaVencimiento
      ) {
        debtor.mensualidadMasAntigua = serialized;
      }

      grouped.set(serialized.studentId, debtor);
    }

    const debtors = Array.from(grouped.values())
      .map((debtor) => ({
        cursos: Array.from(debtor.cursos).join(", "),
        cuotasVencidas: debtor.cuotasVencidas,
        deudaTotal: Number(debtor.deudaTotal.toFixed(2)),
        mensualidadMasAntigua: debtor.mensualidadMasAntigua,
        payments: debtor.payments.sort((left, right) =>
          left.fechaVencimiento.localeCompare(right.fechaVencimiento),
        ),
        studentDocument: debtor.studentDocument,
        studentId: debtor.studentId,
        studentName: debtor.studentName,
        studentPhone: debtor.studentPhone,
        sucursales: Array.from(debtor.sucursales).join(", "),
      }))
      .sort((left, right) => {
        const dateDiff =
          new Date(
            left.mensualidadMasAntigua?.fechaVencimiento || 0,
          ).getTime() -
          new Date(
            right.mensualidadMasAntigua?.fechaVencimiento || 0,
          ).getTime();

        if (dateDiff !== 0) return dateDiff;

        return right.deudaTotal - left.deudaTotal;
      });

    return {
      branches: context.branches,
      careers: context.careers,
      courses: context.courses,
      debtors,
      ok: true,
    };
  } catch (error) {
    return {
      branches: [],
      careers: [],
      courses: [],
      debtors: [],
      error: getActionError(error),
      ok: false,
    };
  }
}

async function listReportTransactions(filters = {}) {
  const databases = createAdminDatabases();
  const context = await getFinancialContext();
  const transactionQueries = [
    Query.select([
      "$id",
      "$createdAt",
      "paymentId",
      "studentId",
      "sucursalId",
      "monto",
      "metodoPago",
      "referencia",
      "fecha",
      "registradoPor",
      "estado",
      "anuladoPor",
      "motivoAnulacion",
      "fechaAnulacion",
      "notas",
    ]),
  ];

  if (filters.sucursalId && filters.sucursalId !== "todos") {
    transactionQueries.push(Query.equal("sucursalId", filters.sucursalId));
  }

  if (filters.estado && filters.estado !== "todos") {
    transactionQueries.push(Query.equal("estado", filters.estado));
  }

  if (filters.startDate) {
    transactionQueries.push(Query.greaterThanEqual("fecha", filters.startDate));
  }

  if (filters.endDate) {
    transactionQueries.push(Query.lessThanEqual("fecha", filters.endDate));
  }

  const transactions = await listAllDocuments(
    TRANSACTIONS_COLLECTION_ID,
    transactionQueries,
  );
  const paymentIds = [...new Set(transactions.map((item) => item.paymentId))];
  const reportPayments = await Promise.all(
    paymentIds.map((paymentId) =>
      databases.getDocument({
        collectionId: PAYMENTS_COLLECTION_ID,
        databaseId: APPWRITE_DATABASE_ID,
        documentId: paymentId,
      }),
    ),
  );
  const paymentMap = new Map(
    reportPayments.map((payment) => [payment.$id, payment]),
  );
  const reportContext = { ...context, paymentMap };
  const courseId = toCleanString(filters.courseId);
  const carreraId = toCleanString(filters.carreraId);
  const metodoPago = toCleanString(filters.metodoPago);
  const serializedTransactions = transactions
    .map((transaction) => serializeTransaction(transaction, reportContext))
    .filter((transaction) => {
      if (
        courseId &&
        courseId !== "todos" &&
        transaction.courseId !== courseId
      ) {
        return false;
      }

      if (
        carreraId &&
        carreraId !== "todos" &&
        context.courseMap.get(transaction.courseId)?.carreraId !== carreraId
      ) {
        return false;
      }

      if (
        metodoPago &&
        metodoPago !== "todos" &&
        transaction.metodoPago !== metodoPago
      ) {
        return false;
      }

      return true;
    })
    .sort((left, right) => right.fecha.localeCompare(left.fecha));

  return {
    branches: context.branches,
    careers: context.careers,
    courses: context.courses,
    summary: summarizeTransactions(serializedTransactions),
    transactions: serializedTransactions,
  };
}

export async function getDailyIncomeReport(dateInput = "") {
  try {
    const range = getDateRangeForInput(dateInput);
    const result = await listReportTransactions({
      endDate: range.end,
      estado: "valida",
      startDate: range.start,
    });

    return {
      ...result,
      date: range.date,
      ok: true,
    };
  } catch (error) {
    return {
      branches: [],
      careers: [],
      courses: [],
      date: "",
      error: getActionError(error),
      ok: false,
      summary: { count: 0, efectivo: 0, qr: 0, total: 0 },
      transactions: [],
    };
  }
}

export async function getIncomeHistoryReport(filters = {}) {
  try {
    const now = new Date();
    const startDate = parseDateBoundary(filters.startDate, now);
    const endDate = parseDateBoundary(filters.endDate, now, true);
    const result = await listReportTransactions({
      carreraId: toCleanString(filters.carreraId),
      courseId: toCleanString(filters.courseId),
      endDate,
      estado: "valida",
      metodoPago: toCleanString(filters.metodoPago),
      startDate,
      sucursalId: toCleanString(filters.sucursalId),
    });

    return {
      ...result,
      filters: {
        endDate,
        startDate,
      },
      ok: true,
    };
  } catch (error) {
    return {
      branches: [],
      careers: [],
      courses: [],
      error: getActionError(error),
      filters: {},
      ok: false,
      summary: { count: 0, efectivo: 0, qr: 0, total: 0 },
      transactions: [],
    };
  }
}
