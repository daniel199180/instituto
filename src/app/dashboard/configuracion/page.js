import { PrivatePage } from "../../_components/control-shell";
import { SettingsClient } from "./settings-client";

export default function SettingsPage() {
  return (
    <PrivatePage ariaLabel="Configuración del sistema" title="Configuración">
      <SettingsClient />
    </PrivatePage>
  );
}
