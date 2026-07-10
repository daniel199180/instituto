import { Client, Databases, ID, Query, Teams, Users } from "node-appwrite";

const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || "main";
const STAFF_TEAM_ID = "staff";
const DOCENTES_TEAM_ID = "docentes";
const TEACHERS_COLLECTION_ID = "teachers";
const PAYMENTS_COLLECTION_ID = "payments";
const TRANSACTIONS_COLLECTION_ID = "transactions";
const STUDENTS_COLLECTION_ID = "students";
const COURSES_COLLECTION_ID = "courses";
const BRANCHES_COLLECTION_ID = "branches";
const CAREERS_COLLECTION_ID = "careers";
const STAFF_PROFILES_COLLECTION_ID = "staffProfiles";
const STUDENT_ATTENDANCE_COLLECTION_ID = "studentAttendance";
const SYSTEM_CASHIER_ID = "sistema";
const VALID_ATTENDANCE_STATES = new Set(["presente", "ausente", "justificado"]);
const VALID_PAYMENT_METHODS = new Set(["efectivo", "qr"]);
const VALID_PAYMENT_STATUSES = new Set([
  "pendiente",
  "parcial",
  "pagado",
  "vencido",
]);
const VALID_TRANSACTION_STATUSES = new Set(["valida", "anulada"]);
const VALID_STAFF_ROLES = new Set(["administrador", "cajero", "academico"]);
const VALID_ROLES = new Set([...VALID_STAFF_ROLES, "docente"]);
const VALID_USER_STATUSES = new Set(["activo", "inactivo"]);

function getEnv(name, fallback = "") {
  return process.env[name] || fallback;
}

function toCleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toNumber(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) return Number(value);
  return Number.NaN;
}

function getActionError(error) {
  return error?.message || "No se pudo completar la operación.";
}

function parseBody(req) {
  if (req.bodyJson && typeof req.bodyJson === "object") {
    return req.bodyJson;
  }

  if (!req.body) return {};

  try {
    return JSON.parse(req.body);
  } catch {
    return {};
  }
}

function normalizePaymentStatus(status) {
  return VALID_PAYMENT_STATUSES.has(status) ? status : "pendiente";
}

function normalizeTransactionStatus(status) {
  return VALID_TRANSACTION_STATUSES.has(status) ? status : "valida";
}

function normalizeUserStatus(status) {
  return status === "inactivo" ? "inactivo" : "activo";
}

function teamForRole(role) {
  return role === "docente" ? DOCENTES_TEAM_ID : STAFF_TEAM_ID;
}

function getPrimaryRole(roles = []) {
  return roles.find((role) => VALID_ROLES.has(role)) || "cajero";
}

function roleLabel(role) {
  if (role === "administrador") return "Administrador";
  if (role === "academico") return "Encargado Académico";
  if (role === "docente") return "Docente";
  return "Cajero";
}

function getPaymentBalance(payment) {
  return Math.max(
    Number(payment.montoEsperado || 0) - Number(payment.montoPagado || 0),
    0,
  );
}

function calculatePaymentStatus({
  fechaVencimiento,
  montoEsperado,
  montoPagado,
}) {
  const balance = Math.max(
    Number(montoEsperado || 0) - Number(montoPagado || 0),
    0,
  );

  if (balance <= 0) return "pagado";
  if (Number(montoPagado || 0) > 0) return "parcial";
  if (fechaVencimiento && fechaVencimiento < new Date().toISOString()) {
    return "vencido";
  }

  return "pendiente";
}

