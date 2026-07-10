"use server";

import { revalidatePath } from "next/cache";
import {
  APPWRITE_DATABASE_ID,
  ID,
  Query,
  createAdminDatabases,
} from "@/lib/appwrite-server";
import { requireStaffRole, requireTeacherSession } from "@/lib/auth-guard";
import { invokeSecureOperation } from "@/lib/secure-operations";

const TEACHERS_COLLECTION_ID = "teachers";
const COURSES_COLLECTION_ID = "courses";
const ENROLLMENTS_COLLECTION_ID = "enrollments";
const STUDENTS_COLLECTION_ID = "students";
const BRANCHES_COLLECTION_ID = "branches";
const STUDENT_ATTENDANCE_COLLECTION_ID = "studentAttendance";
const VALID_ATTENDANCE_STATES = new Set(["presente", "ausente", "justificado"]);

function toCleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getActionError(error) {
  return error?.message || "No se pudo completar la operación.";
}

function getTodayLaPaz() {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/La_Paz",
    year: "numeric",
  }).format(new Date());
}

function normalizeDateInput(value) {
  const clean = toCleanString(value);
  const today = getTodayLaPaz();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return today;

  // Never let a session be taken for a date in the future.
  return clean > today ? today : clean;
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

async function listCoursesForTeacher(teacherId) {
  const courses = await listAllDocuments(COURSES_COLLECTION_ID, [
    Query.equal("docenteId", teacherId),
    Query.select(["$id", "nombre", "sucursalId", "estado"]),
  ]);
  const branchIds = [...new Set(courses.map((course) => course.sucursalId).filter(Boolean))];
  const branches = await Promise.all(
    branchIds.map((id) => getDocumentOrNull(BRANCHES_COLLECTION_ID, id)),
  );
  const branchMap = new Map(
    branches.filter(Boolean).map((branch) => [branch.$id, branch.nombre]),
  );
  const counts = await Promise.all(
    courses.map((course) =>
      listAllDocuments(ENROLLMENTS_COLLECTION_ID, [
        Query.equal("courseId", course.$id),
        Query.equal("estado", "activa"),
        Query.select(["$id"]),
      ]).then((enrollments) => enrollments.length),
    ),
  );

  return courses
    .map((course, index) => ({
      $id: course.$id,
      estado: course.estado || "cerrado",
      estudiantes: counts[index],
      nombre: course.nombre || "",
      sucursalNombre: branchMap.get(course.sucursalId) || "Sin sucursal",
    }))
    .sort((left, right) => left.nombre.localeCompare(right.nombre, "es"));
}

async function buildRoster(courseId, date) {
  const course = await getDocumentOrNull(COURSES_COLLECTION_ID, courseId);

  if (!course) {
    return { error: "No se encontró el curso." };
  }

  const enrollments = await listAllDocuments(ENROLLMENTS_COLLECTION_ID, [
    Query.equal("courseId", courseId),
    Query.equal("estado", "activa"),
    Query.select(["$id", "studentId"]),
  ]);
  const students = await Promise.all(
    enrollments.map((enrollment) =>
      getDocumentOrNull(STUDENTS_COLLECTION_ID, enrollment.studentId),
    ),
  );
  const existingAttendance = await listAllDocuments(
    STUDENT_ATTENDANCE_COLLECTION_ID,
    [Query.equal("courseId", courseId), Query.equal("fecha", date)],
  );
  const attendanceMap = new Map(
    existingAttendance.map((record) => [record.studentId, record]),
  );
  const roster = students
    .filter(Boolean)
    .map((student) => {
      const record = attendanceMap.get(student.$id);

      return {
        apellido: student.apellido || "",
        documento: student.documento || "",
        estado: record?.estado || "",
        nombre: student.nombre || "",
        studentId: student.$id,
      };
    })
    .sort((left, right) =>
      `${left.apellido} ${left.nombre}`.localeCompare(
        `${right.apellido} ${right.nombre}`,
        "es",
      ),
    );

  return {
    course: { $id: course.$id, docenteId: course.docenteId, nombre: course.nombre || "" },
    date,
    roster,
  };
}

async function persistAttendanceLocally({
  courseId,
  date,
  records,
  registradoPor,
  teacherId,
}) {
  const databases = createAdminDatabases();
  const validRecords = (Array.isArray(records) ? records : []).filter((record) =>
    VALID_ATTENDANCE_STATES.has(record?.estado),
  );

  await Promise.all(
    validRecords.map(async (record) => {
      const studentId = toCleanString(record.studentId);

      if (!studentId) return;

      const existing = await databases.listDocuments({
        collectionId: STUDENT_ATTENDANCE_COLLECTION_ID,
        databaseId: APPWRITE_DATABASE_ID,
        queries: [
          Query.equal("courseId", courseId),
          Query.equal("studentId", studentId),
          Query.equal("fecha", date),
          Query.limit(1),
        ],
      });
      const data = {
        courseId,
        estado: record.estado,
        fecha: date,
        registradoPor,
        studentId,
        teacherId,
      };

      if (existing.documents[0]) {
        await databases.updateDocument({
          collectionId: STUDENT_ATTENDANCE_COLLECTION_ID,
          databaseId: APPWRITE_DATABASE_ID,
          documentId: existing.documents[0].$id,
          data,
        });
      } else {
        await databases.createDocument({
          collectionId: STUDENT_ATTENDANCE_COLLECTION_ID,
          databaseId: APPWRITE_DATABASE_ID,
          data,
          documentId: ID.unique(),
          permissions: [],
        });
      }
    }),
  );
}

// The attendance write is the key operation here, so it runs inside the
// Appwrite "secure-operations" function. It only falls back to the local
// admin write if that function can't be reached (same pattern as
// registerTransaction / staff users). The caller has already verified the
// teacher owns the course before we get here.
async function persistAttendance(params) {
  const result = await invokeSecureOperation("saveStudentAttendance", params);

  if (result.useLocalFallback) {
    await persistAttendanceLocally(params);
  }
}

// ---- Teacher-facing (docente portal): scoped to the caller's own courses ----

export async function getMyTeacherCourses() {
  try {
    const teacher = await requireTeacherSession();
    const courses = await listCoursesForTeacher(teacher.teacherId);

    return { courses, ok: true, teacherName: teacher.teacherName };
  } catch (error) {
    return { courses: [], error: getActionError(error), ok: false, teacherName: "" };
  }
}

export async function getMyCourseRoster(courseId, date) {
  try {
    const teacher = await requireTeacherSession();
    const cleanCourseId = toCleanString(courseId);
    const result = await buildRoster(cleanCourseId, normalizeDateInput(date));

    if (result.error) {
      return { error: result.error, ok: false, roster: [] };
    }

    if (result.course.docenteId !== teacher.teacherId) {
      return { error: "Este curso no te pertenece.", ok: false, roster: [] };
    }

    return { ...result, ok: true };
  } catch (error) {
    return { error: getActionError(error), ok: false, roster: [] };
  }
}

export async function saveMyCourseAttendance(courseId, date, records) {
  try {
    const teacher = await requireTeacherSession();
    const cleanCourseId = toCleanString(courseId);
    const course = await getDocumentOrNull(COURSES_COLLECTION_ID, cleanCourseId);

    if (!course) {
      return { error: "No se encontró el curso.", ok: false };
    }

    if (course.docenteId !== teacher.teacherId) {
      return { error: "Este curso no te pertenece.", ok: false };
    }

    const cleanDate = normalizeDateInput(date);

    await persistAttendance({
      courseId: cleanCourseId,
      date: cleanDate,
      records,
      registradoPor: teacher.teacherName || teacher.email,
      teacherId: teacher.teacherId,
    });

    const result = await buildRoster(cleanCourseId, cleanDate);

    revalidatePath("/docente/asistencia");

    return { ...result, ok: true, teacherName: teacher.teacherName };
  } catch (error) {
    return { error: getActionError(error), ok: false };
  }
}

// ---- Staff-facing (admin dashboard): any teacher, any course ----

export async function getTeachersForAttendance() {
  try {
    await requireStaffRole(["administrador", "academico"]);

    const teachers = await listAllDocuments(TEACHERS_COLLECTION_ID, [
      Query.equal("estado", "activo"),
      Query.select(["$id", "nombre", "apellido"]),
    ]);

    return {
      ok: true,
      teachers: teachers
        .map((teacher) => ({
          $id: teacher.$id,
          nombre: `${teacher.nombre || ""} ${teacher.apellido || ""}`.trim(),
        }))
        .sort((left, right) => left.nombre.localeCompare(right.nombre, "es")),
    };
  } catch (error) {
    return { error: getActionError(error), ok: false, teachers: [] };
  }
}

export async function getTeacherCoursesForStaff(teacherId) {
  try {
    await requireStaffRole(["administrador", "academico"]);

    const cleanTeacherId = toCleanString(teacherId);

    if (!cleanTeacherId) {
      return { courses: [], ok: true };
    }

    const courses = await listCoursesForTeacher(cleanTeacherId);

    return { courses, ok: true };
  } catch (error) {
    return { courses: [], error: getActionError(error), ok: false };
  }
}

export async function getCourseRosterForStaff(courseId, date) {
  try {
    await requireStaffRole(["administrador", "academico"]);

    const result = await buildRoster(toCleanString(courseId), normalizeDateInput(date));

    if (result.error) {
      return { error: result.error, ok: false, roster: [] };
    }

    return { ...result, ok: true };
  } catch (error) {
    return { error: getActionError(error), ok: false, roster: [] };
  }
}

export async function saveCourseAttendanceForStaff(courseId, date, records) {
  try {
    const staffUser = await requireStaffRole(["administrador", "academico"]);
    const cleanCourseId = toCleanString(courseId);
    const course = await getDocumentOrNull(COURSES_COLLECTION_ID, cleanCourseId);

    if (!course) {
      return { error: "No se encontró el curso.", ok: false };
    }

    const cleanDate = normalizeDateInput(date);

    await persistAttendance({
      courseId: cleanCourseId,
      date: cleanDate,
      records,
      registradoPor: staffUser.name || staffUser.email,
      teacherId: course.docenteId,
    });

    const result = await buildRoster(cleanCourseId, cleanDate);

    revalidatePath("/dashboard/asistencia");

    return { ...result, ok: true };
  } catch (error) {
    return { error: getActionError(error), ok: false };
  }
}
