import { describe, expect, it } from "vitest";
import {
  addDays,
  buildSales,
  invoiceBlockMessage,
  invoiceErrorField,
  invoiceErrorMessage,
  invoiceStatus,
  invoiceSummary,
  invoiceTotal,
  isOverdue,
  issueDates,
  mapFacturaRow,
  monthlySoldVsInvoiced,
  salesSummary,
  type Invoice,
} from "@/lib/crm/facturas";
import type { MappedOpportunity } from "@/lib/crm/mapRows";

const today = new Date(2026, 9, 28);

function opp(over: Partial<MappedOpportunity> = {}): MappedOpportunity {
  return {
    id: "o1",
    nombre: "Ana",
    empresa: "Acme",
    empresa_id: "c1",
    persona_id: null,
    proyecto: "Web",
    email: "a@a.es",
    detalles: "",
    precio: 1000,
    estado: "won",
    creado_en: "2026-01-01T00:00:00Z",
    ganada_en: new Date(2026, 9, 10).toISOString(),
    ...over,
  };
}

function inv(over: Partial<Invoice> = {}): Invoice {
  return {
    id: "i1",
    numero: "F-2026-0001",
    oportunidad_id: "o1",
    empresa_id: "c1",
    fecha_emision: "2026-10-05",
    fecha_vencimiento: "2026-11-04",
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

describe("mapFacturaRow", () => {
  it("coerces numeric strings", () => {
    const mapped = mapFacturaRow({
      id: 7,
      numero: null,
      oportunidad_id: "o1",
      empresa_id: null,
      fecha_emision: "2026-10-05",
      fecha_vencimiento: "2026-11-04",
      base: "2980.00",
      iva_pct: "21",
      estado: "borrador",
    });
    expect(mapped.base).toBe(2980);
    expect(mapped.iva_pct).toBe(21);
    expect(mapped.id).toBe("7");
    expect(mapped.numero).toBeNull();
    expect(mapped.empresa_id).toBeNull();
    expect(mapped.origen).toBe("venta");
    expect(mapped.foto_path).toBeNull();
  });

  it("maps photo invoices without a sale", () => {
    const mapped = mapFacturaRow({
      id: "p1",
      numero: "2026/045",
      oportunidad_id: null,
      empresa_id: "c1",
      fecha_emision: "2026-10-05",
      fecha_vencimiento: "2026-11-04",
      base: 100,
      iva_pct: 10,
      estado: "pagada",
      origen: "foto",
      foto_path: "p1/1761700000000.jpg",
    });
    expect(mapped.oportunidad_id).toBeNull();
    expect(mapped.origen).toBe("foto");
    expect(mapped.foto_path).toBe("p1/1761700000000.jpg");
  });
});

describe("invoiceTotal", () => {
  it("adds IVA and rounds to 2 decimals", () => {
    expect(invoiceTotal({ base: 1000, iva_pct: 21 })).toBe(1210);
    expect(invoiceTotal({ base: 2980, iva_pct: 21 })).toBe(3605.8);
  });
});

describe("isOverdue / invoiceStatus", () => {
  it("only flags pendiente invoices strictly past due", () => {
    expect(isOverdue(inv({ fecha_vencimiento: "2026-10-28" }), today)).toBe(false);
    expect(isOverdue(inv({ fecha_vencimiento: "2026-10-27" }), today)).toBe(true);
    expect(isOverdue(inv({ estado: "pagada", fecha_vencimiento: "2026-01-01" }), today)).toBe(false);
  });

  it("returns vencida only for overdue pendiente", () => {
    expect(invoiceStatus(inv({ fecha_vencimiento: "2026-10-27" }), today)).toBe("vencida");
    expect(invoiceStatus(inv(), today)).toBe("pendiente");
    expect(invoiceStatus(inv({ estado: "pagada", fecha_vencimiento: "2026-01-01" }), today)).toBe("pagada");
    expect(invoiceStatus(inv({ estado: "borrador", fecha_vencimiento: "2026-01-01" }), today)).toBe("borrador");
  });
});

describe("buildSales", () => {
  it("excludes non-won, ignores anulada invoices and sorts by ganada_en desc", () => {
    const older = opp({ id: "a", ganada_en: new Date(2026, 8, 1).toISOString() });
    const newer = opp({ id: "b", ganada_en: new Date(2026, 9, 20).toISOString() });
    const lost = opp({ id: "c", estado: "lost" });
    const sales = buildSales(
      [older, lost, newer],
      [
        inv({ id: "x", oportunidad_id: "a", estado: "anulada" }),
        inv({ id: "y", oportunidad_id: "b" }),
      ],
    );
    expect(sales.map((s) => s.opportunity.id)).toEqual(["b", "a"]);
    expect(sales[0].invoice?.id).toBe("y");
    expect(sales[1].invoice).toBeNull();
  });

  it("ignores photo invoices", () => {
    const sales = buildSales([opp()], [inv({ id: "p", oportunidad_id: null, origen: "foto", numero: "2026/045" })]);
    expect(sales[0].invoice).toBeNull();
    expect(salesSummary(sales, today).uninvoicedCount).toBe(1);
  });
});

describe("salesSummary", () => {
  it("ignores null price in every amount and counts it", () => {
    const sales = buildSales([opp({ precio: null })], []);
    expect(salesSummary(sales, today)).toEqual({
      monthTotal: 0,
      prevMonthTotal: 0,
      yearTotal: 0,
      uninvoicedTotal: 0,
      uninvoicedCount: 0,
      noPriceCount: 1,
    });
  });

  it("buckets month totals by ganada_en and counts uninvoiced", () => {
    const sales = buildSales(
      [
        opp({ id: "a", precio: 500, ganada_en: new Date(2026, 9, 3).toISOString() }),
        opp({ id: "b", precio: 300, ganada_en: new Date(2026, 8, 15).toISOString() }),
        opp({ id: "c", precio: 200, ganada_en: new Date(2025, 11, 15).toISOString() }),
      ],
      [inv({ oportunidad_id: "b" })],
    );
    const s = salesSummary(sales, today);
    expect(s.monthTotal).toBe(500);
    expect(s.prevMonthTotal).toBe(300);
    expect(s.yearTotal).toBe(800);
    expect(s.uninvoicedTotal).toBe(700);
    expect(s.uninvoicedCount).toBe(2);
  });

  it("counts sales without ganada_en as uninvoiced but not in date totals", () => {
    const sales = buildSales([opp({ precio: 400, ganada_en: null })], []);
    const s = salesSummary(sales, today);
    expect(s.yearTotal).toBe(0);
    expect(s.uninvoicedTotal).toBe(400);
  });
});

describe("invoiceSummary", () => {
  it("excludes drafts and anuladas and splits overdue", () => {
    const s = invoiceSummary(
      [
        inv({ id: "1", base: 1000 }),
        inv({ id: "2", base: 100, fecha_vencimiento: "2026-10-01" }),
        inv({ id: "3", base: 200, estado: "pagada" }),
        inv({ id: "4", base: 999, estado: "borrador" }),
        inv({ id: "5", base: 999, estado: "anulada" }),
        inv({ id: "6", base: 50, estado: "pagada", fecha_emision: "2026-09-30" }),
      ],
      today,
    );
    expect(s.invoicedMonth).toBe(1300);
    expect(s.pendingTotal).toBe(1331);
    expect(s.pendingCount).toBe(2);
    expect(s.overdueTotal).toBe(121);
    expect(s.overdueCount).toBe(1);
  });
});

describe("monthlySoldVsInvoiced", () => {
  it("returns 12 months ending in the current one with values in the right buckets", () => {
    const sales = buildSales(
      [
        opp({ id: "a", precio: 500, ganada_en: new Date(2026, 9, 3).toISOString() }),
        opp({ id: "b", precio: 300, ganada_en: new Date(2025, 10, 3).toISOString() }),
      ],
      [],
    );
    const r = monthlySoldVsInvoiced(
      sales,
      [
        inv({ base: 400, fecha_emision: "2026-10-05" }),
        inv({ id: "2", base: 90, fecha_emision: "2026-09-05", estado: "pagada" }),
        inv({ id: "3", base: 999, estado: "anulada" }),
        inv({ id: "4", base: 999, estado: "borrador" }),
      ],
      today,
    );
    expect(r.labels).toHaveLength(12);
    expect(r.labels[11]).toBe(new Date(2026, 9, 1).toLocaleDateString("es-ES", { month: "short", year: "2-digit" }));
    expect(r.sold[11]).toBe(500);
    expect(r.sold[0]).toBe(300);
    expect(r.invoiced[11]).toBe(400);
    expect(r.invoiced[10]).toBe(90);
    expect(r.invoiced.reduce((a, b) => a + b, 0)).toBe(490);
  });
});

describe("invoiceBlockMessage", () => {
  it("extracts the invoice number", () => {
    expect(invoiceBlockMessage({ message: "factura_emitida:F-2026-0007" })).toContain("F-2026-0007");
    expect(invoiceBlockMessage({ message: "x factura_emitida:F-2026-10000 y" })).toBe(
      "Esta oportunidad tiene la factura F-2026-10000 emitida. Anúlala antes de cambiarla.",
    );
  });

  it("returns null for unrelated errors", () => {
    expect(invoiceBlockMessage({ message: "boom" })).toBeNull();
    expect(invoiceBlockMessage(null)).toBeNull();
  });
});

describe("invoiceErrorField", () => {
  it("places a duplicate number on the number field", () => {
    expect(invoiceErrorField({ message: "factura_numero_duplicado:2026/045" })).toBe("numero");
  });

  it("returns null for any other error", () => {
    expect(invoiceErrorField({ message: "factura_foto_incompleta: missing client" })).toBeNull();
    expect(invoiceErrorField({ message: "boom" })).toBeNull();
    expect(invoiceErrorField(null)).toBeNull();
  });
});

describe("invoiceErrorMessage", () => {
  it("maps a duplicate number", () => {
    expect(invoiceErrorMessage({ message: "factura_numero_duplicado:2026/045" })).toBe(
      "Ya existe una factura con el número 2026/045.",
    );
  });

  it("delegates issued-invoice blocks to invoiceBlockMessage", () => {
    expect(invoiceErrorMessage({ message: "factura_emitida:F-2026-0007" })).toBe(
      invoiceBlockMessage({ message: "factura_emitida:F-2026-0007" }),
    );
  });

  it("maps a company with invoices and an incomplete photo invoice", () => {
    expect(invoiceErrorMessage({ message: "empresa_con_facturas:Clínica Vega SL" })).toBe(
      "No se puede eliminar Clínica Vega SL porque tiene facturas emitidas.",
    );
    expect(
      invoiceErrorMessage({ message: "factura_foto_incompleta: a photo invoice needs a number and a client" }),
    ).toBe("Faltan datos de la factura: número y cliente son obligatorios.");
  });

  it("returns null for unrelated errors", () => {
    expect(invoiceErrorMessage({ message: "boom" })).toBeNull();
    expect(invoiceErrorMessage(null)).toBeNull();
  });
});

describe("addDays", () => {
  it("adds days to an ISO date", () => {
    expect(addDays("2026-10-28", 30)).toBe("2026-11-27");
  });
});

describe("issueDates", () => {
  it("moves a past draft to today keeping the original gap", () => {
    expect(issueDates({ fecha_emision: "2026-09-01", fecha_vencimiento: "2026-10-01" }, today)).toEqual({
      fecha_emision: "2026-10-28",
      fecha_vencimiento: "2026-11-27",
    });
  });

  it("keeps the dates of a current draft", () => {
    const dates = { fecha_emision: "2026-10-28", fecha_vencimiento: "2026-11-15" };
    expect(issueDates(dates, today)).toEqual(dates);
  });
});
