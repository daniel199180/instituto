import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSessionClient } from "@/lib/appwrite-server";
import {
  getAuthenticatedUser,
  getStaffSessionUser,
  SESSION_COOKIE_NAME,
} from "@/lib/auth-guard";
import { getPrimaryStaffRole } from "@/lib/roles";

export async function GET() {
  // Staff carry a role (used to filter the dashboard nav); teachers and other
  // logged-in accounts have no staff role.
  const staffUser = await getStaffSessionUser();

  if (staffUser) {
    return NextResponse.json({
      ok: true,
      user: {
        $id: staffUser.$id,
        email: staffUser.email,
        name: staffUser.name,
        role: getPrimaryStaffRole(staffUser.roles),
      },
    });
  }

  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json({ ok: true, user: null });
  }

  return NextResponse.json({
    ok: true,
    user: { $id: user.$id, email: user.email, name: user.name, role: null },
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
