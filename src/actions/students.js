"use server";

import { revalidatePath } from "next/cache";
import {
  APPWRITE_DATABASE_ID,
  ID,
  Query,
  createAdminDatabases,
} from "@/lib/appwrite-server";
import { requireStaffSession } from "@/lib/auth-guard";

const STUDENTS_COLLECTION_ID = "students";
const BRANCHES_COLLECTION_ID = "branches";
const COURSES_COLLECTION_ID = "courses";
const ENROLLMENTS_COLLECTION_ID = "enrollments";
const PAYMENTS_COLLECTION_ID = "payments";
const VALID_STUDENT_STATUSES = new Set(["activo", "inactivo", "retirado"]);
const ACTIVE_COURSE_STATUS = "en_inscripciones";
const ACTIVE_ENROLLMENT_STATUS = "activa";

function toCleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStudentStatus(status) {
  return VALID_STUDENT_STATUSES.has(status) ? status : "activo";
}

function normalizeBranchStatus(status) {
  if (status === "activa") return "activo";
  if (status === "inactiva" || status === "inactivo" || status === "cerrada") {
    return "cerrado";
  }

  return status || "activo";
}

function normalizeCourseStatus(status) {
  if (status === "activo") return ACTIVE_COURSE_STATUS;

  return status || "cerrado";
}

function parseEnrollmentDate(value) {
  const cleanValue = toCleanString(value);

  if (!cleanValue) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(cleanValue)) {
    const parsed = new Date(`${cleanValue}T04:00:00.000Z`);

    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return parsed.toISOString();
  }

  const parsed = new Date(cleanValue);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function getDayFromLaPazDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    timeZone: "America/La_Paz",
  }).formatToParts(date);
  const day = Number(parts.find((part) => part.type === "day")?.value);

  if (!Number.isInteger(day)) {
    return null;
  }

  return Math.min(day, 28);
}

function serializeBranch(branch) {
  return {
    $id: branch.$id,
    estado: normalizeBranchStatus(branch.estado),
    nombre: branch.nombre || "",
    tipo: branch.tipo || "presencial",
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
    sucursalNombre: branch?.nombre || "",
  };
}

function serializeStudent(student, context = {}) {
  const enrollment = context.enrollmentByStudent?.get(student.$id);
  const course = enrollment
    ? context.courseMap?.get(enrollment.courseId)
    : null;
  const directBranch = context.branchMap?.get(student.sucursalId);
  const courseBranch = course
    ? context.branchMap?.get(course.sucursalId)
    : null;
  const branch = courseBranch || directBranch;
  const debt = context.debtByStudent?.get(student.$id);

  return {
    $createdAt: student.$createdAt,
    $id: student.$id,
    $updatedAt: student.$updatedAt,
    apellido: student.apellido || "",
    cursoId: course?.$id || "",
    cursoNombre: course?.nombre || "",
    diaVencimiento: enrollment?.diaVencimiento || "",
    direccion: student.direccion || "",
    documento: student.documento || "",
    email: student.email || "",
    enrollmentId: enrollment?.$id || "",
    estado: normalizeStudentStatus(student.estado),
    fechaInscripcion: student.fechaInscripcion || "",
    nombre: student.nombre || "",
    sucursalId: course?.sucursalId || student.sucursalId || "",
    sucursalNombre: branch?.nombre || "",
    telefono: student.telefono || "",
    cuotasVencidas: debt?.cuotasVencidas || 0,
    montoDeuda: debt?.montoDeuda || 0,
    tieneDeuda: Boolean(debt?.tieneDeuda),
  };
}

