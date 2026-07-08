import { PrivatePage } from "../../_components/control-shell";
import { ReportsClient } from "./reports-client";

export default function ReportsPage() {
  return (
    <PrivatePage ariaLabel="Reportes financieros" title="Reportes">
      <ReportsClient />
    </PrivatePage>
  );
}
