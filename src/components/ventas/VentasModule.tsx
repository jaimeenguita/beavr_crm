"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import type { Company } from "@/components/CompanyDialogs";
import { AgentePanel } from "@/components/ventas/AgentePanel";
import { FacturasPanel } from "@/components/ventas/FacturasPanel";
import { InvoiceDialog } from "@/components/ventas/InvoiceDialog";
import { PhotoInvoiceDialog } from "@/components/ventas/PhotoInvoiceDialog";
import { VentasPanel } from "@/components/ventas/VentasPanel";
import { buildSales, type Invoice, type Sale } from "@/lib/crm/facturas";
import type { MappedOpportunity } from "@/lib/crm/mapRows";

const TABS = [
  { key: "ventas", label: "Ventas", href: "/?vista=ventas" },
  { key: "facturas", label: "Facturas", href: "/?vista=ventas&tab=facturas" },
  { key: "agente", label: "Agente IA", href: "/?vista=ventas&tab=agente" },
] as const;

type DialogState = { mode: "create"; sales: Sale[] } | { mode: "edit"; invoice: Invoice } | { mode: "photo" };

export function VentasModule({
  opportunities,
  invoices,
  companies,
  loading,
  onChanged,
  onNotice,
}: {
  opportunities: MappedOpportunity[];
  invoices: Invoice[];
  companies: Company[];
  loading: boolean;
  onChanged: () => Promise<void>;
  onNotice: (notice: { type: "success" | "error"; text: string }) => void;
}) {
  const searchParams = useSearchParams();
  const active = TABS.find((tab) => tab.key === searchParams.get("tab"))?.key ?? "ventas";
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const sales = useMemo(() => buildSales(opportunities, invoices), [opportunities, invoices]);

  const handleSaved = async (text: string) => {
    setDialog(null);
    onNotice({ type: "success", text });
    await onChanged();
  };

  return (
    <>
      <nav className="rrhh-tabs" aria-label="Secciones de ventas y facturación">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            className={`filter-chip ${active === tab.key ? "active" : ""}`}
            aria-current={active === tab.key ? "page" : undefined}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      {loading ? (
        <div className="empty-column" role="status">
          Cargando...
        </div>
      ) : active === "ventas" ? (
        <VentasPanel
          sales={sales}
          invoices={invoices}
          onCreateInvoice={(sale) => setDialog({ mode: "create", sales: [sale] })}
        />
      ) : active === "agente" ? (
        <AgentePanel invoices={invoices} sales={sales} companies={companies} onChanged={onChanged} />
      ) : (
        <FacturasPanel
          invoices={invoices}
          opportunities={opportunities}
          companies={companies}
          highlightId={searchParams.get("factura")}
          onNew={() =>
            setDialog({
              mode: "create",
              sales: sales.filter((sale) => sale.opportunity.precio !== null && !sale.invoice),
            })
          }
          onNewFromPhoto={() => setDialog({ mode: "photo" })}
          onEdit={(invoice) => setDialog({ mode: "edit", invoice })}
          onChanged={onChanged}
          onNotice={onNotice}
        />
      )}
      {dialog?.mode === "photo" ? (
        <PhotoInvoiceDialog
          companies={companies}
          onClose={() => setDialog(null)}
          onSaved={(text) => void handleSaved(text)}
          onChanged={onChanged}
        />
      ) : dialog ? (
        <InvoiceDialog
          mode={dialog.mode}
          sales={
            dialog.mode === "create"
              ? dialog.sales
              : sales.filter((sale) => sale.opportunity.id === dialog.invoice.oportunidad_id)
          }
          invoice={dialog.mode === "edit" ? dialog.invoice : undefined}
          onClose={() => setDialog(null)}
          onSaved={(text) => void handleSaved(text)}
        />
      ) : null}
    </>
  );
}
