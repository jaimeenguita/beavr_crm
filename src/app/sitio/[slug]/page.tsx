import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SitioPublicView } from "@/components/web/templates/SitioPublicView";
import { mapSitioRow } from "@/lib/crm/sitios";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type PageProps = {
  params: Promise<{ slug: string }>;
};

async function loadSitio(slug: string) {
  const supabase = createSupabaseServerClient();
  const { data: sitioRow, error } = await supabase
    .from("sitios_web")
    .select("*")
    .eq("slug", slug)
    .eq("publicado", true)
    .maybeSingle();

  if (error || !sitioRow) return null;

  const { data: empresa } = await supabase
    .from("empresas")
    .select("nombre, logo_url")
    .eq("id", sitioRow.empresa_id)
    .maybeSingle();

  const brandName = empresa?.nombre ?? "Empresa";
  return {
    sitio: mapSitioRow(sitioRow as Record<string, unknown>, brandName),
    brandName,
    logoUrl: (empresa?.logo_url as string | null) ?? null,
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const loaded = await loadSitio(slug);
  if (!loaded) {
    return { title: "Sitio no encontrado" };
  }
  return {
    title: loaded.sitio.contenido.hero.titulo || loaded.brandName,
    description: loaded.sitio.contenido.hero.subtitulo || loaded.sitio.contenido.sobre.texto,
  };
}

export default async function SitioPublicPage({ params }: PageProps) {
  const { slug } = await params;
  const loaded = await loadSitio(slug);
  if (!loaded) notFound();

  return (
    <SitioPublicView
      sitio={loaded.sitio}
      brandName={loaded.brandName}
      logoUrl={loaded.logoUrl}
    />
  );
}
