"use server";

import {
  APPWRITE_DATABASE_ID,
  Query,
  createAdminDatabases,
} from "@/lib/appwrite-server";
import { requireStaffRole } from "@/lib/auth-guard";

const TEACHERS_COLLECTION_ID = "teachers";
const COURSES_COLLECTION_ID = "courses";
const COURSE_SCHEDULES_COLLECTION_ID = "courseSchedules";
const ATTENDANCE_COLLECTION_ID = "attendance";
const BRANCHES_COLLECTION_ID = "branches";
const EXCLUDED_ATTENDANCE_STATES = new Set(["ausente", "cancelada", "anulada"]);

function toCleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getActionError(error) {
  return error?.message || "No se pudo completar la operación.";
}

function normalizeDay(value) {
  return toCleanString(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getCurrentMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    month: "2-digit",
    timeZone: "America/La_Paz",
    year: "numeric",
  }).formatToParts(new Date());
  const partMap = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${partMap.year}-${partMap.month}`;
}

function getTodayLaPaz() {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/La_Paz",
    year: "numeric",
  }).format(new Date());
}

function normalizeMonth(value) {
  const clean = toCleanString(value);

  return /^\d{4}-\d{2}$/.test(clean) ? clean : getCurrentMonth();
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// Weekday name (normalized, no accents) for a given YYYY-MM-DD in La Paz.
function getWeekdayName(dateStr) {
  const weekday = new Intl.DateTimeFormat("es-BO", {
    timeZone: "America/La_Paz",
    weekday: "long",
  }).format(new Date(`${dateStr}T12:00:00.000Z`));

  return normalizeDay(weekday);
}

function timeToHours(value) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(toCleanString(value));

  if (!match) return 0;

  return Number(match[1]) + Number(match[2]) / 60;
}

function courseStartDateStr(course) {
  if (!course.fechaInicio) return "";

  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/La_Paz",
    year: "numeric",
  }).format(new Date(course.fechaInicio));
}

// Course end date (start + duracionMeses), as YYYY-MM-DD, so payroll never
// counts scheduled hours for months after the course has finished.
function courseEndDateStr(course) {
  if (!course.fechaInicio) return "";

  const start = new Date(course.fechaInicio);
  const end = new Date(
    Date.UTC(
      start.getUTCFullYear(),
      start.getUTCMonth() + Number(course.duracionMeses || 0),
      start.getUTCDate(),
      12,
      0,
      0,
    ),
  );

  return end.toISOString().slice(0, 10);
}

async function listAllDocuments(collectionId, queries = []) {
  const databases = createAdminDatabases();
  const documents = [];
  let cursor = null;

  do {
    const pageQueries = [...queries, Query.limit(100)];

    if (cursor) pageQueries.push(Query.cursorAfter(cursor));

    const response = await databases.listDocuments({
      collectionId,
      databaseId: APPWRITE_DATABASE_ID,
      queries: pageQueries,
      total: false,
    });

    documents.push(...response.documents);
    cursor = response.documents.at(-1)?.$id || null;

    if (response.documents.length < 100) cursor = null;
  } while (cursor);

  return documents;
}

// Scheduled teaching hours for a course within the selected month, bounded
// by the course's own start/end and by today (no future classes are paid).
function computeScheduledHours(schedules, month, course) {
  if (!schedules.length) return 0;

  const [year, monthIndex] = month.split("-").map(Number);
  const totalDays = daysInMonth(year, monthIndex);
  const monthStart = `${month}-01`;
  const monthEnd = `${month}-${String(totalDays).padStart(2, "0")}`;
  const start = course.startStr && course.startStr > monthStart ? course.startStr : monthStart;
  const today = getTodayLaPaz();
  const bounds = [monthEnd, today];

  if (course.endStr) bounds.push(course.endStr);

  const end = bounds.reduce((min, value) => (value < min ? value : min));

  if (start > end) return 0;

  const hoursByDay = new Map();

  for (const schedule of schedules) {
    const dia = normalizeDay(schedule.dia);
    const sessionHours = Math.max(
      timeToHours(schedule.horaFin) - timeToHours(schedule.horaInicio),
      0,
    );

    hoursByDay.set(dia, (hoursByDay.get(dia) || 0) + sessionHours);
  }

  let total = 0;

  for (let day = 1; day <= totalDays; day += 1) {
    const dateStr = `${month}-${String(day).padStart(2, "0")}`;

    if (dateStr < start || dateStr > end) continue;

    const dayHours = hoursByDay.get(getWeekdayName(dateStr));

    if (dayHours) total += dayHours;
  }

  return Number(total.toFixed(2));
}

function computeAttendanceHours(records) {
  let total = 0;
  let count = 0;

  for (const record of records) {
    if (EXCLUDED_ATTENDANCE_STATES.has(record.estado)) continue;
    if (!record.horaEntrada || !record.horaSalida) continue;

    const entrada = new Date(record.horaEntrada).getTime();
    const salida = new Date(record.horaSalida).getTime();

    if (!Number.isFinite(entrada) || !Number.isFinite(salida) || salida <= entrada) {
      continue;
    }

    total += (salida - entrada) / (1000 * 60 * 60);
    count += 1;
  }

  return { count, hours: Number(total.toFixed(2)) };
}

export async function getTeacherPayroll(filters = {}) {
  try {
    await requireStaffRole(["administrador"]);

    const month = normalizeMonth(filters.month);
    const [rawTeachers, branches] = await Promise.all([
      listAllDocuments(TEACHERS_COLLECTION_ID, [
        Query.select(["$id", "nombre", "apellido", "estado"]),
      ]),
      listAllDocuments(BRANCHES_COLLECTION_ID, [
        Query.select(["$id", "nombre"]),
      ]),
    ]);
    const branchMap = new Map(branches.map((branch) => [branch.$id, branch.nombre]));
    const teachers = rawTeachers
      .map((teacher) => ({
        $id: teacher.$id,
        estado: teacher.estado || "activo",
        nombre: `${teacher.nombre || ""} ${teacher.apellido || ""}`.trim(),
      }))
      .sort((left, right) => left.nombre.localeCompare(right.nombre, "es"));
    const selectableTeachers = teachers.filter(
      (teacher) => teacher.estado !== "inactivo",
    );
    const requestedId = toCleanString(filters.teacherId);
    const teacher =
      selectableTeachers.find((item) => item.$id === requestedId) ||
      selectableTeachers[0] ||
      null;

    if (!teacher) {
      return {
        courses: [],
        month,
        ok: true,
        summary: { cursos: 0, totalHoras: 0, totalMonto: 0 },
        teacher: null,
        teachers: selectableTeachers,
      };
    }

    const rawCourses = await listAllDocuments(COURSES_COLLECTION_ID, [
      Query.equal("docenteId", teacher.$id),
      Query.select([
        "$id",
        "nombre",
        "sucursalId",
        "precioPorHora",
        "fechaInicio",
        "duracionMeses",
        "estado",
      ]),
    ]);
    const [year, monthIndex] = month.split("-").map(Number);
    const monthStartIso = new Date(
      Date.UTC(year, monthIndex - 1, 1, 0, 0, 0),
    ).toISOString();
    const monthEndIso = new Date(
      Date.UTC(year, monthIndex, 1, 3, 59, 59, 999),
    ).toISOString();

    const courses = await Promise.all(
      rawCourses.map(async (course) => {
        const [schedules, attendance] = await Promise.all([
          listAllDocuments(COURSE_SCHEDULES_COLLECTION_ID, [
            Query.equal("courseId", course.$id),
            Query.select(["$id", "dia", "horaInicio", "horaFin"]),
          ]),
          listAllDocuments(ATTENDANCE_COLLECTION_ID, [
            Query.equal("teacherId", teacher.$id),
            Query.equal("courseId", course.$id),
            Query.greaterThanEqual("fecha", monthStartIso),
            Query.lessThanEqual("fecha", monthEndIso),
            Query.select([
              "$id",
              "fecha",
              "horaEntrada",
              "horaSalida",
              "estado",
            ]),
          ]),
        ]);
        const courseWithDates = {
          ...course,
          endStr: courseEndDateStr(course),
          startStr: courseStartDateStr(course),
        };
        const scheduledHours = computeScheduledHours(schedules, month, courseWithDates);
        const registered = computeAttendanceHours(attendance);
        const usesAttendance = registered.count > 0;
        const horas = usesAttendance ? registered.hours : scheduledHours;
        const precioPorHora = Number(course.precioPorHora || 0);
        const semanaHoras = schedules.reduce(
          (total, schedule) =>
            total +
            Math.max(
              timeToHours(schedule.horaFin) - timeToHours(schedule.horaInicio),
              0,
            ),
          0,
        );

        return {
          $id: course.$id,
          base: usesAttendance ? "registrada" : "programada",
          estado: course.estado || "cerrado",
          horas,
          horasProgramadas: scheduledHours,
          horasRegistradas: registered.hours,
          monto: Number((precioPorHora * horas).toFixed(2)),
          nombre: course.nombre || "",
          precioPorHora,
          semanaHoras: Number(semanaHoras.toFixed(2)),
          sucursalNombre: branchMap.get(course.sucursalId) || "Sin sucursal",
        };
      }),
    );

    courses.sort((left, right) => left.nombre.localeCompare(right.nombre, "es"));

    const summary = courses.reduce(
      (acc, course) => {
        acc.cursos += 1;
        acc.totalHoras += course.horas;
        acc.totalMonto += course.monto;
        return acc;
      },
      { cursos: 0, totalHoras: 0, totalMonto: 0 },
    );

    return {
      courses,
      month,
      ok: true,
      summary: {
        cursos: summary.cursos,
        totalHoras: Number(summary.totalHoras.toFixed(2)),
        totalMonto: Number(summary.totalMonto.toFixed(2)),
      },
      teacher,
      teachers: selectableTeachers,
    };
  } catch (error) {
    return {
      courses: [],
      error: getActionError(error),
      month: normalizeMonth(filters.month),
      ok: false,
      summary: { cursos: 0, totalHoras: 0, totalMonto: 0 },
      teacher: null,
      teachers: [],
    };
  }
}
