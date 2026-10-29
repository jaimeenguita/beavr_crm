"use client";

import { useState, type FormEvent } from "react";
import { FormField } from "@/components/FormField";
import { CloseButton, Modal } from "@/components/Modal";
import {
  addDays,
  DEFAULT_DUE_DAYS,
  invoiceTotal,
  IVA_OPTIONS,
  IVA_PCT,
  toIsoDate,
  type Invoice,
  type IvaPct,
  type Sale,
} from "@/lib/crm/facturas";
import { createDraftFromSale, issueDraft, updateDraft } from "@/lib/crm/invoiceActions";
import { formatPrice } from "@/lib/crm/money";

type FieldErrors = Partial<Record<"venta" | "fecha_emision" | "fecha_vencimiento", string>>;

function saleLabel({ opportunity }: Sale) {
  return `${opportunity.empresa} · ${opportunity.proyecto || "Sin proyecto"} · ${formatPrice(opportunity.precio) ?? "—"}`;
}

/**
 * Create mode: `sales` are the selectable ones (with price, no live invoice); pass one to preselect it.
 * Edit mode: `sales` must contain the draft's sale, so its base is refreshed from the current price.
 */
export function InvoiceDialog({
  mode,
  sales: initialSales,
  invoice,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  sales: Sale[];
  invoice?: Invoice;
  onClose: () => void;
  onSaved: (text: string) => void;
}) {
  // Frozen at open: a refetch after inserting the draft would drop its sale from the selectable list.
  const [sales] = useState(initialSales);
  const [opportunityId, setOpportunityId] = useState(
    invoice?.oportunidad_id ?? (sales.length === 1 ? sales[0].opportunity.id : ""),
  );
  const [emision, setEmision] = useState(invoice?.fecha_emision ?? toIsoDate(new Date()));
  const [vencimiento, setVencimiento] = useState(
    invoice?.fecha_vencimiento ?? addDays(emision, DEFAULT_DUE_DAYS),
  );
  const [dueTouched, setDueTouched] = useState(mode === "edit");
  // The stored rate is always one of IVA_OPTIONS (database check).
  const [ivaPct, setIvaPct] = useState<IvaPct>((invoice?.iva_pct as IvaPct | undefined) ?? IVA_PCT);
  // Id of the draft once inserted, so a failed issue can be retried without inserting twice.
  const [draftId, setDraftId] = useState<string | null>(invoice?.id ?? null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const sale = sales.find((candidate) => candidate.opportunity.id === opportunityId) ?? null;
  const opportunity = sale?.opportunity ?? null;
  const base = opportunity?.precio ?? invoice?.base ?? null;

  const changeEmision = (value: string) => {
    setEmision(value);
    if (!dueTouched && value) setVencimiento(addDays(value, DEFAULT_DUE_DAYS));
    setErrors((current) => ({ ...current, fecha_emision: undefined, fecha_vencimiento: undefined }));
  };

  const save = async (issue: boolean) => {
    const nextErrors: FieldErrors = {};
    if (!opportunity || base === null) nextErrors.venta = "Elige una venta.";
    if (!emision) nextErrors.fecha_emision = "Elige la fecha de emisión.";
    else if (issue && emision < toIsoDate(new Date())) {
      nextErrors.fecha_emision = "La fecha de emisión no puede ser anterior a hoy.";
    }
    if (!vencimiento) nextErrors.fecha_vencimiento = "Elige la fecha de vencimiento.";
    else if (emision && vencimiento < emision) {
      nextErrors.fecha_vencimiento = "El vencimiento no puede ser anterior a la emisión.";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length || !sale || base === null) return;

    setSaving(true);
    setSaveError(null);

    const dates = { fecha_emision: emision, fecha_vencimiento: vencimiento };
    let id = draftId;

    if (!id) {
      const created = await createDraftFromSale(sale, dates, ivaPct);
      if (created.error || !created.id) {
        setSaving(false);
        setSaveError(created.error);
        return;
      }
      id = created.id;
      setDraftId(id);
      if (!issue) {
        setSaving(false);
        onSaved("Borrador guardado.");
        return;
      }
    }

    const { error, numero } = issue
      ? await issueDraft({ id, ...dates, iva_pct: ivaPct }, base, new Date())
      : await updateDraft(id, { ...dates, base, iva_pct: ivaPct });
    setSaving(false);
    if (error) {
      setSaveError(error);
      return;
    }
    onSaved(issue ? `Factura ${numero} emitida.` : "Borrador guardado.");
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void save(false);
  };

  const close = () => {
    if (!saving) onClose();
  };

  const title = mode === "create" ? "Nueva factura" : "Editar borrador";
  const noSales = mode === "create" && sales.length === 0;

  return (
    <Modal titleId="invoice-dialog-title" onClose={close}>
      <div className="modal-header">
        <div>
          <div className="detail-label">Facturas</div>
          <h3 id="invoice-dialog-title">{title}</h3>
        </div>
        <CloseButton label="Cerrar sin guardar" onClick={close} />
      </div>

      <form className="company-form" onSubmit={handleSubmit} noValidate>
        {noSales ? (
          <p className="modal-text">No hay ventas sin facturar.</p>
        ) : mode === "create" ? (
          <FormField id="invoice-venta" label="Venta" required error={errors.venta}>
            <select
              id="invoice-venta"
              value={opportunityId}
              onChange={(event) => {
                setOpportunityId(event.target.value);
                setErrors((current) => ({ ...current, venta: undefined }));
              }}
              className={errors.venta ? "is-invalid" : ""}
            >
              <option value="">Elige una venta</option>
              {sales.map((sale) => (
                <option key={sale.opportunity.id} value={sale.opportunity.id}>
                  {saleLabel(sale)}
                </option>
              ))}
            </select>
          </FormField>
        ) : opportunity ? (
          <p className="modal-text">{saleLabel({ opportunity, invoice: invoice ?? null })}</p>
        ) : null}

        <div className="form-row">
          <FormField id="invoice-emision" label="Fecha de emisión" required error={errors.fecha_emision}>
            <input
              id="invoice-emision"
              type="date"
              value={emision}
              onChange={(event) => changeEmision(event.target.value)}
              className={errors.fecha_emision ? "is-invalid" : ""}
            />
          </FormField>
          <FormField
            id="invoice-vencimiento"
            label="Vencimiento"
            required
            error={errors.fecha_vencimiento}
            help={`Por defecto, ${DEFAULT_DUE_DAYS} días después de la emisión`}
          >
            <input
              id="invoice-vencimiento"
              type="date"
              value={vencimiento}
              min={emision || undefined}
              onChange={(event) => {
                setVencimiento(event.target.value);
                setDueTouched(true);
                setErrors((current) => ({ ...current, fecha_vencimiento: undefined }));
              }}
              className={errors.fecha_vencimiento ? "is-invalid" : ""}
            />
          </FormField>
        </div>

        <FormField id="invoice-iva" label="IVA" required>
          <select
            id="invoice-iva"
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

        <dl className="detail-facts" aria-label="Importes de la factura">
          <div>
            <dt>Base imponible</dt>
            <dd>{formatPrice(base) ?? "—"}</dd>
          </div>
          <div>
            <dt>IVA {ivaPct} %</dt>
            <dd>{base === null ? "—" : formatPrice(invoiceTotal({ base, iva_pct: ivaPct }) - base)}</dd>
          </div>
          <div>
            <dt>Total</dt>
            <dd>
              <strong>{base === null ? "—" : formatPrice(invoiceTotal({ base, iva_pct: ivaPct }))}</strong>
            </dd>
          </div>
        </dl>

        {saveError ? (
          <p className="form-error" role="alert">
            {saveError}
          </p>
        ) : null}

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={close} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" className="btn" disabled={saving || noSales}>
            Guardar borrador
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void save(true)} disabled={saving || noSales}>
            {saving ? "Guardando..." : "Emitir factura"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
