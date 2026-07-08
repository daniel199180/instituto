import { PrivatePage } from "../../_components/control-shell";
import { DebtorsClient } from "./debtors-client";

export default function DebtorsPage() {
  return (
    <PrivatePage ariaLabel="Reporte de deudores" title="Deudores">
      <DebtorsClient />
    </PrivatePage>
  );
}
