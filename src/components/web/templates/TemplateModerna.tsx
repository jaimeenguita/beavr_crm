import { ContactBlock, SectionHeading, SiteShell } from "@/components/web/templates/SiteShell";
import type { Paleta, SitioContenido } from "@/lib/crm/sitios";

export function TemplateModerna({
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
    <SiteShell paleta={paleta} plantilla="moderna" brandName={brandName} logoUrl={logoUrl}>
      <section
        className={`site-hero site-hero-moderna site-reveal ${imagen ? "has-photo" : ""}`}
        aria-labelledby="hero-title"
      >
        {imagen ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="site-hero-bg-img" src={imagen} alt="" />
        ) : null}
        <div className="site-hero-moderna-content">
          <p className="site-kicker">{brandName}</p>
          <h1 id="hero-title">{contenido.hero.titulo}</h1>
          {contenido.hero.subtitulo ? <p className="site-lead">{contenido.hero.subtitulo}</p> : null}
          {contenido.hero.cta ? (
            <a className="site-btn" href="#contacto">
              {contenido.hero.cta}
            </a>
          ) : null}
        </div>
      </section>

      <section id="sobre" className="site-block site-reveal" aria-labelledby="sobre-title">
        <div className="site-pad site-pad-wide">
          <SectionHeading id="sobre-title">{contenido.sobre.titulo}</SectionHeading>
          <div className="site-box site-box-soft site-sobre-card">
            <p className="site-prose site-prose-centered">{contenido.sobre.texto}</p>
          </div>
        </div>
      </section>

      <section id="servicios" className="site-block site-reveal" aria-labelledby="servicios-title">
        <div className="site-pad site-pad-wide">
          <SectionHeading id="servicios-title">Servicios</SectionHeading>
          <div className="site-services-grid">
            {contenido.servicios.map((servicio, index) => (
              <article key={index} className="site-box site-box-soft site-service-tile">
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

      <section id="contacto" className="site-block site-reveal" aria-labelledby="contacto-title">
        <div className="site-pad site-pad-wide">
          <SectionHeading id="contacto-title">Contacto</SectionHeading>
          <div className="site-box site-box-accent site-contacto-panel">
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
        </div>
      </section>
    </SiteShell>
  );
}
