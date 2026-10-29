import { tool, type InferUITools, type UIDataTypes, type UIMessage } from "ai";
import { z } from "zod";
import type { supabaseForToken } from "@/lib/agente/server";
import {
  buildSales,
  INVOICE_STATUS_LABELS,
  invoiceStatus,
  invoiceSummary,
  invoiceTotal,
  mapFacturaRow,
  salesSummary,
  type Invoice,
  type InvoiceStatus,
} from "@/lib/crm/facturas";
import { normalizeName } from "@/lib/crm/invoiceExtraction";
import { mapOpportunityRow, opportunityLookups, strOrNull } from "@/lib/crm/mapRows";

type Row = Record<string, unknown>;
type Supabase = ReturnType<typeof supabaseForToken>;

export type CrmRows = { companies: Row[]; people: Row[]; opportunities: Row[]; invoices: Row[] };
type CrmContext = ReturnType<typeof crmContext>;

// Rows sent to the model per answer; the full count is always reported.
const MAX_ROWS = 50;
const READ_ERROR = "No se han podido leer los datos del CRM.";

const INVOICE_STATUSES = Object.keys(INVOICE_STATUS_LABELS) as [InvoiceStatus, ...InvoiceStatus[]];

function matchesName(name: string | null, query: string | undefined) {
  const wanted = normalizeName(query ?? null);
  return !wanted || normalizeName(name).includes(wanted);
}

function capped<T>(items: T[]) {
  return { count: items.length, items: items.slice(0, MAX_ROWS) };
}

export function crmContext({ companies, people, opportunities, invoices }: CrmRows) {
  const { companyById, personById } = opportunityLookups(companies, people);
  const mappedOpportunities = opportunities.map((row) => mapOpportunityRow(row, personById, companyById));
  return {
    companyById,
    opportunityById: new Map(mappedOpportunities.map((opportunity) => [opportunity.id, opportunity])),
    opportunities: mappedOpportunities,
    invoices: invoices.map(mapFacturaRow),
  };
}

// The client is the company frozen on the invoice; the sale's company is only a fallback.
function clientOf(context: CrmContext, invoice: Invoice) {
  const company = invoice.empresa_id ? context.companyById.get(invoice.empresa_id) : undefined;
  const opportunity = invoice.oportunidad_id ? context.opportunityById.get(invoice.oportunidad_id) : undefined;
  return company ?? opportunity?.empresa ?? null;
}

function statusLabel(invoice: Invoice, today: Date) {
  return INVOICE_STATUS_LABELS[invoiceStatus(invoice, today)];
}

export function invoiceList(
  context: CrmContext,
  filter: { estado?: InvoiceStatus; cliente?: string },
  today: Date,
) {
  const { count, items } = capped(
    context.invoices
      .map((invoice) => ({ invoice, cliente: clientOf(context, invoice) }))
      .filter(
        ({ invoice, cliente }) =>
          (!filter.estado || invoiceStatus(invoice, today) === filter.estado) && matchesName(cliente, filter.cliente),
      )
      .sort((a, b) => b.invoice.fecha_emision.localeCompare(a.invoice.fecha_emision)),
  );
  return {
    count,
    invoices: items.map(({ invoice, cliente }) => ({
      id: invoice.id,
      numero: invoice.numero,
      cliente,
      estado: statusLabel(invoice, today),
      fecha_emision: invoice.fecha_emision,
      fecha_vencimiento: invoice.fecha_vencimiento,
      base: invoice.base,
      iva_pct: invoice.iva_pct,
      total: invoiceTotal(invoice),
    })),
  };
}

export function saleList(context: CrmContext, filter: { sinFacturar?: boolean }, today: Date) {
  const { count, items } = capped(
    buildSales(context.opportunities, context.invoices).filter((sale) => !filter.sinFacturar || !sale.invoice),
  );
  return {
    count,
    sales: items.map(({ opportunity, invoice }) => ({
      opportunityId: opportunity.id,
      cliente: opportunity.empresa,
      proyecto: opportunity.proyecto,
      importe: opportunity.precio,
      ganada_en: opportunity.ganada_en,
      factura: invoice ? { id: invoice.id, numero: invoice.numero, estado: statusLabel(invoice, today) } : null,
    })),
  };
}

export function salesOverview(context: CrmContext, today: Date) {
  return {
    ventas: salesSummary(buildSales(context.opportunities, context.invoices), today),
    facturas: invoiceSummary(context.invoices, today),
  };
}

