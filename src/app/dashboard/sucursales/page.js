import { PrivatePage } from "../../_components/control-shell";
import { BranchesClient } from "./branches-client";

export default function BranchesPage() {
  return (
    <PrivatePage ariaLabel="Gestión de sucursales" title="Sucursales">
      <BranchesClient />
    </PrivatePage>
  );
}
