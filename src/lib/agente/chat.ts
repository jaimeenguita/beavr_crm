import { APICallError, lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import type { AgentUIMessage, ProposalResult, proposalTools } from "@/lib/agente/tools";
import { INVOICE_STATUS_LABELS, invoiceStatus, invoiceTotal, type Invoice, type Sale } from "@/lib/crm/facturas";
import { formatPrice } from "@/lib/crm/money";

// Display logic of the Agente IA chat, shared by the chat route (error copy) and the chat panel.

export const AGENT_ERROR_MESSAGE = "El agente no ha podido responder. Inténtalo de nuevo.";
export const PROPOSAL_DONE = "Hecho.";
// Sent to the model as the tool output; the card shows the shorter PROPOSAL_CANCELLED_TEXT.
export const PROPOSAL_CANCELLED = "El usuario ha cancelado el cambio.";
const PROPOSAL_CANCELLED_TEXT = "Cancelado.";
export const PROPOSAL_NOT_FOUND = "No encuentro ese registro en el CRM.";

type AgentPart = AgentUIMessage["parts"][number];
export type ProposalName = keyof typeof proposalTools;
export type ProposalPart = Extract<AgentPart, { type: `tool-${ProposalName}` }>;

const PROPOSAL_TYPES: Record<ProposalPart["type"], true> = {
  "tool-proposeMarkPaid": true,
  "tool-proposeCancel": true,
  "tool-proposeIssueDraft": true,
  "tool-proposeDraftFromSale": true,
};

export function isProposalPart(part: AgentPart): part is ProposalPart {
  return Object.hasOwn(PROPOSAL_TYPES, part.type);
}

export function proposalName(part: ProposalPart) {
  return part.type.slice("tool-".length) as ProposalName;
}

export type CrmRecords = { invoices: Invoice[]; sales: Sale[]; companies: { id: string; nombre: string }[] };

// The CRM records a proposal acts on, and the change described with their data (never the model's text).
// "blocked" when the invoice's current state no longer allows the change: the card only offers Cancelar.
export type ResolvedProposal =
  | { kind: "invoice"; description: string; invoice: Invoice; precio: number }
  | { kind: "sale"; description: string; sale: Sale }
  | { kind: "blocked"; description: string };

// Same rules as the Facturas tab: pay or cancel a pending invoice (overdue included), issue a draft.
const ALLOWED_STATE = {
  "tool-proposeMarkPaid": "pendiente",
  "tool-proposeCancel": "pendiente",
  "tool-proposeIssueDraft": "borrador",
} as const;

// Same rule as the Facturas table: the company on the invoice first, the sale's company as fallback.
function clientOf(invoice: Invoice, sale: Sale | undefined, records: CrmRecords) {
  const company = invoice.empresa_id ? records.companies.find(({ id }) => id === invoice.empresa_id) : undefined;
  return company?.nombre ?? sale?.opportunity.empresa ?? "cliente sin nombre";
}

// Null when the ids in the proposal are missing or not in the loaded CRM data.
export function resolveProposal(part: ProposalPart, records: CrmRecords, today: Date): ResolvedProposal | null {
  if (part.state === "input-streaming" || !part.input) return null;
  if (part.type === "tool-proposeDraftFromSale") {
    const { opportunityId } = part.input;
    const sale = records.sales.find(({ opportunity }) => opportunity.id === opportunityId);
    if (!sale) return null;
    const precio = formatPrice(sale.opportunity.precio);
    const detail = precio ? `${sale.opportunity.empresa}, ${precio} sin IVA` : sale.opportunity.empresa;
    return { kind: "sale", description: `Crear un borrador de factura para la venta (${detail})`, sale };
  }
  const { invoiceId } = part.input;
  const invoice = records.invoices.find(({ id }) => id === invoiceId);
  if (!invoice) return null;
  // Only while the card waits: once answered, the change it made has moved the invoice to another state.
  if (part.state === "input-available" && invoice.estado !== ALLOWED_STATE[part.type]) {
    const estado = INVOICE_STATUS_LABELS[invoiceStatus(invoice, today)];
    return { kind: "blocked", description: `Esta factura ya no admite ese cambio (estado: ${estado}).` };
  }
  const sale = records.sales.find(({ opportunity }) => opportunity.id === invoice.oportunidad_id);
  // Issuing refreshes the base from the sale's current price, so the card shows that amount.
  const precio = part.type === "tool-proposeIssueDraft" ? (sale?.opportunity.precio ?? invoice.base) : invoice.base;
  const detail = `(${clientOf(invoice, sale, records)}, ${formatPrice(invoiceTotal({ base: precio, iva_pct: invoice.iva_pct }))})`;
  const numero = invoice.numero ?? "sin número";
  const action = {
    "tool-proposeMarkPaid": `Marcar como pagada la factura ${numero}`,
    "tool-proposeCancel": `Anular la factura ${numero}`,
    "tool-proposeIssueDraft": "Emitir el borrador de factura",
  }[part.type];
  return { kind: "invoice", description: `${action} ${detail}`, invoice, precio };
}

// The answer shown instead of the buttons once the proposal has a result; null while it waits for the user.
export function proposalResultText(part: ProposalPart): string | null {
  if (part.state === "output-available") return resultText(part.output);
  if (part.state === "output-error") return part.errorText;
  return null;
}

function resultText(result: ProposalResult) {
  if (result.ok) return PROPOSAL_DONE;
  return result.error === PROPOSAL_CANCELLED ? PROPOSAL_CANCELLED_TEXT : result.error;
}

export function hasPendingProposal(messages: AgentUIMessage[]) {
  const last = messages.at(-1);
  return (
    last?.role === "assistant" &&
    last.parts.some((part) => isProposalPart(part) && part.state === "input-available")
  );
}

// Continue the chat only when the user has just answered a proposal. The SDK helper alone would also resend
// when the server stopped at its step cap after read tools, starting a turn nobody asked for.
export function shouldSendProposalAnswer({ messages }: { messages: AgentUIMessage[] }) {
  if (!lastAssistantMessageIsCompleteWithToolCalls({ messages })) return false;
  const parts = messages.at(-1)?.parts ?? [];
  const lastStep = parts.slice(parts.findLastIndex((part) => part.type === "step-start") + 1);
  return lastStep.some(
    (part) => isProposalPart(part) && (part.state === "output-available" || part.state === "output-error"),
  );
}

// Parts the chat shows: text with content and proposals whose input is complete (no reasoning, no read tools).
export function visibleParts(message: AgentUIMessage) {
  return message.parts.filter(
    (part): part is Extract<AgentPart, { type: "text" }> | ProposalPart =>
      (part.type === "text" && part.text.trim() !== "") || (isProposalPart(part) && part.state !== "input-streaming"),
  );
}

export type TextBlock =
  | { kind: "paragraph"; lines: string[] }
  | { kind: "list"; items: string[] }
  | { kind: "table"; header: string[]; rows: string[][] };

const LIST_ITEM = /^\s*[-*•]\s+/;
// A pipe row (outer pipes optional) and the dashes/colons row that separates a table header from its body.
const TABLE_ROW = /\|/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

const withoutEmphasis = (line: string) => line.replace(/\*\*|__/g, "");

function tableCells(row: string) {
  return withoutEmphasis(row)
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim());
}

