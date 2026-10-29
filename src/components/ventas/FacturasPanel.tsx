"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Company } from "@/components/CompanyDialogs";
import { EmptyState } from "@/components/EmptyState";
import { DeleteConfirmDialog } from "@/components/rrhh/HrDialogs";
import { InvoiceStatusPill } from "@/components/ventas/InvoiceStatusPill";
import {
  INVOICE_STATUS_LABELS,
  invoiceStatus,
  invoiceSummary,
  invoiceTotal,
  type Invoice,
  type InvoiceStatus,
} from "@/lib/crm/facturas";
import { formatDateEs } from "@/lib/crm/format";
import {
  cancelInvoice,
  deleteDraft,
  issueDraft,
  markPaid as markInvoicePaid,
  type InvoiceActionResult,
} from "@/lib/crm/invoiceActions";
import { invoicePhotoUrl } from "@/lib/crm/invoicePhotos";
import type { MappedOpportunity } from "@/lib/crm/mapRows";
import { formatPrice } from "@/lib/crm/money";

const FILTERS: Array<"todas" | InvoiceStatus> = ["todas", "borrador", "pendiente", "vencida", "pagada", "anulada"];

type Notice = { type: "success" | "error"; text: string };
type Confirm = { kind: "delete" | "anular"; invoice: Invoice };

function invoicesLabel(count: number) {
  return count === 1 ? "1 factura" : `${count} facturas`;
}

