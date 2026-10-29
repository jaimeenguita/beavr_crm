import { INVOICE_STATUS_LABELS, type InvoiceStatus } from "@/lib/crm/facturas";

// Pagada = success, Vencida = danger, the rest neutral (spec "Facturas tab").
const STATUS_PILL_CLASS: Record<InvoiceStatus, string> = {
  borrador: "rrhh-status-pendiente",
  pendiente: "rrhh-status-pendiente",
  vencida: "rrhh-status-rechazada",
  pagada: "rrhh-status-aprobada",
  anulada: "rrhh-status-pendiente",
};

export function InvoiceStatusPill({ status }: { status: InvoiceStatus }) {
  return <span className={`rrhh-status ${STATUS_PILL_CLASS[status]}`}>{INVOICE_STATUS_LABELS[status]}</span>;
}