function validateStudentInput(input) {
  const assignment = {
    courseId: toCleanString(input?.courseId),
    sucursalId: toCleanString(input?.sucursalId),
  };
  const student = {
    apellido: toCleanString(input?.apellido),
    direccion: toCleanString(input?.direccion),
    documento: toCleanString(input?.documento),
    email: toCleanString(input?.email),
    estado: normalizeStudentStatus(toCleanString(input?.estado)),
    fechaInscripcion: parseEnrollmentDate(input?.fechaInscripcion),
    nombre: toCleanString(input?.nombre),
    sucursalId: assignment.sucursalId,
    telefono: toCleanString(input?.telefono),
  };

  if (!student.nombre) {
    return { error: "Ingresa el nombre del estudiante." };
  }

  if (student.nombre.length > 128) {
    return { error: "El nombre no puede superar 128 caracteres." };
  }

  if (!student.apellido) {
    return { error: "Ingresa el apellido del estudiante." };
  }

  if (student.apellido.length > 128) {
    return { error: "El apellido no puede superar 128 caracteres." };
  }

  if (!student.documento) {
    return { error: "Ingresa el documento del estudiante." };
  }

  if (student.documento.length > 32) {
    return { error: "El documento no puede superar 32 caracteres." };
  }

  if (student.email.length > 128) {
    return { error: "El correo no puede superar 128 caracteres." };
  }

  if (student.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(student.email)) {
    return { error: "Ingresa un correo válido." };
  }

  if (student.telefono.length > 32) {
    return { error: "El teléfono no puede superar 32 caracteres." };
  }

  if (student.direccion.length > 256) {
    return { error: "La dirección no puede superar 256 caracteres." };
  }

  if (!student.fechaInscripcion) {
    return { error: "Selecciona una fecha de inscripción válida." };
  }

  if (!VALID_STUDENT_STATUSES.has(student.estado)) {
    return { error: "Selecciona un estado válido." };
  }

  if (assignment.sucursalId.length > 64) {
    return { error: "Selecciona una sucursal válida." };
  }

  if (assignment.courseId.length > 64) {
    return { error: "Selecciona un curso válido." };
  }

  return { assignment, student };
}

function getActionError(error) {
  if (error?.message) {
    return error.message;
  }

  return "No se pudo completar la operación.";
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

function sortStudents(students) {
  return students.sort((left, right) => {
    const leftName = `${left.apellido} ${left.nombre}`;
    const rightName = `${right.apellido} ${right.nombre}`;
    return leftName.localeCompare(rightName, "es");
  });
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

function getTodayLaPazIso() {
  const today = getLaPazDateParts(new Date());

  return toLaPazDateIso(today.year, today.month, today.day);
}

function isUnpaidPayment(payment) {
  if (payment.estado === "pagado") {
    return false;
  }

  const expected = Number(payment.montoEsperado || 0);
  const paid = Number(payment.montoPagado || 0);

  return Math.max(expected - paid, 0) > 0;
}

function buildDebtByStudent(payments) {
  const todayIso = getTodayLaPazIso();
  const debtByStudent = new Map();

  for (const payment of payments) {
    if (
      !payment.studentId ||
      !payment.fechaVencimiento ||
      payment.fechaVencimiento >= todayIso ||
      !isUnpaidPayment(payment)
    ) {
      continue;
    }

    const expected = Number(payment.montoEsperado || 0);
    const paid = Number(payment.montoPagado || 0);
    const outstanding = Math.max(expected - paid, 0);
    const currentDebt = debtByStudent.get(payment.studentId) || {
      cuotasVencidas: 0,
      montoDeuda: 0,
      tieneDeuda: false,
    };

    currentDebt.cuotasVencidas += 1;
    currentDebt.montoDeuda += outstanding;
    currentDebt.tieneDeuda = true;
    debtByStudent.set(payment.studentId, currentDebt);
  }

  return debtByStudent;
}

function buildMonthlyPayments({
  course,
  diaVencimiento,
  enrollmentId,
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
      montoEsperado: Number(course.precioMensual || 0),
      montoPagado: 0,
      notas: "",
      periodo: toMonthPeriod(periodDate.year, periodDate.month),
      studentId,
      sucursalId: course.sucursalId,
    });
  }

  return payments;
}

