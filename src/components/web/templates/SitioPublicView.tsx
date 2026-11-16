import { TemplateAnimacion } from "@/components/web/templates/TemplateAnimacion";
import { TemplateModerna } from "@/components/web/templates/TemplateModerna";
import type { SitioWeb } from "@/lib/crm/sitios";

export function SitioPublicView({
  sitio,
  brandName,
  logoUrl,
}: {
  sitio: SitioWeb;
  brandName: string;
  logoUrl?: string | null;
}) {
  if (sitio.plantilla === "moderna") {
    return (
      <TemplateModerna
        contenido={sitio.contenido}
        paleta={sitio.paleta}
        brandName={brandName}
        logoUrl={logoUrl}
      />
    );
  }

  return (
    <TemplateAnimacion
      contenido={sitio.contenido}
      paleta={sitio.paleta}
      brandName={brandName}
      logoUrl={logoUrl}
    />
  );
}
