"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Banknote,
  Check,
  Copy,
  CreditCard,
  Link as LinkIcon,
  Loader2,
  QrCode,
  Search,
  UserPlus,
} from "lucide-react";
import {
  createPosPaymentLink,
  createPosEnrollment,
  findStudentLedgerByDocument,
  getDashboardPosData,
  registerPosEnrollmentQrPayment,
  registerPosPayment,
} from "@/actions/dashboard-pos";

const today = new Date().toISOString().slice(0, 10);

const emptyEnrollmentForm = {
  apellido: "",
  courseId: "",
  documento: "",
  email: "",
  existingStudentId: "",
  fechaInscripcion: today,
  motivoBeca: "",
  nombre: "",
  paymentMethod: "efectivo",
  paymentPlan: "mensual",
  paymentReference: "",
  studentMode: "new",
  sucursalId: "",
  telefono: "",
  tipoBeca: "ninguna",
  valorBeca: "0",
};

function normalizeBranch(branch) {
  return {
    $id: branch.$id,
    estado: branch.estado || "activo",
    nombre: branch.nombre || "",
  };
}

function normalizeCourse(course) {
  return {
    $id: course.$id,
    cupoMaximo: Number(course.cupoMaximo || 0),
    cupoOcupado: Number(course.cupoOcupado || 0),
    estado: course.estado || "cerrado",
    nombre: course.nombre || "",
    precioMensual: Number(course.precioMensual || 0),
    sucursalId: course.sucursalId || "",
    sucursalNombre: course.sucursalNombre || "Sin sucursal",
  };
}

function normalizeStudent(student) {
  return {
    $id: student.$id || student.studentId || "",
    documento: student.documento || "",
    nombre: student.nombre || "",
  };
}

