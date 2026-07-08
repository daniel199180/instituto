import { PrivatePage } from "../../_components/control-shell";
import { CoursesClient } from "./courses-client";

export default function CoursesPage() {
  return (
    <PrivatePage ariaLabel="Gestión de cursos" title="Cursos">
      <CoursesClient />
    </PrivatePage>
  );
}
