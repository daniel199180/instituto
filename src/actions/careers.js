"use server";

import { revalidatePath } from "next/cache";
import {
  APPWRITE_DATABASE_ID,
  ID,
  Query,
  createAdminDatabases,
} from "@/lib/appwrite-server";
import { requireStaffSession } from "@/lib/auth-guard";

const CAREERS_COLLECTION_ID = "careers";
const BRANCHES_COLLECTION_ID = "branches";
const COURSES_COLLECTION_ID = "courses";
const VALID_CAREER_STATUSES = new Set(["activo", "cerrado"]);

function normalizeCareerStatus(status) {
  if (status === "activa") return "activo";
  if (status === "inactiva" || status === "inactivo" || status === "cerrada") {
    return "cerrado";
  }

  return VALID_CAREER_STATUSES.has(status) ? status : "activo";
}

function normalizeBranchStatus(status) {
  if (status === "activa") return "activo";
  if (status === "inactiva" || status === "inactivo" || status === "cerrada") {
    return "cerrado";
  }

  return status || "activo";
}

function toCleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function serializeBranch(branch) {
  return {
    $id: branch.$id,
    estado: normalizeBranchStatus(branch.estado),
    nombre: branch.nombre || "",
    tipo: branch.tipo || "presencial",
  };
}

function serializeCareer(career, branchMap = new Map()) {
  const branch = branchMap.get(career.sucursalId);

  return {
    $createdAt: career.$createdAt,
    $id: career.$id,
    $updatedAt: career.$updatedAt,
    descripcion: career.descripcion || "",
    estado: normalizeCareerStatus(career.estado),
    nombre: career.nombre || "",
    sucursalId: career.sucursalId || "",
    sucursalNombre: branch?.nombre || "Sin sucursal",
  };
}

function validateCareerInput(input) {
  const career = {
    descripcion: toCleanString(input?.descripcion),
    estado: normalizeCareerStatus(toCleanString(input?.estado)),
    nombre: toCleanString(input?.nombre),
    sucursalId: toCleanString(input?.sucursalId),
  };

  if (!career.nombre) {
    return { error: "Ingresa el nombre de la carrera." };
  }

  if (career.nombre.length > 128) {
    return { error: "El nombre no puede superar 128 caracteres." };
  }

  if (career.descripcion.length > 512) {
    return { error: "La descripción no puede superar 512 caracteres." };
  }

  if (!career.sucursalId) {
    return { error: "Selecciona una sucursal." };
  }

  if (career.sucursalId.length > 64) {
    return { error: "La sucursal seleccionada no es válida." };
  }

  if (!VALID_CAREER_STATUSES.has(career.estado)) {
    return { error: "Selecciona un estado válido." };
  }

  return { career };
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

async function getBranchMap() {
  const branches = await listAllDocuments(BRANCHES_COLLECTION_ID, [
    Query.select(["$id", "nombre", "tipo", "estado"]),
  ]);
  const serialized = sortByName(branches.map(serializeBranch));

  return {
    branchMap: new Map(serialized.map((branch) => [branch.$id, branch])),
    branches: serialized,
  };
}

export async function listCareers() {
  try {
    await requireStaffSession();

    const [{ branchMap, branches }, careers] = await Promise.all([
      getBranchMap(),
      listAllDocuments(CAREERS_COLLECTION_ID, [
        Query.select([
          "$id",
          "$createdAt",
          "$updatedAt",
          "nombre",
          "descripcion",
          "sucursalId",
          "estado",
        ]),
      ]),
    ]);

    return {
      branches,
      careers: sortByName(
        careers.map((career) => serializeCareer(career, branchMap)),
      ),
      ok: true,
    };
  } catch (error) {
    return {
      branches: [],
      careers: [],
      error: getActionError(error),
      ok: false,
    };
  }
}

export async function createCareer(input) {
  const validation = validateCareerInput(input);

  if (validation.error) {
    return { error: validation.error, ok: false };
  }

  try {
    await requireStaffSession();

    const databases = createAdminDatabases();
    const { branchMap } = await getBranchMap();
    const career = await databases.createDocument({
      collectionId: CAREERS_COLLECTION_ID,
      databaseId: APPWRITE_DATABASE_ID,
      data: validation.career,
      documentId: ID.unique(),
      permissions: [],
    });

    revalidatePath("/dashboard/carreras");

    return { career: serializeCareer(career, branchMap), ok: true };
  } catch (error) {
    return { error: getActionError(error), ok: false };
  }
}

export async function updateCareer(careerId, input) {
  const cleanCareerId = toCleanString(careerId);
  const validation = validateCareerInput(input);

  if (!cleanCareerId) {
    return { error: "No se encontró la carrera a editar.", ok: false };
  }

  if (validation.error) {
    return { error: validation.error, ok: false };
  }

  try {
    await requireStaffSession();

    const databases = createAdminDatabases();
    const { branchMap } = await getBranchMap();
    const career = await databases.updateDocument({
      collectionId: CAREERS_COLLECTION_ID,
      databaseId: APPWRITE_DATABASE_ID,
      data: validation.career,
      documentId: cleanCareerId,
    });

    revalidatePath("/dashboard/carreras");

    return { career: serializeCareer(career, branchMap), ok: true };
  } catch (error) {
    return { error: getActionError(error), ok: false };
  }
}

export async function deleteCareer(careerId) {
  const cleanCareerId = toCleanString(careerId);

  if (!cleanCareerId) {
    return { error: "No se encontró la carrera a borrar.", ok: false };
  }

  try {
    await requireStaffSession();

    const databases = createAdminDatabases();
    const courses = await listAllDocuments(COURSES_COLLECTION_ID, [
      Query.equal("carreraId", cleanCareerId),
      Query.select(["$id"]),
    ]);

    if (courses.length) {
      const { branchMap } = await getBranchMap();
      const career = await databases.updateDocument({
        collectionId: CAREERS_COLLECTION_ID,
        databaseId: APPWRITE_DATABASE_ID,
        data: { estado: "cerrado" },
        documentId: cleanCareerId,
      });

      revalidatePath("/dashboard/carreras");

      return {
        career: serializeCareer(career, branchMap),
        closed: true,
        ok: true,
      };
    }

    await databases.deleteDocument({
      collectionId: CAREERS_COLLECTION_ID,
      databaseId: APPWRITE_DATABASE_ID,
      documentId: cleanCareerId,
    });

    revalidatePath("/dashboard/carreras");

    return { deleted: true, ok: true };
  } catch (error) {
    return { error: getActionError(error), ok: false };
  }
}