function formatMoney(value) {
  return new Intl.NumberFormat("es-BO", {
    currency: "BOB",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return "Sin fecha";

  return new Intl.DateTimeFormat("es-BO", {
    day: "2-digit",
    month: "short",
    timeZone: "America/La_Paz",
    year: "numeric",
  }).format(new Date(value));
}

function isPaymentOverdue(payment) {
  return (
    payment.estado !== "pagado" &&
    payment.saldo > 0 &&
    payment.fechaVencimiento &&
    payment.fechaVencimiento < new Date().toISOString()
  );
}

function getPaymentStatusLabel(payment) {
  if (payment.estado === "pagado") return "Pagada";
  if (isPaymentOverdue(payment)) return "Vencida";
  if (payment.estado === "parcial") return "Parcial";

  return "Pendiente";
}

export function DashboardPosClient() {
  const [branches, setBranches] = useState([]);
  const [courses, setCourses] = useState([]);
  const [students, setStudents] = useState([]);
  const [mode, setMode] = useState("inscribir");
  const [form, setForm] = useState(emptyEnrollmentForm);
  const [ledgerQuery, setLedgerQuery] = useState("");
  const [ledger, setLedger] = useState(null);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [selectedPaymentId, setSelectedPaymentId] = useState("");
  const [selectedPaymentAmount, setSelectedPaymentAmount] = useState("");
  const [confirmationDialog, setConfirmationDialog] = useState(null);
  const [paymentLinkDialog, setPaymentLinkDialog] = useState(null);
  const [qrDialog, setQrDialog] = useState(null);
  const [isQrBusy, setIsQrBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const branchCourses = useMemo(() => {
    return courses.filter((course) => {
      const matchesBranch =
        !form.sucursalId || course.sucursalId === form.sucursalId;

      return matchesBranch && course.estado === "en_inscripciones";
    });
  }, [courses, form.sucursalId]);

  const selectedCourse = useMemo(() => {
    return courses.find((course) => course.$id === form.courseId) || null;
  }, [courses, form.courseId]);

  const existingStudent = useMemo(() => {
    const document = form.documento.trim();

    if (!document) return null;

    return students.find((student) => student.documento === document) || null;
  }, [form.documento, students]);

  const ledgerCourse = useMemo(() => {
    return (
      ledger?.courses.find((course) => course.courseId === selectedCourseId) ||
      null
    );
  }, [ledger, selectedCourseId]);

  const selectedPayment = useMemo(() => {
    return (
      ledgerCourse?.payments.find(
        (payment) => payment.$id === selectedPaymentId,
      ) || null
    );
  }, [ledgerCourse, selectedPaymentId]);

  const chargeAmount = useMemo(() => {
    const amount = Number(selectedPaymentAmount);

    if (!selectedPayment || !Number.isFinite(amount)) {
      return Number.NaN;
    }

    return amount;
  }, [selectedPayment, selectedPaymentAmount]);

  const isChargeAmountValid =
    Boolean(selectedPayment) &&
    Number.isFinite(chargeAmount) &&
    chargeAmount > 0 &&
    chargeAmount <= selectedPayment.saldo;

  useEffect(() => {
    refreshData();
  }, []);

  useEffect(() => {
    if (!form.sucursalId && branches[0]?.$id) {
      setForm((currentForm) => ({
        ...currentForm,
        sucursalId: branches[0].$id,
      }));
    }
  }, [branches, form.sucursalId]);

  useEffect(() => {
    if (
      form.courseId &&
      !branchCourses.some((course) => course.$id === form.courseId)
    ) {
      setForm((currentForm) => ({ ...currentForm, courseId: "" }));
    }
  }, [branchCourses, form.courseId]);

  useEffect(() => {
    if (selectedPayment) {
      setSelectedPaymentAmount(String(selectedPayment.saldo || ""));
    } else {
      setSelectedPaymentAmount("");
    }
  }, [selectedPayment]);

  function refreshData() {
    setIsLoading(true);
    setError("");
    setNotice("");

    startTransition(async () => {
      const result = await getDashboardPosData();

      if (!result.ok) {
        setBranches([]);
        setCourses([]);
        setStudents([]);
        setError(result.error);
      } else {
        const nextBranches = result.branches.map(normalizeBranch);
        const nextCourses = result.courses.map(normalizeCourse);

        setBranches(nextBranches);
        setCourses(nextCourses);
        setStudents(result.students.map(normalizeStudent));
        setForm((currentForm) => ({
          ...currentForm,
          courseId:
            currentForm.courseId ||
            nextCourses.find(
              (course) =>
                course.sucursalId ===
                  (currentForm.sucursalId || nextBranches[0]?.$id) &&
                course.estado === "en_inscripciones",
            )?.$id ||
            "",
          sucursalId: currentForm.sucursalId || nextBranches[0]?.$id || "",
        }));
      }

      setIsLoading(false);
    });
  }

  function updateForm(event) {
    const { name, value } = event.target;

    setForm((currentForm) => ({ ...currentForm, [name]: value }));
  }

  function setPaymentPlan(paymentPlan) {
    setForm((currentForm) => ({ ...currentForm, paymentPlan }));
  }

  function setStudentMode(studentMode) {
    setError("");
    setNotice("");
    setForm((currentForm) => ({
      ...currentForm,
      apellido: "",
      email: "",
      nombre: "",
      studentMode,
      telefono: "",
    }));
  }

  function submitEnrollment(event) {
    event.preventDefault();
    setError("");
    setNotice("");

    if (form.studentMode === "existing" && !existingStudent) {
      setError("Ingresa el CI de un estudiante existente.");
      return;
    }

    if (form.studentMode === "new" && existingStudent) {
      setError(
        "Ese CI ya pertenece a un estudiante. Usa la opción Estudiante existente.",
      );
      return;
    }

    startTransition(async () => {
      const result = await createPosEnrollment({
        ...form,
        existingStudentId:
          form.studentMode === "existing" ? existingStudent?.$id || "" : "",
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      if (result.pendingQrPayment) {
        setNotice("Inscripción registrada. Esperando confirmación del QR.");
        await openBanecoQr({
          amount: result.pendingQrPayment.amount,
          context: {
            enrollmentId: result.pendingQrPayment.enrollmentId,
            kind: "enrollment",
          },
          title: `Inscripción ${result.enrollment.studentName}`,
          type: "enrollment",
        });
        setForm({
          ...emptyEnrollmentForm,
          sucursalId: form.sucursalId,
        });
        refreshData();
        return;
      }

      if (result.paymentLink) {
        const url = buildPaymentLinkUrl(result.paymentLink.path);

        await copyPaymentLink(url);
        setPaymentLinkDialog({
          message: "Enlace de inscripción generado y copiado.",
          title: "Enlace de pago",
          url,
        });
        setForm({
          ...emptyEnrollmentForm,
          sucursalId: form.sucursalId,
        });
        refreshData();
        return;
      }

      const paidText =
        result.paymentPlan === "contado"
          ? ` Se registraron ${result.paidSummary.count} cuotas por ${formatMoney(result.paidSummary.total)}.`
          : "";

      setConfirmationDialog({
        message: `Inscripción registrada para ${result.enrollment.studentName}.${paidText}`,
        title: "Inscripción completada",
      });
      setForm({
        ...emptyEnrollmentForm,
        sucursalId: form.sucursalId,
      });
      refreshData();
    });
  }

  function searchLedger(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    setLedger(null);
    setSelectedCourseId("");
    setSelectedPaymentId("");
    setSelectedPaymentAmount("");

    startTransition(async () => {
      const result = await findStudentLedgerByDocument(ledgerQuery);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setLedger(result);
      setSelectedCourseId(result.courses[0]?.courseId || "");
    });
  }

  function paySelected(method) {
    if (!selectedPayment) {
      setError("Selecciona una cuota.");
      return;
    }

    if (!isChargeAmountValid) {
      setError("Ingresa un monto a cobrar válido.");
      return;
    }

    setError("");
    setNotice("");

    if (method === "qr") {
      openBanecoQr({
        amount: chargeAmount,
        context: {
          kind: "payment",
          paymentId: selectedPayment.$id,
        },
        paymentId: selectedPayment.$id,
        title: `Mensualidad ${selectedPayment.periodo}`,
        type: "payment",
      });
      return;
    }

    startTransition(async () => {
      const result = await registerPosPayment(
        selectedPayment.$id,
        method,
        chargeAmount,
      );

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setConfirmationDialog({
        message: `Cuota ${result.payment.periodo} pagada con ${method === "qr" ? "QR" : "efectivo"}.`,
        title: "Mensualidad registrada",
      });
      const refreshedLedger = await findStudentLedgerByDocument(ledgerQuery);

      if (refreshedLedger.ok) {
        setLedger(refreshedLedger);
        setSelectedPaymentId("");
      }
    });
  }

  function buildPaymentLinkUrl(path) {
    if (typeof window === "undefined") return path;

    return new URL(path, window.location.origin).toString();
  }

  async function copyPaymentLink(url) {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      setNotice("Enlace generado. Cópialo manualmente desde el cuadro.");
    }
  }

  function createPaymentLinkForSelectedPayment() {
    if (!selectedPayment) {
      setError("Selecciona una cuota.");
      return;
    }

    if (!isChargeAmountValid) {
      setError("Ingresa un monto a cobrar válido.");
      return;
    }

    setError("");
    setNotice("");

    startTransition(async () => {
      const result = await createPosPaymentLink(
        selectedPayment.$id,
        chargeAmount,
      );

      if (!result.ok) {
        setError(result.error);
        return;
      }

      const url = buildPaymentLinkUrl(result.path);

      await copyPaymentLink(url);
      setPaymentLinkDialog({
        message: "Enlace de mensualidad generado y copiado.",
        title: "Enlace de pago",
        url,
      });
    });
  }

  async function openBanecoQr({
    amount,
    context,
    paymentId = "",
    title,
    type,
  }) {
    setIsQrBusy(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/payments/baneco/qr", {
        body: JSON.stringify({
          amount,
          enrollmentId: context.enrollmentId,
          paymentId,
          type,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "No se pudo generar el QR.");
      }

      setQrDialog({
        amount: result.amount || amount,
        context,
        qrId: result.qrId,
        qrImage: result.qrImage,
        status: "pending",
        title,
      });
    } catch (qrError) {
      setError(qrError.message || "No se pudo generar el QR.");
    } finally {
      setIsQrBusy(false);
    }
  }

  function checkQrStatus() {
    if (!qrDialog?.qrId) return;

    setIsQrBusy(true);
    setError("");

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
          setQrDialog((currentDialog) =>
            currentDialog ? { ...currentDialog, status: "pending" } : null,
          );
          setNotice("El QR sigue pendiente de pago.");
          return;
        }

        if (statusResult.status === "cancelled") {
          setQrDialog((currentDialog) =>
            currentDialog ? { ...currentDialog, status: "cancelled" } : null,
          );
          setError("Banco Económico reportó el QR como cancelado.");
          return;
        }

        if (qrDialog.context.kind === "enrollment") {
          const result = await registerPosEnrollmentQrPayment(
            qrDialog.context.enrollmentId,
            qrDialog.qrId,
          );

          if (!result.ok) {
            throw new Error(result.error);
          }

          setQrDialog(null);
          setConfirmationDialog({
            message: `Pago QR confirmado. Se registraron ${result.paidSummary.count} cuotas por ${formatMoney(result.paidSummary.total)}.`,
            title: "Inscripción pagada",
          });
          refreshData();
          return;
        }

        const result = await registerPosPayment(
          qrDialog.context.paymentId,
          "qr",
          qrDialog.amount,
        );

        if (!result.ok) {
          throw new Error(result.error);
        }

        setQrDialog(null);
        setConfirmationDialog({
          message: `Cuota ${result.payment.periodo} pagada con QR.`,
          title: "Mensualidad registrada",
        });
        const refreshedLedger = await findStudentLedgerByDocument(ledgerQuery);

        if (refreshedLedger.ok) {
          setLedger(refreshedLedger);
          setSelectedPaymentId("");
        }
      } catch (qrError) {
        setError(qrError.message || "No se pudo verificar el QR.");
      } finally {
        setIsQrBusy(false);
      }
    });
  }

  return (
    <div className="pos-page">
      <section className="pos-mode-bar" aria-label="Flujo de caja">
        <button
          className={mode === "inscribir" ? "is-selected" : ""}
          onClick={() => setMode("inscribir")}
          type="button"
        >
          <UserPlus size={18} />
          <span>Inscribir</span>
        </button>
        <button
          className={mode === "mensualidad" ? "is-selected" : ""}
          onClick={() => setMode("mensualidad")}
          type="button"
        >
          <Banknote size={18} />
          <span>Registrar mensualidad</span>
        </button>
      </section>

      {error ? (
        <p className="form-error branch-error" role="alert">
          {error}
        </p>
      ) : null}

      {notice ? <p className="form-note branch-error">{notice}</p> : null}

      {isLoading ? (
        <section className="branch-table-shell">
          <div className="table-state">
            <Loader2 className="spin-icon" size={22} />
            <span>Cargando caja</span>
          </div>
        </section>
      ) : mode === "inscribir" ? (
        <section className="pos-workspace" aria-label="Inscripción">
          <form className="pos-panel pos-form" onSubmit={submitEnrollment}>
            <header className="pos-panel-header">
              <div>
                <p className="eyebrow">Inscripción</p>
                <h2>
                  {form.studentMode === "existing"
                    ? "Estudiante existente"
                    : "Nuevo estudiante"}
                </h2>
              </div>
              <span className="status-badge is-en_inscripciones">
                {form.studentMode === "existing"
                  ? existingStudent
                    ? "Encontrado"
                    : "Buscar por CI"
                  : "Nuevo registro"}
              </span>
            </header>

            <fieldset className="pos-choice-fieldset">
              <legend>Tipo de inscripción</legend>
              <div className="pos-choice-row">
                <label
                  className={form.studentMode === "new" ? "is-selected" : ""}
                >
                  <input
                    checked={form.studentMode === "new"}
                    name="studentMode"
                    onChange={() => setStudentMode("new")}
                    type="radio"
                  />
                  <UserPlus size={17} />
                  <span>Inscribir nuevo estudiante</span>
                </label>
                <label
                  className={
                    form.studentMode === "existing" ? "is-selected" : ""
                  }
                >
                  <input
                    checked={form.studentMode === "existing"}
                    name="studentMode"
                    onChange={() => setStudentMode("existing")}
                    type="radio"
                  />
                  <Search size={17} />
                  <span>Inscribir estudiante existente</span>
                </label>
              </div>
            </fieldset>

            <fieldset className="pos-choice-fieldset">
              <legend>Tipo de pago</legend>
              <div className="pos-choice-row">
                <label
                  className={
                    form.paymentPlan === "mensual" ? "is-selected" : ""
                  }
                >
                  <input
                    checked={form.paymentPlan === "mensual"}
                    name="paymentPlan"
                    onChange={() => setPaymentPlan("mensual")}
                    type="radio"
                  />
                  <CreditCard size={17} />
                  <span>Pago mensual</span>
                </label>
                <label
                  className={
                    form.paymentPlan === "contado" ? "is-selected" : ""
                  }
                >
                  <input
                    checked={form.paymentPlan === "contado"}
                    name="paymentPlan"
                    onChange={() => setPaymentPlan("contado")}
                    type="radio"
                  />
                  <Banknote size={17} />
                  <span>Pago al contado</span>
                </label>
              </div>
            </fieldset>

            <div
              className={`pos-form-grid ${
                form.studentMode === "existing" ? "is-existing" : ""
              }`}
            >
              <label className="field-group">
                <span>CI</span>
                <input
                  className="control-input"
                  name="documento"
                  onChange={updateForm}
                  placeholder={
                    form.studentMode === "existing"
                      ? "CI del estudiante registrado"
                      : ""
                  }
                  required
                  value={form.documento}
                />
              </label>
              {form.studentMode === "new" ? (
                <>
                  <label className="field-group">
                    <span>Nombre</span>
                    <input
                      className="control-input"
                      name="nombre"
                      onChange={updateForm}
                      required
                      value={form.nombre}
                    />
                  </label>
                  <label className="field-group">
                    <span>Apellido</span>
                    <input
                      className="control-input"
                      name="apellido"
                      onChange={updateForm}
                      required
                      value={form.apellido}
                    />
                  </label>
                  <label className="field-group">
                    <span>Teléfono</span>
                    <input
                      className="control-input"
                      name="telefono"
                      onChange={updateForm}
                      value={form.telefono}
                    />
                  </label>
                  <label className="field-group">
                    <span>Correo</span>
                    <input
                      className="control-input"
                      name="email"
                      onChange={updateForm}
                      type="email"
                      value={form.email}
                    />
                  </label>
                </>
              ) : (
                <div className="pos-selected-student">
                  <span>Estudiante</span>
                  <strong>
                    {existingStudent
                      ? existingStudent.nombre
                      : "Ingresa un CI existente"}
                  </strong>
                  <small>
                    {existingStudent
                      ? `CI ${existingStudent.documento}`
                      : "No se creará un registro nuevo"}
                  </small>
                </div>
              )}
              <label className="field-group">
                <span>Sucursal</span>
                <select
                  className="control-input"
                  name="sucursalId"
                  onChange={updateForm}
                  required
                  value={form.sucursalId}
                >
                  {branches.map((branch) => (
                    <option key={branch.$id} value={branch.$id}>
                      {branch.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-group">
                <span>Beca/descuento</span>
                <select
                  className="control-input"
                  name="tipoBeca"
                  onChange={updateForm}
                  value={form.tipoBeca}
                >
                  <option value="ninguna">Sin beca</option>
                  <option value="porcentaje">Porcentaje</option>
                  <option value="monto_fijo">Monto fijo</option>
                </select>
              </label>
              <label className="field-group">
                <span>Valor beca</span>
                <input
                  className="control-input"
                  min="0"
                  name="valorBeca"
                  onChange={updateForm}
                  step="0.01"
                  type="number"
                  value={form.valorBeca}
                />
              </label>
              <label className="field-group pos-course-field">
                <span>Curso</span>
                <select
                  className="control-input"
                  name="courseId"
                  onChange={updateForm}
                  required
                  value={form.courseId}
                >
                  <option value="">Seleccionar curso</option>
                  {branchCourses.map((course) => (
                    <option key={course.$id} value={course.$id}>
                      {course.nombre} - {formatMoney(course.precioMensual)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {form.tipoBeca !== "ninguna" ? (
              <label className="field-group">
                <span>Motivo de beca/descuento</span>
                <input
                  className="control-input"
                  name="motivoBeca"
                  onChange={updateForm}
                  required
                  value={form.motivoBeca}
                />
              </label>
            ) : null}

            {form.paymentPlan === "contado" ? (
              <div className="pos-form-grid">
                <label className="field-group">
                  <span>Método al contado</span>
                  <select
                    className="control-input"
                    name="paymentMethod"
                    onChange={updateForm}
                    value={form.paymentMethod}
                  >
                    <option value="efectivo">Efectivo</option>
                    <option value="qr">QR</option>
                    <option value="enlace">Cobrar por enlace de pago</option>
                  </select>
                </label>
                <label className="field-group">
                  <span>Referencia</span>
                  <input
                    className="control-input"
                    name="paymentReference"
                    onChange={updateForm}
                    placeholder="Opcional"
                    value={form.paymentReference}
                  />
                </label>
              </div>
            ) : null}

            <button
              className="primary-action pos-submit"
              disabled={isPending}
              type="submit"
            >
              {isPending ? (
                <Loader2 className="spin-icon" size={18} />
              ) : (
                <Check size={18} />
              )}
              <span>Registrar inscripción</span>
            </button>
          </form>

          <aside className="pos-panel pos-summary">
            <p className="eyebrow">Resumen</p>
            <h2>{selectedCourse?.nombre || "Selecciona un curso"}</h2>
            <dl>
              <div>
                <dt>Sucursal</dt>
                <dd>{selectedCourse?.sucursalNombre || "-"}</dd>
              </div>
              <div>
                <dt>Mensualidad</dt>
                <dd>{formatMoney(selectedCourse?.precioMensual || 0)}</dd>
              </div>
              <div>
                <dt>Cupo</dt>
                <dd>
                  {selectedCourse
                    ? `${selectedCourse.cupoOcupado}/${selectedCourse.cupoMaximo}`
                    : "-"}
                </dd>
              </div>
              <div>
                <dt>Plan</dt>
                <dd>
                  {form.paymentPlan === "contado"
                    ? "Pago al contado"
                    : "Pago mensual"}
                </dd>
              </div>
            </dl>
          </aside>
        </section>
      ) : (
        <section className="pos-workspace" aria-label="Registro de mensualidad">
          <div className="pos-panel">
            <header className="pos-panel-header">
              <div>
                <p className="eyebrow">Mensualidad</p>
                <h2>Buscar estudiante</h2>
              </div>
            </header>

            <form className="pos-search-row" onSubmit={searchLedger}>
              <label className="search-control">
                <Search size={17} strokeWidth={1.8} />
                <input
                  onChange={(event) => setLedgerQuery(event.target.value)}
                  placeholder="CI del estudiante"
                  required
                  value={ledgerQuery}
                />
              </label>
              <button
                className="primary-action"
                disabled={isPending}
                type="submit"
              >
                {isPending ? (
                  <Loader2 className="spin-icon" size={18} />
                ) : (
                  <Search size={18} />
                )}
                <span>Buscar</span>
              </button>
            </form>

            {ledger ? (
              <div className="pos-ledger">
                <div className="pos-student-strip">
                  <strong>{ledger.student.nombre}</strong>
                  <span>CI {ledger.student.documento}</span>
                </div>

                {ledger.courses.length ? (
                  <>
                    <div className="pos-course-list">
                      {ledger.courses.map((course) => (
                        <button
                          className={
                            selectedCourseId === course.courseId
                              ? "is-selected"
                              : ""
                          }
                          key={course.courseId}
                          onClick={() => {
                            setSelectedCourseId(course.courseId);
                            setSelectedPaymentId("");
                          }}
                          type="button"
                        >
                          <strong>{course.courseName}</strong>
                          <span>{course.sucursalNombre}</span>
                          <small>{formatMoney(course.deuda)} pendiente</small>
                        </button>
                      ))}
                    </div>

                    {ledgerCourse ? (
                      <div className="pos-payment-list">
                        {ledgerCourse.payments.map((payment) => {
                          const disabled = payment.saldo <= 0;

                          return (
                            <button
                              className={
                                selectedPaymentId === payment.$id
                                  ? "is-selected"
                                  : ""
                              }
                              disabled={disabled}
                              key={payment.$id}
                              onClick={() => setSelectedPaymentId(payment.$id)}
                              type="button"
                            >
                              <div>
                                <strong>{payment.periodo}</strong>
                                <span>
                                  {formatDate(payment.fechaVencimiento)}
                                </span>
                              </div>
                              <div>
                                <span
                                  className={`status-badge is-${isPaymentOverdue(payment) ? "vencido" : payment.estado}`}
                                >
                                  {getPaymentStatusLabel(payment)}
                                </span>
                                <small>
                                  {formatMoney(payment.saldo)} saldo
                                </small>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="table-state compact-state">
                    <span>El estudiante no tiene cuotas registradas.</span>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <aside className="pos-panel pos-summary">
            <p className="eyebrow">Cobro</p>
            <h2>
              {selectedPayment
                ? selectedPayment.periodo
                : "Selecciona una cuota"}
            </h2>
            <dl>
              <div>
                <dt>Curso</dt>
                <dd>{selectedPayment?.courseName || "-"}</dd>
              </div>
              <div>
                <dt>Vencimiento</dt>
                <dd>
                  {selectedPayment
                    ? formatDate(selectedPayment.fechaVencimiento)
                    : "-"}
                </dd>
              </div>
              <div>
                <dt>Debería pagar</dt>
                <dd>{formatMoney(selectedPayment?.saldo || 0)}</dd>
              </div>
            </dl>
            <label className="field-group pos-charge-amount">
              <span>Monto a cobrar</span>
              <input
                className="control-input"
                disabled={!selectedPayment}
                max={selectedPayment?.saldo || 0}
                min="0.01"
                onChange={(event) => setSelectedPaymentAmount(event.target.value)}
                placeholder="0.00"
                step="0.01"
                type="number"
                value={selectedPaymentAmount}
              />
            </label>
            <div className="pos-pay-actions">
              <button
                className="primary-action"
                disabled={
                  !isChargeAmountValid || isPending
                }
                onClick={() => paySelected("efectivo")}
                type="button"
              >
                <Banknote size={18} />
                <span>Pagar efectivo</span>
              </button>
              <button
                className="secondary-action"
                disabled={
                  !isChargeAmountValid || isPending || isQrBusy
                }
                onClick={() => paySelected("qr")}
                type="button"
              >
                <QrCode size={18} />
                <span>Pagar QR</span>
              </button>
              <button
                className="secondary-action"
                disabled={
                  !isChargeAmountValid || isPending || isQrBusy
                }
                onClick={createPaymentLinkForSelectedPayment}
                type="button"
              >
                <LinkIcon size={18} />
                <span>Cobrar por enlace de pago</span>
              </button>
            </div>
          </aside>
        </section>
      )}

      {confirmationDialog ? (
        <div className="pos-confirmation-layer" role="presentation">
          <div
            aria-labelledby="pos-confirmation-title"
            aria-modal="true"
            className="pos-confirmation-dialog"
            role="dialog"
          >
            <span className="pos-confirmation-icon">
              <Check size={24} strokeWidth={2} />
            </span>
            <div>
              <p className="eyebrow">Confirmación</p>
              <h2 id="pos-confirmation-title">{confirmationDialog.title}</h2>
              <p>{confirmationDialog.message}</p>
            </div>
            <button
              className="primary-action"
              onClick={() => setConfirmationDialog(null)}
              type="button"
            >
              <Check size={18} />
              <span>Aceptar</span>
            </button>
          </div>
        </div>
      ) : null}

      {paymentLinkDialog ? (
        <div className="pos-confirmation-layer" role="presentation">
          <div
            aria-labelledby="payment-link-title"
            aria-modal="true"
            className="pos-confirmation-dialog payment-link-dialog"
            role="dialog"
          >
            <div>
              <p className="eyebrow">Enlace de pago</p>
              <h2 id="payment-link-title">{paymentLinkDialog.title}</h2>
              <p>{paymentLinkDialog.message}</p>
            </div>
            <input
              className="control-input"
              readOnly
              value={paymentLinkDialog.url}
            />
            <div className="drawer-actions">
              <button
                className="secondary-action"
                onClick={() => setPaymentLinkDialog(null)}
                type="button"
              >
                Cerrar
              </button>
              <button
                className="primary-action"
                onClick={() => copyPaymentLink(paymentLinkDialog.url)}
                type="button"
              >
                <Copy size={18} />
                <span>Copiar enlace</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {qrDialog ? (
        <div className="pos-confirmation-layer" role="presentation">
          <div
            aria-labelledby="baneco-qr-title"
            aria-modal="true"
            className="pos-confirmation-dialog qr-dialog"
            role="dialog"
          >
            <div>
              <p className="eyebrow">Banco Económico</p>
              <h2 id="baneco-qr-title">{qrDialog.title}</h2>
              <p>
                Escanea el QR por {formatMoney(qrDialog.amount)} y verifica el
                estado para registrar el pago.
              </p>
            </div>
            <img
              alt={`QR Baneco ${qrDialog.qrId}`}
              className="baneco-qr-image"
              src={`data:image/png;base64,${qrDialog.qrImage}`}
            />
            <small>QR: {qrDialog.qrId}</small>
            <div className="drawer-actions">
              <button
                className="secondary-action"
                disabled={isQrBusy || isPending}
                onClick={() => setQrDialog(null)}
                type="button"
              >
                Cerrar
              </button>
              <button
                className="primary-action"
                disabled={isQrBusy || isPending}
                onClick={checkQrStatus}
                type="button"
              >
                {isQrBusy || isPending ? (
                  <Loader2 className="spin-icon" size={18} />
                ) : (
                  <Check size={18} />
                )}
                <span>Verificar pago</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
