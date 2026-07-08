import { PrivatePage } from "../../_components/control-shell";
import { UsersClient } from "./users-client";

export default function UsersPage() {
  return (
    <PrivatePage ariaLabel="Gestión de usuarios" title="Usuarios">
      <UsersClient />
    </PrivatePage>
  );
}
