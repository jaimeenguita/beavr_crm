"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useAuth } from "@/components/AuthProvider";
import type { Company } from "@/components/CompanyDialogs";
import { FormField } from "@/components/FormField";
import { CloseButton, Modal } from "@/components/Modal";
import {
  addDays,
  DEFAULT_DUE_DAYS,
  invoiceTotal,
  IVA_OPTIONS,
  IVA_PCT,
  type IvaPct,
} from "@/lib/crm/facturas";
import { createPhotoInvoice } from "@/lib/crm/invoiceActions";
import {
  matchClients,
  normalizeNif,
  prefillAmounts,
  totalMismatch,
  type InvoiceExtraction,
} from "@/lib/crm/invoiceExtraction";
import { removeInvoicePhoto, uploadInvoicePhoto } from "@/lib/crm/invoicePhotos";
import { formatPrice, parsePriceInput } from "@/lib/crm/money";
import { validatePhotoFile } from "@/lib/crm/rrhhStorage";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const supabase = createSupabaseBrowserClient();

const NEW_CLIENT = "nuevo";
const OTHER_CLIENT = "otro";
const UNREAD_HELP = "No se ha podido leer; revísalo.";
const READ_ERROR = "No se ha podido leer la factura. Inténtalo de nuevo o rellénala a mano.";

const EMPTY_EXTRACTION: InvoiceExtraction = {
  cliente_nombre: null,
  cliente_nif: null,
  numero: null,
  fecha_emision: null,
  fecha_vencimiento: null,
  base: null,
  iva_pct: null,
  total: null,
};

type Step = "upload" | "client" | "form";
type FieldErrors = Partial<
  Record<"foto" | "cliente" | "nombre" | "numero" | "fecha_emision" | "fecha_vencimiento" | "base", string>
>;

function amountText(value: number | null) {
  return value === null ? "" : String(value).replace(".", ",");
}

