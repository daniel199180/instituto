import { PrivatePage } from "../../_components/control-shell";
import { PagosClient } from "./pagos-client";

export default function PagosPage() {
  return (
    <PrivatePage ariaLabel="Pagos" title="Pagos">
      <PagosClient />
    </PrivatePage>
  );
}
