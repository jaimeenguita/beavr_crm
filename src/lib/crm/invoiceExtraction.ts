import { z } from "zod";
import { invoiceTotal, IVA_OPTIONS, IVA_PCT, round2, toIsoDate, type IvaPct } from "@/lib/crm/facturas";

// What the model reads from an invoice photo. Every field is nullable: anything it cannot read stays empty.
export const invoiceExtractionSchema = z.object({
  cliente_nombre: z.string().nullable().describe("Name of the customer the invoice is addressed to"),
  cliente_nif: z.string().nullable().describe("Customer tax id (NIF/CIF)"),
  numero: z.string().nullable().describe("Invoice number exactly as printed"),
  fecha_emision: z.string().nullable().describe("Issue date, YYYY-MM-DD"),
  fecha_vencimiento: z.string().nullable().describe("Due date, YYYY-MM-DD"),
  base: z.number().nullable().describe("Taxable base in euros, without IVA"),
  iva_pct: z.number().nullable().describe("IVA percentage: 21, 10, 4 or 0"),
  total: z.number().nullable().describe("Total in euros, IVA included"),
});

export type InvoiceExtraction = z.infer<typeof invoiceExtractionSchema>;

type ClientCandidate = { id: string; nombre: string; nif: string | null };

const MAX_CLIENT_MATCHES = 5;
const TOTAL_TOLERANCE = 0.05;

function isIvaPct(value: number | null): value is IvaPct {
  return (IVA_OPTIONS as readonly number[]).includes(value ?? NaN);
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() || null : null;
}

// Accepts "yyyy-mm-dd" and "dd/mm/yyyy" (also with "-" or "."); impossible dates such as 31/02 become null.
function cleanDate(value: unknown) {
  const text = cleanText(value);
  if (!text) return null;
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const european = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  const parts = iso ? [iso[1], iso[2], iso[3]] : european ? [european[3], european[2], european[1]] : null;
  if (!parts) return null;
  const [year, month, day] = parts.map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return toIsoDate(date);
}

// Numbers may come as strings in Spanish ("1.234,56") or English ("1234.56") notation; negatives become null.
function cleanAmount(value: unknown) {
  let amount = typeof value === "number" ? value : NaN;
  if (typeof value === "string") {
    let text = value.replace(/[\s€%]/g, "");
    if (text.lastIndexOf(",") > text.lastIndexOf(".")) text = text.replace(/\./g, "").replace(",", "."); // 1.234,56
    else if (text.includes(",")) text = text.replace(/,/g, ""); // 1,234.56
    else if (/^\d{1,3}(\.\d{3})+$/.test(text)) text = text.replace(/\./g, ""); // 1.234
    if (text) amount = Number(text);
  }
  return Number.isFinite(amount) && amount >= 0 ? round2(amount) : null;
}

export function normalizeExtraction(raw: unknown): InvoiceExtraction {
  const source = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const iva = cleanAmount(source.iva_pct);
  return {
    cliente_nombre: cleanText(source.cliente_nombre),
    cliente_nif: cleanText(source.cliente_nif),
    numero: cleanText(typeof source.numero === "number" ? String(source.numero) : source.numero),
    fecha_emision: cleanDate(source.fecha_emision),
    fecha_vencimiento: cleanDate(source.fecha_vencimiento),
    base: cleanAmount(source.base),
    iva_pct: isIvaPct(iva) ? iva : null,
    total: cleanAmount(source.total),
  };
}

export function normalizeNif(nif: string | null) {
  const normalized = (nif ?? "").toUpperCase().replace(/[\s.-]/g, "");
  return normalized || null;
}

// Case- and accent-insensitive form of a name, for searching clients.
export function normalizeName(name: string | null) {
  return (name ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Existing clients the read name or NIF may refer to: the exact NIF match first, then name matches.
export function matchClients(
  extraction: Pick<InvoiceExtraction, "cliente_nombre" | "cliente_nif">,
  companies: ClientCandidate[],
) {
  const nif = normalizeNif(extraction.cliente_nif);
  const name = normalizeName(extraction.cliente_nombre);
  const byNif = nif ? companies.filter((company) => normalizeNif(company.nif) === nif) : [];
  const byName = name
    ? companies.filter((company) => {
        const candidate = normalizeName(company.nombre);
        return !byNif.includes(company) && candidate !== "" && (candidate.includes(name) || name.includes(candidate));
      })
    : [];
  return [
    ...byNif.map((company) => ({ ...company, exactNif: true })),
    ...byName.map((company) => ({ ...company, exactNif: false })),
  ].slice(0, MAX_CLIENT_MATCHES);
}

// The form stores base + IVA; when only the total is read, the base is derived from it.
export function prefillAmounts(extraction: Pick<InvoiceExtraction, "base" | "iva_pct" | "total">) {
  const iva_pct: IvaPct = isIvaPct(extraction.iva_pct) ? extraction.iva_pct : IVA_PCT;
  const base =
    extraction.base ?? (extraction.total === null ? null : round2(extraction.total / (1 + iva_pct / 100)));
  return { base, iva_pct };
}

export function totalMismatch(base: number, iva: number, total: number | null) {
  return total !== null && Math.abs(invoiceTotal({ base, iva_pct: iva }) - total) > TOTAL_TOLERANCE;
}
