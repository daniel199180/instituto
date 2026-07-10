"use server";

import { revalidatePath } from "next/cache";
import {
  APPWRITE_DATABASE_ID,
  ID,
  Query,
  createAdminDatabases,
} from "@/lib/appwrite-server";
import { requireStaffRole } from "@/lib/auth-guard";

const BRANCHES_COLLECTION_ID = "branches";
const COURSES_COLLECTION_ID = "courses";
const VALID_BRANCH_TYPES = new Set(["presencial", "online"]);
const VALID_BRANCH_STATUSES = new Set(["activo", "cerrado"]);

function normalizeBranchStatus(status) {
  if (status === "activa") return "activo";
  if (status === "inactiva" || status === "inactivo" || status === "cerrada") {
    return "cerrado";
  }

  return status || "activo";
}

function serializeBranch(branch) {
  return {
    $createdAt: branch.$createdAt,
    $id: branch.$id,
    $updatedAt: branch.$updatedAt,
    direccion: branch.direccion || "",
    estado: normalizeBranchStatus(branch.estado),
    nombre: branch.nombre || "",
    telefono: branch.telefono || "",
    tipo: branch.tipo || "presencial",
  };
}

function toCleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function validateBranchInput(input) {
  const branch = {
    direccion: toCleanString(input?.direccion),
    estado: normalizeBranchStatus(toCleanString(input?.estado)),
    nombre: toCleanString(input?.nombre),
    telefono: toCleanString(input?.telefono),
    tipo: toCleanString(input?.tipo),
  };

  if (!branch.nombre) {
    return { error: "Ingresa el nombre de la sucursal." };
  }

  if (branch.nombre.length > 128) {
    return { error: "El nombre no puede superar 128 caracteres." };
  }

  if (!VALID_BRANCH_TYPES.has(branch.tipo)) {
    return { error: "Selecciona un tipo válido de sucursal." };
  }

  if (branch.direccion.length > 256) {
    return { error: "La dirección no puede superar 256 caracteres." };
  }

  if (branch.telefono.length > 32) {
    return { error: "El teléfono no puede superar 32 caracteres." };
  }

  if (!VALID_BRANCH_STATUSES.has(branch.estado)) {
    return { error: "Selecciona un estado válido." };
  }

  return { branch };
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

export async function listBranches() {
  try {
    await requireStaffRole(["administrador", "cajero"]);

    const branches = await listAllDocuments(BRANCHES_COLLECTION_ID, [
      Query.select([
        "$id",
        "$createdAt",
        "$updatedAt",
        "nombre",
        "tipo",
        "direccion",
        "telefono",
        "estado",
      ]),
    ]);

    return {
      branches: branches
        .map(serializeBranch)
        .sort((left, right) => left.nombre.localeCompare(right.nombre, "es")),
      ok: true,
    };
  } catch (error) {
    return { branches: [], error: getActionError(error), ok: false };
  }
}

export async function createBranch(input) {
  const validation = validateBranchInput(input);

  if (validation.error) {
    return { error: validation.error, ok: false };
  }

  try {
    await requireStaffRole(["administrador"]);

    const databases = createAdminDatabases();
    const branch = await databases.createDocument({
      collectionId: BRANCHES_COLLECTION_ID,
      databaseId: APPWRITE_DATABASE_ID,
      data: validation.branch,
      documentId: ID.unique(),
      permissions: [],
    });

    revalidatePath("/dashboard/sucursales");

    return { branch: serializeBranch(branch), ok: true };
  } catch (error) {
    return { error: getActionError(error), ok: false };
  }
}

export async function updateBranch(branchId, input) {
  const cleanBranchId = toCleanString(branchId);
  const validation = validateBranchInput(input);

  if (!cleanBranchId) {
    return { error: "No se encontró la sucursal a editar.", ok: false };
  }

  if (validation.error) {
    return { error: validation.error, ok: false };
  }

  try {
    await requireStaffRole(["administrador"]);

    const databases = createAdminDatabases();
    const branch = await databases.updateDocument({
      collectionId: BRANCHES_COLLECTION_ID,
      databaseId: APPWRITE_DATABASE_ID,
      data: validation.branch,
      documentId: cleanBranchId,
    });

    revalidatePath("/dashboard/sucursales");

    return { branch: serializeBranch(branch), ok: true };
  } catch (error) {
    return { error: getActionError(error), ok: false };
  }
}

export async function deleteBranch(branchId) {
  const cleanBranchId = toCleanString(branchId);

  if (!cleanBranchId) {
    return { error: "No se encontró la sucursal a borrar.", ok: false };
  }

  try {
    await requireStaffRole(["administrador"]);

    const databases = createAdminDatabases();
    const courses = await listAllDocuments(COURSES_COLLECTION_ID, [
      Query.equal("sucursalId", cleanBranchId),
      Query.select(["$id", "estado"]),
    ]);
    const hasOpenCourses = courses.some(
      (course) => course.estado !== "cerrado",
    );

    if (hasOpenCourses) {
      return {
        error:
          "No se puede borrar la sucursal porque tiene cursos que no están cerrados.",
        ok: false,
      };
    }

    await databases.deleteDocument({
      collectionId: BRANCHES_COLLECTION_ID,
      databaseId: APPWRITE_DATABASE_ID,
      documentId: cleanBranchId,
    });

    revalidatePath("/dashboard/sucursales");

    return { ok: true };
  } catch (error) {
    return { error: getActionError(error), ok: false };
  }
}