async function getStudentContext() {
  const todayIso = getTodayLaPazIso();
  const [branches, courses, enrollments, payments] = await Promise.all([
    listAllDocuments(BRANCHES_COLLECTION_ID, [
      Query.select(["$id", "nombre", "tipo", "estado"]),
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
    listAllDocuments(ENROLLMENTS_COLLECTION_ID, [
      Query.equal("estado", ACTIVE_ENROLLMENT_STATUS),
      Query.select([
        "$id",
        "studentId",
        "courseId",
        "diaVencimiento",
        "estado",
      ]),
    ]),
    listAllDocuments(PAYMENTS_COLLECTION_ID, [
      Query.equal("estado", ["pendiente", "parcial", "vencido"]),
      Query.lessThan("fechaVencimiento", todayIso),
      Query.select([
        "$id",
        "studentId",
        "fechaVencimiento",
        "estado",
        "montoEsperado",
        "montoPagado",
      ]),
    ]),
  ]);
  const serializedBranches = sortByName(branches.map(serializeBranch));
  const branchMap = new Map(
    serializedBranches.map((branch) => [branch.$id, branch]),
  );
  const enrollmentCounts = new Map();
  const enrollmentByStudent = new Map();

  for (const enrollment of enrollments) {
    enrollmentCounts.set(
      enrollment.courseId,
      (enrollmentCounts.get(enrollment.courseId) || 0) + 1,
    );

    if (!enrollmentByStudent.has(enrollment.studentId)) {
      enrollmentByStudent.set(enrollment.studentId, enrollment);
    }
  }

  const serializedCourses = sortByName(
    courses.map((course) =>
      serializeCourse(course, { branchMap, enrollmentCounts }),
    ),
  );
  const courseMap = new Map(
    serializedCourses.map((course) => [course.$id, course]),
  );

  return {
    branchMap,
    branches: serializedBranches,
    courseMap,
    courses: serializedCourses,
    debtByStudent: buildDebtByStudent(payments),
    enrollmentByStudent,
    enrollmentCounts,
  };
}

async function validateAssignment(assignment, options = {}) {
  const databases = createAdminDatabases();
  const activeStudentEnrollments = options.studentId
    ? await listAllDocuments(ENROLLMENTS_COLLECTION_ID, [
        Query.equal("studentId", options.studentId),
        Query.equal("estado", ACTIVE_ENROLLMENT_STATUS),
        Query.select(["$id", "courseId"]),
      ])
    : [];
  const existingEnrollment = activeStudentEnrollments[0];
  let branch = null;
  let course = null;

  if (assignment.sucursalId) {
    branch = await databases.getDocument({
      collectionId: BRANCHES_COLLECTION_ID,
      databaseId: APPWRITE_DATABASE_ID,
      documentId: assignment.sucursalId,
    });
  }

  if (!assignment.courseId) {
    if (branch && normalizeBranchStatus(branch.estado) !== "activo") {
      return { error: "La sucursal seleccionada está cerrada." };
    }

    return {
      assignment: {
        course: null,
        sucursalId: branch?.$id || "",
      },
    };
  }

  course = await databases.getDocument({
    collectionId: COURSES_COLLECTION_ID,
    databaseId: APPWRITE_DATABASE_ID,
    documentId: assignment.courseId,
  });

  const isExistingCourse = existingEnrollment?.courseId === course.$id;

  if (
    assignment.sucursalId &&
    course.sucursalId &&
    course.sucursalId !== assignment.sucursalId
  ) {
    return { error: "El curso no pertenece a la sucursal seleccionada." };
  }

  if (!branch) {
    branch = await databases.getDocument({
      collectionId: BRANCHES_COLLECTION_ID,
      databaseId: APPWRITE_DATABASE_ID,
      documentId: course.sucursalId,
    });
  }

  if (!isExistingCourse) {
    if (normalizeCourseStatus(course.estado) !== ACTIVE_COURSE_STATUS) {
      return { error: "El curso seleccionado no está en inscripciones." };
    }

    if (normalizeBranchStatus(branch.estado) !== "activo") {
      return { error: "La sucursal del curso seleccionado está cerrada." };
    }

    const activeEnrollments = await listAllDocuments(
      ENROLLMENTS_COLLECTION_ID,
      [
        Query.equal("courseId", course.$id),
        Query.equal("estado", ACTIVE_ENROLLMENT_STATUS),
        Query.select(["$id"]),
      ],
    );
    const cupoMaximo = Number(course.cupoMaximo || 0);

    if (!Number.isInteger(cupoMaximo) || cupoMaximo < 1) {
      return { error: "El curso seleccionado no tiene un cupo válido." };
    }

    if (activeEnrollments.length >= cupoMaximo) {
      return { error: "El curso seleccionado ya alcanzó su cupo máximo." };
    }

    if (
      !Number.isInteger(Number(course.duracionMeses)) ||
      course.duracionMeses < 1
    ) {
      return { error: "El curso seleccionado no tiene duración válida." };
    }

    if (!course.fechaInicio || !getDayFromLaPazDate(course.fechaInicio)) {
      return {
        error: "El curso seleccionado no tiene fecha de inicio de clases.",
      };
    }
  }

  return {
    assignment: {
      course,
      sucursalId: course.sucursalId,
    },
  };
}

async function createEnrollmentForStudent({ course, studentId }) {
  const databases = createAdminDatabases();
  const enrollmentId = ID.unique();
  const diaVencimiento = getDayFromLaPazDate(course.fechaInicio);

  if (!diaVencimiento) {
    throw new Error("El curso no tiene fecha de inicio de clases válida.");
  }

  const enrollment = await databases.createDocument({
    collectionId: ENROLLMENTS_COLLECTION_ID,
    databaseId: APPWRITE_DATABASE_ID,
    data: {
      courseId: course.$id,
      diaVencimiento,
      estado: ACTIVE_ENROLLMENT_STATUS,
      fechaInicio: course.fechaInicio,
      montoMensual: Number(course.precioMensual || 0),
      motivoBeca: "",
      tipoBeca: "ninguna",
      valorBeca: 0,
      studentId,
    },
    documentId: enrollmentId,
    permissions: [],
  });
  const payments = buildMonthlyPayments({
    course,
    diaVencimiento,
    enrollmentId,
    studentId,
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

  return enrollment;
}

async function assignCourseIfNeeded({ assignment, studentId }) {
  if (!assignment.course) {
    return null;
  }

  const activeStudentEnrollments = await listAllDocuments(
    ENROLLMENTS_COLLECTION_ID,
    [
      Query.equal("studentId", studentId),
      Query.equal("estado", ACTIVE_ENROLLMENT_STATUS),
      Query.select(["$id", "courseId"]),
    ],
  );
  const existingEnrollment = activeStudentEnrollments[0];

  if (existingEnrollment?.courseId === assignment.course.$id) {
    return existingEnrollment;
  }

  if (existingEnrollment) {
    throw new Error(
      "El estudiante ya tiene una inscripción activa en otro curso.",
    );
  }

  return createEnrollmentForStudent({
    course: assignment.course,
    studentId,
  });
}

async function serializeStudentById(studentId) {
  const databases = createAdminDatabases();
  const [context, student] = await Promise.all([
    getStudentContext(),
    databases.getDocument({
      collectionId: STUDENTS_COLLECTION_ID,
      databaseId: APPWRITE_DATABASE_ID,
      documentId: studentId,
    }),
  ]);

  return serializeStudent(student, context);
}

export async function listStudents() {
  try {
    await requireStaffSession();

    const [context, students] = await Promise.all([
      getStudentContext(),
      listAllDocuments(STUDENTS_COLLECTION_ID, [
        Query.select([
          "$id",
          "$createdAt",
          "$updatedAt",
          "nombre",
          "apellido",
          "documento",
          "email",
          "telefono",
          "direccion",
          "sucursalId",
          "fechaInscripcion",
          "estado",
        ]),
      ]),
    ]);

    return {
      branches: context.branches,
      courses: context.courses,
      ok: true,
      students: sortStudents(
        students.map((student) => serializeStudent(student, context)),
      ),
    };
  } catch (error) {
    return {
      branches: [],
      courses: [],
      error: getActionError(error),
      ok: false,
      students: [],
    };
  }
}

export async function createStudent(input) {
  const validation = validateStudentInput(input);

  if (validation.error) {
    return { error: validation.error, ok: false };
  }

  try {
    await requireStaffSession();

    const databases = createAdminDatabases();
    const assignmentResult = await validateAssignment(validation.assignment);

    if (assignmentResult.error) {
      return { error: assignmentResult.error, ok: false };
    }

    const student = await databases.createDocument({
      collectionId: STUDENTS_COLLECTION_ID,
      databaseId: APPWRITE_DATABASE_ID,
      data: {
        ...validation.student,
        sucursalId: assignmentResult.assignment.sucursalId,
      },
      documentId: ID.unique(),
      permissions: [],
    });
    const enrollment = await assignCourseIfNeeded({
      assignment: {
        ...assignmentResult.assignment,
      },
      studentId: student.$id,
    });
    const serializedStudent = await serializeStudentById(student.$id);

    revalidatePath("/dashboard/estudiantes");
    revalidatePath("/dashboard/inscripciones");
    revalidatePath("/dashboard/mensualidades");

    return {
      enrolled: Boolean(enrollment),
      ok: true,
      student: serializedStudent,
    };
  } catch (error) {
    return { error: getActionError(error), ok: false };
  }
}

export async function updateStudent(studentId, input) {
  const cleanStudentId = toCleanString(studentId);
  const validation = validateStudentInput(input);

  if (!cleanStudentId) {
    return { error: "No se encontró el estudiante a editar.", ok: false };
  }

  if (validation.error) {
    return { error: validation.error, ok: false };
  }

  try {
    await requireStaffSession();

    const databases = createAdminDatabases();
    const assignmentResult = await validateAssignment(validation.assignment, {
      studentId: cleanStudentId,
    });

    if (assignmentResult.error) {
      return { error: assignmentResult.error, ok: false };
    }

    await databases.updateDocument({
      collectionId: STUDENTS_COLLECTION_ID,
      databaseId: APPWRITE_DATABASE_ID,
      data: {
        ...validation.student,
        sucursalId: assignmentResult.assignment.sucursalId,
      },
      documentId: cleanStudentId,
    });

    const enrollment = await assignCourseIfNeeded({
      assignment: {
        ...assignmentResult.assignment,
      },
      studentId: cleanStudentId,
    });
    const serializedStudent = await serializeStudentById(cleanStudentId);

    revalidatePath("/dashboard/estudiantes");
    revalidatePath("/dashboard/inscripciones");
    revalidatePath("/dashboard/mensualidades");

    return {
      enrolled: Boolean(enrollment),
      ok: true,
      student: serializedStudent,
    };
  } catch (error) {
    return { error: getActionError(error), ok: false };
  }
}

export async function deleteStudent(studentId) {
  const cleanStudentId = toCleanString(studentId);

  if (!cleanStudentId) {
    return { error: "No se encontró el estudiante a borrar.", ok: false };
  }

  try {
    await requireStaffSession();

    const databases = createAdminDatabases();
    const [enrollments, payments] = await Promise.all([
      listAllDocuments(ENROLLMENTS_COLLECTION_ID, [
        Query.equal("studentId", cleanStudentId),
        Query.select(["$id"]),
      ]),
      listAllDocuments(PAYMENTS_COLLECTION_ID, [
        Query.equal("studentId", cleanStudentId),
        Query.select(["$id"]),
      ]),
    ]);

    if (enrollments.length || payments.length) {
      await databases.updateDocument({
        collectionId: STUDENTS_COLLECTION_ID,
        databaseId: APPWRITE_DATABASE_ID,
        data: { estado: "retirado" },
        documentId: cleanStudentId,
      });
      const serializedStudent = await serializeStudentById(cleanStudentId);

      revalidatePath("/dashboard/estudiantes");

      return {
        ok: true,
        retired: true,
        student: serializedStudent,
      };
    }

    await databases.deleteDocument({
      collectionId: STUDENTS_COLLECTION_ID,
      databaseId: APPWRITE_DATABASE_ID,
      documentId: cleanStudentId,
    });

    revalidatePath("/dashboard/estudiantes");

    return { deleted: true, ok: true };
  } catch (error) {
    return { error: getActionError(error), ok: false };
  }
}
