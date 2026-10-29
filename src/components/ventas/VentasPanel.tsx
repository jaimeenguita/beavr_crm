"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SalesVsInvoicedChart } from "@/components/CrmCharts";
import { EmptyState } from "@/components/EmptyState";
import { InvoiceStatusPill } from "@/components/ventas/InvoiceStatusPill";
import { invoiceStatus, monthlySoldVsInvoiced, salesSummary, type Invoice, type Sale } from "@/lib/crm/facturas";
import { formatDateEs } from "@/lib/crm/format";
import { formatPrice } from "@/lib/crm/money";

function monthComparison(current: number, previous: number, previousMonthName: string) {
  if (previous === 0) return "Sin ventas el mes anterior";
  const pct = new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    signDisplay: "exceptZero",
  }).format(((current - previous) / previous) * 100);
  return `${pct} % frente a ${previousMonthName}`;
}

function InvoiceCell({ sale, today }: { sale: Sale; today: Date }) {
  const { opportunity, invoice } = sale;

  if (opportunity.precio === null) return <span className="rrhh-status">Sin precio</span>;
  if (!invoice) return <span className="rrhh-status rrhh-status-pendiente">Sin facturar</span>;

  return (
    <span className="crm-table-inline">
      <InvoiceStatusPill status={invoiceStatus(invoice, today)} />
      <Link href={`/?vista=ventas&tab=facturas&factura=${invoice.id}`} className="crm-table-link">
        {invoice.numero ?? "Ver borrador"}
      </Link>
    </span>
  );
}

function ActionCell({ sale, onCreateInvoice }: { sale: Sale; onCreateInvoice: (sale: Sale) => void }) {
  const { opportunity, invoice } = sale;

  if (opportunity.precio === null) {
    return (
      <Link href={`/oportunidades/${opportunity.id}`} className="crm-table-link">
        Poner precio
      </Link>
    );
  }
  if (!invoice) {
    return (
      <button type="button" className="btn btn-compact" onClick={() => onCreateInvoice(sale)}>
        Crear factura
      </button>
    );
  }
  return null;
}

export function VentasPanel({
  sales,
  invoices,
  onCreateInvoice,
}: {
  sales: Sale[];
  invoices: Invoice[];
  onCreateInvoice: (sale: Sale) => void;
}) {
  const [search, setSearch] = useState("");
  const today = useMemo(() => new Date(), []);
  const summary = useMemo(() => salesSummary(sales, today), [sales, today]);
  const chart = useMemo(() => monthlySoldVsInvoiced(sales, invoices, today), [sales, invoices, today]);
  const previousMonthName = new Date(today.getFullYear(), today.getMonth() - 1, 1).toLocaleDateString("es-ES", {
    month: "long",
  });

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return sales;
    return sales.filter(({ opportunity }) =>
      `${opportunity.empresa} ${opportunity.proyecto}`.toLowerCase().includes(query),
    );
  }, [sales, search]);

  if (sales.length === 0) {
    return (
      <EmptyState
        title="Todavía no hay ventas"
        description="Las oportunidades que marques como Ganada aparecerán aquí."
        action={
          <Link href="/?vista=oportunidades" className="btn btn-primary">
            Ir a Oportunidades
          </Link>
        }
      />
    );
  }

  return (
    <div className="summary-page">
      <div className="crm-kpi-grid crm-kpi-grid-3">
        <article className="crm-kpi">
          <span className="crm-kpi-label">Vendido este mes</span>
          <strong>{formatPrice(summary.monthTotal)}</strong>
          <small>{monthComparison(summary.monthTotal, summary.prevMonthTotal, previousMonthName)}</small>
        </article>
        <article className="crm-kpi">
          <span className="crm-kpi-label">Vendido este año</span>
          <strong>{formatPrice(summary.yearTotal)}</strong>
        </article>
        <article className="crm-kpi">
          <span className="crm-kpi-label">Sin facturar</span>
          <strong>{formatPrice(summary.uninvoicedTotal)}</strong>
          <small>{summary.uninvoicedCount === 1 ? "1 venta" : `${summary.uninvoicedCount} ventas`}</small>
        </article>
      </div>

      <article className="detail-card crm-card">
        <div className="crm-card-header">
          <h2>Vendido y facturado por mes</h2>
        </div>
        <SalesVsInvoicedChart labels={chart.labels} sold={chart.sold} invoiced={chart.invoiced} />
      </article>

      <div className="crm-toolbar">
        <div className="search-field">
          <label htmlFor="search-ventas">Buscar por cliente o proyecto</label>
          <div className="search-box">
            <span className="search-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="11" cy="11" r="5.5" stroke="currentColor" strokeWidth="1.8" />
                <path d="M16.2 16.2L20 20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </span>
            <input
              id="search-ventas"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="crm-table-wrap">
        <table className="crm-table">
          <thead>
            <tr>
              <th scope="col">Cliente</th>
              <th scope="col">Proyecto</th>
              <th scope="col">Fecha</th>
              <th scope="col" className="crm-table-num">
                Importe
              </th>
              <th scope="col">Factura</th>
              <th scope="col">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="crm-table-empty">
                  Sin resultados
                </td>
              </tr>
            ) : (
              filtered.map((sale) => {
                const { opportunity } = sale;
                return (
                  <tr key={opportunity.id}>
                    <td>
                      {opportunity.empresa_id ? (
                        <Link href={`/empresas/${opportunity.empresa_id}`} className="crm-table-link">
                          {opportunity.empresa}
                        </Link>
                      ) : (
                        opportunity.empresa || "—"
                      )}
                    </td>
                    <td>{opportunity.proyecto || "—"}</td>
                    <td className="crm-table-muted">{formatDateEs(opportunity.ganada_en)}</td>
                    <td className="crm-table-num">{formatPrice(opportunity.precio) ?? "—"}</td>
                    <td>
                      <InvoiceCell sale={sale} today={today} />
                    </td>
                    <td>
                      <ActionCell sale={sale} onCreateInvoice={onCreateInvoice} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
