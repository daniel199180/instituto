"use server";

import { revalidatePath } from "next/cache";
import {
  APPWRITE_DATABASE_ID,
  ID,
  Query,
  createAdminDatabases,
} from "@/lib/appwrite-server";
import { requireStaffSession } from "@/lib/auth-guard";

const COURSES_COLLECTION_ID = "courses";
const BRANCHES_COLLECTION_ID = "branches";
const CAREERS_COLLECTION_ID = "careers";
const TEACHERS_COLLECTION_ID = "teachers";
const ENROLLMENTS_COLLECTION_ID = "enrollments";
const STUDENTS_COLLECTION_ID = "students";
const COURSE_SCHEDULES_COLLECTION_ID = "courseSchedules";
const VALID_COURSE_STATUSES = new Set([
  "en_inscripciones",
  "en_clases",
  "terminado",
  "cerrado",
]);
const VALID_DAYS = new Set([
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
  "domingo",
]);
const DAY_ORDER = [
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
  "domingo",
];

function toCleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeDay(value) {
  const day = toCleanString(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  return VALID_DAYS.has(day) ? day : "";
}

function toNumber(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) return Number(value);
  return Number.NaN;
}

function toOptionalInteger(value) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);

  if (!Number.isInteger(parsed)) return Number.NaN;

  return parsed;
}

