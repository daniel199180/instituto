import { PrivatePage } from "../../_components/control-shell";
import { SueldosClient } from "./sueldos-client";

export default function SueldosPage() {
  return (
    <PrivatePage ariaLabel="Sueldos docentes" title="Sueldos">
      <SueldosClient />
    </PrivatePage>
  );
}
