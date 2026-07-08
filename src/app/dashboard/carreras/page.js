import { PrivatePage } from "../../_components/control-shell";
import { CareersClient } from "./careers-client";

export default function CareersPage() {
  return (
    <PrivatePage ariaLabel="Gestión de carreras" title="Carreras">
      <CareersClient />
    </PrivatePage>
  );
}