export function clientList(companies: Row[], filter: { nombre?: string }) {
  const { count, items } = capped(
    companies
      .map((company) => ({ id: String(company.id), nombre: String(company.nombre ?? "Sin nombre"), nif: strOrNull(company.nif) }))
      .filter((company) => matchesName(company.nombre, filter.nombre)),
  );
  return { count, clients: items };
}

async function rowsOf(request: PromiseLike<{ data: unknown; error: unknown }>) {
  const { data, error } = await request;
  if (error) throw new Error(READ_ERROR);
  return (data ?? []) as Row[];
}

async function loadCrm(supabase: Supabase) {
  const [companies, people, opportunities, invoices] = await Promise.all([
    rowsOf(supabase.from("empresas").select("*")),
    rowsOf(supabase.from("personas").select("*")),
    rowsOf(supabase.from("oportunidades").select("*")),
    rowsOf(supabase.from("facturas").select("*")),
  ]);
  return crmContext({ companies, people, opportunities, invoices });
}

const invoiceId = z.uuid().describe("Invoice id taken from listInvoices or listSales");
const numero = z.string().min(1).describe("Invoice number, shown to the user");
const cliente = z.string().min(1).describe("Client name, shown to the user");

// Proposals have no execute: the browser shows a Confirmar / Cancelar card, runs the change on Confirmar and
// returns its result as the tool output.
export const proposalResultSchema = z.union([
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);
export type ProposalResult = z.infer<typeof proposalResultSchema>;

export const proposalTools = {
  proposeMarkPaid: tool({
    description: "Propose marking a pending or overdue invoice as paid. The user confirms it in a card.",
    inputSchema: z.object({ invoiceId, numero }),
    outputSchema: proposalResultSchema,
  }),
  proposeCancel: tool({
    description: "Propose cancelling (anular) a pending or overdue invoice. The user confirms it in a card.",
    inputSchema: z.object({ invoiceId, numero }),
    outputSchema: proposalResultSchema,
  }),
  proposeIssueDraft: tool({
    description: "Propose issuing a draft (borrador) invoice. The user confirms it in a card.",
    inputSchema: z.object({ invoiceId, cliente }),
    outputSchema: proposalResultSchema,
  }),
  proposeDraftFromSale: tool({
    description: "Propose creating a draft invoice for a won sale without invoice. The user confirms it in a card.",
    inputSchema: z.object({
      opportunityId: z.uuid().describe("Sale id (opportunityId) taken from listSales"),
      cliente,
      importe: z.number().describe("Sale amount without IVA, shown to the user"),
    }),
    outputSchema: proposalResultSchema,
  }),
};

// Read tools run on the server as the signed-in user, so row level security applies as in the browser.
export function agentTools(supabase: Supabase) {
  // One request is one chat turn: its read tools share a single load of the CRM tables.
  let crm: Promise<CrmContext> | undefined;
  const load = () => (crm ??= loadCrm(supabase));
  return {
    listInvoices: tool({
      description: "List invoices with id, number, client, status, dates, base (without IVA) and total (with IVA).",
      inputSchema: z.object({
        estado: z.enum(INVOICE_STATUSES).optional().describe("Only invoices in this status"),
        cliente: z.string().optional().describe("Only invoices whose client name contains this text"),
      }),
      execute: async (filter) => invoiceList(await load(), filter, new Date()),
    }),
    salesSummary: tool({
      description:
        "Sales KPIs (sold this month, last month, this year, sold without invoice) and invoice KPIs (invoiced " +
        "this month, pending, overdue).",
      inputSchema: z.object({}),
      execute: async () => salesOverview(await load(), new Date()),
    }),
    listSales: tool({
      description: "List won sales with opportunityId, client, project, amount without IVA and their invoice, if any.",
      inputSchema: z.object({
        sinFacturar: z.boolean().optional().describe("Only sales that have no invoice yet"),
      }),
      execute: async (filter) => saleList(await load(), filter, new Date()),
    }),
    listClients: tool({
      description: "List clients (companies) with id, name and NIF.",
      inputSchema: z.object({
        nombre: z.string().optional().describe("Only clients whose name contains this text"),
      }),
      execute: async (filter) => clientList(await rowsOf(supabase.from("empresas").select("id, nombre, nif")), filter),
    }),
    ...proposalTools,
  };
}

export type AgentUIMessage = UIMessage<never, UIDataTypes, InferUITools<ReturnType<typeof agentTools>>>;
