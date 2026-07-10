"use server";

import { revalidatePath } from "next/cache";
import {
  APPWRITE_DATABASE_ID,
  ID,
  Query,
  createAdminDatabases,
  createAdminTeams,
  createAdminUsers,
} from "@/lib/appwrite-server";
import { invokeSecureOperation } from "@/lib/secure-operations";
import { requireStaffRole } from "@/lib/auth-guard";

const STAFF_TEAM_ID = "staff";
const DOCENTES_TEAM_ID = "docentes";
const STAFF_PROFILES_COLLECTION_ID = "staffProfiles";
const BRANCHES_COLLECTION_ID = "branches";
const TEACHERS_COLLECTION_ID = "teachers";
const VALID_STAFF_ROLES = new Set(["administrador", "cajero", "academico"]);
// "docente" is a role too, but it lives in the separate "docentes" team so it
// never grants staff access; requireStaffSession only checks the staff team.
const VALID_ROLES = new Set([...VALID_STAFF_ROLES, "docente"]);
const VALID_USER_STATUSES = new Set(["activo", "inactivo"]);

function toCleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeUserStatus(status) {
  return status === "inactivo" ? "inactivo" : "activo";
}

function teamForRole(role) {
  return role === "docente" ? DOCENTES_TEAM_ID : STAFF_TEAM_ID;
}

function getPrimaryRole(roles = []) {
  return roles.find((role) => VALID_ROLES.has(role)) || "cajero";
}

function roleLabel(role) {
  if (role === "administrador") return "Administrador";
  if (role === "academico") return "Encargado Académico";
  if (role === "docente") return "Docente";
  return "Cajero";
}

function serializeBranch(branch) {
  return {
    $id: branch.$id,
    estado: branch.estado || "activo",
    nombre: branch.nombre || "",
    tipo: branch.tipo || "presencial",
  };
}

function serializeStaffUser({ branchMap, membership, profile, user }) {
  const role = getPrimaryRole(membership.roles);
  const sucursalId = profile?.sucursalId || "";

  return {
    $createdAt: user.registration || membership.$createdAt,
    $id: user.$id,
    email: user.email || membership.userEmail || "",
    membershipId: membership.$id,
    nombre: user.name || membership.userName || "",
    role,
    roleLabel: roleLabel(role),
    status: user.status ? "activo" : "inactivo",
    sucursalId,
    sucursalNombre: branchMap.get(sucursalId)?.nombre || "",
  };
}

