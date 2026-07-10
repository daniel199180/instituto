import { PrivatePage } from "../../_components/control-shell";
import { MyCoursesClient } from "./my-courses-client";

export default function MyCoursesPage() {
  return (
    <PrivatePage ariaLabel="Mis cursos" navMode="teacher" title="Mis cursos">
      <MyCoursesClient />
    </PrivatePage>
  );
}
