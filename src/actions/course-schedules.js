"use server";

import { revalidatePath } from "next/cache";
import {
  APPWRITE_DATABASE_ID,
  ID,
  Query,
  createAdminDatabases,
} from "@/lib/appwrite-server";
import { requireStaffSession } from "@/lib/auth-guard";

const BRANCHES_COLLECTION_ID = "branches";
const COURSES_COLLECTION_ID = "courses";
const COURSE_SCHEDULES_COLLECTION_ID = "courseSchedules";
const ENROLLMENTS_COLLECTION_ID = "enrollments";
const TEACHERS_COLLECTION_ID = "teachers";
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

function normalizeCourseStatus(status) {
  if (status === "activo") return "en_inscripciones";

  return status || "cerrado";
}

function getActionError(error) {
  return error?.message || "No se pudo completar la operación.";
}

function isValidTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function timeToMinutes(value) {
  const [hours, minutes] = value.split(":").map(Number);

  return hours * 60 + minutes;
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

function serializeBranch(branch) {
  return {
    $id: branch.$id,
    estado: branch.estado || "activo",
    nombre: branch.nombre || "",
  };
}

function serializeCourse(course, context = {}) {
  const branch = context.branchMap?.get(course.sucursalId);
  const teacher = context.teacherMap?.get(course.docenteId);
  const cupoOcupado = context.enrollmentCounts?.get(course.$id) || 0;

  return {
    $id: course.$id,
    cupoMaximo: Number(course.cupoMaximo || 0),
    cupoOcupado,
    docenteId: course.docenteId || "",
    docenteNombre: teacher?.nombre || "Sin docente",
    estado: normalizeCourseStatus(course.estado),
    nombre: course.nombre || "",
    sucursalId: course.sucursalId || "",
    sucursalNombre: branch?.nombre || "Sin sucursal",
  };
}

function serializeTeacher(teacher) {
  return {
    $id: teacher.$id,
    estado: teacher.estado || "activo",
    nombre: `${teacher.nombre || ""} ${teacher.apellido || ""}`.trim(),
  };
}

function serializeSchedule(schedule, context = {}) {
  const course = context.courseMap?.get(schedule.courseId);
  const branch = course ? context.branchMap?.get(course.sucursalId) : null;

  return {
    $createdAt: schedule.$createdAt,
    $id: schedule.$id,
    $updatedAt: schedule.$updatedAt,
    courseId: schedule.courseId || "",
    courseName: course?.nombre || "Curso no encontrado",
    cupoMaximo: course?.cupoMaximo || 0,
    cupoOcupado: course?.cupoOcupado || 0,
    dia: normalizeDay(schedule.dia),
    docenteNombre: course?.docenteNombre || "Sin docente",
    horaFin: schedule.horaFin || "",
    horaInicio: schedule.horaInicio || "",
    sucursalId: course?.sucursalId || "",
    sucursalNombre: branch?.nombre || "Sin sucursal",
  };
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

function validateScheduleInput(input) {
  const schedule = {
    courseId: toCleanString(input?.courseId),
    dia: normalizeDay(input?.dia),
    horaFin: toCleanString(input?.horaFin),
    horaInicio: toCleanString(input?.horaInicio),
  };

  if (!schedule.courseId) {
    return { error: "Selecciona un curso." };
  }

  if (!schedule.dia) {
    return { error: "Selecciona un día válido." };
  }

  if (!isValidTime(schedule.horaInicio)) {
    return { error: "Ingresa una hora de inicio válida." };
  }

  if (!isValidTime(schedule.horaFin)) {
    return { error: "Ingresa una hora de fin válida." };
  }

  if (timeToMinutes(schedule.horaInicio) >= timeToMinutes(schedule.horaFin)) {
    return { error: "La hora de fin debe ser posterior a la hora de inicio." };
  }

  return { schedule };
}

async function getSchedulesContext() {
  const [branches, courses, teachers, enrollments] = await Promise.all([
    listAllDocuments(BRANCHES_COLLECTION_ID, [
      Query.select(["$id", "nombre", "estado"]),
    ]),
    listAllDocuments(COURSES_COLLECTION_ID, [
      Query.select([
        "$id",
        "nombre",
        "sucursalId",
        "docenteId",
        "cupoMaximo",
        "estado",
      ]),
    ]),
    listAllDocuments(TEACHERS_COLLECTION_ID, [
      Query.select(["$id", "nombre", "apellido", "estado"]),
    ]),
    listAllDocuments(ENROLLMENTS_COLLECTION_ID, [
      Query.equal("estado", "activa"),
      Query.select(["$id", "courseId"]),
    ]),
  ]);
  const serializedBranches = sortByName(branches.map(serializeBranch));
  const serializedTeachers = sortByName(teachers.map(serializeTeacher));
  const enrollmentCounts = new Map();
  const branchMap = new Map(
    serializedBranches.map((branch) => [branch.$id, branch]),
  );
  const teacherMap = new Map(
    serializedTeachers.map((teacher) => [teacher.$id, teacher]),
  );

  for (const enrollment of enrollments) {
    enrollmentCounts.set(
      enrollment.courseId,
      (enrollmentCounts.get(enrollment.courseId) || 0) + 1,
    );
  }

  const serializedCourses = sortByName(
    courses.map((course) =>
      serializeCourse(course, { branchMap, enrollmentCounts, teacherMap }),
    ),
  );

  return {
    branchMap,
    branches: serializedBranches,
    courseMap: new Map(serializedCourses.map((course) => [course.$id, course])),
    courses: serializedCourses,
    enrollmentCounts,
    teacherMap,
    teachers: serializedTeachers,
  };
}

async function validateCourseAndConflicts(schedule, currentScheduleId = "") {
  const databases = createAdminDatabases();
  const course = await databases.getDocument({
    collectionId: COURSES_COLLECTION_ID,
    databaseId: APPWRITE_DATABASE_ID,
    documentId: schedule.courseId,
  });

  if (normalizeCourseStatus(course.estado) === "cerrado") {
    return { error: "No se puede asignar horario a un curso cerrado." };
  }

  const sameDaySchedules = await listAllDocuments(
    COURSE_SCHEDULES_COLLECTION_ID,
    [
      Query.equal("courseId", schedule.courseId),
      Query.equal("dia", schedule.dia),
      Query.select(["$id", "horaInicio", "horaFin"]),
    ],
  );
  const nextStart = timeToMinutes(schedule.horaInicio);
  const nextEnd = timeToMinutes(schedule.horaFin);

  for (const existingSchedule of sameDaySchedules) {
    if (existingSchedule.$id === currentScheduleId) continue;

    const existingStart = timeToMinutes(existingSchedule.horaInicio);
    const existingEnd = timeToMinutes(existingSchedule.horaFin);
    const overlaps = nextStart < existingEnd && nextEnd > existingStart;

    if (overlaps) {
      return { error: "El curso ya tiene un horario que se cruza ese día." };
    }
  }

  return { ok: true };
}

async function getSerializedSchedule(scheduleId) {
  const databases = createAdminDatabases();
  const [context, schedule] = await Promise.all([
    getSchedulesContext(),
    databases.getDocument({
      collectionId: COURSE_SCHEDULES_COLLECTION_ID,
      databaseId: APPWRITE_DATABASE_ID,
      documentId: scheduleId,
    }),
  ]);

  return serializeSchedule(schedule, context);
}

export async function listCourseSchedules() {
  try {
    await requireStaffSession();

    const [context, schedules] = await Promise.all([
      getSchedulesContext(),
      listAllDocuments(COURSE_SCHEDULES_COLLECTION_ID, [
        Query.select([
          "$id",
          "$createdAt",
          "$updatedAt",
          "courseId",
          "dia",
          "horaInicio",
          "horaFin",
        ]),
      ]),
    ]);

    return {
      branches: context.branches,
      courses: context.courses,
      ok: true,
      schedules: sortSchedules(
        schedules.map((schedule) => serializeSchedule(schedule, context)),
      ),
    };
  } catch (error) {
    return {
      branches: [],
      courses: [],
      error: getActionError(error),
      ok: false,
      schedules: [],
    };
  }
}

export async function createCourseSchedule(input) {
  const validation = validateScheduleInput(input);

  if (validation.error) {
    return { error: validation.error, ok: false };
  }

  try {
    await requireStaffSession();

    const databases = createAdminDatabases();
    const courseValidation = await validateCourseAndConflicts(
      validation.schedule,
    );

    if (courseValidation.error) {
      return { error: courseValidation.error, ok: false };
    }

    const schedule = await databases.createDocument({
      collectionId: COURSE_SCHEDULES_COLLECTION_ID,
      databaseId: APPWRITE_DATABASE_ID,
      data: validation.schedule,
      documentId: ID.unique(),
      permissions: [],
    });
    const serializedSchedule = await getSerializedSchedule(schedule.$id);

    revalidatePath("/dashboard/horarios");

    return { ok: true, schedule: serializedSchedule };
  } catch (error) {
    return { error: getActionError(error), ok: false };
  }
}

export async function updateCourseSchedule(scheduleId, input) {
  const cleanScheduleId = toCleanString(scheduleId);
  const validation = validateScheduleInput(input);

  if (!cleanScheduleId) {
    return { error: "No se encontró el horario a editar.", ok: false };
  }

  if (validation.error) {
    return { error: validation.error, ok: false };
  }

  try {
    await requireStaffSession();

    const databases = createAdminDatabases();
    const courseValidation = await validateCourseAndConflicts(
      validation.schedule,
      cleanScheduleId,
    );

    if (courseValidation.error) {
      return { error: courseValidation.error, ok: false };
    }

    await databases.updateDocument({
      collectionId: COURSE_SCHEDULES_COLLECTION_ID,
      databaseId: APPWRITE_DATABASE_ID,
      data: validation.schedule,
      documentId: cleanScheduleId,
    });
    const schedule = await getSerializedSchedule(cleanScheduleId);

    revalidatePath("/dashboard/horarios");

    return { ok: true, schedule };
  } catch (error) {
    return { error: getActionError(error), ok: false };
  }
}

export async function deleteCourseSchedule(scheduleId) {
  const cleanScheduleId = toCleanString(scheduleId);

  if (!cleanScheduleId) {
    return { error: "No se encontró el horario a borrar.", ok: false };
  }

  try {
    await requireStaffSession();

    const databases = createAdminDatabases();

    await databases.deleteDocument({
      collectionId: COURSE_SCHEDULES_COLLECTION_ID,
      databaseId: APPWRITE_DATABASE_ID,
      documentId: cleanScheduleId,
    });

    revalidatePath("/dashboard/horarios");

    return { deleted: true, ok: true };
  } catch (error) {
    return { error: getActionError(error), ok: false };
  }
}
