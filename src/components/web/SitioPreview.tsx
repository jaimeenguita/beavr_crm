import type { CSSProperties } from "react";
import { paletteVars, PLANTILLA_LABELS, PALETA_LABELS, type Paleta, type Plantilla } from "@/lib/crm/sitios";

function HeroPhotoSlot({ layout }: { layout: "panel" | "banner" }) {
  return (
    <div className={`sitio-preview-photo-slot sitio-preview-photo-slot-${layout}`} aria-hidden="true">
      <span className="sitio-preview-photo-icon" />
      <span className="sitio-preview-photo-label">Aquí va la foto</span>
    </div>
  );
}

export function SitioPreview({
  plantilla,
  paleta,
  brandName = "Tu empresa",
}: {
  plantilla: Plantilla;
  paleta: Paleta;
  brandName?: string;
}) {
  const vars = paletteVars(paleta) as CSSProperties;

  return (
    <div className="sitio-preview" style={vars} data-plantilla={plantilla} data-paleta={paleta}>
      <div className="sitio-preview-chrome" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="sitio-preview-scroll">
        {plantilla === "animacion" ? (
          <div className="sitio-preview-anim" aria-hidden="true">
            <div className="sitio-preview-anim-stage">
              <div className="sitio-preview-anim-panel sitio-preview-anim-panel-hero">
                <HeroPhotoSlot layout="banner" />
                <div className="sitio-preview-anim-copy">
                  <span className="sitio-preview-brand">{brandName}</span>
                  <span className="sitio-preview-title" />
                  <span className="sitio-preview-btn" />
                </div>
                <span className="sitio-preview-anim-tag">1 · Hero</span>
              </div>
              <div className="sitio-preview-anim-panel sitio-preview-anim-panel-1">
                <span className="sitio-preview-heading" />
                <div className="sitio-preview-sobre" />
                <span className="sitio-preview-anim-tag">2 · Sobre</span>
              </div>
              <div className="sitio-preview-anim-panel sitio-preview-anim-panel-2">
                <span className="sitio-preview-heading" />
                <div className="sitio-preview-cards">
                  <span />
                  <span />
                  <span />
                </div>
                <span className="sitio-preview-anim-tag">3 · Servicios</span>
              </div>
              <div className="sitio-preview-anim-panel sitio-preview-anim-panel-3">
                <span className="sitio-preview-heading" />
                <div className="sitio-preview-contacto">
                  <span />
                  <span />
                  <span />
                </div>
                <span className="sitio-preview-anim-tag">4 · Contacto</span>
              </div>
            </div>
            <p className="sitio-preview-anim-cue">
              <span className="sitio-preview-anim-cue-arrow" />
              Scroll
            </p>
          </div>
        ) : (
          <div className="sitio-preview-frame">
            <div className="sitio-preview-header">
              <span className="sitio-preview-brand">{brandName}</span>
              <span className="sitio-preview-nav" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            </div>

            <div className="sitio-preview-hero-moderna">
              <HeroPhotoSlot layout="banner" />
              <div className="sitio-preview-hero-moderna-copy">
                <span className="sitio-preview-kicker" />
                <span className="sitio-preview-title" />
                <span className="sitio-preview-lead" />
                <span className="sitio-preview-btn" />
              </div>
            </div>

            <div className="sitio-preview-section">
              <span className="sitio-preview-heading" />
              <div className="sitio-preview-sobre" />
            </div>

            <div className="sitio-preview-section">
              <span className="sitio-preview-heading" />
              <div className="sitio-preview-cards">
                <span />
                <span />
                <span />
              </div>
            </div>

            <div className="sitio-preview-section">
              <span className="sitio-preview-heading" />
              <div className="sitio-preview-contacto">
                <span />
                <span />
                <span />
              </div>
            </div>

            <div className="sitio-preview-footer" aria-hidden="true">
              <span />
            </div>
          </div>
        )}
      </div>
      <p className="sitio-preview-caption">
        Vista previa · {PLANTILLA_LABELS[plantilla]} · {PALETA_LABELS[paleta]}
      </p>
    </div>
  );
}

/** Tiny thumbnail used inside each plantilla radio card. */
export function PlantillaThumb({ plantilla }: { plantilla: Plantilla }) {
  return (
    <div className={`sitio-thumb sitio-thumb-${plantilla}`} aria-hidden="true">
      {plantilla === "moderna" ? (
        <>
          <div className="sitio-thumb-moderna-hero" />
          <div className="sitio-thumb-rows">
            <span />
            <span />
          </div>
        </>
      ) : (
        <>
          <div className="sitio-thumb-anim-stack">
            <span />
            <span />
            <span />
          </div>
        </>
      )}
    </div>
  );
}

export function PaletaThumb({ paleta }: { paleta: Paleta }) {
  const vars = paletteVars(paleta) as CSSProperties;
  return (
    <div className="sitio-paleta-thumb" style={vars} aria-hidden="true">
      <div className="sitio-paleta-thumb-bg" />
      <div className="sitio-paleta-thumb-soft" />
      <div className="sitio-paleta-thumb-accent" />
    </div>
  );
}
