"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Check,
  CreditCard,
  Edit3,
  Loader2,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  Trash2,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";
import { listPayments, registerTransaction } from "@/actions/payments";
import {
  createStudent,
  deleteStudent,
  listStudents,
  updateStudent,
} from "@/actions/students";

const emptyForm = {
  apellido: "",
  courseId: "",
  diaVencimiento: "",
  direccion: "",
  documento: "",
  email: "",
  estado: "activo",
  fechaInscripcion: "",
  nombre: "",
  sucursalId: "",
  telefono: "",
};

const statusLabels = {
  activo: "Activo",
  inactivo: "Inactivo",
  retirado: "Retirado",
};

const paymentStatusLabels = {
  pagado: "Pagado",
  parcial: "Parcial",
  pendiente: "Pendiente",
  vencido: "Vencido",
};

const methodLabels = {
  efectivo: "Efectivo",
  qr: "QR",
};

const emptyPaymentForm = {
  metodoPago: "efectivo",
  monto: "",
  notas: "",
  referencia: "",
};

function formatMoney(value) {
  return `Bs ${Number(value || 0).toLocaleString("es-BO", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;
}

function normalizePayment(payment) {
  return {
    $id: payment.$id,
    courseName: payment.courseName || "Curso no encontrado",
    estado: payment.estado || "pendiente",
    fechaVencimiento: payment.fechaVencimiento || "",
    metodoPago: payment.metodoPago || "",
    montoEsperado: Number(payment.montoEsperado || 0),
    montoPagado: Number(payment.montoPagado || 0),
    periodo: payment.periodo || "",
    saldo: Number(payment.saldo || 0),
    sucursalNombre: payment.sucursalNombre || "Sin sucursal",
  };
}

function getTodayDateInputValue() {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/La_Paz",
    year: "numeric",
  }).format(new Date());
}

function formatDateInputValue(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/La_Paz",
    year: "numeric",
  }).format(date);
}

function formatDisplayDate(value) {
  if (!value) return "Sin fecha";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Sin fecha";
  }

  return new Intl.DateTimeFormat("es-BO", {
    day: "2-digit",
    month: "short",
    timeZone: "America/La_Paz",
    year: "numeric",
  }).format(date);
}

function getDefaultDueDay(value) {
  const date = new Date(`${value || getTodayDateInputValue()}T04:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    return "10";
  }

  return String(Math.min(date.getUTCDate(), 28));
}

function getDueDayFromCourse(course) {
  return course?.fechaInicio
    ? getDefaultDueDay(formatDateInputValue(course.fechaInicio))
    : "";
}

function normalizeBranch(branch) {
  return {
    $id: branch.$id,
    estado: branch.estado || "activo",
    nombre: branch.nombre || "",
    tipo: branch.tipo || "presencial",
  };
}

function normalizeCourse(course) {
  return {
    $id: course.$id,
    cupoMaximo: Number(course.cupoMaximo || 0),
    cupoOcupado: Number(course.cupoOcupado || 0),
    duracionMeses: Number(course.duracionMeses || 0),
    estado: course.estado || "cerrado",
    fechaInicio: course.fechaInicio || "",
    nombre: course.nombre || "",
    precioMensual: Number(course.precioMensual || 0),
    sucursalId: course.sucursalId || "",
    sucursalNombre: course.sucursalNombre || "",
  };
}

function normalizeStudent(student) {
  return {
    $createdAt: student.$createdAt,
    $id: student.$id,
    $updatedAt: student.$updatedAt,
    apellido: student.apellido || "",
    cursoId: student.cursoId || "",
    cursoNombre: student.cursoNombre || "",
    diaVencimiento: student.diaVencimiento || "",
    direccion: student.direccion || "",
    documento: student.documento || "",
    email: student.email || "",
    estado: student.estado || "activo",
    fechaInscripcion: student.fechaInscripcion || "",
    nombre: student.nombre || "",
    sucursalId: student.sucursalId || "",
    sucursalNombre: student.sucursalNombre || "",
    telefono: student.telefono || "",
    cuotasVencidas: Number(student.cuotasVencidas || 0),
    montoDeuda: Number(student.montoDeuda || 0),
    tieneDeuda: Boolean(student.tieneDeuda),
  };
}

