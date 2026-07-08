import { PrivatePage } from "../_components/control-shell";
import { DashboardPosClient } from "./dashboard-pos-client";

export default function DashboardPage() {
  return (
    <PrivatePage title="Panel">
      <DashboardPosClient />
    </PrivatePage>
  );
}