function parseCourseStartDate(value) {
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

function normalizeBranchStatus(status) {
  if (status === "activa") return "activo";
  if (status === "inactiva" || status === "inactivo" || status === "cerrada") {
    return "cerrado";
  }

  return status || "activo";
}

function normalizeCareerStatus(status) {
  if (status === "activa") return "activo";
  if (status === "inactiva" || status === "inactivo" || status === "cerrada") {
    return "cerrado";
  }

  return status || "activo";
}

function normalizeTeacherStatus(status) {
  if (status === "cerrado" || status === "inactiva") return "inactivo";

  return status === "inactivo" ? "inactivo" : "activo";
}

function normalizeCourseStatus(status) {
  return VALID_COURSE_STATUSES.has(status) ? status : "cerrado";
}

function isValidTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function timeToMinutes(value) {
  const [hours, minutes] = value.split(":").map(Number);

  return hours * 60 + minutes;
}

function serializeBranch(branch) {
  return {
    $id: branch.$id,
    estado: normalizeBranchStatus(branch.estado),
    nombre: branch.nombre || "",
    tipo: branch.tipo || "presencial",
  };
}

function serializeCareer(career) {
  return {
    $id: career.$id,
    estado: normalizeCareerStatus(career.estado),
    nombre: career.nombre || "",
    sucursalId: career.sucursalId || "",
  };
}

function serializeTeacher(teacher) {
  return {
    $id: teacher.$id,
    estado: normalizeTeacherStatus(teacher.estado),
    nombre: `${teacher.nombre || ""} ${teacher.apellido || ""}`.trim(),
  };
}

function serializeCourse(course, context = {}) {
  const branch = context.branchMap?.get(course.sucursalId);
  const career = context.careerMap?.get(course.carreraId);
  const teacher = context.teacherMap?.get(course.docenteId);
  const cupoOcupado = context.enrollmentCounts?.get(course.$id) || 0;
  const schedules = context.schedulesByCourse?.get(course.$id) || [];

  return {
    $createdAt: course.$createdAt,
    $id: course.$id,
    $updatedAt: course.$updatedAt,
    carreraId: course.carreraId || "",
    carreraNombre: career?.nombre || "Curso independiente",
    cupoMaximo: Number(course.cupoMaximo || 0),
    cupoOcupado,
    descripcion: course.descripcion || "",
    docenteId: course.docenteId || "",
    docenteNombre: teacher?.nombre || "Sin docente",
    duracionMeses: Number(course.duracionMeses || 0),
    estado: normalizeCourseStatus(course.estado),
    fechaInicio: course.fechaInicio || "",
    nombre: course.nombre || "",
    orden: course.orden ?? "",
    precioMensual: Number(course.precioMensual || 0),
    precioPorHora: Number(course.precioPorHora || 0),
    schedules,
    sucursalId: course.sucursalId || "",
    sucursalNombre: branch?.nombre || "Sin sucursal",
  };
}

function serializeSchedule(schedule) {
  return {
    $id: schedule.$id || "",
    dia: normalizeDay(schedule.dia),
    horaFin: schedule.horaFin || "",
    horaInicio: schedule.horaInicio || "",
  };
}

function serializeEnrolledStudent(enrollment, studentMap) {
  const student = studentMap.get(enrollment.studentId);

  return {
    $id: enrollment.$id,
    apellido: student?.apellido || "",
    diaVencimiento: enrollment.diaVencimiento || "",
    documento: student?.documento || "",
    email: student?.email || "",
    estado: enrollment.estado || "activa",
    estadoEstudiante: student?.estado || "activo",
    fechaInicio: enrollment.fechaInicio || "",
    montoMensual: Number(enrollment.montoMensual || 0),
    nombre: student?.nombre || "Estudiante no encontrado",
    studentId: enrollment.studentId || "",
    telefono: student?.telefono || "",
  };
}

function validateCourseInput(input) {
  const orden = toOptionalInteger(input?.orden);
  const scheduleValidation = validateSchedulesInput(input?.schedules);
  const course = {
    carreraId: toCleanString(input?.carreraId),
    cupoMaximo: toNumber(input?.cupoMaximo),
    descripcion: toCleanString(input?.descripcion),
    docenteId: toCleanString(input?.docenteId),
    duracionMeses: toNumber(input?.duracionMeses),
    estado: normalizeCourseStatus(toCleanString(input?.estado)),
    fechaInicio: parseCourseStartDate(input?.fechaInicio),
    nombre: toCleanString(input?.nombre),
    orden,
    precioMensual: toNumber(input?.precioMensual),
    precioPorHora: toNumber(input?.precioPorHora),
    sucursalId: toCleanString(input?.sucursalId),
  };

  if (!course.nombre) {
    return { error: "Ingresa el nombre del curso." };
  }

  if (course.nombre.length > 128) {
    return { error: "El nombre no puede superar 128 caracteres." };
  }

  if (course.descripcion.length > 512) {
    return { error: "La descripción no puede superar 512 caracteres." };
  }

  if (!course.sucursalId) {
    return { error: "Selecciona una sucursal." };
  }

  if (!course.docenteId) {
    return { error: "Selecciona un docente." };
  }

  if (!Number.isFinite(course.precioMensual) || course.precioMensual < 0) {
    return { error: "Ingresa un precio mensual válido." };
  }

  if (!Number.isFinite(course.precioPorHora) || course.precioPorHora < 0) {
    return { error: "Ingresa un precio por hora válido." };
  }

  if (!Number.isInteger(course.duracionMeses) || course.duracionMeses < 1) {
    return { error: "La duración debe ser un número entero mayor a cero." };
  }

  if (!course.fechaInicio) {
    return { error: "Selecciona la fecha de inicio de clases." };
  }

  if (!Number.isInteger(course.cupoMaximo) || course.cupoMaximo < 1) {
    return { error: "El cupo máximo debe ser un número entero mayor a cero." };
  }

  if (
    Number.isNaN(course.orden) ||
    (course.orden !== null && course.orden < 0)
  ) {
    return { error: "El orden debe ser un número entero positivo." };
  }

  if (!VALID_COURSE_STATUSES.has(course.estado)) {
    return { error: "Selecciona un estado válido." };
  }

  if (scheduleValidation.error) {
    return { error: scheduleValidation.error };
  }

  return {
    course: {
      ...course,
      orden: course.orden === null ? undefined : course.orden,
    },
    schedules: scheduleValidation.schedules,
  };
}

function validateSchedulesInput(inputSchedules) {
  const rows = Array.isArray(inputSchedules) ? inputSchedules : [];
  const schedules = rows
    .map((schedule) => ({
      dia: normalizeDay(schedule?.dia),
      horaFin: toCleanString(schedule?.horaFin),
      horaInicio: toCleanString(schedule?.horaInicio),
    }))
    .filter(
      (schedule) => schedule.dia || schedule.horaInicio || schedule.horaFin,
    );

  if (!schedules.length) {
    return { error: "Agrega al menos un horario para el curso." };
  }

  for (const schedule of schedules) {
    if (!schedule.dia) {
      return { error: "Selecciona un día válido en los horarios." };
    }

    if (!isValidTime(schedule.horaInicio)) {
      return { error: "Ingresa una hora de inicio válida en los horarios." };
    }

    if (!isValidTime(schedule.horaFin)) {
      return { error: "Ingresa una hora de fin válida en los horarios." };
    }

    if (timeToMinutes(schedule.horaInicio) >= timeToMinutes(schedule.horaFin)) {
      return {
        error: "La hora de fin debe ser posterior a la hora de inicio.",
      };
    }
  }

  for (const day of VALID_DAYS) {
    const daySchedules = schedules
      .filter((schedule) => schedule.dia === day)
      .sort((left, right) => left.horaInicio.localeCompare(right.horaInicio));

    for (let index = 1; index < daySchedules.length; index += 1) {
      const previous = daySchedules[index - 1];
      const current = daySchedules[index];
      const overlaps =
        timeToMinutes(current.horaInicio) < timeToMinutes(previous.horaFin);

      if (overlaps) {
        return { error: "Hay horarios cruzados en el mismo día." };
      }
    }
  }

  return { schedules: sortSchedules(schedules) };
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

function chunkArray(items, size) {
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function sortByName(items) {
  return items.sort((left, right) =>
    left.nombre.localeCompare(right.nombre, "es"),
  );
}

function sortSchedules(schedules) {
  return schedules.sort((left, right) => {
    const dayDiff = DAY_ORDER.indexOf(left.dia) - DAY_ORDER.indexOf(right.dia);

    if (dayDiff !== 0) return dayDiff;

    return left.horaInicio.localeCompare(right.horaInicio);
  });
}

async function getCourseContext() {
  const [branches, careers, teachers, enrollments, schedules] =
    await Promise.all([
      listAllDocuments(BRANCHES_COLLECTION_ID, [
        Query.select(["$id", "nombre", "tipo", "estado"]),
      ]),
      listAllDocuments(CAREERS_COLLECTION_ID, [
        Query.select(["$id", "nombre", "sucursalId", "estado"]),
      ]),
      listAllDocuments(TEACHERS_COLLECTION_ID, [
        Query.select(["$id", "nombre", "apellido", "estado"]),
      ]),
      listAllDocuments(ENROLLMENTS_COLLECTION_ID, [
        Query.equal("estado", "activa"),
        Query.select(["$id", "courseId"]),
      ]),
      listAllDocuments(COURSE_SCHEDULES_COLLECTION_ID, [
        Query.select(["$id", "courseId", "dia", "horaInicio", "horaFin"]),
      ]),
    ]);
  const serializedBranches = sortByName(branches.map(serializeBranch));
  const serializedCareers = sortByName(careers.map(serializeCareer));
  const serializedTeachers = sortByName(teachers.map(serializeTeacher));
  const enrollmentCounts = new Map();
  const schedulesByCourse = new Map();

  for (const enrollment of enrollments) {
    enrollmentCounts.set(
      enrollment.courseId,
      (enrollmentCounts.get(enrollment.courseId) || 0) + 1,
    );
  }

  for (const schedule of schedules) {
    const courseSchedules = schedulesByCourse.get(schedule.courseId) || [];

    courseSchedules.push(serializeSchedule(schedule));
    schedulesByCourse.set(schedule.courseId, sortSchedules(courseSchedules));
  }

  return {
    branchMap: new Map(
      serializedBranches.map((branch) => [branch.$id, branch]),
    ),
    branches: serializedBranches,
    careerMap: new Map(serializedCareers.map((career) => [career.$id, career])),
    careers: serializedCareers,
    enrollmentCounts,
    schedulesByCourse,
    teacherMap: new Map(
      serializedTeachers.map((teacher) => [teacher.$id, teacher]),
    ),
    teachers: serializedTeachers,
  };
}

async function syncCourseSchedules(courseId, schedules) {
  const databases = createAdminDatabases();
  const existingSchedules = await listAllDocuments(
    COURSE_SCHEDULES_COLLECTION_ID,
    [Query.equal("courseId", courseId), Query.select(["$id"])],
  );

  for (const schedule of existingSchedules) {
    await databases.deleteDocument({
      collectionId: COURSE_SCHEDULES_COLLECTION_ID,
      databaseId: APPWRITE_DATABASE_ID,
      documentId: schedule.$id,
    });
  }

  for (const schedule of schedules) {
    await databases.createDocument({
      collectionId: COURSE_SCHEDULES_COLLECTION_ID,
      databaseId: APPWRITE_DATABASE_ID,
      data: {
        ...schedule,
        courseId,
      },
      documentId: ID.unique(),
      permissions: [],
    });
  }
}

export async function listCourses() {
  try {
    await requireStaffSession();

    const [context, courses] = await Promise.all([
      getCourseContext(),
      listAllDocuments(COURSES_COLLECTION_ID, [
        Query.select([
          "$id",
          "$createdAt",
          "$updatedAt",
          "nombre",
          "descripcion",
          "sucursalId",
          "carreraId",
          "orden",
          "docenteId",
          "precioMensual",
          "precioPorHora",
          "duracionMeses",
          "fechaInicio",
          "cupoMaximo",
          "estado",
        ]),
      ]),
    ]);

    return {
      branches: context.branches,
      careers: context.careers,
      courses: sortByName(
        courses.map((course) => serializeCourse(course, context)),
      ),
      ok: true,
      teachers: context.teachers,
    };
  } catch (error) {
    return {
      branches: [],
      careers: [],
      courses: [],
      error: getActionError(error),
      ok: false,
      teachers: [],
    };
  }
}

export async function listCourseEnrolledStudents(courseId) {
  const cleanCourseId = toCleanString(courseId);

  if (!cleanCourseId) {
    return { error: "No se encontró el curso.", ok: false };
  }

  try {
    await requireStaffSession();

    const databases = createAdminDatabases();
    const [course, enrollments] = await Promise.all([
      databases.getDocument({
        collectionId: COURSES_COLLECTION_ID,
        databaseId: APPWRITE_DATABASE_ID,
        documentId: cleanCourseId,
      }),
      listAllDocuments(ENROLLMENTS_COLLECTION_ID, [
        Query.equal("courseId", cleanCourseId),
        Query.select([
          "$id",
          "studentId",
          "courseId",
          "fechaInicio",
          "diaVencimiento",
          "estado",
          "montoMensual",
        ]),
      ]),
    ]);
    const studentIds = [
      ...new Set(
        enrollments.map((enrollment) => enrollment.studentId).filter(Boolean),
      ),
    ];
    const studentPages = await Promise.all(
      chunkArray(studentIds, 100).map((batch) =>
        listAllDocuments(STUDENTS_COLLECTION_ID, [
          Query.equal("$id", batch),
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
      ),
    );
    const studentMap = new Map(
      studentPages.flat().map((student) => [student.$id, student]),
    );
    const students = enrollments
      .map((enrollment) => serializeEnrolledStudent(enrollment, studentMap))
      .sort((left, right) =>
        `${left.apellido} ${left.nombre}`.localeCompare(
          `${right.apellido} ${right.nombre}`,
          "es",
        ),
      );

    return {
      course: {
        $id: course.$id,
        nombre: course.nombre || "",
      },
      ok: true,
      students,
    };
  } catch (error) {
    return {
      course: null,
      error: getActionError(error),
      ok: false,
      students: [],
    };
  }
}

export async function createCourse(input) {
  const validation = validateCourseInput(input);

  if (validation.error) {
    return { error: validation.error, ok: false };
  }

  try {
    await requireStaffSession();

    const databases = createAdminDatabases();
    const course = await databases.createDocument({
      collectionId: COURSES_COLLECTION_ID,
      databaseId: APPWRITE_DATABASE_ID,
      data: validation.course,
      documentId: ID.unique(),
      permissions: [],
    });
    await syncCourseSchedules(course.$id, validation.schedules);
    const context = await getCourseContext();

    revalidatePath("/dashboard/cursos");
    revalidatePath("/dashboard/horarios");

    return { course: serializeCourse(course, context), ok: true };
  } catch (error) {
    return { error: getActionError(error), ok: false };
  }
}

export async function updateCourse(courseId, input) {
  const cleanCourseId = toCleanString(courseId);
  const validation = validateCourseInput(input);

  if (!cleanCourseId) {
    return { error: "No se encontró el curso a editar.", ok: false };
  }

  if (validation.error) {
    return { error: validation.error, ok: false };
  }

  try {
    await requireStaffSession();

    const databases = createAdminDatabases();
    const course = await databases.updateDocument({
      collectionId: COURSES_COLLECTION_ID,
      databaseId: APPWRITE_DATABASE_ID,
      data: validation.course,
      documentId: cleanCourseId,
    });
    await syncCourseSchedules(cleanCourseId, validation.schedules);
    const context = await getCourseContext();

    revalidatePath("/dashboard/cursos");
    revalidatePath("/dashboard/horarios");

    return { course: serializeCourse(course, context), ok: true };
  } catch (error) {
    return { error: getActionError(error), ok: false };
  }
}

export async function deleteCourse(courseId) {
  const cleanCourseId = toCleanString(courseId);

  if (!cleanCourseId) {
    return { error: "No se encontró el curso a borrar.", ok: false };
  }

  try {
    await requireStaffSession();

    const databases = createAdminDatabases();
    const enrollments = await listAllDocuments(ENROLLMENTS_COLLECTION_ID, [
      Query.equal("courseId", cleanCourseId),
      Query.select(["$id"]),
    ]);

    if (enrollments.length) {
      const context = await getCourseContext();
      const course = await databases.updateDocument({
        collectionId: COURSES_COLLECTION_ID,
        databaseId: APPWRITE_DATABASE_ID,
        data: { estado: "cerrado" },
        documentId: cleanCourseId,
      });

      revalidatePath("/dashboard/cursos");

      return {
        closed: true,
        course: serializeCourse(course, context),
        ok: true,
      };
    }

    await syncCourseSchedules(cleanCourseId, []);
    await databases.deleteDocument({
      collectionId: COURSES_COLLECTION_ID,
      databaseId: APPWRITE_DATABASE_ID,
      documentId: cleanCourseId,
    });

    revalidatePath("/dashboard/cursos");
    revalidatePath("/dashboard/horarios");

    return { deleted: true, ok: true };
  } catch (error) {
    return { error: getActionError(error), ok: false };
  }
}
