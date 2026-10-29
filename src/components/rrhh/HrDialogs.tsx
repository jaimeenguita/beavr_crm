"use client";

import { useEffect, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import { FormField } from "@/components/FormField";
import { CloseButton, Modal, formatDate } from "@/components/Modal";
import { StaffNameLink } from "@/components/rrhh/StaffNameLink";
import type { Admision, EstadoLaboral, StaffMember } from "@/lib/crm/rrhh";
import { ESTADO_LABORAL_LABELS } from "@/lib/crm/rrhh";

export type StaffFormValues = {
  nombre: string;
  email: string;
  cargo: string;
  telefono: string;
  notas: string;
  estado_laboral: EstadoLaboral;
  fecha_alta: string;
  fotoFile: File | null;
};

export type AdmisionFormValues = {
  nombre: string;
  email: string;
  telefono: string;
  puesto: string;
  notas: string;
  cvFile: File | null;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^\+?[\d\s().-]{6,}$/;

export function StaffEditor({
  staff,
  existingEmails,
  saving,
  onSave,
  onClose,
}: {
  staff: StaffMember | null;
  existingEmails: string[];
  saving: boolean;
  onSave: (values: StaffFormValues) => void;
  onClose: () => void;
}) {
  const [values, setValues] = useState<StaffFormValues>({
    nombre: staff?.nombre ?? "",
    email: staff?.email ?? "",
    cargo: staff?.cargo ?? "",
    telefono: staff?.telefono ?? "",
    notas: staff?.notas ?? "",
    estado_laboral: staff?.estado_laboral ?? "activo",
    fecha_alta: staff?.fecha_alta ?? new Date().toISOString().slice(0, 10),
    fotoFile: null,
  });
  const [errors, setErrors] = useState<Partial<Record<keyof StaffFormValues, string>>>({});
  const nameRef = useRef<HTMLInputElement>(null);
  const isNew = staff === null;

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const update = <K extends keyof StaffFormValues>(field: K, value: StaffFormValues[K]) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const nombre = values.nombre.trim();
    const email = values.email.trim().toLowerCase();
    const telefono = values.telefono.trim();
    const nextErrors: typeof errors = {};

    if (!nombre) nextErrors.nombre = "Escribe el nombre del trabajador.";
    if (email) {
      if (!emailPattern.test(email)) {
        nextErrors.email = "Escribe un correo válido.";
      } else if (existingEmails.some((item) => item.trim().toLowerCase() === email)) {
        nextErrors.email = "Ya hay otra persona con este correo.";
      }
    }
    if (telefono && !phonePattern.test(telefono)) {
      nextErrors.telefono = "Escribe un teléfono válido.";
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    onSave({
      ...values,
      nombre,
      email,
      telefono,
      cargo: values.cargo.trim(),
      notas: values.notas.trim(),
    });
  };

  return (
    <Modal titleId="staff-editor-title" onClose={onClose}>
      <div className="modal-header">
        <div>
          <div className="detail-label">{isNew ? "Nueva ficha" : "Editar ficha"}</div>
          <h3 id="staff-editor-title">{isNew ? "Añadir trabajador" : staff.nombre}</h3>
        </div>
        <CloseButton label="Cerrar sin guardar" onClick={onClose} />
      </div>

      <form className="company-form" onSubmit={handleSubmit} noValidate>
        <FormField id="staff-nombre" label="Nombre" required error={errors.nombre}>
          <input
            ref={nameRef}
            id="staff-nombre"
            type="text"
            value={values.nombre}
            onChange={(event) => update("nombre", event.target.value)}
            placeholder="Ej.: Ana García"
            aria-required="true"
            className={errors.nombre ? "is-invalid" : ""}
            aria-invalid={Boolean(errors.nombre)}
            aria-describedby={errors.nombre ? "staff-nombre-error" : undefined}
          />
        </FormField>

        <div className="form-row">
          <FormField id="staff-cargo" label="Puesto">
            <input
              id="staff-cargo"
              type="text"
              value={values.cargo}
              onChange={(event) => update("cargo", event.target.value)}
              placeholder="Ej.: Desarrollador"
            />
          </FormField>
          <FormField id="staff-estado" label="Estado">
            <select
              id="staff-estado"
              value={values.estado_laboral}
              onChange={(event) => update("estado_laboral", event.target.value as EstadoLaboral)}
            >
              <option value="activo">{ESTADO_LABORAL_LABELS.activo}</option>
              <option value="baja">{ESTADO_LABORAL_LABELS.baja}</option>
            </select>
          </FormField>
        </div>

        <div className="form-row">
          <FormField id="staff-email" label="Email" error={errors.email}>
            <input
              id="staff-email"
              type="email"
              value={values.email}
              onChange={(event) => update("email", event.target.value)}
              placeholder="Ej.: ana@beavr.com"
              className={errors.email ? "is-invalid" : ""}
              aria-describedby={errors.email ? "staff-email-error" : undefined}
            />
          </FormField>
          <FormField id="staff-telefono" label="Teléfono" error={errors.telefono}>
            <input
              id="staff-telefono"
              type="tel"
              value={values.telefono}
              onChange={(event) => update("telefono", event.target.value)}
              placeholder="Ej.: 600 123 456"
              className={errors.telefono ? "is-invalid" : ""}
              aria-describedby={errors.telefono ? "staff-telefono-error" : undefined}
            />
          </FormField>
        </div>

        <div className="form-row">
          <FormField id="staff-alta" label="Fecha de alta">
            <input
              id="staff-alta"
              type="date"
              value={values.fecha_alta}
              onChange={(event) => update("fecha_alta", event.target.value)}
            />
          </FormField>
          <FormField
            id="staff-foto"
            label="Foto"
            help={
              staff?.foto_url && !values.fotoFile
                ? "Ya hay una foto subida. Elige otra para sustituirla."
                : "PNG, JPG o WEBP."
            }
          >
            <input
              id="staff-foto"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => update("fotoFile", event.target.files?.[0] ?? null)}
              aria-describedby="staff-foto-help"
            />
          </FormField>
        </div>

        <FormField id="staff-notas" label="Notas">
          <textarea
            id="staff-notas"
            rows={3}
            value={values.notas}
            onChange={(event) => update("notas", event.target.value)}
          />
        </FormField>

        {!isNew ? (
          <dl className="form-dates">
            <div>
              <dt>Creado</dt>
              <dd>{formatDate(staff.created_at)}</dd>
            </div>
            <div>
              <dt>Última modificación</dt>
              <dd>{formatDate(staff.updated_at)}</dd>
            </div>
          </dl>
        ) : null}

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Guardando..." : isNew ? "Crear ficha" : "Guardar cambios"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function AdmisionEditor({
  saving,
  onSave,
  onClose,
}: {
  saving: boolean;
  onSave: (values: AdmisionFormValues) => void;
  onClose: () => void;
}) {
  const [values, setValues] = useState<AdmisionFormValues>({
    nombre: "",
    email: "",
    telefono: "",
    puesto: "",
    notas: "",
    cvFile: null,
  });
  const [errors, setErrors] = useState<Partial<Record<keyof AdmisionFormValues, string>>>({});
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const update = <K extends keyof AdmisionFormValues>(field: K, value: AdmisionFormValues[K]) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const nombre = values.nombre.trim();
    const email = values.email.trim().toLowerCase();
    const nextErrors: typeof errors = {};
    if (!nombre) nextErrors.nombre = "Escribe el nombre del candidato.";
    if (email && !emailPattern.test(email)) nextErrors.email = "Escribe un correo válido.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    onSave({
      ...values,
      nombre,
      email,
      telefono: values.telefono.trim(),
      puesto: values.puesto.trim(),
      notas: values.notas.trim(),
    });
  };

  return (
    <Modal titleId="admision-editor-title" onClose={onClose}>
      <div className="modal-header">
        <div>
          <div className="detail-label">Admisión</div>
          <h3 id="admision-editor-title">Nuevo proceso de admisión</h3>
        </div>
        <CloseButton label="Cerrar sin guardar" onClick={onClose} />
      </div>

      <form className="company-form" onSubmit={handleSubmit} noValidate>
        <FormField id="admision-nombre" label="Nombre" required error={errors.nombre}>
          <input
            ref={nameRef}
            id="admision-nombre"
            type="text"
            value={values.nombre}
            onChange={(event) => update("nombre", event.target.value)}
            placeholder="Ej.: Ana García"
            aria-required="true"
            className={errors.nombre ? "is-invalid" : ""}
            aria-describedby={errors.nombre ? "admision-nombre-error" : undefined}
          />
        </FormField>

        <div className="form-row">
          <FormField id="admision-puesto" label="Puesto solicitado">
            <input
              id="admision-puesto"
              type="text"
              value={values.puesto}
              onChange={(event) => update("puesto", event.target.value)}
              placeholder="Ej.: Desarrollador"
            />
          </FormField>
          <FormField id="admision-email" label="Email" error={errors.email}>
            <input
              id="admision-email"
              type="email"
              value={values.email}
              onChange={(event) => update("email", event.target.value)}
              placeholder="Ej.: ana@email.com"
              className={errors.email ? "is-invalid" : ""}
              aria-describedby={errors.email ? "admision-email-error" : undefined}
            />
          </FormField>
        </div>

        <div className="form-row">
          <FormField id="admision-telefono" label="Teléfono">
            <input
              id="admision-telefono"
              type="tel"
              value={values.telefono}
              onChange={(event) => update("telefono", event.target.value)}
              placeholder="Ej.: 600 123 456"
            />
          </FormField>
          <FormField id="admision-cv" label="CV" help="PDF o imagen.">
            <input
              id="admision-cv"
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp"
              onChange={(event) => update("cvFile", event.target.files?.[0] ?? null)}
              aria-describedby="admision-cv-help"
            />
          </FormField>
        </div>

        <FormField id="admision-notas" label="Notas">
          <textarea
            id="admision-notas"
            rows={3}
            value={values.notas}
            onChange={(event) => update("notas", event.target.value)}
          />
        </FormField>

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Guardando..." : "Crear admisión"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function HireAdmisionDialog({
  admision,
  hiring,
  onConfirm,
  onClose,
}: {
  admision: Admision;
  hiring: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal titleId="hire-admision-title" onClose={onClose}>
      <div className="modal-header">
        <div>
          <div className="detail-label">Contratar</div>
          <h3 id="hire-admision-title">¿Contratar a «{admision.nombre}»?</h3>
        </div>
        <CloseButton label="Cancelar" onClick={onClose} />
      </div>
      <p className="modal-text">
        Se creará la ficha del trabajador con el correo indicado, se marcará la admisión como contratada y se
        generará el checklist de inicio (portátil, correo, accesos…).
      </p>
      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose} disabled={hiring}>
          Cancelar
        </button>
        <button type="button" className="btn btn-primary" onClick={onConfirm} disabled={hiring}>
          {hiring ? "Contratando..." : "Sí, contratar"}
        </button>
      </div>
    </Modal>
  );
}