export function FacturasPanel({
  invoices,
  opportunities,
  companies,
  highlightId,
  onNew,
  onNewFromPhoto,
  onEdit,
  onChanged,
  onNotice,
}: {
  invoices: Invoice[];
  opportunities: MappedOpportunity[];
  companies: Company[];
  highlightId: string | null;
  onNew: () => void;
  onNewFromPhoto: () => void;
  onEdit: (invoice: Invoice) => void;
  onChanged: () => Promise<void>;
  onNotice: (notice: Notice) => void;
}) {
  const [filter, setFilter] = useState<"todas" | InvoiceStatus>("todas");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const scrolledTo = useRef<string | null>(null);
  const today = useMemo(() => new Date(), []);

  const opportunityById = useMemo(
    () => new Map(opportunities.map((opportunity) => [opportunity.id, opportunity])),
    [opportunities],
  );
  const companyById = useMemo(() => new Map(companies.map((company) => [company.id, company])), [companies]);
  const opportunityOf = useCallback(
    (invoice: Invoice) => (invoice.oportunidad_id ? opportunityById.get(invoice.oportunidad_id) : undefined),
    [opportunityById],
  );
  // The client is the company frozen on the invoice (always set on photo invoices, which have no sale);
  // the opportunity's company is only a fallback, without link.
  const clientOf = useCallback(
    (invoice: Invoice) => {
      const company = invoice.empresa_id ? companyById.get(invoice.empresa_id) : undefined;
      return {
        id: company?.id ?? null,
        name: company?.nombre ?? opportunityOf(invoice)?.empresa ?? null,
      };
    },
    [companyById, opportunityOf],
  );
  const summary = useMemo(() => invoiceSummary(invoices, today), [invoices, today]);

  const rows = useMemo(
    () =>
      invoices
        .map((invoice) => ({
          invoice,
          status: invoiceStatus(invoice, today),
          client: clientOf(invoice),
        }))
        .sort(
          (a, b) =>
            b.invoice.fecha_emision.localeCompare(a.invoice.fecha_emision) ||
            (b.invoice.numero ?? "").localeCompare(a.invoice.numero ?? ""),
        ),
    [invoices, clientOf, today],
  );

  const counts = useMemo(() => {
    const result: Record<"todas" | InvoiceStatus, number> = {
      todas: rows.length,
      borrador: 0,
      pendiente: 0,
      vencida: 0,
      pagada: 0,
      anulada: 0,
    };
    for (const row of rows) result[row.status] += 1;
    return result;
  }, [rows]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter(
      (row) =>
        (filter === "todas" || row.status === filter) &&
        (!query || `${row.client.name ?? ""} ${row.invoice.numero ?? ""}`.toLowerCase().includes(query)),
    );
  }, [rows, filter, search]);

  // Scroll the invoice linked from Ventas into view once, when its row is rendered.
  useEffect(() => {
    if (!highlightId || scrolledTo.current === highlightId) return;
    const row = document.getElementById(`factura-${highlightId}`);
    if (!row) return;
    row.scrollIntoView({ block: "center" });
    scrolledTo.current = highlightId;
  }, [highlightId, filtered]);

  const runAction = async (
    invoice: Invoice,
    request: () => Promise<InvoiceActionResult>,
    successText: (numero: string | null) => string,
  ) => {
    setBusyId(invoice.id);
    try {
      const { error, numero } = await request();
      setConfirm(null);
      if (error) {
        onNotice({ type: "error", text: error });
        return;
      }
      onNotice({ type: "success", text: successText(numero ?? null) });
      await onChanged();
    } finally {
      setBusyId(null);
    }
  };

  const issue = (invoice: Invoice) =>
    runAction(
      invoice,
      () => issueDraft(invoice, opportunityOf(invoice)?.precio ?? invoice.base, new Date()),
      (numero) => `Factura ${numero} emitida.`,
    );

  const markPaid = (invoice: Invoice) =>
    runAction(invoice, () => markInvoicePaid(invoice.id), (numero) => `Factura ${numero} marcada como pagada.`);

  const cancel = (invoice: Invoice) =>
    runAction(invoice, () => cancelInvoice(invoice.id), (numero) => `Factura ${numero} anulada.`);

  const remove = (invoice: Invoice) => runAction(invoice, () => deleteDraft(invoice.id), () => "Borrador eliminado.");

  if (invoices.length === 0) {
    return (
      <EmptyState
        title="Todavía no hay facturas"
        description="Crea la primera desde una venta ganada o desde la foto de una factura."
        action={
          <div className="crm-toolbar-actions">
            <button type="button" className="btn" onClick={onNewFromPhoto}>
              Desde foto
            </button>
            <button type="button" className="btn btn-primary" onClick={onNew}>
              Nueva factura
            </button>
          </div>
        }
      />
    );
  }

  return (
    <div className="summary-page">
      <div className="crm-kpi-grid crm-kpi-grid-3">
        <article className="crm-kpi">
          <span className="crm-kpi-label">Facturado este mes</span>
          <strong>{formatPrice(summary.invoicedMonth)}</strong>
          <small>Sin IVA</small>
        </article>
        <article className="crm-kpi">
          <span className="crm-kpi-label">Pendiente de cobro</span>
          <strong>{formatPrice(summary.pendingTotal)}</strong>
          <small>{invoicesLabel(summary.pendingCount)}</small>
        </article>
        <article className="crm-kpi crm-kpi-lost">
          <span className="crm-kpi-label">Vencido</span>
          <strong>{formatPrice(summary.overdueTotal)}</strong>
          <small>{invoicesLabel(summary.overdueCount)}</small>
        </article>
      </div>

      <div className="crm-toolbar">
        <div className="search-field">
          <label htmlFor="search-facturas">Buscar por cliente o número</label>
          <div className="search-box">
            <span className="search-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="11" cy="11" r="5.5" stroke="currentColor" strokeWidth="1.8" />
                <path d="M16.2 16.2L20 20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </span>
            <input
              id="search-facturas"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>
        <div className="crm-toolbar-actions">
          <button type="button" className="btn" onClick={onNewFromPhoto}>
            Desde foto
          </button>
          <button type="button" className="btn btn-primary" onClick={onNew}>
            Nueva factura
          </button>
        </div>
      </div>

      <div className="filter-row" role="group" aria-label="Filtrar por estado">
        {FILTERS.map((key) => (
          <button
            key={key}
            type="button"
            className={`filter-chip ${filter === key ? "active" : ""}`}
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
          >
            {key === "todas" ? "Todas" : INVOICE_STATUS_LABELS[key]} {counts[key]}
          </button>
        ))}
      </div>

      <div className="crm-table-wrap">
        <table className="crm-table">
          <thead>
            <tr>
              <th scope="col">Nº factura</th>
              <th scope="col">Cliente</th>
              <th scope="col">Emisión</th>
              <th scope="col">Vencimiento</th>
              <th scope="col" className="crm-table-num">
                Base
              </th>
              <th scope="col" className="crm-table-num">
                Total (con IVA)
              </th>
              <th scope="col">Estado</th>
              <th scope="col">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="crm-table-empty">
                  Sin resultados
                </td>
              </tr>
            ) : (
              filtered.map(({ invoice, status, client }) => {
                const selected = invoice.id === highlightId;
                const busy = busyId !== null;
                const name = invoice.numero ?? `borrador de ${client.name ?? "la venta"}`;
                return (
                  <tr
                    key={invoice.id}
                    id={`factura-${invoice.id}`}
                    className={selected ? "is-selected" : undefined}
                    aria-current={selected ? "true" : undefined}
                  >
                    <td>{invoice.numero ?? "—"}</td>
                    <td>
                      {client.id ? (
                        <Link href={`/empresas/${client.id}`} className="crm-table-link">
                          {client.name}
                        </Link>
                      ) : (
                        (client.name ?? "—")
                      )}
                    </td>
                    <td className="crm-table-muted">{formatDateEs(invoice.fecha_emision)}</td>
                    <td className="crm-table-muted">{formatDateEs(invoice.fecha_vencimiento)}</td>
                    <td className="crm-table-num">{formatPrice(invoice.base)}</td>
                    <td className="crm-table-num">{formatPrice(invoiceTotal(invoice))}</td>
                    <td>
                      <InvoiceStatusPill status={status} />
                    </td>
                    <td>
                      <div className="rrhh-row-actions">
                        {invoice.origen === "foto" && invoice.foto_path ? (
                          <a
                            href={invoicePhotoUrl(invoice.foto_path)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-compact"
                          >
                            Ver foto<span className="sr-only"> de {name} (se abre en una pestaña nueva)</span>
                          </a>
                        ) : null}
                        {status === "borrador" ? (
                          <>
                            <button
                              type="button"
                              className="btn btn-compact btn-soft"
                              disabled={busy}
                              onClick={() => void issue(invoice)}
                              aria-label={`Emitir ${name}`}
                            >
                              Emitir
                            </button>
                            <button
                              type="button"
                              className="btn btn-compact"
                              disabled={busy}
                              onClick={() => onEdit(invoice)}
                              aria-label={`Editar ${name}`}
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              className="btn btn-compact btn-danger-soft"
                              disabled={busy}
                              onClick={() => setConfirm({ kind: "delete", invoice })}
                              aria-label={`Eliminar ${name}`}
                            >
                              Eliminar
                            </button>
                          </>
                        ) : status === "pendiente" || status === "vencida" ? (
                          <>
                            <button
                              type="button"
                              className="btn btn-compact btn-soft"
                              disabled={busy}
                              onClick={() => void markPaid(invoice)}
                              aria-label={`Marcar como pagada ${name}`}
                            >
                              Pagada
                            </button>
                            <button
                              type="button"
                              className="btn btn-compact btn-danger-soft"
                              disabled={busy}
                              onClick={() => setConfirm({ kind: "anular", invoice })}
                              aria-label={`Anular ${name}`}
                            >
                              Anular
                            </button>
                          </>
                        ) : invoice.origen === "foto" && invoice.foto_path ? null : (
                          <span className="crm-table-muted">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {confirm ? (
        confirm.kind === "delete" ? (
          <DeleteConfirmDialog
            titleId="invoice-delete-title"
            heading={`¿Eliminar el borrador de ${clientOf(confirm.invoice).name ?? "la venta"}?`}
            confirmLabel="Sí, eliminar borrador"
            deleting={busyId === confirm.invoice.id}
            onConfirm={() => void remove(confirm.invoice)}
            onClose={() => setConfirm(null)}
          />
        ) : (
          <DeleteConfirmDialog
            titleId="invoice-cancel-title"
            label="Anular"
            heading={`¿Anular la factura ${confirm.invoice.numero}?`}
            detail="Conservará su número y la venta volverá a Sin facturar."
            confirmLabel="Sí, anular factura"
            busyLabel="Anulando..."
            deleting={busyId === confirm.invoice.id}
            onConfirm={() => void cancel(confirm.invoice)}
            onClose={() => setConfirm(null)}
          />
        )
      ) : null}
    </div>
  );
}