function validateStaffUserInput(input, mode = "create") {
  const staffUser = {
    apellido: toCleanString(input?.apellido),
    documento: toCleanString(input?.documento),
    email: toCleanString(input?.email),
    nombre: toCleanString(input?.nombre),
    password: typeof input?.password === "string" ? input.password : "",
    role: toCleanString(input?.role),
    status: normalizeUserStatus(toCleanString(input?.status)),
    sucursalId: toCleanString(input?.sucursalId),
  };

  if (!staffUser.nombre) {
    return { error: "Ingresa el nombre del usuario." };
  }

  if (staffUser.nombre.length > 128) {
    return { error: "El nombre no puede superar 128 caracteres." };
  }

  if (!staffUser.email) {
    return { error: "Ingresa el correo del usuario." };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(staffUser.email)) {
    return { error: "Ingresa un correo válido." };
  }

  if (!VALID_ROLES.has(staffUser.role)) {
    return { error: "Selecciona un rol válido." };
  }

  if (staffUser.role === "cajero" && !staffUser.sucursalId) {
    return { error: "Selecciona la sucursal del cajero." };
  }

  if (staffUser.role === "docente") {
    if (!staffUser.apellido) {
      return { error: "Ingresa el apellido del docente." };
    }

    if (staffUser.apellido.length > 128) {
      return { error: "El apellido no puede superar 128 caracteres." };
    }

    if (mode === "create" && !staffUser.documento) {
      return { error: "Ingresa el documento del docente." };
    }

    if (staffUser.documento.length > 32) {
      return { error: "El documento no puede superar 32 caracteres." };
    }
  }

  if (mode === "create" && staffUser.password.length < 8) {
    return { error: "La contraseña debe tener al menos 8 caracteres." };
  }

  if (mode === "edit" && staffUser.password && staffUser.password.length < 8) {
    return { error: "La nueva contraseña debe tener al menos 8 caracteres." };
  }

  if (!VALID_USER_STATUSES.has(staffUser.status)) {
    return { error: "Selecciona un estado válido." };
  }

  // The Auth account keeps a single display name; for docentes it's the full
  // "nombre apellido" so their teacher record and login stay consistent.
  staffUser.displayName =
    staffUser.role === "docente"
      ? `${staffUser.nombre} ${staffUser.apellido}`.trim()
      : staffUser.nombre;

  return { staffUser };
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

async function listAllMemberships(teamId) {
  const teams = createAdminTeams();
  const memberships = [];
  let cursor = null;

  do {
    const queries = [Query.limit(100)];

    if (cursor) {
      queries.push(Query.cursorAfter(cursor));
    }

    const response = await teams.listMemberships({
      queries,
      teamId,
      total: false,
    });

    memberships.push(...response.memberships);
    cursor = response.memberships.at(-1)?.$id || null;

    if (response.memberships.length < 100) {
      cursor = null;
    }
  } while (cursor);

  return memberships;
}

async function getBranchMap() {
  const branches = await listAllDocuments(BRANCHES_COLLECTION_ID, [
    Query.select(["$id", "nombre", "tipo", "estado"]),
  ]);
  const serialized = branches
    .map(serializeBranch)
    .sort((left, right) => left.nombre.localeCompare(right.nombre, "es"));

  return {
    branchMap: new Map(serialized.map((branch) => [branch.$id, branch])),
    branches: serialized,
  };
}

async function getProfileMap() {
  const profiles = await listAllDocuments(STAFF_PROFILES_COLLECTION_ID, [
    Query.select(["$id", "userId", "sucursalId"]),
  ]);

  return new Map(profiles.map((profile) => [profile.userId, profile]));
}

async function upsertStaffProfile(userId, sucursalId) {
  const databases = createAdminDatabases();
  const existing = await databases.listDocuments({
    collectionId: STAFF_PROFILES_COLLECTION_ID,
    databaseId: APPWRITE_DATABASE_ID,
    queries: [Query.equal("userId", userId), Query.limit(1)],
    total: false,
  });
  const data = sucursalId ? { sucursalId, userId } : { sucursalId: "", userId };

  if (existing.documents[0]) {
    return databases.updateDocument({
      collectionId: STAFF_PROFILES_COLLECTION_ID,
      databaseId: APPWRITE_DATABASE_ID,
      data,
      documentId: existing.documents[0].$id,
    });
  }

  return databases.createDocument({
    collectionId: STAFF_PROFILES_COLLECTION_ID,
    databaseId: APPWRITE_DATABASE_ID,
    data,
    documentId: ID.unique(),
    permissions: [],
  });
}

// Keeps the Docentes collection in sync when a docente account is created or
// edited from Usuarios, so the teacher is registered once and appears in both
// places. Matched by teachers.userId (the same field the teacher portal uses).
async function upsertTeacherRecord(userId, staffUser) {
  const databases = createAdminDatabases();
  const existing = await databases.listDocuments({
    collectionId: TEACHERS_COLLECTION_ID,
    databaseId: APPWRITE_DATABASE_ID,
    queries: [Query.equal("userId", userId), Query.limit(1)],
    total: false,
  });
  const data = {
    apellido: staffUser.apellido,
    email: staffUser.email,
    estado: staffUser.status === "inactivo" ? "inactivo" : "activo",
    nombre: staffUser.nombre,
    userId,
  };

  if (staffUser.documento) {
    data.documento = staffUser.documento;
  }

  if (existing.documents[0]) {
    return databases.updateDocument({
      collectionId: TEACHERS_COLLECTION_ID,
      databaseId: APPWRITE_DATABASE_ID,
      data,
      documentId: existing.documents[0].$id,
    });
  }

  return databases.createDocument({
    collectionId: TEACHERS_COLLECTION_ID,
    databaseId: APPWRITE_DATABASE_ID,
    data,
    documentId: ID.unique(),
    permissions: [],
  });
}

async function setTeacherRecordStatus(userId, estado) {
  const databases = createAdminDatabases();
  const existing = await databases.listDocuments({
    collectionId: TEACHERS_COLLECTION_ID,
    databaseId: APPWRITE_DATABASE_ID,
    queries: [Query.equal("userId", userId), Query.limit(1)],
    total: false,
  });

  if (!existing.documents[0]) return;

  await databases.updateDocument({
    collectionId: TEACHERS_COLLECTION_ID,
    databaseId: APPWRITE_DATABASE_ID,
    data: { estado },
    documentId: existing.documents[0].$id,
  });
}

// Locates a user's membership across both the staff and docentes teams, so
// edit/delete work regardless of which one they belong to.
async function findUserMembership(userId) {
  const teams = createAdminTeams();

  for (const teamId of [STAFF_TEAM_ID, DOCENTES_TEAM_ID]) {
    const memberships = await teams.listMemberships({
      queries: [Query.equal("userId", userId), Query.limit(1)],
      teamId,
      total: false,
    });

    if (memberships.memberships[0]) {
      return { membership: memberships.memberships[0], teamId };
    }
  }

  return { membership: null, teamId: null };
}

async function listStaffUsersLocally() {
  const users = createAdminUsers();
  const [{ branchMap, branches }, profileMap, staffMemberships, docenteMemberships] =
    await Promise.all([
      getBranchMap(),
      getProfileMap(),
      listAllMemberships(STAFF_TEAM_ID),
      listAllMemberships(DOCENTES_TEAM_ID),
    ]);
  const memberships = [...staffMemberships, ...docenteMemberships];
  const staffUsers = await Promise.all(
    memberships.map(async (membership) => {
      try {
        const user = await users.get({ userId: membership.userId });

        return serializeStaffUser({
          branchMap,
          membership,
          profile: profileMap.get(membership.userId),
          user,
        });
      } catch {
        return null;
      }
    }),
  );

  return {
    branches,
    ok: true,
    users: staffUsers
      .filter(Boolean)
      .sort((left, right) => left.nombre.localeCompare(right.nombre, "es")),
  };
}

async function createStaffUserLocally(staffUser) {
  const users = createAdminUsers();
  const teams = createAdminTeams();
  const { branchMap } = await getBranchMap();
  const user = await users.create({
    email: staffUser.email,
    name: staffUser.displayName,
    password: staffUser.password,
    userId: ID.unique(),
  });
  const membership = await teams.createMembership({
    roles: [staffUser.role],
    teamId: teamForRole(staffUser.role),
    userId: user.$id,
  });
  let profile = null;

  if (staffUser.role === "docente") {
    await upsertTeacherRecord(user.$id, staffUser);
  } else {
    profile = await upsertStaffProfile(
      user.$id,
      staffUser.role === "cajero" ? staffUser.sucursalId : "",
    );
  }

  if (staffUser.status === "inactivo") {
    await users.updateStatus({ status: false, userId: user.$id });
    user.status = false;
  }

  return {
    ok: true,
    user: serializeStaffUser({ branchMap, membership, profile, user }),
  };
}

async function updateStaffUserLocally(userId, staffUser) {
  const users = createAdminUsers();
  const teams = createAdminTeams();
  const { branchMap } = await getBranchMap();
  const { membership, teamId } = await findUserMembership(userId);

  if (!membership) {
    return { error: "El usuario no pertenece a ningún equipo.", ok: false };
  }

  const isDocenteTeam = teamId === DOCENTES_TEAM_ID;

  // A docente and a staff member live in different teams; switching between
  // them would require moving teams and rebuilding their records, so it's
  // blocked here — delete and re-create instead.
  if (isDocenteTeam !== (staffUser.role === "docente")) {
    return {
      error:
        "No se puede cambiar entre docente y personal. Borra el usuario y créalo con el nuevo rol.",
      ok: false,
    };
  }

  let user = await users.updateName({
    name: staffUser.displayName,
    userId,
  });

  if (user.email !== staffUser.email) {
    user = await users.updateEmail({
      email: staffUser.email,
      userId,
    });
  }

  if (staffUser.password) {
    user = await users.updatePassword({
      password: staffUser.password,
      userId,
    });
  }

  user = await users.updateStatus({
    status: staffUser.status === "activo",
    userId,
  });

  const updatedMembership = await teams.updateMembership({
    membershipId: membership.$id,
    roles: [staffUser.role],
    teamId,
  });
  let profile = null;

  if (isDocenteTeam) {
    await upsertTeacherRecord(userId, staffUser);
  } else {
    profile = await upsertStaffProfile(
      userId,
      staffUser.role === "cajero" ? staffUser.sucursalId : "",
    );
  }

  return {
    ok: true,
    user: serializeStaffUser({
      branchMap,
      membership: updatedMembership,
      profile,
      user,
    }),
  };
}

async function deleteStaffUserLocally(userId) {
  const users = createAdminUsers();
  const { branchMap } = await getBranchMap();
  const { membership, teamId } = await findUserMembership(userId);

  if (!membership) {
    return { error: "El usuario no pertenece a ningún equipo.", ok: false };
  }

  const user = await users.updateStatus({
    status: false,
    userId,
  });

  if (teamId === DOCENTES_TEAM_ID) {
    await setTeacherRecordStatus(userId, "inactivo");
  }

  const profileMap = await getProfileMap();

  return {
    deactivated: true,
    ok: true,
    user: serializeStaffUser({
      branchMap,
      membership,
      profile: profileMap.get(userId),
      user,
    }),
  };
}

export async function listStaffUsers() {
  try {
    await requireStaffRole(["administrador"]);

    const result = await invokeSecureOperation("listStaffUsers");

    return result.useLocalFallback ? await listStaffUsersLocally() : result;
  } catch (error) {
    return { branches: [], error: getActionError(error), ok: false, users: [] };
  }
}

export async function createStaffUser(input) {
  const validation = validateStaffUserInput(input, "create");

  if (validation.error) {
    return { error: validation.error, ok: false };
  }

  const { staffUser } = validation;

  try {
    await requireStaffRole(["administrador"]);

    const result = await invokeSecureOperation("createStaffUser", {
      input: staffUser,
    });
    const finalResult = result.useLocalFallback
      ? await createStaffUserLocally(staffUser)
      : result;

    revalidatePath("/dashboard/usuarios");
    revalidatePath("/dashboard/docentes");

    return finalResult;
  } catch (error) {
    return { error: getActionError(error), ok: false };
  }
}

export async function updateStaffUser(userId, input) {
  const cleanUserId = toCleanString(userId);
  const validation = validateStaffUserInput(input, "edit");

  if (!cleanUserId) {
    return { error: "No se encontró el usuario a editar.", ok: false };
  }

  if (validation.error) {
    return { error: validation.error, ok: false };
  }

  const { staffUser } = validation;

  try {
    await requireStaffRole(["administrador"]);

    const result = await invokeSecureOperation("updateStaffUser", {
      input: staffUser,
      userId: cleanUserId,
    });
    const finalResult = result.useLocalFallback
      ? await updateStaffUserLocally(cleanUserId, staffUser)
      : result;

    revalidatePath("/dashboard/usuarios");
    revalidatePath("/dashboard/docentes");

    return finalResult;
  } catch (error) {
    return { error: getActionError(error), ok: false };
  }
}

export async function deleteStaffUser(userId) {
  const cleanUserId = toCleanString(userId);

  if (!cleanUserId) {
    return { error: "No se encontró el usuario a borrar.", ok: false };
  }

  try {
    await requireStaffRole(["administrador"]);

    const result = await invokeSecureOperation("deleteStaffUser", {
      userId: cleanUserId,
    });
    const finalResult = result.useLocalFallback
      ? await deleteStaffUserLocally(cleanUserId)
      : result;

    revalidatePath("/dashboard/usuarios");
    revalidatePath("/dashboard/docentes");

    return finalResult;
  } catch (error) {
    return { error: getActionError(error), ok: false };
  }
}
