import "server-only";

import { cookies } from "next/headers";
import {
  APPWRITE_DATABASE_ID,
  createAdminDatabases,
  createAdminTeams,
  createSessionClient,
  Query,
} from "@/lib/appwrite-server";

export const SESSION_COOKIE_NAME = "ci_session";
const STAFF_TEAM_ID = "staff";
const TEACHERS_COLLECTION_ID = "teachers";

/**
 * Confirms the session cookie maps to a real, currently-valid Appwrite
 * session by asking Appwrite with that user's own session (never the admin
 * API key). Used for the generic "is anyone logged in" check shared by the
 * staff and teacher portals, which don't require staff-team membership.
 */
export async function getAuthenticatedUser() {
  const cookieStore = await cookies();
  const secret = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!secret) {
    return null;
  }

  try {
    const { account } = createSessionClient(secret);
    return await account.get();
  } catch (error) {
    console.error("getAuthenticatedUser failed:", error?.message || error);
    return null;
  }
}

/**
 * Same as getAuthenticatedUser, but additionally resolves the caller's
 * membership (and roles) in the "staff" team. Identity is proven with the
 * caller's own session (account.get() can only ever return their own
 * record), then the membership/roles lookup goes through the admin Teams
 * client filtered by that exact userId — regular team members aren't
 * guaranteed permission to list a team's memberships via their own session,
 * so this avoids depending on that.
 */
export async function getStaffSessionUser() {
  const cookieStore = await cookies();
  const secret = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!secret) {
    return null;
  }

  try {
    const { account } = createSessionClient(secret);
    const user = await account.get();
    const teams = createAdminTeams();
    const memberships = await teams.listMemberships({
      queries: [Query.equal("userId", user.$id), Query.limit(1)],
      teamId: STAFF_TEAM_ID,
    });
    const membership = memberships.memberships[0];

    if (!membership) {
      console.error(
        `Acceso denegado: ${user.email} tiene sesión válida pero no pertenece al team "staff". Agrégalo desde Usuarios o la consola de Appwrite.`,
      );
      return null;
    }

    return { ...user, roles: membership.roles };
  } catch (error) {
    console.error("getStaffSessionUser failed:", error?.message || error);
    return null;
  }
}

/**
 * Same as getAuthenticatedUser, but additionally resolves the caller's own
 * "teachers" record (matched by teachers.userId, the manual link set from
 * the staff Docentes page). Returns null for anyone logged in who isn't
 * linked to an active teacher record, so teacher-only actions never run on
 * behalf of a student/guardian or a not-yet-linked account.
 */
export async function getTeacherSessionUser() {
  const user = await getAuthenticatedUser();

  if (!user) {
    return null;
  }

  try {
    const databases = createAdminDatabases();
    const response = await databases.listDocuments({
      collectionId: TEACHERS_COLLECTION_ID,
      databaseId: APPWRITE_DATABASE_ID,
      queries: [Query.equal("userId", user.$id), Query.limit(1)],
    });
    const teacher = response.documents[0];

    if (!teacher || teacher.estado === "inactivo") {
      return null;
    }

    return {
      ...user,
      teacherId: teacher.$id,
      teacherName: `${teacher.nombre || ""} ${teacher.apellido || ""}`.trim(),
    };
  } catch (error) {
    console.error("getTeacherSessionUser failed:", error?.message || error);
    return null;
  }
}

/**
 * Guard for every "use server" action that touches the admin Appwrite
 * clients (full privileges). Must be the first call in each action so an
 * unauthenticated or non-staff caller never reaches the admin clients,
 * regardless of what the browser UI shows.
 */
export async function requireStaffSession() {
  const user = await getStaffSessionUser();

  if (!user) {
    throw new Error("No autorizado. Inicia sesión nuevamente.");
  }

  return user;
}

export async function requireStaffRole(allowedRoles) {
  const user = await requireStaffSession();

  if (!allowedRoles.some((role) => user.roles.includes(role))) {
    throw new Error("No tienes permiso para realizar esta acción.");
  }

  return user;
}

export async function requireTeacherSession() {
  const teacher = await getTeacherSessionUser();

  if (!teacher) {
    throw new Error("No autorizado. Inicia sesión como docente nuevamente.");
  }

  return teacher;
}