function validateRegisterTransactionInput(payment, input = {}) {
  const amount = toNumber(input.monto);
  const metodoPago = toCleanString(input.metodoPago);
  const referencia = toCleanString(input.referencia);
  const notas = toCleanString(input.notas);
  const saldo = getPaymentBalance(payment);

  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "Ingresa un monto válido." };
  }

  if (amount > saldo) {
    return { error: "El monto no puede superar el saldo pendiente." };
  }

  if (!VALID_PAYMENT_METHODS.has(metodoPago)) {
    return { error: "Selecciona un método de pago válido." };
  }

  if (referencia.length > 128) {
    return { error: "La referencia no puede superar 128 caracteres." };
  }

  if (notas.length > 256) {
    return { error: "Las notas no pueden superar 256 caracteres." };
  }

  return {
    transaction: {
      estado: "valida",
      fecha: new Date().toISOString(),
      metodoPago,
      monto: Number(amount.toFixed(2)),
      notas,
      referencia,
      registradoPor: SYSTEM_CASHIER_ID,
    },
  };
}

function validateStaffUserInput(input, mode = "create") {
  const staffUser = {
    apellido: toCleanString(input?.apellido),
    documento: toCleanString(input?.documento),
    email: toCleanString(input?.email),
    nombre: toCleanString(input?.nombre),
    password: typeof input?.password === "string" ? input.password : "",
    role: toCleanString(input?.role),
    status: normalizeUserStatus(toCleanString(input?.status)),
    sucursalId: toCleanString(input?.sucursalId),
  };

  if (!staffUser.nombre) return { error: "Ingresa el nombre del usuario." };
  if (staffUser.nombre.length > 128) {
    return { error: "El nombre no puede superar 128 caracteres." };
  }
  if (!staffUser.email) return { error: "Ingresa el correo del usuario." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(staffUser.email)) {
    return { error: "Ingresa un correo válido." };
  }
  if (!VALID_ROLES.has(staffUser.role)) {
    return { error: "Selecciona un rol válido." };
  }
  if (staffUser.role === "cajero" && !staffUser.sucursalId) {
    return { error: "Selecciona la sucursal del cajero." };
  }
  if (staffUser.role === "docente") {
    if (!staffUser.apellido) {
      return { error: "Ingresa el apellido del docente." };
    }
    if (staffUser.apellido.length > 128) {
      return { error: "El apellido no puede superar 128 caracteres." };
    }
    if (mode === "create" && !staffUser.documento) {
      return { error: "Ingresa el documento del docente." };
    }
    if (staffUser.documento.length > 32) {
      return { error: "El documento no puede superar 32 caracteres." };
    }
  }
  if (mode === "create" && staffUser.password.length < 8) {
    return { error: "La contraseña debe tener al menos 8 caracteres." };
  }
  if (mode === "edit" && staffUser.password && staffUser.password.length < 8) {
    return { error: "La nueva contraseña debe tener al menos 8 caracteres." };
  }
  if (!VALID_USER_STATUSES.has(staffUser.status)) {
    return { error: "Selecciona un estado válido." };
  }

  staffUser.displayName =
    staffUser.role === "docente"
      ? `${staffUser.nombre} ${staffUser.apellido}`.trim()
      : staffUser.nombre;

  return { staffUser };
}

function serializeBranch(branch) {
  return {
    $id: branch.$id,
    estado: branch.estado || "activo",
    nombre: branch.nombre || "",
    tipo: branch.tipo || "presencial",
  };
}

function serializeCareer(career) {
  return {
    $id: career.$id,
    estado: career.estado || "activo",
    nombre: career.nombre || "",
    sucursalId: career.sucursalId || "",
  };
}

function serializeCourse(course, context = {}) {
  const branch = context.branchMap?.get(course.sucursalId);
  const career = context.careerMap?.get(course.carreraId);

  return {
    $id: course.$id,
    carreraId: course.carreraId || "",
    carreraNombre: career?.nombre || "Curso independiente",
    estado: course.estado || "cerrado",
    nombre: course.nombre || "",
    sucursalId: course.sucursalId || "",
    sucursalNombre: branch?.nombre || "Sin sucursal",
  };
}

function serializeStudent(student) {
  return {
    $id: student.$id,
    documento: student.documento || "",
    email: student.email || "",
    estado: student.estado || "activo",
    nombre: `${student.nombre || ""} ${student.apellido || ""}`.trim(),
    telefono: student.telefono || "",
  };
}

