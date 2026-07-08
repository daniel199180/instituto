import { PrivatePage } from "../../_components/control-shell";
import { EnrollmentsClient } from "./enrollments-client";

export default function EnrollmentsPage() {
  return (
    <PrivatePage ariaLabel="Gestión de inscripciones" title="Inscripciones">
      <EnrollmentsClient />
    </PrivatePage>
  );
}