// Plain text to paragraphs, "- " lists and pipe tables. Markdown emphasis and heading marks are dropped, never rendered as HTML.
export function textBlocks(text: string): TextBlock[] {
  const blocks: TextBlock[] = [];
  const lines = text.split(/\r?\n/);
  // False after a blank line, so the next line starts a new block.
  let open = false;
  for (let index = 0; index < lines.length; index++) {
    const raw = lines[index];
    const separator = lines[index + 1];
    if (TABLE_ROW.test(raw) && separator !== undefined && TABLE_ROW.test(separator) && TABLE_SEPARATOR.test(separator)) {
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && TABLE_ROW.test(lines[index])) rows.push(tableCells(lines[index++]));
      index--;
      blocks.push({ kind: "table", header: tableCells(raw), rows });
      open = false;
      continue;
    }
    const isItem = LIST_ITEM.test(raw);
    const line = withoutEmphasis(raw.replace(LIST_ITEM, "").replace(/^\s*#{1,6}\s+/, "")).trim();
    if (!line) {
      open = false;
      continue;
    }
    const last = open ? blocks.at(-1) : undefined;
    if (isItem) {
      if (last?.kind === "list") last.items.push(line);
      else blocks.push({ kind: "list", items: [line] });
    } else if (last?.kind === "paragraph") last.lines.push(line);
    else blocks.push({ kind: "paragraph", lines: [line] });
    open = true;
  }
  return blocks;
}

// Route errors before streaming arrive as an API call error with a JSON body `{ error }`; errors while streaming
// arrive as plain errors carrying the route's Spanish copy. Anything else (network, SDK) gets the generic copy.
export function chatErrorText(error: Error) {
  if (APICallError.isInstance(error)) {
    try {
      const body: unknown = JSON.parse(error.responseBody ?? "");
      if (body && typeof body === "object" && "error" in body && typeof body.error === "string") return body.error;
    } catch {
      // Not JSON: fall back to the generic copy.
    }
    return AGENT_ERROR_MESSAGE;
  }
  return error.name === "Error" && error.message ? error.message : AGENT_ERROR_MESSAGE;
}
