import { PrivatePage } from "../../_components/control-shell";
import { PaymentsClient } from "./payments-client";

export default function PaymentsPage() {
  return (
    <PrivatePage ariaLabel="Gestión de mensualidades" title="Mensualidades">
      <PaymentsClient />
    </PrivatePage>
  );
}
