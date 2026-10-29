import { strOrNull, type MappedOpportunity } from "@/lib/crm/mapRows";

export type InvoiceState = "borrador" | "pendiente" | "pagada" | "anulada";
export type InvoiceStatus = InvoiceState | "vencida";
export type InvoiceOrigin = "venta" | "foto";

export const IVA_OPTIONS = [21, 10, 4, 0] as const;
export type IvaPct = (typeof IVA_OPTIONS)[number];

export type Invoice = {
  id: string;
  numero: string | null;
  // Null for photo invoices, which belong to a client but not to a sale.
  oportunidad_id: string | null;
  empresa_id: string | null;
  fecha_emision: string;
  fecha_vencimiento: string;
  base: number;
  iva_pct: number;
  estado: InvoiceState;
  pagada_en: string | null;
  anulada_en: string | null;
  origen: InvoiceOrigin;
  foto_path: string | null;
};

export type Sale = { opportunity: MappedOpportunity; invoice: Invoice | null };

export const IVA_PCT: IvaPct = 21;
export const DEFAULT_DUE_DAYS = 30;

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  borrador: "Borrador",
  pendiente: "Pendiente",
  vencida: "Vencida",
  pagada: "Pagada",
  anulada: "Anulada",
};

const MONTHS_IN_CHART = 12;

export function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function sum(values: number[]) {
  return round2(values.reduce((total, value) => total + value, 0));
}