function serializePayment(payment, context = {}) {
  const student = context.studentMap?.get(payment.studentId);
  const course = context.courseMap?.get(payment.courseId);
  const branch = context.branchMap?.get(payment.sucursalId);
  const balance = getPaymentBalance(payment);

  return {
    $createdAt: payment.$createdAt,
    $id: payment.$id,
    $updatedAt: payment.$updatedAt,
    carreraId: course?.carreraId || "",
    carreraNombre: course?.carreraNombre || "",
    courseId: payment.courseId || "",
    courseName: course?.nombre || "Curso no encontrado",
    enrollmentId: payment.enrollmentId || "",
    estado: normalizePaymentStatus(payment.estado),
    fechaVencimiento: payment.fechaVencimiento || "",
    montoEsperado: Number(payment.montoEsperado || 0),
    montoPagado: Number(payment.montoPagado || 0),
    notas: payment.notas || "",
    periodo: payment.periodo || "",
    saldo: balance,
    studentDocument: student?.documento || "",
    studentEmail: student?.email || "",
    studentId: payment.studentId || "",
    studentName: student?.nombre || "Estudiante no encontrado",
    studentPhone: student?.telefono || "",
    sucursalId: payment.sucursalId || "",
    sucursalNombre: branch?.nombre || course?.sucursalNombre || "Sin sucursal",
  };
}

function serializeStaffUser({ branchMap, membership, profile, user }) {
  const role = getPrimaryRole(membership.roles);
  const sucursalId = profile?.sucursalId || "";

  return {
    $createdAt: user.registration || membership.$createdAt,
    $id: user.$id,
    email: user.email || membership.userEmail || "",
    membershipId: membership.$id,
    nombre: user.name || membership.userName || "",
    role,
    roleLabel: roleLabel(role),
    status: user.status ? "activo" : "inactivo",
    sucursalId,
    sucursalNombre: branchMap.get(sucursalId)?.nombre || "",
  };
}

async function listAllDocuments(databases, collectionId, queries = []) {
  const documents = [];
  let cursor = null;

  do {
    const pageQueries = [...queries, Query.limit(100)];

    if (cursor) pageQueries.push(Query.cursorAfter(cursor));

    const response = await databases.listDocuments({
      collectionId,
      databaseId: DATABASE_ID,
      queries: pageQueries,
      total: false,
    });

    documents.push(...response.documents);
    cursor = response.documents.at(-1)?.$id || null;

    if (response.documents.length < 100) cursor = null;
  } while (cursor);

  return documents;
}

async function listAllMemberships(teams, teamId) {
  const memberships = [];
  let cursor = null;

  do {
    const queries = [Query.limit(100)];

    if (cursor) queries.push(Query.cursorAfter(cursor));

    const response = await teams.listMemberships({
      queries,
      teamId,
      total: false,
    });

    memberships.push(...response.memberships);
    cursor = response.memberships.at(-1)?.$id || null;

    if (response.memberships.length < 100) cursor = null;
  } while (cursor);

  return memberships;
}

function sortByName(items) {
  return items.sort((left, right) =>
    left.nombre.localeCompare(right.nombre, "es"),
  );
}

