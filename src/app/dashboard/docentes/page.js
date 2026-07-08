import { PrivatePage } from "../../_components/control-shell";
import { TeachersClient } from "./teachers-client";

export default function TeachersPage() {
  return (
    <PrivatePage ariaLabel="Gestión de docentes" title="Docentes">
      <TeachersClient />
    </PrivatePage>
  );
}