export function toIsoDate(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function parseIsoDate(isoDate: string) {
  const [year, month, day] = isoDate.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
}

// Months since year 0, so different years compare and subtract directly.
function monthIndex(date: Date) {
  return date.getFullYear() * 12 + date.getMonth();
}

function soldMonthIndex(sale: Sale) {
  const wonAt = sale.opportunity.ganada_en;
  return wonAt ? monthIndex(new Date(wonAt)) : null;
}

export function mapFacturaRow(row: Record<string, unknown>): Invoice {
  return {
    id: String(row.id),
    numero: strOrNull(row.numero),
    oportunidad_id: strOrNull(row.oportunidad_id),
    empresa_id: strOrNull(row.empresa_id),
    fecha_emision: String(row.fecha_emision),
    fecha_vencimiento: String(row.fecha_vencimiento),
    base: Number(row.base),
    iva_pct: Number(row.iva_pct),
    estado: row.estado as InvoiceState,
    pagada_en: strOrNull(row.pagada_en),
    anulada_en: strOrNull(row.anulada_en),
    origen: row.origen === "foto" ? "foto" : "venta",
    foto_path: strOrNull(row.foto_path),
  };
}

export function invoiceTotal(inv: Pick<Invoice, "base" | "iva_pct">) {
  return round2((inv.base * (100 + inv.iva_pct)) / 100);
}

export function isOverdue(inv: Invoice, today: Date) {
  return inv.estado === "pendiente" && inv.fecha_vencimiento < toIsoDate(today);
}

export function invoiceStatus(inv: Invoice, today: Date): InvoiceStatus {
  return isOverdue(inv, today) ? "vencida" : inv.estado;
}

export function isWon(opp: MappedOpportunity) {
  return opp.estado === "won";
}

export function buildSales(opps: MappedOpportunity[], invoices: Invoice[]): Sale[] {
  const liveByOpportunity = new Map<string, Invoice>();
  for (const inv of invoices) {
    if (inv.oportunidad_id && inv.estado !== "anulada") liveByOpportunity.set(inv.oportunidad_id, inv);
  }
  return opps
    .filter(isWon)
    .map((opportunity) => ({ opportunity, invoice: liveByOpportunity.get(opportunity.id) ?? null }))
    .sort((a, b) => (b.opportunity.ganada_en ?? "").localeCompare(a.opportunity.ganada_en ?? ""));
}

export function salesSummary(sales: Sale[], today: Date) {
  const current = monthIndex(today);
  const amountWhere = (matches: (index: number) => boolean) =>
    sum(
      sales.flatMap((sale) => {
        const index = soldMonthIndex(sale);
        return index !== null && sale.opportunity.precio !== null && matches(index)
          ? [sale.opportunity.precio]
          : [];
      }),
    );
  const uninvoiced = sales.filter((sale) => !sale.invoice && sale.opportunity.precio !== null);

  return {
    monthTotal: amountWhere((index) => index === current),
    prevMonthTotal: amountWhere((index) => index === current - 1),
    yearTotal: amountWhere((index) => Math.floor(index / 12) === Math.floor(current / 12)),
    uninvoicedTotal: sum(uninvoiced.map((sale) => sale.opportunity.precio ?? 0)),
    uninvoicedCount: uninvoiced.length,
    noPriceCount: sales.filter((sale) => sale.opportunity.precio === null).length,
  };
}

function isEmitted(inv: Invoice) {
  return inv.estado === "pendiente" || inv.estado === "pagada";
}

export function invoiceSummary(invoices: Invoice[], today: Date) {
  const current = monthIndex(today);
  const pending = invoices.filter((inv) => inv.estado === "pendiente");
  const overdue = pending.filter((inv) => isOverdue(inv, today));

  return {
    invoicedMonth: sum(
      invoices
        .filter((inv) => isEmitted(inv) && monthIndex(parseIsoDate(inv.fecha_emision)) === current)
        .map((inv) => inv.base),
    ),
    pendingTotal: sum(pending.map(invoiceTotal)),
    pendingCount: pending.length,
    overdueTotal: sum(overdue.map(invoiceTotal)),
    overdueCount: overdue.length,
  };
}

export function monthlySoldVsInvoiced(sales: Sale[], invoices: Invoice[], today: Date) {
  const current = monthIndex(today);
  const first = current - (MONTHS_IN_CHART - 1);
  const sold = new Array<number>(MONTHS_IN_CHART).fill(0);
  const invoiced = new Array<number>(MONTHS_IN_CHART).fill(0);

  for (const sale of sales) {
    const index = soldMonthIndex(sale);
    if (index !== null && index >= first && index <= current && sale.opportunity.precio !== null) {
      sold[index - first] += sale.opportunity.precio;
    }
  }
  for (const inv of invoices.filter(isEmitted)) {
    const index = monthIndex(parseIsoDate(inv.fecha_emision));
    if (index >= first && index <= current) invoiced[index - first] += inv.base;
  }

  return {
    labels: sold.map((_, offset) =>
      new Date(today.getFullYear(), today.getMonth() - (MONTHS_IN_CHART - 1 - offset), 1).toLocaleDateString(
        "es-ES",
        { month: "short", year: "2-digit" },
      ),
    ),
    sold: sold.map(round2),
    invoiced: invoiced.map(round2),
  };
}

export function invoiceBlockMessage(error: { message?: string } | null) {
  const number = error?.message?.match(/factura_emitida:(\S+)/)?.[1];
  return number ? `Esta oportunidad tiene la factura ${number} emitida. Anúlala antes de cambiarla.` : null;
}

// Spanish copy for the invoice errors raised by the database triggers; null when the error is not one of them.
export function invoiceErrorMessage(error: { message?: string } | null) {
  const message = error?.message ?? "";
  const duplicate = message.match(/factura_numero_duplicado:(.+)$/)?.[1]?.trim();
  if (duplicate) return `Ya existe una factura con el número ${duplicate}.`;
  const company = message.match(/empresa_con_facturas:(.+)$/)?.[1]?.trim();
  if (company) return `No se puede eliminar ${company} porque tiene facturas emitidas.`;
  if (message.includes("factura_foto_incompleta:")) {
    return "Faltan datos de la factura: número y cliente son obligatorios.";
  }
  return invoiceBlockMessage(error);
}

// Form field an invoice error belongs to, so the dialog can show it next to that field; null for form-level errors.
export function invoiceErrorField(error: { message?: string } | null): "numero" | null {
  return error?.message?.startsWith("factura_numero_duplicado:") ? "numero" : null;
}

export function addDays(isoDate: string, days: number) {
  const date = parseIsoDate(isoDate);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// A draft issued after its emission date is re-dated to today, keeping its payment term.
export function issueDates(inv: Pick<Invoice, "fecha_emision" | "fecha_vencimiento">, today: Date) {
  const todayIso = toIsoDate(today);
  if (inv.fecha_emision >= todayIso) {
    return { fecha_emision: inv.fecha_emision, fecha_vencimiento: inv.fecha_vencimiento };
  }
  // Rounded so a daylight-saving change in between does not lose a day.
  const gapDays = Math.round(
    (parseIsoDate(inv.fecha_vencimiento).getTime() - parseIsoDate(inv.fecha_emision).getTime()) / MS_PER_DAY,
  );
  return { fecha_emision: todayIso, fecha_vencimiento: addDays(todayIso, gapDays) };
}