function sortStudents(students) {
  return [...students].sort((left, right) =>
    `${left.apellido} ${left.nombre}`.localeCompare(
      `${right.apellido} ${right.nombre}`,
      "es",
    ),
  );
}

export function StudentsClient() {
  const [branches, setBranches] = useState([]);
  const [courses, setCourses] = useState([]);
  const [students, setStudents] = useState([]);
  const [drawerMode, setDrawerMode] = useState("closed");
  const [editingStudent, setEditingStudent] = useState(null);
  const [paymentDrawerStudent, setPaymentDrawerStudent] = useState(null);
  const [studentPayments, setStudentPayments] = useState([]);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [paymentForm, setPaymentForm] = useState(emptyPaymentForm);
  const [qrDialog, setQrDialog] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [paymentsError, setPaymentsError] = useState("");
  const [isQrBusy, setIsQrBusy] = useState(false);
  const [isPaymentsLoading, setIsPaymentsLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const visibleStudents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return students.filter((student) => {
      const matchesStatus =
        statusFilter === "todos" || student.estado === statusFilter;
      const matchesQuery =
        !normalizedQuery ||
        `${student.nombre} ${student.apellido} ${student.documento} ${student.email} ${student.telefono} ${student.cursoNombre} ${student.sucursalNombre} ${
          student.tieneDeuda ? "con deuda" : "sin deuda"
        }`
          .toLowerCase()
          .includes(normalizedQuery);

      return matchesStatus && matchesQuery;
    });
  }, [query, statusFilter, students]);

  const filteredCourses = useMemo(() => {
    return courses.filter((course) => {
      const matchesBranch =
        !form.sucursalId || course.sucursalId === form.sucursalId;
      const hasCapacity = course.cupoOcupado < course.cupoMaximo;
      const isCurrentCourse = editingStudent?.cursoId === course.$id;
      const isAssignable = course.estado === "en_inscripciones";

      return (
        matchesBranch &&
        (isAssignable || isCurrentCourse) &&
        (hasCapacity || isCurrentCourse)
      );
    });
  }, [courses, editingStudent?.cursoId, form.sucursalId]);

  const selectedCourse = useMemo(() => {
    return courses.find((course) => course.$id === form.courseId) || null;
  }, [courses, form.courseId]);

  const stats = useMemo(() => {
    return students.reduce(
      (summary, student) => {
        summary.total += 1;
        if (student.cursoId) summary.asignados += 1;
        if (student.tieneDeuda) summary.deudores += 1;
        summary[student.estado] += 1;
        return summary;
      },
      {
        activo: 0,
        asignados: 0,
        deudores: 0,
        inactivo: 0,
        retirado: 0,
        total: 0,
      },
    );
  }, [students]);

  useEffect(() => {
    refreshStudents();
  }, []);

  function refreshStudents() {
    setIsLoading(true);
    setError("");
    setNotice("");

    startTransition(async () => {
      const result = await listStudents();

      if (!result.ok) {
        setError(result.error);
        setBranches([]);
        setCourses([]);
        setStudents([]);
      } else {
        setBranches(result.branches.map(normalizeBranch));
        setCourses(result.courses.map(normalizeCourse));
        setStudents(sortStudents(result.students.map(normalizeStudent)));
      }

      setIsLoading(false);
    });
  }

  function openCreateDrawer() {
    const today = getTodayDateInputValue();

    setError("");
    setNotice("");
    setEditingStudent(null);
    setPaymentDrawerStudent(null);
    setForm({
      ...emptyForm,
      fechaInscripcion: today,
    });
    setDrawerMode("create");
  }

  function openEditDrawer(student) {
    setError("");
    setNotice("");
    setEditingStudent(student);
    setPaymentDrawerStudent(null);
    setForm({
      apellido: student.apellido,
      courseId: student.cursoId,
      diaVencimiento: student.diaVencimiento
        ? String(student.diaVencimiento)
        : "",
      direccion: student.direccion,
      documento: student.documento,
      email: student.email,
      estado: student.estado,
      fechaInscripcion: formatDateInputValue(student.fechaInscripcion),
      nombre: student.nombre,
      sucursalId: student.sucursalId,
      telefono: student.telefono,
    });
    setDrawerMode("edit");
  }

  function closeDrawer(force = false) {
    if (isPending && !force) return;

    setDrawerMode("closed");
    setEditingStudent(null);
    setForm(emptyForm);
  }

  function openPaymentsDrawer(student) {
    setError("");
    setNotice("");
    setPaymentsError("");
    setDrawerMode("closed");
    setEditingStudent(null);
    setPaymentDrawerStudent(student);
    setStudentPayments([]);
    setSelectedPayment(null);
    setPaymentForm(emptyPaymentForm);
    setIsPaymentsLoading(true);

    startTransition(async () => {
      const result = await listPayments({ studentId: student.$id });

      if (!result.ok) {
        setPaymentsError(result.error);
      } else {
        setStudentPayments(
          result.payments
            .map(normalizePayment)
            .sort((left, right) =>
              `${left.estado} ${left.fechaVencimiento}`.localeCompare(
                `${right.estado} ${right.fechaVencimiento}`,
                "es",
              ),
            ),
        );
      }

      setIsPaymentsLoading(false);
    });
  }

  function closePaymentsDrawer() {
    if (isPending) return;

    setPaymentDrawerStudent(null);
    setStudentPayments([]);
    setSelectedPayment(null);
    setPaymentForm(emptyPaymentForm);
    setQrDialog(null);
    setPaymentsError("");
  }

  function selectPaymentToCharge(payment) {
    setSelectedPayment(payment);
    setPaymentForm({
      ...emptyPaymentForm,
      monto: payment.saldo ? String(payment.saldo) : "",
    });
  }

  function handlePaymentFormChange(event) {
    const { name, value } = event.target;

    setPaymentForm((currentForm) => ({ ...currentForm, [name]: value }));
  }

  async function handlePaymentSubmit(event) {
    event.preventDefault();

    if (!selectedPayment) return;

    setPaymentsError("");
    setNotice("");

    if (paymentForm.metodoPago === "qr") {
      await openBanecoQr(selectedPayment);
      return;
    }

    startTransition(async () => {
      const result = await registerTransaction(
        selectedPayment.$id,
        paymentForm,
      );

      if (!result.ok) {
        setPaymentsError(result.error);
        return;
      }

      const updatedPayment = normalizePayment(result.payment);

      setStudentPayments((currentPayments) =>
        currentPayments.map((payment) =>
          payment.$id === updatedPayment.$id ? updatedPayment : payment,
        ),
      );
      setSelectedPayment(updatedPayment.saldo > 0 ? updatedPayment : null);
      setPaymentForm(emptyPaymentForm);
      setNotice("Cobro registrado. El ingreso ya está en reportes.");
      refreshStudents();
    });
  }

  async function openBanecoQr(payment) {
    setIsQrBusy(true);
    setPaymentsError("");
    setNotice("");

    try {
      const response = await fetch("/api/payments/baneco/qr", {
        body: JSON.stringify({
          paymentId: payment.$id,
          type: "payment",
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "No se pudo generar el QR.");
      }

      setQrDialog({
        amount: result.amount,
        paymentId: payment.$id,
        qrId: result.qrId,
        qrImage: result.qrImage,
        title: `${paymentDrawerStudent?.nombre || "Estudiante"} - ${payment.periodo}`,
      });
    } catch (qrError) {
      setPaymentsError(qrError.message || "No se pudo generar el QR.");
    } finally {
      setIsQrBusy(false);
    }
  }

  function checkQrStatus() {
    if (!qrDialog?.qrId || !selectedPayment) return;

    setIsQrBusy(true);
    setPaymentsError("");

    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/payments/baneco/status?qrId=${encodeURIComponent(qrDialog.qrId)}`,
        );
        const statusResult = await response.json();

        if (!response.ok) {
          throw new Error(statusResult.error || "No se pudo verificar el QR.");
        }

        if (statusResult.status === "pending") {
          setNotice("El QR sigue pendiente de pago.");
          return;
        }

        if (statusResult.status === "cancelled") {
          setPaymentsError("Banco Económico reportó el QR como cancelado.");
          return;
        }

        const result = await registerTransaction(selectedPayment.$id, {
          ...paymentForm,
          metodoPago: "qr",
          monto: qrDialog.amount,
          referencia: qrDialog.qrId,
        });

        if (!result.ok) {
          throw new Error(result.error);
        }

        const updatedPayment = normalizePayment(result.payment);

        setStudentPayments((currentPayments) =>
          currentPayments.map((payment) =>
            payment.$id === updatedPayment.$id ? updatedPayment : payment,
          ),
        );
        setSelectedPayment(updatedPayment.saldo > 0 ? updatedPayment : null);
        setPaymentForm(emptyPaymentForm);
        setQrDialog(null);
        setNotice("Pago QR confirmado. El ingreso ya está en reportes.");
        refreshStudents();
      } catch (qrError) {
        setPaymentsError(qrError.message || "No se pudo verificar el QR.");
      } finally {
        setIsQrBusy(false);
      }
    });
  }

  function handleFieldChange(event) {
    const { name, value } = event.target;
    setForm((currentForm) => {
      const nextForm = { ...currentForm, [name]: value };

      if (name === "sucursalId") {
        const selectedCourse = courses.find(
          (course) => course.$id === currentForm.courseId,
        );

        if (selectedCourse && selectedCourse.sucursalId !== value) {
          nextForm.courseId = "";
        }
      }

      if (name === "courseId") {
        const selectedCourse = courses.find((course) => course.$id === value);

        if (selectedCourse) {
          nextForm.sucursalId = selectedCourse.sucursalId;
          nextForm.diaVencimiento = getDueDayFromCourse(selectedCourse);
        } else {
          nextForm.diaVencimiento = "";
        }
      }

      return nextForm;
    });
  }

  function upsertStudentInState(student) {
    setStudents((currentStudents) => {
      const normalized = normalizeStudent(student);
      const exists = currentStudents.some(
        (item) => item.$id === normalized.$id,
      );
      const nextStudents = exists
        ? currentStudents.map((item) =>
            item.$id === normalized.$id ? normalized : item,
          )
        : [...currentStudents, normalized];

      return sortStudents(nextStudents);
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setNotice("");

    startTransition(async () => {
      const result =
        drawerMode === "edit" && editingStudent
          ? await updateStudent(editingStudent.$id, form)
          : await createStudent(form);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      upsertStudentInState(result.student);
      if (result.enrolled) {
        setNotice("Estudiante asignado al curso correctamente.");
      }
      closeDrawer(true);
    });
  }

  async function handleDelete(student) {
    const confirmed = window.confirm(
      `¿Borrar al estudiante "${student.nombre} ${student.apellido}"? Si tiene historial, se marcará como retirado.`,
    );

    if (!confirmed) return;

    setError("");
    setNotice("");

    startTransition(async () => {
      const result = await deleteStudent(student.$id);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      if (result.retired) {
        upsertStudentInState(result.student);
        setNotice(
          "El estudiante tiene historial académico o pagos; se marcó como retirado.",
        );
        return;
      }

      setStudents((currentStudents) =>
        currentStudents.filter((item) => item.$id !== student.$id),
      );
    });
  }

  return (
    <div className="branches-page">
      <section className="branch-toolbar" aria-label="Resumen de estudiantes">
        <div className="branch-stat">
          <span>Total</span>
          <strong>{stats.total}</strong>
        </div>
        <div className="branch-stat">
          <span>Activos</span>
          <strong>{stats.activo}</strong>
        </div>
        <div className="branch-stat">
          <span>Con curso</span>
          <strong>{stats.asignados}</strong>
        </div>
        <div className="branch-stat">
          <span>Con deuda</span>
          <strong>{stats.deudores}</strong>
        </div>
        <div className="branch-stat">
          <span>Retirados</span>
          <strong>{stats.retirado}</strong>
        </div>
      </section>

      <section
        className="branch-controls"
        aria-label="Controles de estudiantes"
      >
        <label className="search-control">
          <Search size={17} strokeWidth={1.8} />
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar estudiante"
            type="search"
            value={query}
          />
        </label>

        <div className="segmented-control" aria-label="Filtrar por estado">
          {[
            ["todos", "Todos"],
            ["activo", "Activos"],
            ["inactivo", "Inactivos"],
            ["retirado", "Retirados"],
          ].map(([value, label]) => (
            <button
              className={statusFilter === value ? "is-selected" : ""}
              key={value}
              onClick={() => setStatusFilter(value)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>

        <button
          className="secondary-action"
          disabled={isLoading || isPending}
          onClick={refreshStudents}
          type="button"
        >
          <RefreshCw
            className={isLoading || isPending ? "spin-icon" : ""}
            size={17}
          />
          <span>Actualizar</span>
        </button>

        <button
          className="primary-action branch-create"
          onClick={openCreateDrawer}
          type="button"
        >
          <Plus size={18} />
          <span>Crear</span>
        </button>
      </section>

      {error ? (
        <p className="form-error branch-error" role="alert">
          {error}
        </p>
      ) : null}

      {notice ? <p className="form-note branch-error">{notice}</p> : null}

      <section className="branch-table-shell" aria-label="Tabla de estudiantes">
        {isLoading ? (
          <div className="table-state">
            <Loader2 className="spin-icon" size={22} />
            <span>Cargando</span>
          </div>
        ) : visibleStudents.length ? (
          <>
            <div className="desktop-table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Estudiante</th>
                    <th>Documento</th>
                    <th>Contacto</th>
                    <th>Asignación</th>
                    <th>Inscripción</th>
                    <th>Deuda</th>
                    <th>Estado</th>
                    <th aria-label="Acciones" />
                  </tr>
                </thead>
                <tbody>
                  {visibleStudents.map((student) => (
                    <tr key={student.$id}>
                      <td>
                        <div className="branch-name-cell">
                          <span className="branch-icon">
                            <UserRound size={18} strokeWidth={1.8} />
                          </span>
                          <div>
                            <strong>
                              {student.nombre} {student.apellido}
                            </strong>
                            <span>{student.direccion || "Sin dirección"}</span>
                          </div>
                        </div>
                      </td>
                      <td>{student.documento}</td>
                      <td>
                        <div className="compact-cell">
                          <span>{student.email || "Sin correo"}</span>
                          <span>{student.telefono || "Sin teléfono"}</span>
                        </div>
                      </td>
                      <td>
                        <div className="compact-cell">
                          <span>{student.cursoNombre || "Sin curso"}</span>
                          <span>
                            {student.sucursalNombre || "Sin sucursal"}
                          </span>
                        </div>
                      </td>
                      <td>{formatDisplayDate(student.fechaInscripcion)}</td>
                      <td>
                        <DebtBadge student={student} />
                      </td>
                      <td>
                        <StatusBadge status={student.estado} />
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            aria-label={`Mensualidades de ${student.nombre} ${student.apellido}`}
                            className="icon-action"
                            onClick={() => openPaymentsDrawer(student)}
                            type="button"
                          >
                            <WalletCards size={17} strokeWidth={1.8} />
                          </button>
                          <button
                            aria-label={`Editar ${student.nombre} ${student.apellido}`}
                            className="icon-action"
                            onClick={() => openEditDrawer(student)}
                            type="button"
                          >
                            <Edit3 size={17} strokeWidth={1.8} />
                          </button>
                          <button
                            aria-label={`Borrar ${student.nombre} ${student.apellido}`}
                            className="icon-action danger-action"
                            onClick={() => handleDelete(student)}
                            type="button"
                          >
                            <Trash2 size={17} strokeWidth={1.8} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mobile-branch-list">
              {visibleStudents.map((student) => (
                <article className="branch-mobile-card" key={student.$id}>
                  <div className="branch-mobile-heading">
                    <div>
                      <h2>
                        {student.nombre} {student.apellido}
                      </h2>
                      <span>{student.documento}</span>
                    </div>
                    <StatusBadge status={student.estado} />
                  </div>
                  <dl>
                    <div>
                      <dt>Contacto</dt>
                      <dd>
                        {student.email || student.telefono || "Sin contacto"}
                      </dd>
                    </div>
                    <div>
                      <dt>Asignación</dt>
                      <dd>
                        {student.cursoNombre ||
                          student.sucursalNombre ||
                          "Sin asignación"}
                      </dd>
                    </div>
                    <div>
                      <dt>Inscripción</dt>
                      <dd>{formatDisplayDate(student.fechaInscripcion)}</dd>
                    </div>
                    <div>
                      <dt>Deuda</dt>
                      <dd>
                        <DebtBadge student={student} />
                      </dd>
                    </div>
                    <div>
                      <dt>Dirección</dt>
                      <dd>{student.direccion || "Sin dirección"}</dd>
                    </div>
                  </dl>
                  <div className="mobile-card-actions">
                    <button
                      className="secondary-action"
                      onClick={() => openPaymentsDrawer(student)}
                      type="button"
                    >
                      <WalletCards size={17} />
                      <span>Cuotas</span>
                    </button>
                    <button
                      className="secondary-action"
                      onClick={() => openEditDrawer(student)}
                      type="button"
                    >
                      <Edit3 size={17} />
                      <span>Editar</span>
                    </button>
                    <button
                      className="secondary-action danger-action"
                      onClick={() => handleDelete(student)}
                      type="button"
                    >
                      <Trash2 size={17} />
                      <span>Borrar</span>
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : (
          <div className="table-state">
            <UserRound size={22} />
            <span>Sin estudiantes</span>
          </div>
        )}
      </section>

      {paymentDrawerStudent ? (
        <div className="drawer-layer" role="presentation">
          <button
            aria-label="Cerrar panel"
            className="drawer-scrim"
            onClick={closePaymentsDrawer}
            type="button"
          />
          <aside
            aria-labelledby="student-payments-title"
            className="side-drawer"
            role="dialog"
          >
            <header className="drawer-header">
              <div>
                <p className="eyebrow">Mensualidades</p>
                <h2 id="student-payments-title">
                  {paymentDrawerStudent.nombre} {paymentDrawerStudent.apellido}
                </h2>
              </div>
              <button
                aria-label="Cerrar"
                className="icon-action"
                onClick={closePaymentsDrawer}
                type="button"
              >
                <X size={18} strokeWidth={1.8} />
              </button>
            </header>

            <div className="drawer-form">
              {paymentsError ? (
                <p className="form-error" role="alert">
                  {paymentsError}
                </p>
              ) : null}

              {isPaymentsLoading ? (
                <div className="table-state compact-state">
                  <Loader2 className="spin-icon" size={20} />
                  <span>Cargando mensualidades</span>
                </div>
              ) : studentPayments.length ? (
                <div className="student-payments-layout">
                  <div className="enrollment-drawer-list">
                    {studentPayments.map((payment) => (
                      <article
                        className="enrollment-drawer-item"
                        key={payment.$id}
                      >
                        <div>
                          <strong>
                            {payment.courseName} - {payment.periodo}
                          </strong>
                          <span>
                            {formatDisplayDate(payment.fechaVencimiento)}
                          </span>
                        </div>
                        <PaymentStatusBadge status={payment.estado} />
                        <dl>
                          <div>
                            <dt>Monto</dt>
                            <dd>{formatMoney(payment.montoEsperado)}</dd>
                          </div>
                          <div>
                            <dt>Pagado</dt>
                            <dd>{formatMoney(payment.montoPagado)}</dd>
                          </div>
                          <div>
                            <dt>Saldo</dt>
                            <dd>{formatMoney(payment.saldo)}</dd>
                          </div>
                          <div>
                            <dt>Sucursal</dt>
                            <dd>{payment.sucursalNombre}</dd>
                          </div>
                        </dl>
                        <button
                          className="secondary-action"
                          disabled={payment.saldo <= 0 || isPending}
                          onClick={() => selectPaymentToCharge(payment)}
                          type="button"
                        >
                          <CreditCard size={17} />
                          <span>Cobrar</span>
                        </button>
                      </article>
                    ))}
                  </div>

                  {selectedPayment ? (
                    <form
                      className="student-payment-form"
                      onSubmit={handlePaymentSubmit}
                    >
                      <div className="payment-summary-box">
                        <div>
                          <span>Periodo</span>
                          <strong>{selectedPayment.periodo}</strong>
                        </div>
                        <div>
                          <span>Saldo</span>
                          <strong>{formatMoney(selectedPayment.saldo)}</strong>
                        </div>
                      </div>

                      {paymentForm.metodoPago === "qr" ? (
                        <div className="readonly-amount-box">
                          <span>Monto QR a cobrar</span>
                          <strong>{formatMoney(selectedPayment.saldo)}</strong>
                        </div>
                      ) : (
                        <label className="field-group">
                          <span>Monto a cobrar</span>
                          <input
                            className="control-input"
                            max={selectedPayment.saldo}
                            min="0.01"
                            name="monto"
                            onChange={handlePaymentFormChange}
                            required
                            step="0.01"
                            type="number"
                            value={paymentForm.monto}
                          />
                        </label>
                      )}

                      <fieldset className="field-group state-fieldset">
                        <legend>Método de pago</legend>
                        <div className="state-options">
                          {Object.entries(methodLabels).map(
                            ([value, label]) => (
                              <label
                                className={
                                  paymentForm.metodoPago === value
                                    ? "is-selected"
                                    : ""
                                }
                                key={value}
                              >
                                <input
                                  checked={paymentForm.metodoPago === value}
                                  name="metodoPago"
                                  onChange={handlePaymentFormChange}
                                  type="radio"
                                  value={value}
                                />
                                <CreditCard size={17} strokeWidth={1.8} />
                                <span>{label}</span>
                              </label>
                            ),
                          )}
                        </div>
                      </fieldset>

                      <label className="field-group">
                        <span>Referencia</span>
                        <input
                          className="control-input"
                          maxLength={128}
                          name="referencia"
                          onChange={handlePaymentFormChange}
                          value={paymentForm.referencia}
                        />
                      </label>

                      <label className="field-group">
                        <span>Notas</span>
                        <textarea
                          className="control-input textarea-input"
                          maxLength={256}
                          name="notas"
                          onChange={handlePaymentFormChange}
                          value={paymentForm.notas}
                        />
                      </label>

                      <button
                        className="primary-action"
                        disabled={isPending || isQrBusy}
                        type="submit"
                      >
                        {isPending || isQrBusy ? (
                          <Loader2 className="spin-icon" size={18} />
                        ) : paymentForm.metodoPago === "qr" ? (
                          <QrCode size={18} />
                        ) : (
                          <Check size={18} />
                        )}
                        <span>
                          {paymentForm.metodoPago === "qr"
                            ? "Generar QR"
                            : "Registrar ingreso"}
                        </span>
                      </button>

                      {qrDialog ? (
                        <div className="baneco-qr-panel">
                          <p className="eyebrow">Banco Económico</p>
                          <h3>{qrDialog.title}</h3>
                          <img
                            alt={`QR Baneco ${qrDialog.qrId}`}
                            className="baneco-qr-image"
                            src={`data:image/png;base64,${qrDialog.qrImage}`}
                          />
                          <p>{formatMoney(qrDialog.amount)}</p>
                          <small>QR: {qrDialog.qrId}</small>
                          <button
                            className="primary-action"
                            disabled={isPending || isQrBusy}
                            onClick={checkQrStatus}
                            type="button"
                          >
                            {isPending || isQrBusy ? (
                              <Loader2 className="spin-icon" size={18} />
                            ) : (
                              <Check size={18} />
                            )}
                            <span>Verificar pago</span>
                          </button>
                        </div>
                      ) : null}
                    </form>
                  ) : (
                    <div className="table-state compact-state">
                      <CreditCard size={21} />
                      <span>Selecciona una cuota para cobrar</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="table-state compact-state">
                  <WalletCards size={21} />
                  <span>Sin mensualidades registradas</span>
                </div>
              )}
            </div>
          </aside>
        </div>
      ) : null}

      {drawerMode !== "closed" ? (
        <div className="drawer-layer" role="presentation">
          <button
            aria-label="Cerrar panel"
            className="drawer-scrim"
            onClick={() => closeDrawer()}
            type="button"
          />
          <aside
            aria-labelledby="student-drawer-title"
            className="side-drawer"
            role="dialog"
          >
            <header className="drawer-header">
              <div>
                <p className="eyebrow">Estudiante</p>
                <h2 id="student-drawer-title">
                  {drawerMode === "edit" ? "Editar" : "Crear"}
                </h2>
              </div>
              <button
                aria-label="Cerrar"
                className="icon-action"
                onClick={() => closeDrawer()}
                type="button"
              >
                <X size={18} strokeWidth={1.8} />
              </button>
            </header>

            <form className="drawer-form" onSubmit={handleSubmit}>
              <label className="field-group">
                <span>Nombre</span>
                <input
                  className="control-input"
                  maxLength={128}
                  name="nombre"
                  onChange={handleFieldChange}
                  required
                  value={form.nombre}
                />
              </label>

              <label className="field-group">
                <span>Apellido</span>
                <input
                  className="control-input"
                  maxLength={128}
                  name="apellido"
                  onChange={handleFieldChange}
                  required
                  value={form.apellido}
                />
              </label>

              <label className="field-group">
                <span>Documento</span>
                <input
                  className="control-input"
                  maxLength={32}
                  name="documento"
                  onChange={handleFieldChange}
                  required
                  value={form.documento}
                />
              </label>

              <label className="field-group">
                <span>Fecha inscripción</span>
                <input
                  className="control-input"
                  name="fechaInscripcion"
                  onChange={handleFieldChange}
                  required
                  type="date"
                  value={form.fechaInscripcion}
                />
              </label>

              <label className="field-group">
                <span>Sucursal</span>
                <select
                  className="control-input"
                  name="sucursalId"
                  onChange={handleFieldChange}
                  value={form.sucursalId}
                >
                  <option value="">Sin sucursal</option>
                  {branches
                    .filter((branch) => branch.estado === "activo")
                    .map((branch) => (
                      <option key={branch.$id} value={branch.$id}>
                        {branch.nombre}
                      </option>
                    ))}
                </select>
              </label>

              <label className="field-group">
                <span>Curso</span>
                <select
                  className="control-input"
                  name="courseId"
                  onChange={handleFieldChange}
                  value={form.courseId}
                >
                  <option value="">Sin curso</option>
                  {filteredCourses.map((course) => (
                    <option key={course.$id} value={course.$id}>
                      {course.nombre} - {course.sucursalNombre} -{" "}
                      {course.cupoOcupado}/{course.cupoMaximo}
                    </option>
                  ))}
                </select>
              </label>

              {form.courseId ? (
                <div className="form-two-columns">
                  <label className="field-group">
                    <span>Inicio clases</span>
                    <input
                      className="control-input"
                      readOnly
                      value={formatDisplayDate(selectedCourse?.fechaInicio)}
                    />
                  </label>

                  <label className="field-group">
                    <span>Día vencimiento</span>
                    <input
                      className="control-input"
                      name="diaVencimiento"
                      readOnly
                      value={
                        form.diaVencimiento ||
                        getDueDayFromCourse(selectedCourse) ||
                        ""
                      }
                    />
                  </label>
                </div>
              ) : null}

              <label className="field-group">
                <span>Correo</span>
                <input
                  className="control-input"
                  maxLength={128}
                  name="email"
                  onChange={handleFieldChange}
                  type="email"
                  value={form.email}
                />
              </label>

              <label className="field-group">
                <span>Teléfono</span>
                <input
                  className="control-input"
                  maxLength={32}
                  name="telefono"
                  onChange={handleFieldChange}
                  value={form.telefono}
                />
              </label>

              <label className="field-group">
                <span>Dirección</span>
                <textarea
                  className="control-input textarea-input"
                  maxLength={256}
                  name="direccion"
                  onChange={handleFieldChange}
                  value={form.direccion}
                />
              </label>

              <fieldset className="field-group state-fieldset">
                <legend>Estado</legend>
                <div className="state-options">
                  {[
                    ["activo", "Activo", Check],
                    ["inactivo", "Inactivo", X],
                    ["retirado", "Retirado", X],
                  ].map(([value, label, Icon]) => (
                    <label
                      className={form.estado === value ? "is-selected" : ""}
                      key={value}
                    >
                      <input
                        checked={form.estado === value}
                        name="estado"
                        onChange={handleFieldChange}
                        type="radio"
                        value={value}
                      />
                      <Icon size={17} strokeWidth={1.8} />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="drawer-actions">
                <button
                  className="secondary-action"
                  disabled={isPending}
                  onClick={() => closeDrawer()}
                  type="button"
                >
                  Cancelar
                </button>
                <button
                  className="primary-action"
                  disabled={isPending}
                  type="submit"
                >
                  {isPending ? (
                    <Loader2 className="spin-icon" size={18} />
                  ) : (
                    <Check size={18} />
                  )}
                  <span>Guardar</span>
                </button>
              </div>
            </form>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function StatusBadge({ status }) {
  return (
    <span className={`status-badge is-${status}`}>
      {statusLabels[status] || status}
    </span>
  );
}

function DebtBadge({ student }) {
  if (!student.tieneDeuda) {
    return <span className="status-badge is-sin_deuda">Sin deuda</span>;
  }

  return (
    <span className="debt-cell">
      <span className="status-badge is-con_deuda">Con deuda</span>
      <small>
        {formatMoney(student.montoDeuda)} · {student.cuotasVencidas}{" "}
        {student.cuotasVencidas === 1 ? "cuota" : "cuotas"}
      </small>
    </span>
  );
}

function PaymentStatusBadge({ status }) {
  return (
    <span className={`status-badge is-${status}`}>
      {paymentStatusLabels[status] || status}
    </span>
  );
}
