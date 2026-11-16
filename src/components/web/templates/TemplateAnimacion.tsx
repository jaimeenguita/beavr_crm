"use client";

import { ContactBlock, SectionHeading, SiteShell } from "@/components/web/templates/SiteShell";
import type { Paleta, SitioContenido } from "@/lib/crm/sitios";

export function TemplateAnimacion({
  contenido,
  paleta,
  brandName,
  logoUrl,
}: {
  contenido: SitioContenido;
  paleta: Paleta;
  brandName: string;
  logoUrl?: string | null;
}) {
  const imagen = contenido.hero.imagen_url.trim();

  return (
    <SiteShell paleta={paleta} plantilla="animacion" brandName={brandName} logoUrl={logoUrl}>
      <div className="site-anim" aria-label="Sitio con pantallas animadas">
        {/* Scroll drivers: one viewport per screen (anchors + snap). */}
        <div className="site-anim-spacers" aria-hidden="true">
          <div id="inicio" className="site-anim-spacer" />
          <div id="sobre" className="site-anim-spacer" />
          <div id="servicios" className="site-anim-spacer" />
          <div id="contacto" className="site-anim-spacer" />
        </div>

        <div className="site-anim-stage">
          <section
            className="site-anim-screen site-anim-hero is-active is-seen"
            aria-labelledby="hero-title"
            data-anim-index="0"
          >
            <div className={`site-anim-hero-media ${imagen ? "has-photo" : "is-empty"}`}>
              {imagen ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imagen} alt="" />
              ) : (
                <div className="site-anim-hero-placeholder" aria-hidden="true">
                  <span>Aquí va la foto</span>
                </div>
              )}
            </div>
            <div className="site-anim-hero-veil" aria-hidden="true" />
            <div className="site-anim-inner site-anim-hero-copy">
              <p className="site-kicker">{brandName}</p>
              <h1 id="hero-title">{contenido.hero.titulo}</h1>
              {contenido.hero.subtitulo ? <p className="site-lead">{contenido.hero.subtitulo}</p> : null}
              {contenido.hero.cta ? (
                <a className="site-btn" href="#contacto">
                  {contenido.hero.cta}
                </a>
              ) : null}
              <p className="site-anim-scroll-hint">
                <span className="site-anim-scroll-dot" aria-hidden="true" />
                Desliza para continuar
              </p>
            </div>
          </section>

          <section
            className="site-anim-screen site-anim-sobre"
            aria-labelledby="sobre-title"
            data-anim-index="1"
          >
            <div className="site-anim-inner">
              <SectionHeading id="sobre-title">{contenido.sobre.titulo}</SectionHeading>
              <div className="site-box site-box-soft site-sobre-card site-anim-card">
                <p className="site-prose site-prose-centered">{contenido.sobre.texto}</p>
              </div>
            </div>
          </section>

          <section
            className="site-anim-screen site-anim-servicios"
            aria-labelledby="servicios-title"
            data-anim-index="2"
          >
            <div className="site-anim-inner">
              <SectionHeading id="servicios-title">Servicios</SectionHeading>
              <div className="site-services-grid site-anim-services">
                {contenido.servicios.map((servicio, index) => (
                  <article
                    key={index}
                    className="site-box site-box-soft site-service-tile site-anim-card"
                    style={{ ["--anim-delay" as string]: `${index * 80}ms` }}
                  >
                    <h3>{servicio.titulo}</h3>
                    {servicio.descripcion ? <p>{servicio.descripcion}</p> : null}
                    {servicio.precio.trim() ? (
                      <p className="site-service-price">{servicio.precio.trim()}</p>
                    ) : null}
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section
            className="site-anim-screen site-anim-contacto"
            aria-labelledby="contacto-title"
            data-anim-index="3"
          >
            <div className="site-anim-inner">
              <SectionHeading id="contacto-title">Contacto</SectionHeading>
              <div className="site-box site-box-accent site-contacto-panel site-anim-card">
                <ContactBlock contacto={contenido.contacto} />
                {contenido.hero.cta ? (
                  <div className="site-contacto-cta">
                    {contenido.contacto.email ? (
                      <a className="site-btn" href={`mailto:${contenido.contacto.email}`}>
                        {contenido.hero.cta}
                      </a>
                    ) : (
                      <span className="site-btn site-btn-disabled" aria-disabled="true">
                        {contenido.hero.cta}
                      </span>
                    )}
                  </div>
                ) : null}
              </div>
              <p className="site-anim-year">
                © {new Date().getFullYear()} {brandName}
              </p>
            </div>
          </section>
        </div>
      </div>
    </SiteShell>
  );
}
