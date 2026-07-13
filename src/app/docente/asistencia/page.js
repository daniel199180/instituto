import { PrivatePage } from "../../_components/control-shell";
import { MyAttendanceClient } from "./my-attendance-client";

export default async function MyAttendancePage({ searchParams }) {
  const params = await searchParams;
  const initialCourseId =
    typeof params?.courseId === "string" ? params.courseId : "";

  return (
    <PrivatePage
      ariaLabel="Tomar asistencia"
      navMode="teacher"
      title="Tomar asistencia"
    >
      <MyAttendanceClient initialCourseId={initialCourseId} />
    </PrivatePage>
  );
}
