import { asSchema } from "ai";
import { describe, expect, it, vi } from "vitest";
import {
  agentTools,
  clientList,
  crmContext,
  invoiceList,
  proposalTools,
  saleList,
  salesOverview,
  type CrmRows,
} from "@/lib/agente/tools";

const today = new Date(2026, 9, 28);

const ACME = "11111111-1111-4111-8111-111111111111";
const BETA = "22222222-2222-4222-8222-222222222222";
const SALE_INVOICED = "33333333-3333-4333-8333-333333333333";
const SALE_OPEN = "44444444-4444-4444-8444-444444444444";
const INV_PENDING = "55555555-5555-4555-8555-555555555555";
const INV_PHOTO = "66666666-6666-4666-8666-666666666666";

function invoiceRow(over: Record<string, unknown>) {
  return {
    id: INV_PENDING,
    numero: "F-2026-0001",
    oportunidad_id: SALE_INVOICED,
    empresa_id: null,
    fecha_emision: "2026-10-01",
    fecha_vencimiento: "2026-10-31",
    base: 1000,
    iva_pct: 21,
    estado: "pendiente",
    pagada_en: null,
    anulada_en: null,
    origen: "venta",
    foto_path: null,
    ...over,
  };
}

function rows(): CrmRows {
  return {
    companies: [
      { id: ACME, nombre: "Acmé Soluciones", nif: "B12345678", created_at: "2026-01-01" },
      { id: BETA, nombre: "Beta SL", nif: null, created_at: "2026-01-02" },
    ],
    people: [{ id: "p1", nombre: "Ana", email: "ana@acme.es", empresa_id: ACME }],
    opportunities: [
      {
        id: SALE_INVOICED,
        persona_id: "p1",
        empresa_id: ACME,
        proyecto: "Web",
        precio: 1000,
        estado: "won",
        ganada_en: new Date(2026, 9, 5).toISOString(),
      },
      {
        id: SALE_OPEN,
        empresa_id: BETA,
        proyecto: "App",
        precio: 500,
        estado: "won",
        ganada_en: new Date(2026, 9, 20).toISOString(),
      },
      { id: "o-lost", empresa_id: BETA, proyecto: "Nada", precio: 900, estado: "lost" },
    ],
    invoices: [
      invoiceRow({}),
      invoiceRow({
        id: INV_PHOTO,
        numero: "A-77",
        oportunidad_id: null,
        empresa_id: BETA,
        fecha_emision: "2026-09-01",
        fecha_vencimiento: "2026-09-15",
        base: 200,
        iva_pct: 10,
        origen: "foto",
      }),
    ],
  };
}

describe("invoiceList", () => {
  it("returns every invoice with its client, status label and total with IVA, newest first", () => {
    const result = invoiceList(crmContext(rows()), {}, today);
    expect(result.count).toBe(2);
    expect(result.invoices).toEqual([
      {
        id: INV_PENDING,
        numero: "F-2026-0001",
        cliente: "Acmé Soluciones",
        estado: "Pendiente",
        fecha_emision: "2026-10-01",
        fecha_vencimiento: "2026-10-31",
        base: 1000,
        iva_pct: 21,
        total: 1210,
      },
      {
        id: INV_PHOTO,
        numero: "A-77",
        cliente: "Beta SL",
        estado: "Vencida",
        fecha_emision: "2026-09-01",
        fecha_vencimiento: "2026-09-15",
        base: 200,
        iva_pct: 10,
        total: 220,
      },
    ]);
  });

  it("filters by computed status and by client name ignoring case and accents", () => {
    const context = crmContext(rows());
    expect(invoiceList(context, { estado: "vencida" }, today).invoices.map((inv) => inv.numero)).toEqual(["A-77"]);
    expect(invoiceList(context, { cliente: "ACME" }, today).invoices.map((inv) => inv.numero)).toEqual([
      "F-2026-0001",
    ]);
  });

  it("caps the rows sent to the model and keeps the full count", () => {
    const many = rows();
    many.invoices = Array.from({ length: 60 }, (_, index) => invoiceRow({ id: `inv-${index}`, numero: `N-${index}` }));
    const result = invoiceList(crmContext(many), {}, today);
    expect(result.count).toBe(60);
    expect(result.invoices).toHaveLength(50);
  });
});

