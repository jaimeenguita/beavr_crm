import { strOrNull } from "@/lib/crm/mapRows";

export type Plantilla = "animacion" | "moderna";
/** clara/oscura = neutrals; sol/rio = warm/cool accent systems with soft fills. */
export type Paleta = "clara" | "oscura" | "sol" | "rio";

export type ServicioItem = {
  titulo: string;
  descripcion: string;
  /** Empty string = no price shown on the public site. */
  precio: string;
};

export type SitioContenido = {
  hero: { titulo: string; subtitulo: string; cta: string; imagen_url: string };
  sobre: { titulo: string; texto: string };
  servicios: ServicioItem[];
  contacto: { email: string; telefono: string; direccion: string };
};

export type SitioWeb = {
  id: string;
  empresa_id: string;
  slug: string;
  plantilla: Plantilla;
  paleta: Paleta;
  contenido: SitioContenido;
  publicado: boolean;
  created_at: string;
  updated_at: string;
};

export const PLANTILLAS: { value: Plantilla; label: string; description: string }[] = [
  {
    value: "animacion",
    label: "Animación",
    description: "Aconsejable si quieres meter mucho texto, animaciones al hacer scroll.",
  },
  {
    value: "moderna",
    label: "Moderna",
    description: "Estilo simple y aconsejable si quieres meter poca información y algo más simple.",
  },
];

export const PALETAS: { value: Paleta; label: string; description: string }[] = [
  { value: "clara", label: "Clara", description: "Grises + acento negro." },
  { value: "oscura", label: "Oscura", description: "Fondos oscuros + acento claro." },
  { value: "sol", label: "Sol", description: "Cálidos + acento naranja." },
  { value: "rio", label: "Río", description: "Fríos + acento azul." },
];

export const PLANTILLA_LABELS: Record<Plantilla, string> = {
  animacion: "Animación",
  moderna: "Moderna",
};

export const PALETA_LABELS: Record<Paleta, string> = {
  clara: "Clara",
  oscura: "Oscura",
  sol: "Sol",
  rio: "Río",
};

export const MIN_SERVICIOS = 3;
export const MAX_SERVICIOS = 6;

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugifyNombre(nombre: string): string {
  const base = nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || "empresa";
}

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug) && slug.length >= 2 && slug.length <= 60;
}

export function defaultContenido(nombreEmpresa: string): SitioContenido {
  return {
    hero: {
      titulo: nombreEmpresa,
      subtitulo: "Soluciones profesionales para tu negocio",
      cta: "Contactar",
      imagen_url: "",
    },
    sobre: {
      titulo: "Sobre nosotros",
      texto: `${nombreEmpresa} acompaña a sus clientes con un equipo cercano y resultados medibles.`,
    },
    servicios: [
      { titulo: "Consultoría", descripcion: "Análisis y plan de acción a medida.", precio: "" },
      { titulo: "Implementación", descripcion: "Puesta en marcha con seguimiento continuo.", precio: "" },
      { titulo: "Soporte", descripcion: "Acompañamiento y respuesta rápida.", precio: "" },
    ],
    contacto: {
      email: "",
      telefono: "",
      direccion: "",
    },
  };
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function parseServicios(value: unknown): ServicioItem[] {
  if (!Array.isArray(value)) return defaultContenido("Empresa").servicios;
  const items = value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const titulo = asString(row.titulo).trim();
      const descripcion = asString(row.descripcion).trim();
      const precio =
        typeof row.precio === "number" && Number.isFinite(row.precio)
          ? String(row.precio)
          : asString(row.precio).trim();
      if (!titulo && !descripcion) return null;
      return { titulo: titulo || "Servicio", descripcion, precio };
    })
    .filter((item): item is ServicioItem => item !== null);
  if (items.length < MIN_SERVICIOS) return defaultContenido("Empresa").servicios;
  return items.slice(0, MAX_SERVICIOS);
}

export function parseContenido(value: unknown, nombreEmpresa = "Empresa"): SitioContenido {
  const fallback = defaultContenido(nombreEmpresa);
  if (!value || typeof value !== "object") return fallback;
  const raw = value as Record<string, unknown>;
  const hero = (raw.hero && typeof raw.hero === "object" ? raw.hero : {}) as Record<string, unknown>;
  const sobre = (raw.sobre && typeof raw.sobre === "object" ? raw.sobre : {}) as Record<string, unknown>;
  const contacto =
    (raw.contacto && typeof raw.contacto === "object" ? raw.contacto : {}) as Record<string, unknown>;

  return {
    hero: {
      titulo: asString(hero.titulo, fallback.hero.titulo),
      subtitulo: asString(hero.subtitulo, fallback.hero.subtitulo),
      cta: asString(hero.cta, fallback.hero.cta),
      imagen_url: asString(hero.imagen_url),
    },
    sobre: {
      titulo: asString(sobre.titulo, fallback.sobre.titulo),
      texto: asString(sobre.texto, fallback.sobre.texto),
    },
    servicios: parseServicios(raw.servicios),
    contacto: {
      email: asString(contacto.email),
      telefono: asString(contacto.telefono),
      direccion: asString(contacto.direccion),
    },
  };
}

