import { APICallError } from "ai";
import { describe, expect, it } from "vitest";
import {
  AGENT_ERROR_MESSAGE,
  chatErrorText,
  hasPendingProposal,
  isProposalPart,
  PROPOSAL_CANCELLED,
  proposalName,
  proposalResultText,
  resolveProposal,
  shouldSendProposalAnswer,
  textBlocks,
  visibleParts,
  type CrmRecords,
  type ProposalPart,
} from "@/lib/agente/chat";
import type { AgentUIMessage } from "@/lib/agente/tools";
import type { Invoice, Sale } from "@/lib/crm/facturas";

const INVOICE = "55555555-5555-4555-8555-555555555555";
const SALE = "44444444-4444-4444-8444-444444444444";

const markPaid = (over: Partial<ProposalPart> = {}) =>
  ({
    type: "tool-proposeMarkPaid",
    toolCallId: "call-1",
    state: "input-available",
    input: { invoiceId: INVOICE, numero: "F-2026-0001" },
    ...over,
  }) as ProposalPart;

function assistant(parts: AgentUIMessage["parts"]): AgentUIMessage {
  return { id: "a1", role: "assistant", parts };
}

function apiError(statusCode: number, responseBody: string) {
  return new APICallError({ message: responseBody, url: "/api/agente/chat", requestBodyValues: {}, statusCode, responseBody });
}

const invoice: Invoice = {
  id: INVOICE,
  numero: "F-2026-0001",
  oportunidad_id: SALE,
  empresa_id: "c1",
  fecha_emision: "2026-10-01",
  fecha_vencimiento: "2026-10-31",
  base: 8200,
  iva_pct: 21,
  estado: "pendiente",
  pagada_en: null,
  anulada_en: null,
  origen: "venta",
  foto_path: null,
};

const sale: Sale = {
  opportunity: {
    id: SALE,
    nombre: "Web",
    empresa: "Nombre en la venta",
    empresa_id: "c1",
    persona_id: null,
    proyecto: "Web",
    email: "",
    detalles: "",
    precio: 9000,
    estado: "won",
    creado_en: "2026-09-01",
    ganada_en: "2026-09-15",
  },
  invoice: null,
};

const records: CrmRecords = { invoices: [invoice], sales: [sale], companies: [{ id: "c1", nombre: "Lucas Webs" }] };
// Before the invoice is due; the day after its due date makes it overdue.
const TODAY = new Date(2026, 9, 15);
const OVERDUE_DAY = new Date(2026, 10, 1);

describe("resolveProposal", () => {
  it("describes the change with the CRM's own number, client and total, not the model's text", () => {
    const part = markPaid({ input: { invoiceId: INVOICE, numero: "F-9999-9999" } });
    expect(resolveProposal(part, records, TODAY)).toEqual({
      kind: "invoice",
      description: "Marcar como pagada la factura F-2026-0001 (Lucas Webs, 9922 €)",
      invoice,
      precio: 8200,
    });
    expect(resolveProposal(markPaid({ type: "tool-proposeCancel" } as Partial<ProposalPart>), records, TODAY)?.description).toBe(
      "Anular la factura F-2026-0001 (Lucas Webs, 9922 €)",
    );
  });

  it("issues a draft with the sale's current price", () => {
    const part = {
      type: "tool-proposeIssueDraft",
      toolCallId: "call-2",
      state: "input-available",
      input: { invoiceId: INVOICE, cliente: "Otro" },
    } as const;
    const draft = { ...invoice, numero: null, estado: "borrador" as const, empresa_id: null };
    expect(resolveProposal(part, { ...records, invoices: [draft] }, TODAY)).toEqual({
      kind: "invoice",
      description: "Emitir el borrador de factura (Nombre en la venta, 10.890 €)",
      invoice: draft,
      precio: 9000,
    });
  });

  it("describes a draft from a sale with its price without IVA", () => {
    const part = {
      type: "tool-proposeDraftFromSale",
      toolCallId: "call-3",
      state: "output-available",
      input: { opportunityId: SALE, cliente: "Otro", importe: 1 },
      output: { ok: true },
    } as const;
    expect(resolveProposal(part, records, TODAY)).toEqual({
      kind: "sale",
      description: "Crear un borrador de factura para la venta (Nombre en la venta, 9000 € sin IVA)",
      sale,
    });
  });

  it("blocks a change the invoice's current state no longer allows", () => {
    const blocked = (estado: string) => ({ kind: "blocked", description: `Esta factura ya no admite ese cambio (estado: ${estado}).` });
    const paid = { ...invoice, estado: "pagada" as const };
    expect(resolveProposal(markPaid(), { ...records, invoices: [paid] }, TODAY)).toEqual(blocked("Pagada"));
    const draft = { ...invoice, numero: null, estado: "borrador" as const };
    expect(
      resolveProposal(markPaid({ type: "tool-proposeCancel" } as Partial<ProposalPart>), { ...records, invoices: [draft] }, TODAY),
    ).toEqual(blocked("Borrador"));
    const issue = { type: "tool-proposeIssueDraft", toolCallId: "c", state: "input-available", input: { invoiceId: INVOICE, cliente: "X" } } as const;
    expect(resolveProposal(issue, records, OVERDUE_DAY)).toEqual(blocked("Vencida"));
  });

  it("keeps describing an answered proposal after its own change applied", () => {
    const paid = { ...invoice, estado: "pagada" as const };
    const answered = markPaid({ state: "output-available", output: { ok: true } });
    expect(resolveProposal(answered, { ...records, invoices: [paid] }, TODAY)?.description).toBe(
      "Marcar como pagada la factura F-2026-0001 (Lucas Webs, 9922 €)",
    );
  });

  it("still marks paid or cancels an overdue invoice", () => {
    expect(resolveProposal(markPaid(), records, OVERDUE_DAY)?.kind).toBe("invoice");
    expect(resolveProposal(markPaid({ type: "tool-proposeCancel" } as Partial<ProposalPart>), records, OVERDUE_DAY)?.kind).toBe(
      "invoice",
    );
  });

  it("is null for unknown ids, a streaming input or a missing input", () => {
    expect(resolveProposal(markPaid({ input: { invoiceId: SALE, numero: "F" } }), records, TODAY)).toBeNull();
    expect(resolveProposal(markPaid({ state: "input-streaming", input: { numero: "F" } }), records, TODAY)).toBeNull();
    expect(
      resolveProposal(markPaid({ state: "output-error", input: undefined, errorText: "x" } as Partial<ProposalPart>), records, TODAY),
    ).toBeNull();
  });
});

