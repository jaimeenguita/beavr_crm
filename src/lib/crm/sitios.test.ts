import { describe, expect, it } from "vitest";
import {
  defaultContenido,
  empresasSinSitio,
  isValidSlug,
  mapSitioRow,
  parseContenido,
  slugifyNombre,
  validateContenido,
} from "@/lib/crm/sitios";

describe("slugifyNombre", () => {
  it("normalizes accents and spaces", () => {
    expect(slugifyNombre("Café López S.L.")).toBe("cafe-lopez-s-l");
  });

  it("falls back when empty", () => {
    expect(slugifyNombre("!!!")).toBe("empresa");
  });
});

describe("isValidSlug", () => {
  it("accepts kebab-case", () => {
    expect(isValidSlug("acme-corp")).toBe(true);
  });

  it("rejects uppercase and underscores", () => {
    expect(isValidSlug("Acme")).toBe(false);
    expect(isValidSlug("acme_corp")).toBe(false);
  });
});

describe("parseContenido / mapSitioRow", () => {
  it("fills defaults for incomplete JSON", () => {
    const contenido = parseContenido({ hero: { titulo: "Hola" } }, "Acme");
    expect(contenido.hero.titulo).toBe("Hola");
    expect(contenido.servicios.length).toBeGreaterThanOrEqual(3);
  });

  it("maps a row", () => {
    const sitio = mapSitioRow({
      id: "s1",
      empresa_id: "e1",
      slug: "acme",
      plantilla: "moderna",
      paleta: "oscura",
      contenido: defaultContenido("Acme"),
      publicado: true,
      created_at: "2026-11-13T00:00:00Z",
      updated_at: "2026-11-13T00:00:00Z",
    });
    expect(sitio.plantilla).toBe("moderna");
    expect(sitio.paleta).toBe("oscura");
  });

  it("normalizes legacy estudio to animacion", () => {
    const sitio = mapSitioRow({
      id: "s2",
      empresa_id: "e1",
      slug: "acme",
      plantilla: "estudio",
      paleta: "clara",
      contenido: {},
      publicado: true,
    });
    expect(sitio.plantilla).toBe("animacion");
  });
});

describe("validateContenido", () => {
  it("requires hero title", () => {
    const c = defaultContenido("Acme");
    c.hero.titulo = "  ";
    expect(validateContenido(c)).toMatch(/hero/i);
  });

  it("accepts defaults", () => {
    expect(validateContenido(defaultContenido("Acme"))).toBeNull();
  });
});

describe("empresasSinSitio", () => {
  it("filters companies that already have a site", () => {
    const companies = [
      { id: "a", nombre: "A" },
      { id: "b", nombre: "B" },
    ];
    expect(empresasSinSitio(companies, [{ empresa_id: "a" }]).map((c) => c.id)).toEqual(["b"]);
  });
});