async function getFinancialContext(databases) {
  const [branches, careers, courses, students] = await Promise.all([
    listAllDocuments(databases, BRANCHES_COLLECTION_ID, [
      Query.select(["$id", "nombre", "tipo", "estado"]),
    ]),
    listAllDocuments(databases, CAREERS_COLLECTION_ID, [
      Query.select(["$id", "nombre", "sucursalId", "estado"]),
    ]),
    listAllDocuments(databases, COURSES_COLLECTION_ID, [
      Query.select(["$id", "nombre", "sucursalId", "carreraId", "estado"]),
    ]),
    listAllDocuments(databases, STUDENTS_COLLECTION_ID, [
      Query.select([
        "$id",
        "nombre",
        "apellido",
        "documento",
        "email",
        "telefono",
        "estado",
      ]),
    ]),
  ]);
  const serializedBranches = sortByName(branches.map(serializeBranch));
  const serializedCareers = sortByName(careers.map(serializeCareer));
  const branchMap = new Map(
    serializedBranches.map((branch) => [branch.$id, branch]),
  );
  const careerMap = new Map(
    serializedCareers.map((career) => [career.$id, career]),
  );
  const serializedCourses = sortByName(
    courses.map((course) => serializeCourse(course, { branchMap, careerMap })),
  );
  const serializedStudents = sortByName(students.map(serializeStudent));

  return {
    branchMap,
    branches: serializedBranches,
    careerMap,
    careers: serializedCareers,
    courseMap: new Map(serializedCourses.map((course) => [course.$id, course])),
    courses: serializedCourses,
    studentMap: new Map(
      serializedStudents.map((student) => [student.$id, student]),
    ),
    students: serializedStudents,
  };
}

async function getBranchMap(databases) {
  const branches = await listAllDocuments(databases, BRANCHES_COLLECTION_ID, [
    Query.select(["$id", "nombre", "tipo", "estado"]),
  ]);
  const serialized = branches
    .map(serializeBranch)
    .sort((left, right) => left.nombre.localeCompare(right.nombre, "es"));

  return {
    branchMap: new Map(serialized.map((branch) => [branch.$id, branch])),
    branches: serialized,
  };
}

async function getProfileMap(databases) {
  const profiles = await listAllDocuments(
    databases,
    STAFF_PROFILES_COLLECTION_ID,
    [Query.select(["$id", "userId", "sucursalId"])],
  );

  return new Map(profiles.map((profile) => [profile.userId, profile]));
}

async function upsertStaffProfile(databases, userId, sucursalId) {
  const existing = await databases.listDocuments({
    collectionId: STAFF_PROFILES_COLLECTION_ID,
    databaseId: DATABASE_ID,
    queries: [Query.equal("userId", userId), Query.limit(1)],
    total: false,
  });
  const data = sucursalId ? { sucursalId, userId } : { sucursalId: "", userId };

  if (existing.documents[0]) {
    return databases.updateDocument({
      collectionId: STAFF_PROFILES_COLLECTION_ID,
      databaseId: DATABASE_ID,
      data,
      documentId: existing.documents[0].$id,
    });
  }

  return databases.createDocument({
    collectionId: STAFF_PROFILES_COLLECTION_ID,
    databaseId: DATABASE_ID,
    data,
    documentId: ID.unique(),
    permissions: [],
  });
}

async function upsertTeacherRecord(databases, userId, staffUser) {
  const existing = await databases.listDocuments({
    collectionId: TEACHERS_COLLECTION_ID,
    databaseId: DATABASE_ID,
    queries: [Query.equal("userId", userId), Query.limit(1)],
    total: false,
  });
  const data = {
    apellido: staffUser.apellido,
    email: staffUser.email,
    estado: staffUser.status === "inactivo" ? "inactivo" : "activo",
    nombre: staffUser.nombre,
    userId,
  };

  if (staffUser.documento) {
    data.documento = staffUser.documento;
  }

  if (existing.documents[0]) {
    return databases.updateDocument({
      collectionId: TEACHERS_COLLECTION_ID,
      databaseId: DATABASE_ID,
      data,
      documentId: existing.documents[0].$id,
    });
  }

  return databases.createDocument({
    collectionId: TEACHERS_COLLECTION_ID,
    databaseId: DATABASE_ID,
    data,
    documentId: ID.unique(),
    permissions: [],
  });
}

async function setTeacherRecordStatus(databases, userId, estado) {
  const existing = await databases.listDocuments({
    collectionId: TEACHERS_COLLECTION_ID,
    databaseId: DATABASE_ID,
    queries: [Query.equal("userId", userId), Query.limit(1)],
    total: false,
  });

  if (!existing.documents[0]) return;

  await databases.updateDocument({
    collectionId: TEACHERS_COLLECTION_ID,
    databaseId: DATABASE_ID,
    data: { estado },
    documentId: existing.documents[0].$id,
  });
}

