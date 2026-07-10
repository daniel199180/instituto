// Central source of truth for staff role → page access, derived from the
// permission matrix in docs/especificacion-sistema-mensualidades.md §3.
// Shared by the sidebar (visibility), the route guard (URL access) and the
// server actions (real enforcement) so all three stay consistent.
//
// Staff roles: "administrador", "cajero", "academico". "docente" is a
// separate team with its own /docente/* portal and is not listed here.

export const STAFF_ROLES = ["administrador", "cajero", "academico"];

// Which roles may see/enter each dashboard route.
export const PAGE_ROLES = {
  "/dashboard": ["administrador", "cajero"],
  "/dashboard/estudiantes": ["administrador", "cajero"],
  "/dashboard/cursos": ["administrador", "cajero", "academico"],
  "/dashboard/inscripciones": ["administrador", "cajero"],
  "/dashboard/horarios": ["administrador", "cajero", "academico"],
  "/dashboard/asistencia": ["administrador", "academico"],
  "/dashboard/mensualidades": ["administrador", "cajero"],
  "/dashboard/deudores": ["administrador", "cajero"],
  "/dashboard/pagos": ["administrador", "cajero"],
  "/dashboard/sucursales": ["administrador"],
  "/dashboard/carreras": ["administrador", "cajero"],
  "/dashboard/docentes": ["administrador"],
  "/dashboard/usuarios": ["administrador"],
  "/dashboard/configuracion": ["administrador"],
  "/dashboard/sueldos": ["administrador"],
};

// Reusable role sets for guarding server actions. "view" is who may read a
// page's data; "manage" is who may create/edit/delete within it.
export const ACTION_ROLES = {
  students: { manage: ["administrador", "cajero"], view: ["administrador", "cajero"] },
  courses: {
    manage: ["administrador", "cajero"],
    changeState: ["administrador", "cajero", "academico"],
    view: ["administrador", "cajero", "academico"],
  },
  enrollments: {
    manage: ["administrador", "cajero"],
    view: ["administrador", "cajero"],
  },
  schedules: {
    manage: ["administrador", "cajero", "academico"],
    view: ["administrador", "cajero", "academico"],
  },
  payments: { manage: ["administrador", "cajero"], view: ["administrador", "cajero"] },
  paymentsHistory: ["administrador"],
  branches: { manage: ["administrador"], view: ["administrador", "cajero"] },
  careers: { manage: ["administrador"], view: ["administrador", "cajero"] },
  teachers: ["administrador"],
  users: ["administrador"],
  paymentSettings: ["administrador"],
  payroll: ["administrador"],
  attendance: ["administrador", "academico"],
};

// Picks the display/authorization role from an Appwrite Team membership.
export function getPrimaryStaffRole(roles = []) {
  return STAFF_ROLES.find((role) => roles.includes(role)) || null;
}

// True if a role may access a given dashboard pathname (exact route or a
// child of it, e.g. /dashboard/cursos/123).
export function canRoleAccessPath(role, pathname) {
  if (!role) return false;

  const match = Object.keys(PAGE_ROLES)
    .filter(
      (route) =>
        route === "/dashboard"
          ? pathname === "/dashboard"
          : pathname === route || pathname.startsWith(`${route}/`),
    )
    .sort((left, right) => right.length - left.length)[0];

  if (!match) return true;

  return PAGE_ROLES[match].includes(role);
}
