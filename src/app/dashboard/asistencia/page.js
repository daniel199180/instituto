import { PrivatePage } from "../../_components/control-shell";
import { AttendanceClient } from "./attendance-client";

export default function AttendancePage() {
  return (
    <PrivatePage ariaLabel="Asistencia" title="Asistencia">
      <AttendanceClient />
    </PrivatePage>
  );
}