async function findUserMembership(teams, userId) {
  for (const teamId of [STAFF_TEAM_ID, DOCENTES_TEAM_ID]) {
    const memberships = await teams.listMemberships({
      queries: [Query.equal("userId", userId), Query.limit(1)],
      teamId,
      total: false,
    });

    if (memberships.memberships[0]) {
      return { membership: memberships.memberships[0], teamId };
    }
  }

  return { membership: null, teamId: null };
}

async function listPaymentTransactions(databases, paymentId) {
  return listAllDocuments(databases, TRANSACTIONS_COLLECTION_ID, [
    Query.equal("paymentId", paymentId),
    Query.select([
      "$id",
      "$createdAt",
      "paymentId",
      "studentId",
      "sucursalId",
      "monto",
      "metodoPago",
      "referencia",
      "fecha",
      "registradoPor",
      "estado",
      "anuladoPor",
      "motivoAnulacion",
      "fechaAnulacion",
      "notas",
    ]),
  ]);
}

async function recalculatePayment(databases, paymentId) {
  const [payment, transactions] = await Promise.all([
    databases.getDocument({
      collectionId: PAYMENTS_COLLECTION_ID,
      databaseId: DATABASE_ID,
      documentId: paymentId,
    }),
    listPaymentTransactions(databases, paymentId),
  ]);
  const montoPagado = transactions
    .filter((transaction) => transaction.estado !== "anulada")
    .reduce((total, transaction) => total + Number(transaction.monto || 0), 0);
  const estado = calculatePaymentStatus({
    fechaVencimiento: payment.fechaVencimiento,
    montoEsperado: payment.montoEsperado,
    montoPagado,
  });

  return databases.updateDocument({
    collectionId: PAYMENTS_COLLECTION_ID,
    databaseId: DATABASE_ID,
    data: {
      estado,
      montoPagado: Number(montoPagado.toFixed(2)),
    },
    documentId: paymentId,
  });
}

async function registerTransaction(databases, payload) {
  const cleanPaymentId = toCleanString(payload?.paymentId);

  if (!cleanPaymentId) {
    return { error: "No se encontró la mensualidad.", ok: false };
  }

  const payment = await databases.getDocument({
    collectionId: PAYMENTS_COLLECTION_ID,
    databaseId: DATABASE_ID,
    documentId: cleanPaymentId,
  });
  const validation = validateRegisterTransactionInput(payment, payload?.input);

  if (validation.error) return { error: validation.error, ok: false };

  await databases.createDocument({
    collectionId: TRANSACTIONS_COLLECTION_ID,
    databaseId: DATABASE_ID,
    data: {
      ...validation.transaction,
      paymentId: payment.$id,
      studentId: payment.studentId,
      sucursalId: payment.sucursalId,
    },
    documentId: ID.unique(),
    permissions: [],
  });

  const updatedPayment = await recalculatePayment(databases, payment.$id);
  const context = await getFinancialContext(databases);

  return {
    ok: true,
    payment: serializePayment(updatedPayment, context),
  };
}

