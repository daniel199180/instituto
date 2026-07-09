import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { AppwriteException } from "node-appwrite";
import { createAdminAccount, createAdminUsers } from "@/lib/appwrite-server";
import { SESSION_COOKIE_NAME } from "@/lib/auth-guard";

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
    const user = await users.get({ userId: session.userId });

    return NextResponse.json({
      ok: true,
      user: { $id: user.$id, email: user.email, name: user.name },
    });
  } catch (error) {
    return NextResponse.json(
      { error: getErrorMessage(error), ok: false },
      { status: 401 },
    );
  }
}