export function PhotoInvoiceDialog({
  companies,
  onClose,
  onSaved,
  onChanged,
}: {
  companies: Company[];
  onClose: () => void;
  onSaved: (text: string) => void;
  onChanged: () => Promise<void>;
}) {
  const { session } = useAuth();
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  // Null until the photo is read, or when the user fills the invoice by hand (nothing is marked as unread).
  const [extraction, setExtraction] = useState<InvoiceExtraction | null>(null);
  const [choice, setChoice] = useState("");
  // "Otro cliente": the read client matched someone, but the user picks another existing client from the full list.
  const [otherClient, setOtherClient] = useState(false);
  const [newName, setNewName] = useState("");
  const [newNif, setNewNif] = useState("");
  // Id of the client created by a failed save: later saves update it instead of creating another one.
  const [newClientId, setNewClientId] = useState<string | null>(null);
  const [numero, setNumero] = useState("");
  const [emision, setEmision] = useState("");
  const [vencimiento, setVencimiento] = useState("");
  const [dueTouched, setDueTouched] = useState(false);
  const [baseText, setBaseText] = useState("");
  const [ivaPct, setIvaPct] = useState<IvaPct>(IVA_PCT);
  const [pagada, setPagada] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const shownStep = useRef(step);

  // Revokes the previous preview when the photo changes, and the last one when the dialog closes.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // Each step replaces the form content, so focus moves to its first field instead of getting lost.
  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    formRef.current?.querySelector<HTMLElement>("input:not([readonly]), select")?.focus();
  }, [step]);

  const read = extraction ?? EMPTY_EXTRACTION;
  const matches = useMemo(() => matchClients(read, companies), [read, companies]);
  const clientName =
    choice === NEW_CLIENT ? newName.trim() : (companies.find((company) => company.id === choice)?.nombre ?? "");
  const base = parsePriceInput(baseText);
  const validBase = base !== null && !Number.isNaN(base) ? base : null;
  const mismatch = validBase !== null && totalMismatch(validBase, ivaPct, read.total);
  const total = validBase === null ? null : invoiceTotal({ base: validBase, iva_pct: ivaPct });
  const busy = reading || saving;

  // Marks the fields the photo did not fill while they are still empty.
  const unreadHelp = (value: string) => (extraction && !value ? UNREAD_HELP : undefined);
  const clearError = (field: keyof FieldErrors) => setErrors((current) => ({ ...current, [field]: undefined }));

  const pickFile = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0] ?? null;
    const invalid = picked ? validatePhotoFile(picked) : null;
    setFormError(null);
    setErrors((current) => ({ ...current, foto: invalid ?? undefined }));
    if (invalid) event.target.value = "";
    const accepted = invalid ? null : picked;
    setFile(accepted);
    setPreviewUrl(accepted ? URL.createObjectURL(accepted) : null);
  };

  // Prefills the client and the form from what was read (or leaves them empty) and moves to the client step.
  const startWith = (next: InvoiceExtraction | null) => {
    const values = next ?? EMPTY_EXTRACTION;
    const amounts = prefillAmounts(values);
    const exact = matchClients(values, companies).find((match) => match.exactNif);
    setExtraction(next);
    setChoice(exact?.id ?? "");
    setOtherClient(false);
    setNewName(values.cliente_nombre ?? "");
    setNewNif(normalizeNif(values.cliente_nif) ?? "");
    setNumero(values.numero ?? "");
    setEmision(values.fecha_emision ?? "");
    setVencimiento(
      values.fecha_vencimiento ?? (values.fecha_emision ? addDays(values.fecha_emision, DEFAULT_DUE_DAYS) : ""),
    );
    setDueTouched(values.fecha_vencimiento !== null);
    setBaseText(amountText(amounts.base));
    setIvaPct(amounts.iva_pct);
    setPagada(false);
    setErrors({});
    setFormError(null);
    setStep("client");
  };

  const requireFile = () => {
    if (file) return true;
    setErrors((current) => ({ ...current, foto: "Elige la foto de la factura." }));
    return false;
  };

  const readInvoice = async () => {
    if (!requireFile() || !file) return;
    if (!session?.access_token) {
      setFormError("Tu sesión ha caducado. Vuelve a iniciar sesión.");
      return;
    }
    setReading(true);
    setFormError(null);
    try {
      const body = new FormData();
      body.append("image", file);
      const response = await fetch("/api/agente/factura-foto", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body,
      });
      const data = (await response.json().catch(() => null)) as {
        extraction?: InvoiceExtraction;
        error?: string;
      } | null;
      if (!response.ok || !data?.extraction) {
        setFormError(data?.error ?? READ_ERROR);
        return;
      }
      startWith(data.extraction);
    } catch {
      setFormError(READ_ERROR);
    } finally {
      setReading(false);
    }
  };

  const fillByHand = () => {
    if (requireFile()) startWith(null);
  };

  const confirmClient = () => {
    const nextErrors: FieldErrors = {};
    const name = newName.trim();
    if (!choice) nextErrors.cliente = "Elige un cliente.";
    else if (choice === NEW_CLIENT) {
      if (!name) nextErrors.nombre = "Escribe el nombre del cliente.";
      else if (
        companies.some(
          (company) => company.id !== newClientId && company.nombre.trim().toLowerCase() === name.toLowerCase(),
        )
      ) {
        nextErrors.nombre = "Ya existe otra empresa con este nombre.";
      }
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setStep("form");
  };

  const changeEmision = (value: string) => {
    setEmision(value);
    if (!dueTouched && value) setVencimiento(addDays(value, DEFAULT_DUE_DAYS));
    setErrors((current) => ({ ...current, fecha_emision: undefined, fecha_vencimiento: undefined }));
  };

  // Returns the client id for "Cliente nuevo": the first save creates the empresa, a retry updates that same one
  // with the current name and NIF.
  const resolveClient = async () => {
    if (choice !== NEW_CLIENT) return choice;
    const values = { nombre: newName.trim(), nif: newNif.trim() || null };
    const request = newClientId
      ? supabase.from("empresas").update(values).eq("id", newClientId)
      : supabase.from("empresas").insert(values);
    const { data, error } = await request.select("id").single();
    if (error || !data) return null;
    const id = String(data.id);
    setNewClientId(id);
    void onChanged();
    return id;
  };

  const save = async () => {
    const number = numero.trim();
    const nextErrors: FieldErrors = {};
    if (!number) nextErrors.numero = "Escribe el número de la factura.";
    if (!emision) nextErrors.fecha_emision = "Elige la fecha de emisión.";
    if (!vencimiento) nextErrors.fecha_vencimiento = "Elige la fecha de vencimiento.";
    else if (emision && vencimiento < emision) {
      nextErrors.fecha_vencimiento = "El vencimiento no puede ser anterior a la emisión.";
    }
    if (base === null) nextErrors.base = "Escribe la base imponible.";
    else if (Number.isNaN(base)) nextErrors.base = "Escribe un importe válido, por ejemplo: 1250,50";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length || !file || validBase === null) return;

    setSaving(true);
    setFormError(null);
    try {
      const empresaId = await resolveClient();
      if (!empresaId) {
        setFormError("No se ha podido guardar el cliente. Inténtalo de nuevo.");
        return;
      }

      const id = crypto.randomUUID();
      let fotoPath: string;
      try {
        fotoPath = await uploadInvoicePhoto(id, file);
      } catch {
        setFormError("No se ha podido subir la foto. Inténtalo de nuevo.");
        return;
      }

      const { error, numero: saved, field } = await createPhotoInvoice({
        id,
        empresa_id: empresaId,
        numero: number,
        fecha_emision: emision,
        fecha_vencimiento: vencimiento,
        base: validBase,
        iva_pct: ivaPct,
        pagada,
        foto_path: fotoPath,
      });
      if (error) {
        await removeInvoicePhoto(fotoPath);
        if (field === "numero") {
          setErrors((current) => ({ ...current, numero: error }));
        } else {
          setFormError(error);
        }
        return;
      }
      onSaved(`Factura ${saved ?? number} guardada.`);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (step === "upload") void readInvoice();
    else if (step === "client") confirmClient();
    else void save();
  };

  const close = () => {
    if (!busy) onClose();
  };

  const formErrorBlock = formError ? (
    <p className="form-error" role="alert">
      {formError}
    </p>
  ) : null;

  return (
    <Modal titleId="photo-invoice-title" onClose={close}>
      <div className="modal-header">
        <div>
          <div className="detail-label">Facturas</div>
          <h3 id="photo-invoice-title">Factura desde foto</h3>
        </div>
        <CloseButton label="Cerrar sin guardar" onClick={close} />
      </div>

      <form ref={formRef} className="company-form" onSubmit={handleSubmit} noValidate aria-busy={busy}>
        {step === "upload" ? (
          <>
            <FormField
              id="photo-file"
              label="Foto de la factura"
              required
              error={errors.foto}
              help="Formatos: JPG, PNG o WEBP (máx. 10 MB). Las fotos HEIC del iPhone conviértelas antes a JPG."
            >
              <input
                id="photo-file"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={pickFile}
                disabled={reading}
              />
            </FormField>
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="Vista previa de la foto de la factura" className="invoice-photo-thumb" />
            ) : null}
            {formErrorBlock}
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={close} disabled={reading}>
                Cancelar
              </button>
              <button type="button" className="btn" onClick={fillByHand} disabled={reading}>
                Rellenar a mano
              </button>
              <button type="submit" className="btn btn-primary" disabled={reading}>
                {reading ? "Leyendo la factura..." : "Leer factura"}
              </button>
            </div>
          </>
        ) : step === "client" ? (
          <>
            {extraction ? (
              <dl className="detail-facts" aria-label="Cliente leído en la foto">
                <div>
                  <dt>Nombre leído</dt>
                  <dd>{extraction.cliente_nombre ?? "No se ha podido leer"}</dd>
                </div>
                <div>
                  <dt>NIF leído</dt>
                  <dd>{extraction.cliente_nif ?? "No se ha podido leer"}</dd>
                </div>
              </dl>
            ) : null}

            {matches.length ? (
              <fieldset
                className="invoice-photo-fieldset"
                aria-describedby={errors.cliente ? "photo-cliente-error" : undefined}
              >
                <legend>
                  Cliente<span className="form-required" aria-hidden="true"> *</span>
                  <span className="sr-only"> (obligatorio)</span>
                </legend>
                {[
                  ...matches,
                  { id: OTHER_CLIENT, nombre: "Otro cliente", nif: null },
                  { id: NEW_CLIENT, nombre: "Cliente nuevo", nif: null },
                ].map((option) => (
                  <label key={option.id} className="rrhh-check-item">
                    <input
                      type="radio"
                      name="photo-cliente"
                      value={option.id}
                      checked={option.id === OTHER_CLIENT ? otherClient : !otherClient && choice === option.id}
                      onChange={() => {
                        const other = option.id === OTHER_CLIENT;
                        setOtherClient(other);
                        setChoice(other ? "" : option.id);
                        clearError("cliente");
                      }}
                    />
                    <span>{option.nombre}</span>
                    {option.nif ? <em>NIF {option.nif}</em> : null}
                  </label>
                ))}
                {errors.cliente && !otherClient ? (
                  <p id="photo-cliente-error" className="form-error" role="alert">
                    {errors.cliente}
                  </p>
                ) : null}
              </fieldset>
            ) : null}

            {!matches.length || otherClient ? (
              <FormField id="photo-cliente-lista" label="Cliente" required error={errors.cliente}>
                <select
                  id="photo-cliente-lista"
                  value={choice}
                  onChange={(event) => {
                    setChoice(event.target.value);
                    clearError("cliente");
                  }}
                  className={errors.cliente ? "is-invalid" : ""}
                >
                  <option value="">Elige un cliente</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.nombre}
                    </option>
                  ))}
                  {otherClient ? null : <option value={NEW_CLIENT}>Cliente nuevo</option>}
                </select>
              </FormField>
            ) : null}

            {choice === NEW_CLIENT ? (
              <div className="form-row">
                <FormField id="photo-nuevo-nombre" label="Nombre del cliente" required error={errors.nombre}>
                  <input
                    id="photo-nuevo-nombre"
                    type="text"
                    value={newName}
                    onChange={(event) => {
                      setNewName(event.target.value);
                      clearError("nombre");
                    }}
                    placeholder="Ej.: Clínica Vega SL"
                    className={errors.nombre ? "is-invalid" : ""}
                  />
                </FormField>
                <FormField id="photo-nuevo-nif" label="NIF">
                  <input
                    id="photo-nuevo-nif"
                    type="text"
                    value={newNif}
                    onChange={(event) => setNewNif(event.target.value)}
                    placeholder="Ej.: B12345678"
                  />
                </FormField>
              </div>
            ) : null}

            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setStep("upload")}>
                Volver
              </button>
              <button type="submit" className="btn btn-primary">
                Continuar
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="form-field">
              <label htmlFor="photo-cliente-elegido">Cliente</label>
              <div className="invoice-photo-client">
                <input id="photo-cliente-elegido" type="text" value={clientName} readOnly />
                <button
                  type="button"
                  className="btn btn-compact"
                  onClick={() => setStep("client")}
                  disabled={saving}
                  aria-label="Cambiar cliente"
                >
                  Cambiar
                </button>
              </div>
            </div>

            <FormField
              id="photo-numero"
              label="Nº factura"
              required
              error={errors.numero}
              help={unreadHelp(numero)}
            >
              <input
                id="photo-numero"
                type="text"
                value={numero}
                onChange={(event) => {
                  setNumero(event.target.value);
                  clearError("numero");
                }}
                placeholder="Ej.: 2026/045"
                className={errors.numero ? "is-invalid" : ""}
              />
            </FormField>

            <div className="form-row">
              <FormField
                id="photo-emision"
                label="Fecha de emisión"
                required
                error={errors.fecha_emision}
                help={unreadHelp(emision)}
              >
                <input
                  id="photo-emision"
                  type="date"
                  value={emision}
                  onChange={(event) => changeEmision(event.target.value)}
                  className={errors.fecha_emision ? "is-invalid" : ""}
                />
              </FormField>
              <FormField
                id="photo-vencimiento"
                label="Vencimiento"
                required
                error={errors.fecha_vencimiento}
                help={
                  unreadHelp(vencimiento) ??
                  (dueTouched ? undefined : `Por defecto, ${DEFAULT_DUE_DAYS} días después de la emisión`)
                }
              >
                <input
                  id="photo-vencimiento"
                  type="date"
                  value={vencimiento}
                  min={emision || undefined}
                  onChange={(event) => {
                    setVencimiento(event.target.value);
                    setDueTouched(true);
                    clearError("fecha_vencimiento");
                  }}
                  className={errors.fecha_vencimiento ? "is-invalid" : ""}
                />
              </FormField>
            </div>

            <div className="form-row">
              <FormField
                id="photo-base"
                label="Base imponible"
                required
                error={errors.base}
                help={unreadHelp(baseText)}
              >
                <input
                  id="photo-base"
                  type="text"
                  inputMode="decimal"
                  value={baseText}
                  onChange={(event) => {
                    setBaseText(event.target.value);
                    clearError("base");
                  }}
                  placeholder="Ej.: 1250,50"
                  className={errors.base ? "is-invalid" : ""}
                />
              </FormField>
              <FormField id="photo-iva" label="IVA" required>
                <select
                  id="photo-iva"
                  value={ivaPct}
                  onChange={(event) => setIvaPct(Number(event.target.value) as IvaPct)}
                >
                  {IVA_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option} %
                    </option>
                  ))}
                </select>
              </FormField>
            </div>

            <FormField id="photo-total" label="Total">
              <input
                id="photo-total"
                type="text"
                value={formatPrice(total) ?? ""}
                readOnly
                aria-describedby={mismatch ? "photo-total-warning" : undefined}
              />
              {mismatch ? (
                <p id="photo-total-warning" className="form-error" role="status">
                  El total no coincide con el de la foto ({formatPrice(read.total)}).
                </p>
              ) : null}
            </FormField>

            <label className="rrhh-check-item">
              <input type="checkbox" checked={pagada} onChange={(event) => setPagada(event.target.checked)} />
              <span>Ya está pagada</span>
            </label>

            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="Foto de la factura" className="invoice-photo-thumb" />
            ) : null}

            {formErrorBlock}

            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={close} disabled={saving}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Guardando..." : "Guardar factura"}
              </button>
            </div>
          </>
        )}
      </form>
    </Modal>
  );
}
