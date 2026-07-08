"use server";

import { revalidatePath } from "next/cache";
import {
  APPWRITE_DATABASE_ID,
  ID,
  Query,
  createAdminDatabases,
} from "@/lib/appwrite-server";

const STUDENTS_COLLECTION_ID = "students";
const BRANCHES_COLLECTION_ID = "branches";
const COURSES_COLLECTION_ID = "courses";
const ENROLLMENTS_COLLECTION_ID = "enrollments";
const PAYMENTS_COLLECTION_ID = "payments";
const ACTIVE_COURSE_STATUS = "en_inscripciones";
const ACTIVE_ENROLLMENT_STATUS = "activa";
const VALID_ENROLLMENT_STATUSES = new Set([
  "activa",
  "finalizada",
  "cancelada",
]);
const VALID_SCHOLARSHIP_TYPES = new Set([
  "ninguna",
  "porcentaje",
  "monto_fijo",
]);

function toCleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toNumber(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) return Number(value);
  return Number.NaN;
}

function normalizeEnrollmentStatus(status) {
  return VALID_ENROLLMENT_STATUSES.has(status) ? status : "activa";
}

function normalizeCourseStatus(status) {
  if (status === "activo") return ACTIVE_COURSE_STATUS;

  return status || "cerrado";
}

function normalizeStudentStatus(status) {
  return status === "inactivo" || status === "retirado" ? status : "activo";
}

