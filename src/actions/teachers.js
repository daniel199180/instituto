"use server";

import { revalidatePath } from "next/cache";
import {
  APPWRITE_DATABASE_ID,
  ID,
  Query,
  createAdminDatabases,
} from "@/lib/appwrite-server";
import { requireStaffSession } from "@/lib/auth-guard";

const TEACHERS_COLLECTION_ID = "teachers";
const COURSES_COLLECTION_ID = "courses";
const ATTENDANCE_COLLECTION_ID = "attendance";
const VALID_TEACHER_STATUSES = new Set(["activo", "inactivo"]);

function normalizeTeacherStatus(status) {
  if (status === "cerrado" || status === "inactiva") return "inactivo";

  return VALID_TEACHER_STATUSES.has(status) ? status : "activo";
}

function serializeTeacher(teacher) {
  return {
    $createdAt: teacher.$createdAt,
    $id: teacher.$id,
    $updatedAt: teacher.$updatedAt,
    apellido: teacher.apellido || "",
    documento: teacher.documento || "",
    email: teacher.email || "",
    especialidad: teacher.especialidad || "",
    estado: normalizeTeacherStatus(teacher.estado),
    nombre: teacher.nombre || "",
    telefono: teacher.telefono || "",
    userId: teacher.userId || "",
  };
}

function toCleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function validateTeacherInput(input) {
  const teacher = {
    apellido: toCleanString(input?.apellido),
    documento: toCleanString(input?.documento),
    email: toCleanString(input?.email),
    especialidad: toCleanString(input?.especialidad),
    estado: normalizeTeacherStatus(toCleanString(input?.estado)),
    nombre: toCleanString(input?.nombre),
    telefono: toCleanString(input?.telefono),
    userId: toCleanString(input?.userId),
  };

  if (!teacher.nombre) {
    return { error: "Ingresa el nombre del docente." };
  }

  if (teacher.nombre.length > 128) {
    return { error: "El nombre no puede superar 128 caracteres." };
  }

  if (!teacher.apellido) {
    return { error: "Ingresa el apellido del docente." };
  }

  if (teacher.apellido.length > 128) {
    return { error: "El apellido no puede superar 128 caracteres." };
  }

  if (!teacher.documento) {
    return { error: "Ingresa el documento del docente." };
  }

  if (teacher.documento.length > 32) {
    return { error: "El documento no puede superar 32 caracteres." };
  }

  if (teacher.email.length > 128) {
    return { error: "El correo no puede superar 128 caracteres." };
  }

  if (teacher.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(teacher.email)) {
    return { error: "Ingresa un correo válido." };
  }

  if (teacher.telefono.length > 32) {
    return { error: "El teléfono no puede superar 32 caracteres." };
  }

  if (teacher.especialidad.length > 128) {
    return { error: "La especialidad no puede superar 128 caracteres." };
  }

  if (teacher.userId.length > 64) {
    return { error: "El ID de usuario no puede superar 64 caracteres." };
  }

  if (!VALID_TEACHER_STATUSES.has(teacher.estado)) {
    return { error: "Selecciona un estado válido." };
  }

  return { teacher };
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

function sortTeachers(teachers) {
  return teachers.sort((left, right) => {
    const leftName = `${left.apellido} ${left.nombre}`;
    const rightName = `${right.apellido} ${right.nombre}`;
    return leftName.localeCompare(rightName, "es");
  });
}

export async function listTeachers() {
  try {
    await requireStaffSession();

    const teachers = await listAllDocuments(TEACHERS_COLLECTION_ID, [
      Query.select([
        "$id",
        "$createdAt",
        "$updatedAt",
        "nombre",
        "apellido",
        "documento",
        "email",
        "telefono",
        "especialidad",
        "estado",
        "userId",
      ]),
    ]);

    return {
      ok: true,
      teachers: sortTeachers(teachers.map(serializeTeacher)),
    };
  } catch (error) {
    return { error: getActionError(error), ok: false, teachers: [] };
  }
}

export async function createTeacher(input) {
  const validation = validateTeacherInput(input);

  if (validation.error) {
    return { error: validation.error, ok: false };
  }

  try {
    await requireStaffSession();

    const databases = createAdminDatabases();
    const teacher = await databases.createDocument({
      collectionId: TEACHERS_COLLECTION_ID,
      databaseId: APPWRITE_DATABASE_ID,
      data: validation.teacher,
      documentId: ID.unique(),
      permissions: [],
    });

    revalidatePath("/dashboard/docentes");

    return { ok: true, teacher: serializeTeacher(teacher) };
  } catch (error) {
    return { error: getActionError(error), ok: false };
  }
}

export async function updateTeacher(teacherId, input) {
  const cleanTeacherId = toCleanString(teacherId);
  const validation = validateTeacherInput(input);

  if (!cleanTeacherId) {
    return { error: "No se encontró el docente a editar.", ok: false };
  }

  if (validation.error) {
    return { error: validation.error, ok: false };
  }

  try {
    await requireStaffSession();

    const databases = createAdminDatabases();
    const teacher = await databases.updateDocument({
      collectionId: TEACHERS_COLLECTION_ID,
      databaseId: APPWRITE_DATABASE_ID,
      data: validation.teacher,
      documentId: cleanTeacherId,
    });

    revalidatePath("/dashboard/docentes");

    return { ok: true, teacher: serializeTeacher(teacher) };
  } catch (error) {
    return { error: getActionError(error), ok: false };
  }
}

export async function deleteTeacher(teacherId) {
  const cleanTeacherId = toCleanString(teacherId);

  if (!cleanTeacherId) {
    return { error: "No se encontró el docente a borrar.", ok: false };
  }

  try {
    await requireStaffSession();

    const databases = createAdminDatabases();
    const [courses, attendance] = await Promise.all([
      listAllDocuments(COURSES_COLLECTION_ID, [
        Query.equal("docenteId", cleanTeacherId),
        Query.select(["$id"]),
      ]),
      listAllDocuments(ATTENDANCE_COLLECTION_ID, [
        Query.equal("teacherId", cleanTeacherId),
        Query.select(["$id"]),
      ]),
    ]);

    if (courses.length || attendance.length) {
      const teacher = await databases.updateDocument({
        collectionId: TEACHERS_COLLECTION_ID,
        databaseId: APPWRITE_DATABASE_ID,
        data: { estado: "inactivo" },
        documentId: cleanTeacherId,
      });

      revalidatePath("/dashboard/docentes");

      return {
        deactivated: true,
        ok: true,
        teacher: serializeTeacher(teacher),
      };
    }

    await databases.deleteDocument({
      collectionId: TEACHERS_COLLECTION_ID,
      databaseId: APPWRITE_DATABASE_ID,
      documentId: cleanTeacherId,
    });

    revalidatePath("/dashboard/docentes");

    return { deleted: true, ok: true };
  } catch (error) {
    return { error: getActionError(error), ok: false };
  }
}
