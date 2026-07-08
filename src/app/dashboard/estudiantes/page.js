import { PrivatePage } from "../../_components/control-shell";
import { StudentsClient } from "./students-client";

export default function StudentsPage() {
  return (
    <PrivatePage ariaLabel="Gestión de estudiantes" title="Estudiantes">
      <StudentsClient />
    </PrivatePage>
  );
}
