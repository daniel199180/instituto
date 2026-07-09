import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSessionClient } from "@/lib/appwrite-server";
import { getAuthenticatedUser, SESSION_COOKIE_NAME } from "@/lib/auth-guard";

export async function GET() {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json({ ok: true, user: null });
  }

  return NextResponse.json({
    ok: true,
    user: { $id: user.$id, email: user.email, name: user.name },
  });
}

export async function DELETE() {
  const cookieStore = await cookies();
  const secret = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (secret) {
    try {
      const { account } = createSessionClient(secret);
      await account.deleteSession({ sessionId: "current" });
    } catch {
      // Session may already be invalid/expired; clearing the cookie below
      // is enough to end the local session either way.
    }
  }

  cookieStore.delete(SESSION_COOKIE_NAME);

  return NextResponse.json({ ok: true });
}
