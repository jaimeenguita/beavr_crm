"use client";

import { useEffect, type CSSProperties, type ReactNode } from "react";
import { paletteVars, type Paleta, type Plantilla, type SitioContenido } from "@/lib/crm/sitios";

export function SiteShell({
  paleta,
  plantilla,
  brandName,
  logoUrl,
  children,
}: {
  paleta: Paleta;
  plantilla: Plantilla;
  brandName: string;
  logoUrl?: string | null;
  children: ReactNode;
}) {
  const vars = paletteVars(paleta) as CSSProperties;
  const isAnimacion = plantilla === "animacion";

  useEffect(() => {
    const revealNodes = Array.from(document.querySelectorAll<HTMLElement>(".site-reveal"));
    const animScreens = Array.from(document.querySelectorAll<HTMLElement>(".site-anim-screen"));
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduced) {
      revealNodes.forEach((node) => node.classList.add("is-visible"));
      const spacers = Array.from(document.querySelectorAll<HTMLElement>(".site-anim-spacer"));
      animScreens.forEach((node, i) => {
        node.classList.add("is-active", "is-seen");
        const spacer = spacers[i];
        if (spacer?.id) {
          node.id = spacer.id;
          spacer.removeAttribute("id");
        }
      });
      return;
    }

    const observers: IntersectionObserver[] = [];

    if (revealNodes.length) {
      const revealObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-visible");
              revealObserver.unobserve(entry.target);
            }
          }
        },
        { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
      );
      revealNodes.forEach((node) => revealObserver.observe(node));
      observers.push(revealObserver);
    }

    if (animScreens.length) {
      // Spacers drive scroll; panels stack. Down = cover from below, up = slide away.
      let prevIndex = 0;
      const leavingTimers = new Map<HTMLElement, number>();

      const clearLeaving = (screen: HTMLElement) => {
        const timer = leavingTimers.get(screen);
        if (timer) window.clearTimeout(timer);
        leavingTimers.delete(screen);
        screen.classList.remove("is-leaving");
      };

      const startLeaving = (screen: HTMLElement) => {
        clearLeaving(screen);
        screen.classList.add("is-leaving");
        screen.classList.remove("is-seen", "is-active");
        const timer = window.setTimeout(() => clearLeaving(screen), 700);
        leavingTimers.set(screen, timer);
      };

      const syncActive = () => {
        const vh = window.innerHeight || 1;
        const index = Math.min(
          animScreens.length - 1,
          Math.max(0, Math.round(window.scrollY / vh)),
        );
        const goingUp = index < prevIndex;
        const goingDown = index > prevIndex;

        if (goingDown) {
          animScreens.forEach((screen) => clearLeaving(screen));
        }

        if (goingUp && prevIndex > 0) {
          startLeaving(animScreens[prevIndex]);
          // Hide screens jumped over when scroll snaps across several steps.
          for (let i = index + 1; i < prevIndex; i += 1) {
            clearLeaving(animScreens[i]);
            animScreens[i].classList.remove("is-seen", "is-active");
          }
        }

        animScreens.forEach((screen, i) => {
          if (screen.classList.contains("is-leaving")) return;
          screen.classList.toggle("is-active", i === index);
          screen.classList.toggle("is-seen", i <= index);
        });

        prevIndex = index;
      };

      syncActive();
      window.addEventListener("scroll", syncActive, { passive: true });
      window.addEventListener("resize", syncActive);

      return () => {
        observers.forEach((o) => o.disconnect());
        window.removeEventListener("scroll", syncActive);
        window.removeEventListener("resize", syncActive);
        animScreens.forEach((screen) => clearLeaving(screen));
      };
    }

    return () => observers.forEach((o) => o.disconnect());
  }, [plantilla]);

  return (
    <div
      className={`site-root site-plantilla-${plantilla}`}
      style={vars}
      data-paleta={paleta}
      data-plantilla={plantilla}
    >
      <a className="site-skip" href="#contenido">
        Saltar al contenido
      </a>
      <header className={`site-header${isAnimacion ? " site-header-overlay" : ""}`}>
        <div className="site-header-inner">
          <div className="site-brand">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="site-logo" />
            ) : null}
            <span className="site-brand-name">{brandName}</span>
          </div>
          <nav className="site-nav" aria-label="Secciones del sitio">
            {isAnimacion ? <a href="#inicio">Inicio</a> : null}
            <a href="#sobre">Sobre</a>
            <a href="#servicios">Servicios</a>
            <a href="#contacto">Contacto</a>
          </nav>
        </div>
      </header>
      <main id="contenido">{children}</main>
      {isAnimacion ? null : (
        <footer className="site-footer">
          <p>
            © {new Date().getFullYear()} {brandName}
          </p>
        </footer>
      )}
    </div>
  );
}

export function SectionHeading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div className="site-section-heading">
      <h2 id={id}>{children}</h2>
      <span className="site-accent-bar" aria-hidden="true" />
    </div>
  );
}

export function ContactBlock({ contacto }: { contacto: SitioContenido["contacto"] }) {
  const items = [
    contacto.email
      ? { key: "email", label: "Email", value: contacto.email, href: `mailto:${contacto.email}` }
      : null,
    contacto.telefono
      ? {
          key: "telefono",
          label: "Teléfono",
          value: contacto.telefono,
          href: `tel:${contacto.telefono.replace(/\s+/g, "")}`,
        }
      : null,
    contacto.direccion
      ? { key: "direccion", label: "Dirección", value: contacto.direccion, href: null }
      : null,
  ].filter(Boolean) as { key: string; label: string; value: string; href: string | null }[];

  if (items.length === 0) {
    return (
      <div className="site-contact-empty">
        <p className="site-muted">Los datos de contacto se completan desde el CRM.</p>
      </div>
    );
  }

  return (
    <ul className="site-contact-grid">
      {items.map((item) => (
        <li key={item.key} className="site-contact-tile">
          <span className="site-contact-label">{item.label}</span>
          {item.href ? (
            <a href={item.href}>{item.value}</a>
          ) : (
            <span className="site-contact-value">{item.value}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