export function DeleteConfirmDialog({
  titleId = "rrhh-delete-title",
  label,
  heading,
  detail,
  confirmLabel,
  busyLabel = "Eliminando...",
  deleting,
  onConfirm,
  onClose,
}: {
  titleId?: string;
  label?: string;
  heading: string;
  detail?: string;
  confirmLabel: string;
  busyLabel?: string;
  deleting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal titleId={titleId} onClose={() => !deleting && onClose()}>
      <div className="modal-header">
        <div>
          <div className="detail-label">{label ?? "Eliminar"}</div>
          <h3 id={titleId}>{heading}</h3>
        </div>
        <CloseButton label="Cancelar" onClick={() => !deleting && onClose()} />
      </div>

      <div className="modal-warning" role="alert">
        Esta acción <strong>no se puede deshacer</strong>.
      </div>

      {detail ? <p className="modal-text">{detail}</p> : null}

      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose} disabled={deleting} autoFocus>
          Cancelar
        </button>
        <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={deleting}>
          {deleting ? busyLabel : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

/** Toolbar de borrado tipo galería: Entrar → Cancelar / Eliminar seleccionados */
export function SectionDeleteActions({
  selectMode,
  selectedCount,
  disabled,
  canEnter = true,
  onEnterSelect,
  onCancel,
  onRequestDelete,
  enterLabel = "Eliminar seleccionados",
}: {
  selectMode: boolean;
  selectedCount: number;
  disabled?: boolean;
  canEnter?: boolean;
  onEnterSelect: () => void;
  onCancel: () => void;
  onRequestDelete: () => void;
  enterLabel?: string;
}) {
  if (selectMode) {
    return (
      <>
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={disabled}>
          Cancelar
        </button>
        <button
          type="button"
          className="btn btn-danger"
          onClick={onRequestDelete}
          disabled={disabled || selectedCount === 0}
        >
          {selectedCount > 0 ? `Eliminar seleccionados (${selectedCount})` : "Eliminar seleccionados"}
        </button>
      </>
    );
  }

  return (
    <button
      type="button"
      className="btn btn-danger-soft"
      onClick={onEnterSelect}
      disabled={disabled || !canEnter}
    >
      {enterLabel}
    </button>
  );
}

export function VacacionDialog({
  personaId,
  personaNombre,
  saving,
  onSave,
  onClose,
}: {
  personaId?: string;
  personaNombre?: string;
  saving: boolean;
  onSave: (values: { fecha_inicio: string; fecha_fin: string; motivo: string }) => void;
  onClose: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [fechaInicio, setFechaInicio] = useState(today);
  const [fechaFin, setFechaFin] = useState(today);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleInicioChange = (value: string) => {
    setFechaInicio(value);
    setError(null);
    setFechaFin((current) => (current < value ? value : current));
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!fechaInicio || !fechaFin) {
      setError("Indica las fechas.");
      return;
    }
    if (fechaFin < fechaInicio) {
      setError("La fecha de fin no puede ser anterior al inicio.");
      return;
    }
    onSave({ fecha_inicio: fechaInicio, fecha_fin: fechaFin, motivo: motivo.trim() });
  };

  return (
    <Modal titleId="vacacion-dialog-title" onClose={onClose}>
      <div className="modal-header">
        <div>
          <div className="detail-label">
            {personaNombre ? (
              <>
                Vacaciones ·{" "}
                {personaId ? (
                  <StaffNameLink id={personaId}>{personaNombre}</StaffNameLink>
                ) : (
                  personaNombre
                )}
              </>
            ) : (
              "Vacaciones"
            )}
          </div>
          <h2 id="vacacion-dialog-title">
            {personaNombre ? "Añadir vacaciones" : "Solicitar vacaciones"}
          </h2>
        </div>
        <CloseButton label="Cerrar" onClick={onClose} />
      </div>
      <form className="company-form" onSubmit={handleSubmit}>
        <div className="form-row">
          <FormField id="vac-inicio" label="Desde" required>
            <input
              id="vac-inicio"
              type="date"
              value={fechaInicio}
              onChange={(e) => handleInicioChange(e.target.value)}
              aria-required="true"
            />
          </FormField>
          <FormField id="vac-fin" label="Hasta" required>
            <input
              id="vac-fin"
              type="date"
              min={fechaInicio}
              value={fechaFin}
              onChange={(e) => {
                setFechaFin(e.target.value);
                setError(null);
              }}
              aria-required="true"
            />
          </FormField>
        </div>
        <FormField id="vac-motivo" label="Motivo" help="Opcional.">
          <textarea
            id="vac-motivo"
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej.: Vacaciones de verano…"
          />
        </FormField>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Guardando…" : personaNombre ? "Guardar vacaciones" : "Solicitar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function EvaluacionDialog({
  defaultPeriodo,
  saving,
  onSave,
  onClose,
}: {
  defaultPeriodo: string;
  saving: boolean;
  onSave: (values: { periodo: string; nota: number; comentario: string }) => void;
  onClose: () => void;
}) {
  const [periodo, setPeriodo] = useState(defaultPeriodo);
  const [nota, setNota] = useState(3);
  const [comentario, setComentario] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!periodo.trim()) {
      setError("Indica el periodo (p. ej. T1 2026).");
      return;
    }
    onSave({ periodo: periodo.trim(), nota, comentario: comentario.trim() });
  };

  return (
    <Modal titleId="eval-dialog-title" onClose={onClose}>
      <div className="modal-header">
        <div>
          <div className="detail-label">Evaluación</div>
          <h3 id="eval-dialog-title">Nueva evaluación trimestral</h3>
        </div>
        <CloseButton label="Cerrar" onClick={onClose} />
      </div>
      <form className="company-form" onSubmit={handleSubmit}>
        <div className="form-row">
          <FormField
            id="eval-periodo"
            label="Periodo"
            required
            error={error}
            help={error ? undefined : "Ejemplo: T1 2026."}
          >
            <input
              id="eval-periodo"
              type="text"
              value={periodo}
              onChange={(e) => {
                setPeriodo(e.target.value);
                setError(null);
              }}
              placeholder="Ej.: T1 2026"
              aria-required="true"
              aria-describedby={error ? "eval-periodo-error" : "eval-periodo-help"}
            />
          </FormField>
          <FormField id="eval-nota" label="Nota" help="De 1 a 5.">
            <select id="eval-nota" value={nota} onChange={(e) => setNota(Number(e.target.value))}>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </FormField>
        </div>
        <FormField id="eval-comentario" label="Comentario">
          <textarea
            id="eval-comentario"
            rows={4}
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
          />
        </FormField>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Guardando..." : "Guardar evaluación"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function NominaUploadDialog({
  saving,
  onSave,
  onClose,
}: {
  saving: boolean;
  onSave: (values: { periodo: string; file: File }) => void;
  onClose: () => void;
}) {
  const [periodo, setPeriodo] = useState(() => {
    const now = new Date();
    return `${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
  });
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!periodo.trim()) {
      setError("Indica el periodo de la nómina.");
      return;
    }
    if (!file) {
      setError("Sube el PDF de la nómina.");
      return;
    }
    onSave({ periodo: periodo.trim(), file });
  };

  return (
    <Modal titleId="nomina-dialog-title" onClose={onClose}>
      <div className="modal-header">
        <div>
          <div className="detail-label">Nómina</div>
          <h3 id="nomina-dialog-title">Subir nómina PDF</h3>
        </div>
        <CloseButton label="Cerrar" onClick={onClose} />
      </div>
      <form className="company-form" onSubmit={handleSubmit}>
        <FormField
          id="nomina-periodo"
          label="Periodo"
          required
          help="Formato mes/año."
        >
          <input
            id="nomina-periodo"
            type="text"
            value={periodo}
            onChange={(e) => {
              setPeriodo(e.target.value);
              setError(null);
            }}
            placeholder="Ej.: 10/2026"
            aria-required="true"
            aria-describedby="nomina-periodo-help"
          />
        </FormField>
        <FormField id="nomina-file" label="Archivo PDF" required help="Solo PDF.">
          <input
            id="nomina-file"
            type="file"
            accept="application/pdf"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setError(null);
            }}
            aria-required="true"
            aria-describedby="nomina-file-help"
          />
        </FormField>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Subiendo..." : "Subir nómina"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

const SIGN_CANVAS_W = 560;
const SIGN_CANVAS_H = 200;

export function NominaSignDialog({
  periodo,
  saving,
  onConfirm,
  onClose,
}: {
  periodo: string;
  saving: boolean;
  onConfirm: (signaturePng: Blob) => void;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const hasInkRef = useRef(false);
  const [hasInk, setHasInk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#1a2332";
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  const pointerPos = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  };

  const startDraw = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (saving) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    const { x, y } = pointerPos(event);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || saving) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    event.preventDefault();
    const { x, y } = pointerPos(event);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hasInkRef.current) {
      hasInkRef.current = true;
      setHasInk(true);
      setError(null);
    }
  };

  const endDraw = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    try {
      canvasRef.current?.releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#1a2332";
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    hasInkRef.current = false;
    setHasInk(false);
    setError(null);
  };

  const handleConfirm = () => {
    if (!hasInkRef.current) {
      setError("Dibuja tu firma en el recuadro antes de confirmar.");
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError("No se ha podido generar la imagen de la firma.");
          return;
        }
        onConfirm(blob);
      },
      "image/png",
    );
  };

  return (
    <Modal titleId="nomina-sign-title" onClose={onClose}>
      <div className="modal-header">
        <div>
          <div className="detail-label">Nómina · {periodo}</div>
          <h3 id="nomina-sign-title">Firmar nómina</h3>
        </div>
        <CloseButton label="Cerrar" onClick={onClose} />
      </div>
      <p className="modal-text">
        Dibuja tu firma en el recuadro. Se incrustará en el apartado «Firma del trabajador» del PDF.
      </p>
      <div className="form-field">
        <label htmlFor="nomina-sign-canvas">Firma manuscrita</label>
        <canvas
          id="nomina-sign-canvas"
          ref={canvasRef}
          className="nomina-sign-canvas"
          width={SIGN_CANVAS_W}
          height={SIGN_CANVAS_H}
          onPointerDown={startDraw}
          onPointerMove={draw}
          onPointerUp={endDraw}
          onPointerCancel={endDraw}
          onPointerLeave={endDraw}
          aria-describedby="nomina-sign-help"
        />
        <p id="nomina-sign-help" className="form-help">
          Usa el ratón o el dedo para firmar. Puedes borrar y volver a empezar.
        </p>
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="modal-actions nomina-sign-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
          Cancelar
        </button>
        <button type="button" className="btn btn-soft" onClick={clearCanvas} disabled={saving || !hasInk}>
          Limpiar
        </button>
        <button type="button" className="btn btn-primary" onClick={handleConfirm} disabled={saving}>
          {saving ? "Firmando..." : "Confirmar firma"}
        </button>
      </div>
    </Modal>
  );
}

function toDatetimeLocalValue(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromDatetimeLocalValue(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export type FichajeFormValues = {
  entrada_en: string;
  salida_en: string | null;
  notas: string;
};

/** Alta manual de fichaje (RRHH · lista de fichajes). */
export function FichajeDialog({
  personaId,
  personaNombre,
  saving,
  onSave,
  onClose,
}: {
  personaId?: string;
  personaNombre: string;
  saving: boolean;
  onSave: (values: FichajeFormValues) => void;
  onClose: () => void;
}) {
  const [entrada, setEntrada] = useState(toDatetimeLocalValue());
  const [salida, setSalida] = useState("");
  const [notas, setNotas] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const entradaDate = fromDatetimeLocalValue(entrada);
    if (!entradaDate) {
      setError("Indica una fecha y hora de entrada válidas.");
      return;
    }
    let salidaIso: string | null = null;
    if (salida) {
      const salidaDate = fromDatetimeLocalValue(salida);
      if (!salidaDate) {
        setError("La fecha y hora de salida no son válidas.");
        return;
      }
      if (salidaDate.getTime() < entradaDate.getTime()) {
        setError("La salida no puede ser anterior a la entrada.");
        return;
      }
      salidaIso = salidaDate.toISOString();
    }
    onSave({
      entrada_en: entradaDate.toISOString(),
      salida_en: salidaIso,
      notas: notas.trim(),
    });
  };

  return (
    <Modal titleId="fichaje-dialog-title" onClose={onClose}>
      <div className="modal-header">
        <div>
          <div className="detail-label">
            Fichaje ·{" "}
            {personaId ? <StaffNameLink id={personaId}>{personaNombre}</StaffNameLink> : personaNombre}
          </div>
          <h2 id="fichaje-dialog-title">Añadir fichaje</h2>
        </div>
        <CloseButton label="Cerrar" onClick={onClose} />
      </div>
      <form className="company-form" onSubmit={handleSubmit}>
        <FormField id="fichaje-entrada" label="Entrada" required help="Fecha y hora de inicio de la jornada.">
          <input
            id="fichaje-entrada"
            type="datetime-local"
            value={entrada}
            onChange={(event) => {
              setEntrada(event.target.value);
              setError(null);
            }}
            required
          />
        </FormField>
        <FormField
          id="fichaje-salida"
          label="Salida"
          help="Déjalo vacío si la jornada sigue en curso."
        >
          <input
            id="fichaje-salida"
            type="datetime-local"
            value={salida}
            min={entrada || undefined}
            onChange={(event) => {
              setSalida(event.target.value);
              setError(null);
            }}
          />
        </FormField>
        <FormField id="fichaje-notas" label="Notas" help="Opcional.">
          <textarea
            id="fichaje-notas"
            rows={3}
            value={notas}
            onChange={(event) => setNotas(event.target.value)}
            placeholder="Ej.: Teletrabajo, visita a cliente…"
          />
        </FormField>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Guardando…" : "Guardar fichaje"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Cerrar un fichaje en curso indicando fecha/hora de salida. */
export function TerminarFichajeDialog({
  personaId,
  personaNombre,
  entradaEn,
  saving,
  onSave,
  onClose,
}: {
  personaId?: string;
  personaNombre: string;
  entradaEn: string;
  saving: boolean;
  onSave: (salidaEn: string) => void;
  onClose: () => void;
}) {
  const entradaDate = new Date(entradaEn);
  const defaultSalida = (() => {
    const now = new Date();
    if (!Number.isNaN(entradaDate.getTime()) && now.getTime() < entradaDate.getTime()) {
      return toDatetimeLocalValue(entradaDate);
    }
    return toDatetimeLocalValue(now);
  })();
  const [salida, setSalida] = useState(defaultSalida);
  const [error, setError] = useState<string | null>(null);
  const entradaMin = Number.isNaN(entradaDate.getTime()) ? undefined : toDatetimeLocalValue(entradaDate);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const salidaDate = fromDatetimeLocalValue(salida);
    if (!salidaDate) {
      setError("Indica una fecha y hora de salida válidas.");
      return;
    }
    if (!Number.isNaN(entradaDate.getTime()) && salidaDate.getTime() < entradaDate.getTime()) {
      setError("La salida no puede ser anterior a la entrada.");
      return;
    }
    onSave(salidaDate.toISOString());
  };

  return (
    <Modal titleId="terminar-fichaje-title" onClose={onClose}>
      <div className="modal-header">
        <div>
          <div className="detail-label">
            Fichaje ·{" "}
            {personaId ? <StaffNameLink id={personaId}>{personaNombre}</StaffNameLink> : personaNombre}
          </div>
          <h2 id="terminar-fichaje-title">Terminar fichaje</h2>
        </div>
        <CloseButton label="Cerrar" onClick={onClose} />
      </div>
      <form className="company-form" onSubmit={handleSubmit}>
        <p className="modal-text">
          Este fichaje está en curso desde{" "}
          <strong>
            {Number.isNaN(entradaDate.getTime())
              ? entradaEn
              : entradaDate.toLocaleString("es-ES", {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
          </strong>
          . Indica cuándo finaliza la jornada.
        </p>
        <FormField id="terminar-fichaje-salida" label="Salida" required>
          <input
            id="terminar-fichaje-salida"
            type="datetime-local"
            value={salida}
            min={entradaMin}
            onChange={(event) => {
              setSalida(event.target.value);
              setError(null);
            }}
            required
          />
        </FormField>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Guardando…" : "Terminar fichaje"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