export function isPlantilla(value: unknown): value is Plantilla {
  return value === "animacion" || value === "moderna";
}

/** Legacy `clasica` / `estudio` rows render as animacion. */
export function normalizePlantilla(value: unknown): Plantilla {
  if (value === "moderna") return "moderna";
  return "animacion";
}

export function isPaleta(value: unknown): value is Paleta {
  return value === "clara" || value === "oscura" || value === "sol" || value === "rio";
}

export function mapSitioRow(row: Record<string, unknown>, nombreEmpresa?: string): SitioWeb {
  return {
    id: String(row.id),
    empresa_id: String(row.empresa_id),
    slug: String(row.slug),
    plantilla: normalizePlantilla(row.plantilla),
    paleta: isPaleta(row.paleta) ? row.paleta : "clara",
    contenido: parseContenido(row.contenido, nombreEmpresa),
    publicado: row.publicado !== false,
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: String(row.updated_at ?? new Date().toISOString()),
  };
}

export type PaletteVars = {
  "--site-bg": string;
  "--site-fg": string;
  "--site-muted": string;
  "--site-accent": string;
  "--site-accent-fg": string;
  "--site-surface": string;
  "--site-border": string;
  "--site-soft": string;
  "--site-soft-strong": string;
};

/** Distinct systems: page tint + soft fills + accent (~10% UI). */
export function paletteVars(paleta: Paleta): PaletteVars {
  if (paleta === "oscura") {
    return {
      "--site-bg": "#0c0c0c",
      "--site-fg": "#f4f4f5",
      "--site-muted": "#a1a1aa",
      "--site-accent": "#e4e4e7",
      "--site-accent-fg": "#0c0c0c",
      "--site-surface": "#161616",
      "--site-border": "#2e2e2e",
      "--site-soft": "#1a1a1a",
      "--site-soft-strong": "#242424",
    };
  }
  if (paleta === "sol") {
    return {
      "--site-bg": "#fffaf5",
      "--site-fg": "#1c1917",
      "--site-muted": "#78716c",
      "--site-accent": "#ea580c",
      "--site-accent-fg": "#ffffff",
      "--site-surface": "#ffffff",
      "--site-border": "#fed7aa",
      "--site-soft": "#fff7ed",
      "--site-soft-strong": "#ffedd5",
    };
  }
  if (paleta === "rio") {
    return {
      "--site-bg": "#f5f9ff",
      "--site-fg": "#0f172a",
      "--site-muted": "#64748b",
      "--site-accent": "#2563eb",
      "--site-accent-fg": "#ffffff",
      "--site-surface": "#ffffff",
      "--site-border": "#bfdbfe",
      "--site-soft": "#eff6ff",
      "--site-soft-strong": "#dbeafe",
    };
  }
  return {
    "--site-bg": "#fafafa",
    "--site-fg": "#111111",
    "--site-muted": "#52525b",
    "--site-accent": "#18181b",
    "--site-accent-fg": "#fafafa",
    "--site-surface": "#ffffff",
    "--site-border": "#e4e4e7",
    "--site-soft": "#f4f4f5",
    "--site-soft-strong": "#e4e4e7",
  };
}

export function validateContenido(contenido: SitioContenido): string | null {
  if (!contenido.hero.titulo.trim()) return "El título del hero es obligatorio.";
  if (!contenido.sobre.titulo.trim()) return "El título de «Sobre nosotros» es obligatorio.";
  if (!contenido.sobre.texto.trim()) return "El texto de «Sobre nosotros» es obligatorio.";
  if (contenido.servicios.length < MIN_SERVICIOS) {
    return `Añade al menos ${MIN_SERVICIOS} servicios.`;
  }
  if (contenido.servicios.length > MAX_SERVICIOS) {
    return `Como máximo ${MAX_SERVICIOS} servicios.`;
  }
  if (contenido.servicios.some((s) => !s.titulo.trim())) {
    return "Cada servicio necesita un título.";
  }
  return null;
}

/** Companies that do not yet have a website. */
export function empresasSinSitio<T extends { id: string }>(
  companies: T[],
  sitios: { empresa_id: string }[],
): T[] {
  const taken = new Set(sitios.map((s) => s.empresa_id));
  return companies.filter((c) => !taken.has(c.id));
}

export function empresaNombre(
  companies: { id: string; nombre: string }[],
  empresaId: string,
): string {
  return companies.find((c) => c.id === empresaId)?.nombre ?? "Empresa";
}

export function sitioPublicPath(slug: string) {
  return `/sitio/${slug}`;
}

export function strOrEmpty(value: unknown) {
  return strOrNull(value) ?? "";
}
