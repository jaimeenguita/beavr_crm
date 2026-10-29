import { describe, expect, it } from "vitest";
import {
  matchClients,
  normalizeExtraction,
  normalizeNif,
  prefillAmounts,
  totalMismatch,
} from "@/lib/crm/invoiceExtraction";

const empty = {
  cliente_nombre: null,
  cliente_nif: null,
  numero: null,
  fecha_emision: null,
  fecha_vencimiento: null,
  base: null,
  iva_pct: null,
  total: null,
};

describe("normalizeExtraction", () => {
  it("keeps a clean result", () => {
    const clean = {
      cliente_nombre: "Clínica Vega SL",
      cliente_nif: "B12345678",
      numero: "2026/045",
      fecha_emision: "2026-10-05",
      fecha_vencimiento: "2026-11-04",
      base: 100,
      iva_pct: 21,
      total: 121,
    };
    expect(normalizeExtraction(clean)).toEqual(clean);
  });

  it("clears a negative base", () => {
    expect(normalizeExtraction({ base: -100 }).base).toBeNull();
  });

  it("clears an IVA outside the options", () => {
    expect(normalizeExtraction({ iva_pct: 7 }).iva_pct).toBeNull();
    expect(normalizeExtraction({ iva_pct: "10 %" }).iva_pct).toBe(10);
  });

  it("clears impossible dates and converts dd/mm/yyyy", () => {
    expect(normalizeExtraction({ fecha_emision: "31/02/2026" }).fecha_emision).toBeNull();
    expect(normalizeExtraction({ fecha_emision: "5/10/2026" }).fecha_emision).toBe("2026-10-05");
    expect(normalizeExtraction({ fecha_vencimiento: "2026-02-30" }).fecha_vencimiento).toBeNull();
    expect(normalizeExtraction({ fecha_vencimiento: "mañana" }).fecha_vencimiento).toBeNull();
  });

  it("parses amounts written as strings", () => {
    expect(normalizeExtraction({ total: "1.234,56" }).total).toBe(1234.56);
    expect(normalizeExtraction({ total: "1234.56" }).total).toBe(1234.56);
    expect(normalizeExtraction({ base: "1.234 €" }).base).toBe(1234);
    expect(normalizeExtraction({ base: "doce" }).base).toBeNull();
  });

  it("trims strings and turns empty ones into null", () => {
    const result = normalizeExtraction({ cliente_nombre: "  Acme  ", numero: "   ", cliente_nif: 42 });
    expect(result.cliente_nombre).toBe("Acme");
    expect(result.numero).toBeNull();
    expect(result.cliente_nif).toBeNull();
  });

  it("returns every field empty for garbage input", () => {
    expect(normalizeExtraction(null)).toEqual(empty);
    expect(normalizeExtraction("factura")).toEqual(empty);
  });
});

describe("normalizeNif", () => {
  it("uppercases and strips separators", () => {
    expect(normalizeNif("b-1234 567.8")).toBe("B12345678");
    expect(normalizeNif(" - ")).toBeNull();
    expect(normalizeNif(null)).toBeNull();
  });
});

describe("matchClients", () => {
  const companies = [
    { id: "1", nombre: "Clínica Vega SL", nif: null },
    { id: "2", nombre: "Talleres Norte", nif: "B-12345678" },
    { id: "3", nombre: "Vega", nif: "A11111111" },
  ];

  it("lists the exact NIF match first and flags it", () => {
    const result = matchClients({ cliente_nombre: "Clinica Vega", cliente_nif: "b12345678" }, companies);
    expect(result.map((match) => match.id)).toEqual(["2", "1", "3"]);
    expect(result[0].exactNif).toBe(true);
    expect(result[1].exactNif).toBe(false);
  });

  it("matches names ignoring case and accents, either way", () => {
    expect(matchClients({ cliente_nombre: "clinica vega", cliente_nif: null }, companies).map((m) => m.id)).toEqual([
      "1",
      "3",
    ]);
  });

  it("returns an empty list without matches", () => {
    expect(matchClients({ cliente_nombre: "Panadería Sol", cliente_nif: "X0000000" }, companies)).toEqual([]);
    expect(matchClients({ cliente_nombre: null, cliente_nif: null }, companies)).toEqual([]);
  });

  it("returns at most 5 matches", () => {
    const many = Array.from({ length: 8 }, (_, index) => ({ id: String(index), nombre: `Acme ${index}`, nif: null }));
    expect(matchClients({ cliente_nombre: "acme", cliente_nif: null }, many)).toHaveLength(5);
  });
});

describe("prefillAmounts", () => {
  it("derives the base from the total", () => {
    expect(prefillAmounts({ base: null, iva_pct: 21, total: 121 })).toEqual({ base: 100, iva_pct: 21 });
  });

  it("prefers the base read and defaults IVA to 21", () => {
    expect(prefillAmounts({ base: 80, iva_pct: null, total: 121 })).toEqual({ base: 80, iva_pct: 21 });
    expect(prefillAmounts({ base: null, iva_pct: null, total: null })).toEqual({ base: null, iva_pct: 21 });
  });
});

describe("totalMismatch", () => {
  it("tolerates up to 0,05 of difference", () => {
    expect(totalMismatch(100, 21, 121.04)).toBe(false);
    expect(totalMismatch(100, 21, 125)).toBe(true);
    expect(totalMismatch(100, 21, null)).toBe(false);
  });
});
