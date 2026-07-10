import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { AppwriteException } from "node-appwrite";
import {
  APPWRITE_DATABASE_ID,
  Query,
  createAdminAccount,
  createAdminDatabases,
  createAdminTeams,
  createAdminUsers,
} from "@/lib/appwrite-server";
import { SESSION_COOKIE_NAME } from "@/lib/auth-guard";
import { getPrimaryStaffRole } from "@/lib/roles";

// Resolves what the account is right after login: its staff role (if any)
// and whether it's a linked teacher, so the client can route it to the
// correct portal without an extra round trip.
async function resolveAccessProfile(userId) {
  const teams = createAdminTeams();
  const memberships = await teams.listMemberships({
    queries: [Query.equal("userId", userId), Query.limit(1)],
    teamId: "staff",
  });
  const role = getPrimaryStaffRole(memberships.memberships[0]?.roles || []);

  if (role) {
    return { isTeacher: false, role };
  }

  const databases = createAdminDatabases();
  const teachers = await databases.listDocuments({
    collectionId: "teachers",
    databaseId: APPWRITE_DATABASE_ID,
    queries: [Query.equal("userId", userId), Query.limit(1)],
  });
  const teacher = teachers.documents[0];

  return {
    isTeacher: Boolean(teacher && teacher.estado !== "inactivo"),
    role: null,
  };
}

function getErrorMessage(error) {
  if (error instanceof AppwriteException) {
    const message = error.message.toLowerCase();

    if (
      message.includes("invalid credentials") ||
      message.includes("invalid `password`") ||
      message.includes("invalid password") ||
      message.includes("user_invalid_credentials")
    ) {
      return "Correo o contraseña incorrectos.";
    }

    if (error.code === 429) {
      return "Demasiados intentos. Espera un momento y vuelve a intentar.";
    }

    if (error.code >= 500) {
      return "Appwrite no respondió correctamente. Intenta nuevamente en unos segundos.";
    }

    return "No se pudo iniciar sesión. Verifica tus datos.";
  }

  return "No se pudo completar la solicitud.";
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json(
      { error: "Ingresa tu correo y contraseña.", ok: false },
      { status: 400 },
    );
  }

  try {
    const account = createAdminAccount();
    const session = await account.createEmailPasswordSession({
      email,
      password,
    });
    const cookieStore = await cookies();
    const expireDate = new Date(session.expire);

    cookieStore.set(SESSION_COOKIE_NAME, session.secret, {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      ...(Number.isFinite(expireDate.getTime())
        ? { expires: expireDate }
        : {}),
    });

    const users = createAdminUsers();
    const [user, access] = await Promise.all([
      users.get({ userId: session.userId }),
      resolveAccessProfile(session.userId),
    ]);

    return NextResponse.json({
      ok: true,
      user: {
        $id: user.$id,
        email: user.email,
        isTeacher: access.isTeacher,
        name: user.name,
        role: access.role,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: getErrorMessage(error), ok: false },
      { status: 401 },
    );
  }
}