describe("saleList", () => {
  it("lists won sales with their live invoice, newest first", () => {
    expect(saleList(crmContext(rows()), {}, today)).toEqual({
      count: 2,
      sales: [
        { opportunityId: SALE_OPEN, cliente: "Beta SL", proyecto: "App", importe: 500, ganada_en: expect.any(String), factura: null },
        {
          opportunityId: SALE_INVOICED,
          cliente: "Acmé Soluciones",
          proyecto: "Web",
          importe: 1000,
          ganada_en: expect.any(String),
          factura: { id: INV_PENDING, numero: "F-2026-0001", estado: "Pendiente" },
        },
      ],
    });
  });

  it("keeps only sales without invoice when asked", () => {
    expect(saleList(crmContext(rows()), { sinFacturar: true }, today).sales.map((sale) => sale.opportunityId)).toEqual([
      SALE_OPEN,
    ]);
  });
});

describe("salesOverview", () => {
  it("combines the sales and invoice KPIs", () => {
    expect(salesOverview(crmContext(rows()), today)).toEqual({
      ventas: {
        monthTotal: 1500,
        prevMonthTotal: 0,
        yearTotal: 1500,
        uninvoicedTotal: 500,
        uninvoicedCount: 1,
        noPriceCount: 0,
      },
      facturas: { invoicedMonth: 1000, pendingTotal: 1430, pendingCount: 2, overdueTotal: 220, overdueCount: 1 },
    });
  });
});

describe("clientList", () => {
  it("returns id, name and NIF, filtered by name ignoring case and accents", () => {
    expect(clientList(rows().companies, { nombre: "acme" })).toEqual({
      count: 1,
      clients: [{ id: ACME, nombre: "Acmé Soluciones", nif: "B12345678" }],
    });
    expect(clientList(rows().companies, {}).count).toBe(2);
  });
});

describe("proposal tools", () => {
  function accepts(name: keyof typeof proposalTools, value: unknown) {
    return asSchema<unknown>(proposalTools[name].inputSchema).validate!(value);
  }

  it("have no server execute, so the browser resolves them", () => {
    for (const proposal of Object.values(proposalTools)) expect(proposal).not.toHaveProperty("execute");
  });

  it("accept the ids and display fields the card needs", async () => {
    expect((await accepts("proposeMarkPaid", { invoiceId: INV_PENDING, numero: "F-2026-0001" })).success).toBe(true);
    expect((await accepts("proposeCancel", { invoiceId: INV_PENDING, numero: "F-2026-0001" })).success).toBe(true);
    expect((await accepts("proposeIssueDraft", { invoiceId: INV_PENDING, cliente: "Acme" })).success).toBe(true);
    expect(
      (await accepts("proposeDraftFromSale", { opportunityId: SALE_OPEN, cliente: "Beta SL", importe: 500 })).success,
    ).toBe(true);
  });

  it("reject missing or invented ids", async () => {
    expect((await accepts("proposeMarkPaid", { numero: "F-2026-0001" })).success).toBe(false);
    expect((await accepts("proposeCancel", { invoiceId: "F-2026-0001", numero: "F-2026-0001" })).success).toBe(false);
    expect((await accepts("proposeIssueDraft", { cliente: "Acme" })).success).toBe(false);
    expect((await accepts("proposeDraftFromSale", { cliente: "Beta SL", importe: 500 })).success).toBe(false);
  });
});

describe("agentTools", () => {
  it("loads the CRM tables once per request, however many read tools run", async () => {
    const from = vi.fn(() => ({ select: () => Promise.resolve({ data: [], error: null }) }));
    const tools = agentTools({ from } as unknown as Parameters<typeof agentTools>[0]);
    const options = { toolCallId: "call-1", messages: [], context: {} };
    await tools.listInvoices.execute!({}, options);
    await tools.salesSummary.execute!({}, options);
    await tools.listSales.execute!({ sinFacturar: true }, options);
    expect(from).toHaveBeenCalledTimes(4);
  });
});
