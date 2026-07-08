import { PrivatePage } from "../../_components/control-shell";
import { SchedulesClient } from "./schedules-client";

export default function SchedulesPage() {
  return (
    <PrivatePage ariaLabel="Gestión de horarios" title="Horarios">
      <SchedulesClient />
    </PrivatePage>
  );
}