describe("shouldSendProposalAnswer", () => {
  const read = { type: "tool-listInvoices", toolCallId: "r", state: "output-available", input: {}, output: {} } as never;

  it("continues once the proposal of the last step has its answer", () => {
    expect(
      shouldSendProposalAnswer({
        messages: [assistant([{ type: "step-start" }, markPaid({ state: "output-available", output: { ok: true } })])],
      }),
    ).toBe(true);
  });

  it("does not resend after read tools only or while the proposal waits", () => {
    expect(shouldSendProposalAnswer({ messages: [assistant([{ type: "step-start" }, read])] })).toBe(false);
    expect(shouldSendProposalAnswer({ messages: [assistant([{ type: "step-start" }, markPaid()])] })).toBe(false);
    expect(
      shouldSendProposalAnswer({
        messages: [
          assistant([
            { type: "step-start" },
            markPaid({ state: "output-available", output: { ok: true } }),
            { type: "step-start" },
            read,
          ]),
        ],
      }),
    ).toBe(false);
  });
});

describe("proposalResultText", () => {
  it("shows Cancelado. for a cancelled proposal while the model receives the full sentence", () => {
    expect(
      proposalResultText(markPaid({ state: "output-available", output: { ok: false, error: PROPOSAL_CANCELLED } })),
    ).toBe("Cancelado.");
  });

  it("shows Hecho., the action error or the tool error once answered", () => {
    expect(proposalResultText(markPaid())).toBeNull();
    expect(proposalResultText(markPaid({ state: "output-available", output: { ok: true } }))).toBe("Hecho.");
    expect(
      proposalResultText(markPaid({ state: "output-available", output: { ok: false, error: "No se ha podido." } })),
    ).toBe("No se ha podido.");
    expect(proposalResultText(markPaid({ state: "output-error", errorText: "Fallo" } as Partial<ProposalPart>))).toBe(
      "Fallo",
    );
  });
});