async function saveStudentAttendance(databases, payload) {
  const courseId = toCleanString(payload?.courseId);
  const date = toCleanString(payload?.date);
  const teacherId = toCleanString(payload?.teacherId);
  const registradoPor = toCleanString(payload?.registradoPor);
  const records = Array.isArray(payload?.records) ? payload.records : [];

  if (!courseId || !date) {
    return { error: "Faltan datos de la asistencia.", ok: false };
  }

  const validRecords = records.filter((record) =>
    VALID_ATTENDANCE_STATES.has(record?.estado),
  );

  await Promise.all(
    validRecords.map(async (record) => {
      const studentId = toCleanString(record.studentId);

      if (!studentId) return;

      const existing = await databases.listDocuments({
        collectionId: STUDENT_ATTENDANCE_COLLECTION_ID,
        databaseId: DATABASE_ID,
        queries: [
          Query.equal("courseId", courseId),
          Query.equal("studentId", studentId),
          Query.equal("fecha", date),
          Query.limit(1),
        ],
        total: false,
      });
      const data = {
        courseId,
        estado: record.estado,
        fecha: date,
        registradoPor,
        studentId,
        teacherId,
      };

      if (existing.documents[0]) {
        await databases.updateDocument({
          collectionId: STUDENT_ATTENDANCE_COLLECTION_ID,
          databaseId: DATABASE_ID,
          documentId: existing.documents[0].$id,
          data,
        });
      } else {
        await databases.createDocument({
          collectionId: STUDENT_ATTENDANCE_COLLECTION_ID,
          databaseId: DATABASE_ID,
          data,
          documentId: ID.unique(),
          permissions: [],
        });
      }
    }),
  );

  return { ok: true, saved: validRecords.length };
}

async function listStaffUsers({ databases, teams, users }) {
  const [{ branchMap, branches }, profileMap, staffMemberships, docenteMemberships] =
    await Promise.all([
      getBranchMap(databases),
      getProfileMap(databases),
      listAllMemberships(teams, STAFF_TEAM_ID),
      listAllMemberships(teams, DOCENTES_TEAM_ID),
    ]);
  const memberships = [...staffMemberships, ...docenteMemberships];
  const staffUsers = await Promise.all(
    memberships.map(async (membership) => {
      try {
        const user = await users.get({ userId: membership.userId });

        return serializeStaffUser({
          branchMap,
          membership,
          profile: profileMap.get(membership.userId),
          user,
        });
      } catch {
        return null;
      }
    }),
  );

  return {
    branches,
    ok: true,
    users: staffUsers
      .filter(Boolean)
      .sort((left, right) => left.nombre.localeCompare(right.nombre, "es")),
  };
}

async function createStaffUser({ databases, teams, users }, payload) {
  const validation = validateStaffUserInput(payload?.input, "create");

  if (validation.error) return { error: validation.error, ok: false };

  const { staffUser } = validation;
  const { branchMap } = await getBranchMap(databases);
  const user = await users.create({
    email: staffUser.email,
    name: staffUser.displayName,
    password: staffUser.password,
    userId: ID.unique(),
  });
  const membership = await teams.createMembership({
    roles: [staffUser.role],
    teamId: teamForRole(staffUser.role),
    userId: user.$id,
  });
  let profile = null;

  if (staffUser.role === "docente") {
    await upsertTeacherRecord(databases, user.$id, staffUser);
  } else {
    profile = await upsertStaffProfile(
      databases,
      user.$id,
      staffUser.role === "cajero" ? staffUser.sucursalId : "",
    );
  }

  if (staffUser.status === "inactivo") {
    await users.updateStatus({ status: false, userId: user.$id });
    user.status = false;
  }

  return {
    ok: true,
    user: serializeStaffUser({ branchMap, membership, profile, user }),
  };
}

