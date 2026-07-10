import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSessionClient } from "@/lib/appwrite-server";
import {
  getAuthenticatedUser,
  getStaffSessionUser,
  getTeacherSessionUser,
  SESSION_COOKIE_NAME,
} from "@/lib/auth-guard";
import { getPrimaryStaffRole } from "@/lib/roles";

export async function GET() {
  // Staff carry a role (used to filter the dashboard nav); teachers are
  // flagged so the shell can send them to their /docente portal.
  const staffUser = await getStaffSessionUser();

  if (staffUser) {
    return NextResponse.json({
      ok: true,
      user: {
        $id: staffUser.$id,
        email: staffUser.email,
        isTeacher: false,
        name: staffUser.name,
        role: getPrimaryStaffRole(staffUser.roles),
      },
    });
  }

  const teacher = await getTeacherSessionUser();

  if (teacher) {
    return NextResponse.json({
      ok: true,
      user: {
        $id: teacher.$id,
        email: teacher.email,
        isTeacher: true,
        name: teacher.teacherName || teacher.name,
        role: null,
      },
    });
  }

  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json({ ok: true, user: null });
  }

  return NextResponse.json({
    ok: true,
    user: {
      $id: user.$id,
      email: user.email,
      isTeacher: false,
      name: user.name,
      role: null,
    },
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