describe("proposal parts", () => {
  it("recognises the four proposal tools only", () => {
    expect(isProposalPart(markPaid())).toBe(true);
    expect(proposalName(markPaid())).toBe("proposeMarkPaid");
    expect(
      isProposalPart({ type: "tool-listInvoices", toolCallId: "c", state: "input-available", input: {} }),
    ).toBe(false);
    expect(isProposalPart({ type: "text", text: "Hola" })).toBe(false);
  });

  it("detects a proposal waiting for the user in the last assistant message", () => {
    expect(hasPendingProposal([])).toBe(false);
    expect(hasPendingProposal([assistant([markPaid()])])).toBe(true);
    expect(hasPendingProposal([assistant([markPaid({ state: "output-available", output: { ok: true } })])])).toBe(
      false,
    );
    expect(hasPendingProposal([assistant([markPaid()]), { id: "u2", role: "user", parts: [] }])).toBe(false);
  });

  it("keeps only text with content and proposals whose input is complete", () => {
    const parts: AgentUIMessage["parts"] = [
      { type: "step-start" },
      { type: "reasoning", text: "pensando" },
      { type: "tool-listInvoices", toolCallId: "c", state: "input-available", input: {} },
      { type: "text", text: "  " },
      { type: "text", text: "Tienes 1 factura." },
      markPaid({ state: "input-streaming", input: undefined }),
      markPaid(),
    ];
    expect(visibleParts(assistant(parts))).toEqual([parts[4], parts[6]]);
  });
});

describe("textBlocks", () => {
  it("splits paragraphs and simple lists, dropping markdown marks", () => {
    expect(textBlocks("## Resumen\nTienes **2** facturas.\nTotal 10 €\n\n- F-1: Acme\n* F-2: Beta\n\nFin")).toEqual([
      { kind: "paragraph", lines: ["Resumen", "Tienes 2 facturas.", "Total 10 €"] },
      { kind: "list", items: ["F-1: Acme", "F-2: Beta"] },
      { kind: "paragraph", lines: ["Fin"] },
    ]);
  });

  it("keeps HTML as plain text and ignores empty input", () => {
    expect(textBlocks("<b>hola</b>")).toEqual([{ kind: "paragraph", lines: ["<b>hola</b>"] }]);
    expect(textBlocks("\n \n")).toEqual([]);
  });

  it("starts a new block when a list is followed by text", () => {
    expect(textBlocks("Facturas:\n- A\nY nada más.")).toEqual([
      { kind: "paragraph", lines: ["Facturas:"] },
      { kind: "list", items: ["A"] },
      { kind: "paragraph", lines: ["Y nada más."] },
    ]);
  });
});

describe("textBlocks tables", () => {
  const table = {
    kind: "table",
    header: ["Factura", "Cliente", "Total"],
    rows: [
      ["F-1", "USAL", "14.520,00 €"],
      ["F-2", "Acme", "10 €"],
    ],
  };

  it("parses a pipe table with header, separator and body rows", () => {
    const text = "| Factura | Cliente | Total |\n|---|:---:|---:|\n| F-1 | USAL | 14.520,00 € |\n| F-2 | Acme | 10 € |";
    expect(textBlocks(text)).toEqual([table]);
  });

  it("parses a table without outer pipes and with extra spaces", () => {
    const text = "Factura  |  Cliente | Total\n --- | --- | ---\nF-1 | USAL |  14.520,00 €\nF-2|Acme|10 €";
    expect(textBlocks(text)).toEqual([table]);
  });

  it("keeps the text before and after a table", () => {
    const text = "Estas son:\n| A | B |\n|---|---|\n| 1 | 2 |\nFin.";
    expect(textBlocks(text)).toEqual([
      { kind: "paragraph", lines: ["Estas son:"] },
      { kind: "table", header: ["A", "B"], rows: [["1", "2"]] },
      { kind: "paragraph", lines: ["Fin."] },
    ]);
  });

  it("strips ** from headers, cells and text", () => {
    const text = "**Total**\n| **A** | B |\n|---|---|\n| **1** | 2 |";
    expect(textBlocks(text)).toEqual([
      { kind: "paragraph", lines: ["Total"] },
      { kind: "table", header: ["A", "B"], rows: [["1", "2"]] },
    ]);
  });

  it("does not treat a pipe line without a separator row as a table", () => {
    expect(textBlocks("a | b\nc | d")).toEqual([{ kind: "paragraph", lines: ["a | b", "c | d"] }]);
  });
});

describe("chatErrorText", () => {
  it("reads the JSON error of a failed request", () => {
    expect(chatErrorText(apiError(401, JSON.stringify({ error: "Sesión no válida." })))).toBe("Sesión no válida.");
    expect(chatErrorText(apiError(500, "<html>"))).toBe(AGENT_ERROR_MESSAGE);
  });

  it("shows the stream error copy and hides other errors", () => {
    const limit = "El agente ha alcanzado el límite diario gratuito. Inténtalo mañana.";
    expect(chatErrorText(new Error(limit))).toBe(limit);
    expect(chatErrorText(new TypeError("Failed to fetch"))).toBe(AGENT_ERROR_MESSAGE);
  });
});