async function updateStaffUser({ databases, teams, users }, payload) {
  const cleanUserId = toCleanString(payload?.userId);
  const validation = validateStaffUserInput(payload?.input, "edit");

  if (!cleanUserId) {
    return { error: "No se encontró el usuario a editar.", ok: false };
  }

  if (validation.error) return { error: validation.error, ok: false };

  const { staffUser } = validation;
  const { branchMap } = await getBranchMap(databases);
  const { membership, teamId } = await findUserMembership(teams, cleanUserId);

  if (!membership) {
    return { error: "El usuario no pertenece a ningún equipo.", ok: false };
  }

  const isDocenteTeam = teamId === DOCENTES_TEAM_ID;

  if (isDocenteTeam !== (staffUser.role === "docente")) {
    return {
      error:
        "No se puede cambiar entre docente y personal. Borra el usuario y créalo con el nuevo rol.",
      ok: false,
    };
  }

  let user = await users.updateName({
    name: staffUser.displayName,
    userId: cleanUserId,
  });

  if (user.email !== staffUser.email) {
    user = await users.updateEmail({
      email: staffUser.email,
      userId: cleanUserId,
    });
  }

  if (staffUser.password) {
    user = await users.updatePassword({
      password: staffUser.password,
      userId: cleanUserId,
    });
  }

  user = await users.updateStatus({
    status: staffUser.status === "activo",
    userId: cleanUserId,
  });

  const updatedMembership = await teams.updateMembership({
    membershipId: membership.$id,
    roles: [staffUser.role],
    teamId,
  });
  let profile = null;

  if (isDocenteTeam) {
    await upsertTeacherRecord(databases, cleanUserId, staffUser);
  } else {
    profile = await upsertStaffProfile(
      databases,
      cleanUserId,
      staffUser.role === "cajero" ? staffUser.sucursalId : "",
    );
  }

  return {
    ok: true,
    user: serializeStaffUser({
      branchMap,
      membership: updatedMembership,
      profile,
      user,
    }),
  };
}

async function deleteStaffUser({ databases, teams, users }, payload) {
  const cleanUserId = toCleanString(payload?.userId);

  if (!cleanUserId) {
    return { error: "No se encontró el usuario a borrar.", ok: false };
  }

  const { branchMap } = await getBranchMap(databases);
  const { membership, teamId } = await findUserMembership(teams, cleanUserId);

  if (!membership) {
    return { error: "El usuario no pertenece a ningún equipo.", ok: false };
  }

  const user = await users.updateStatus({
    status: false,
    userId: cleanUserId,
  });

  if (teamId === DOCENTES_TEAM_ID) {
    await setTeacherRecordStatus(databases, cleanUserId, "inactivo");
  }

  const profileMap = await getProfileMap(databases);

  return {
    deactivated: true,
    ok: true,
    user: serializeStaffUser({
      branchMap,
      membership,
      profile: profileMap.get(cleanUserId),
      user,
    }),
  };
}

function createServices() {
  const endpoint = getEnv(
    "APPWRITE_ENDPOINT",
    getEnv("APPWRITE_FUNCTION_API_ENDPOINT"),
  );
  const projectId = getEnv(
    "APPWRITE_PROJECT_ID",
    getEnv("APPWRITE_FUNCTION_PROJECT_ID"),
  );
  const apiKey = getEnv(
    "APPWRITE_SECURE_OPERATIONS_API_KEY",
    getEnv("APPWRITE_FUNCTION_API_KEY"),
  );

  if (!endpoint || !projectId || !apiKey) {
    throw new Error("Faltan variables de Appwrite para operaciones seguras.");
  }

  const client = new Client()
    .setEndpoint(endpoint)
    .setProject(projectId)
    .setKey(apiKey);

  return {
    databases: new Databases(client),
    teams: new Teams(client),
    users: new Users(client),
  };
}

export default async ({ req, res, error }) => {
  const body = parseBody(req);
  const operation = toCleanString(body.operation);
  const payload = body.payload || {};

  try {
    const services = createServices();
    let result;

    if (operation === "registerTransaction") {
      result = await registerTransaction(services.databases, payload);
    } else if (operation === "saveStudentAttendance") {
      result = await saveStudentAttendance(services.databases, payload);
    } else if (operation === "listStaffUsers") {
      result = await listStaffUsers(services);
    } else if (operation === "createStaffUser") {
      result = await createStaffUser(services, payload);
    } else if (operation === "updateStaffUser") {
      result = await updateStaffUser(services, payload);
    } else if (operation === "deleteStaffUser") {
      result = await deleteStaffUser(services, payload);
    } else {
      result = { error: "Operación segura no soportada.", ok: false };
    }

    return res.json(result, result.ok ? 200 : 400);
  } catch (caughtError) {
    const message = getActionError(caughtError);
    error(message);

    return res.json({ error: message, ok: false }, 500);
  }
};