function getActionError(error) {
  return error?.message || "No se pudo completar la operación.";
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

function getDayFromLaPazDate(value) {
  const dateParts = getLaPazDateParts(value);

  if (!Number.isInteger(dateParts.day)) {
    return null;
  }

  return Math.min(dateParts.day, 28);
}

function addMonths(year, month, offset) {
  const zeroBasedMonth = month - 1 + offset;
  const date = new Date(Date.UTC(year, zeroBasedMonth, 1, 4, 0, 0, 0));

  return {
    month: date.getUTCMonth() + 1,
    year: date.getUTCFullYear(),
  };
}

function toMonthPeriod(year, month) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function toLaPazDateIso(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(
    2,
    "0",
  )}T04:00:00.000Z`;
}

function serializeStudent(student) {
  return {
    $id: student.$id,
    documento: student.documento || "",
    estado: normalizeStudentStatus(student.estado),
    nombre: `${student.nombre || ""} ${student.apellido || ""}`.trim(),
  };
}

function serializeBranch(branch) {
  return {
    $id: branch.$id,
    estado: branch.estado || "activo",
    nombre: branch.nombre || "",
  };
}

function serializeCourse(course, context = {}) {
  const branch = context.branchMap?.get(course.sucursalId);
  const cupoOcupado = context.enrollmentCounts?.get(course.$id) || 0;

  return {
    $id: course.$id,
    cupoMaximo: Number(course.cupoMaximo || 0),
    cupoOcupado,
    duracionMeses: Number(course.duracionMeses || 0),
    estado: normalizeCourseStatus(course.estado),
    fechaInicio: course.fechaInicio || "",
    nombre: course.nombre || "",
    precioMensual: Number(course.precioMensual || 0),
    sucursalId: course.sucursalId || "",
    sucursalNombre: branch?.nombre || "Sin sucursal",
  };
}

function serializeEnrollment(enrollment, context = {}) {
  const course = context.courseMap?.get(enrollment.courseId);
  const student = context.studentMap?.get(enrollment.studentId);
  const branch = course ? context.branchMap?.get(course.sucursalId) : null;

  return {
    $createdAt: enrollment.$createdAt,
    $id: enrollment.$id,
    $updatedAt: enrollment.$updatedAt,
    courseId: enrollment.courseId || "",
    courseName: course?.nombre || "Curso no encontrado",
    diaVencimiento: enrollment.diaVencimiento || "",
    estado: normalizeEnrollmentStatus(enrollment.estado),
    fechaInicio: enrollment.fechaInicio || "",
    montoMensual: Number(enrollment.montoMensual || 0),
    motivoBeca: enrollment.motivoBeca || "",
    studentDocument: student?.documento || "",
    studentId: enrollment.studentId || "",
    studentName: student?.nombre || "Estudiante no encontrado",
    sucursalId: course?.sucursalId || "",
    sucursalName: branch?.nombre || "Sin sucursal",
    tipoBeca: enrollment.tipoBeca || "ninguna",
    valorBeca: Number(enrollment.valorBeca || 0),
  };
}

function sortByName(items) {
  return items.sort((left, right) =>
    left.nombre.localeCompare(right.nombre, "es"),
  );
}

function sortEnrollments(enrollments) {
  return enrollments.sort((left, right) => {
    const byStatus = left.estado.localeCompare(right.estado, "es");

    if (byStatus !== 0) return byStatus;

    return `${left.courseName} ${left.studentName}`.localeCompare(
      `${right.courseName} ${right.studentName}`,
      "es",
    );
  });
}

function calculateMonthlyAmount(course, scholarship) {
  const baseAmount = Number(course.precioMensual || 0);

  if (scholarship.tipoBeca === "porcentaje") {
    return Math.max(
      0,
      Number((baseAmount * (1 - scholarship.valorBeca / 100)).toFixed(2)),
    );
  }

  if (scholarship.tipoBeca === "monto_fijo") {
    return Math.max(0, Number((baseAmount - scholarship.valorBeca).toFixed(2)));
  }

  return baseAmount;
}

function buildMonthlyPayments({
  course,
  diaVencimiento,
  enrollmentId,
  montoMensual,
  studentId,
}) {
  const duration = Number(course.duracionMeses || 0);
  const startDateParts = getLaPazDateParts(course.fechaInicio);
  const payments = [];

  for (let offset = 0; offset < duration; offset += 1) {
    const periodDate = addMonths(
      startDateParts.year,
      startDateParts.month,
      offset,
    );

    payments.push({
      courseId: course.$id,
      enrollmentId,
      estado: "pendiente",
      fechaVencimiento: toLaPazDateIso(
        periodDate.year,
        periodDate.month,
        diaVencimiento,
      ),
      montoEsperado: montoMensual,
      montoPagado: 0,
      notas: "",
      periodo: toMonthPeriod(periodDate.year, periodDate.month),
      studentId,
      sucursalId: course.sucursalId,
    });
  }

  return payments;
}

function validateEnrollmentInput(input) {
  const scholarship = {
    motivoBeca: toCleanString(input?.motivoBeca),
    tipoBeca: VALID_SCHOLARSHIP_TYPES.has(input?.tipoBeca)
      ? input.tipoBeca
      : "ninguna",
    valorBeca: toNumber(input?.valorBeca || 0),
  };
  const enrollment = {
    courseId: toCleanString(input?.courseId),
    studentId: toCleanString(input?.studentId),
  };

  if (!enrollment.studentId) {
    return { error: "Selecciona un estudiante." };
  }

  if (!enrollment.courseId) {
    return { error: "Selecciona un curso." };
  }

  if (!Number.isFinite(scholarship.valorBeca) || scholarship.valorBeca < 0) {
    return { error: "Ingresa un valor de beca válido." };
  }

  if (scholarship.tipoBeca === "porcentaje" && scholarship.valorBeca > 100) {
    return { error: "La beca por porcentaje no puede superar 100%." };
  }

  if (scholarship.tipoBeca !== "ninguna" && !scholarship.motivoBeca) {
    return { error: "Ingresa el motivo de la beca o descuento." };
  }

  if (scholarship.tipoBeca === "ninguna") {
    scholarship.valorBeca = 0;
    scholarship.motivoBeca = "";
  }

  return { enrollment, scholarship };
}

async function getEnrollmentContext() {
  const [branches, courses, students, activeEnrollments] = await Promise.all([
    listAllDocuments(BRANCHES_COLLECTION_ID, [
      Query.select(["$id", "nombre", "estado"]),
    ]),
    listAllDocuments(COURSES_COLLECTION_ID, [
      Query.select([
        "$id",
        "nombre",
        "sucursalId",
        "precioMensual",
        "duracionMeses",
        "fechaInicio",
        "cupoMaximo",
        "estado",
      ]),
    ]),
    listAllDocuments(STUDENTS_COLLECTION_ID, [
      Query.select(["$id", "nombre", "apellido", "documento", "estado"]),
    ]),
    listAllDocuments(ENROLLMENTS_COLLECTION_ID, [
      Query.equal("estado", ACTIVE_ENROLLMENT_STATUS),
      Query.select(["$id", "courseId"]),
    ]),
  ]);
  const serializedBranches = sortByName(branches.map(serializeBranch));
  const serializedStudents = sortByName(students.map(serializeStudent));
  const studentOptions = serializedStudents.filter(
    (student) => student.estado === "activo",
  );
  const branchMap = new Map(
    serializedBranches.map((branch) => [branch.$id, branch]),
  );
  const enrollmentCounts = new Map();

  for (const enrollment of activeEnrollments) {
    enrollmentCounts.set(
      enrollment.courseId,
      (enrollmentCounts.get(enrollment.courseId) || 0) + 1,
    );
  }

  const serializedCourses = sortByName(
    courses.map((course) =>
      serializeCourse(course, { branchMap, enrollmentCounts }),
    ),
  );

  return {
    branchMap,
    branches: serializedBranches,
    courseMap: new Map(serializedCourses.map((course) => [course.$id, course])),
    courses: serializedCourses,
    studentMap: new Map(
      serializedStudents.map((student) => [student.$id, student]),
    ),
    students: studentOptions,
  };
}

async function getSerializedEnrollment(enrollmentId) {
  const databases = createAdminDatabases();
  const [context, enrollment] = await Promise.all([
    getEnrollmentContext(),
    databases.getDocument({
      collectionId: ENROLLMENTS_COLLECTION_ID,
      databaseId: APPWRITE_DATABASE_ID,
      documentId: enrollmentId,
    }),
  ]);

  return serializeEnrollment(enrollment, context);
}

export async function listEnrollments() {
  try {
    const [context, enrollments] = await Promise.all([
      getEnrollmentContext(),
      listAllDocuments(ENROLLMENTS_COLLECTION_ID, [
        Query.select([
          "$id",
          "$createdAt",
          "$updatedAt",
          "studentId",
          "courseId",
          "fechaInicio",
          "montoMensual",
          "tipoBeca",
          "valorBeca",
          "motivoBeca",
          "diaVencimiento",
          "estado",
        ]),
      ]),
    ]);

    return {
      branches: context.branches,
      courses: context.courses,
      enrollments: sortEnrollments(
        enrollments.map((enrollment) =>
          serializeEnrollment(enrollment, context),
        ),
      ),
      ok: true,
      students: context.students,
    };
  } catch (error) {
    return {
      branches: [],
      courses: [],
      enrollments: [],
      error: getActionError(error),
      ok: false,
      students: [],
    };
  }
}

export async function createEnrollment(input) {
  const validation = validateEnrollmentInput(input);

  if (validation.error) {
    return { error: validation.error, ok: false };
  }

  try {
    const databases = createAdminDatabases();
    const [student, course, duplicateEnrollments] = await Promise.all([
      databases.getDocument({
        collectionId: STUDENTS_COLLECTION_ID,
        databaseId: APPWRITE_DATABASE_ID,
        documentId: validation.enrollment.studentId,
      }),
      databases.getDocument({
        collectionId: COURSES_COLLECTION_ID,
        databaseId: APPWRITE_DATABASE_ID,
        documentId: validation.enrollment.courseId,
      }),
      listAllDocuments(ENROLLMENTS_COLLECTION_ID, [
        Query.equal("studentId", validation.enrollment.studentId),
        Query.equal("courseId", validation.enrollment.courseId),
        Query.equal("estado", ACTIVE_ENROLLMENT_STATUS),
        Query.select(["$id"]),
      ]),
    ]);

    if (normalizeStudentStatus(student.estado) !== "activo") {
      return { error: "El estudiante seleccionado no está activo.", ok: false };
    }

    if (normalizeCourseStatus(course.estado) !== ACTIVE_COURSE_STATUS) {
      return {
        error: "El curso seleccionado no está en inscripciones.",
        ok: false,
      };
    }

    if (!course.fechaInicio || !getDayFromLaPazDate(course.fechaInicio)) {
      return {
        error: "El curso seleccionado no tiene inicio de clases.",
        ok: false,
      };
    }

    if (duplicateEnrollments.length) {
      return {
        error: "El estudiante ya está inscrito en este curso.",
        ok: false,
      };
    }

    const activeCourseEnrollments = await listAllDocuments(
      ENROLLMENTS_COLLECTION_ID,
      [
        Query.equal("courseId", course.$id),
        Query.equal("estado", ACTIVE_ENROLLMENT_STATUS),
        Query.select(["$id"]),
      ],
    );
    const cupoMaximo = Number(course.cupoMaximo || 0);

    if (activeCourseEnrollments.length >= cupoMaximo) {
      return {
        error: "El curso seleccionado ya alcanzó su cupo máximo.",
        ok: false,
      };
    }

    const diaVencimiento = getDayFromLaPazDate(course.fechaInicio);
    const montoMensual = calculateMonthlyAmount(course, validation.scholarship);
    const enrollmentId = ID.unique();
    const enrollment = await databases.createDocument({
      collectionId: ENROLLMENTS_COLLECTION_ID,
      databaseId: APPWRITE_DATABASE_ID,
      data: {
        courseId: course.$id,
        diaVencimiento,
        estado: ACTIVE_ENROLLMENT_STATUS,
        fechaInicio: course.fechaInicio,
        montoMensual,
        motivoBeca: validation.scholarship.motivoBeca,
        studentId: student.$id,
        tipoBeca: validation.scholarship.tipoBeca,
        valorBeca: validation.scholarship.valorBeca,
      },
      documentId: enrollmentId,
      permissions: [],
    });
    const payments = buildMonthlyPayments({
      course,
      diaVencimiento,
      enrollmentId,
      montoMensual,
      studentId: student.$id,
    });

    for (const payment of payments) {
      await databases.createDocument({
        collectionId: PAYMENTS_COLLECTION_ID,
        databaseId: APPWRITE_DATABASE_ID,
        data: payment,
        documentId: ID.unique(),
        permissions: [],
      });
    }

    const serializedEnrollment = await getSerializedEnrollment(enrollment.$id);

    revalidatePath("/dashboard/inscripciones");
    revalidatePath("/dashboard/estudiantes");
    revalidatePath("/dashboard/mensualidades");

    return { enrollment: serializedEnrollment, ok: true };
  } catch (error) {
    return { error: getActionError(error), ok: false };
  }
}

export async function updateEnrollmentStatus(enrollmentId, status) {
  const cleanEnrollmentId = toCleanString(enrollmentId);
  const cleanStatus = toCleanString(status);

  if (!cleanEnrollmentId) {
    return { error: "No se encontró la inscripción.", ok: false };
  }

  if (!VALID_ENROLLMENT_STATUSES.has(cleanStatus)) {
    return { error: "Selecciona un estado válido.", ok: false };
  }

  try {
    const databases = createAdminDatabases();

    await databases.updateDocument({
      collectionId: ENROLLMENTS_COLLECTION_ID,
      databaseId: APPWRITE_DATABASE_ID,
      data: { estado: cleanStatus },
      documentId: cleanEnrollmentId,
    });

    const enrollment = await getSerializedEnrollment(cleanEnrollmentId);

    revalidatePath("/dashboard/inscripciones");
    revalidatePath("/dashboard/estudiantes");

    return { enrollment, ok: true };
  } catch (error) {
    return { error: getActionError(error), ok: false };
  }
}
