import type { SupabaseClient } from "@supabase/supabase-js";
import { LOGO_BUCKET, LOGO_MAX_BYTES, validateLogoFile } from "@/lib/crm/companyLogo";

export { validateLogoFile as validateHeroImageFile, LOGO_MAX_BYTES as HERO_MAX_BYTES };

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

function storagePathFromUrl(url: string) {
  const marker = `/storage/v1/object/public/${LOGO_BUCKET}/`;
  const index = url.indexOf(marker);
  return index === -1 ? null : decodeURIComponent(url.slice(index + marker.length));
}

export async function uploadSitioHero(supabase: SupabaseClient, sitioId: string, file: File) {
  const validation = validateLogoFile(file);
  if (validation) throw new Error(validation);

  const path = `sitios/${sitioId}/hero-${Date.now()}.${EXTENSIONS[file.type] ?? "jpg"}`;
  const { error } = await supabase.storage
    .from(LOGO_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type, cacheControl: "3600" });

  if (error) throw error;
  return supabase.storage.from(LOGO_BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function deleteSitioHero(supabase: SupabaseClient, url: string | null | undefined) {
  const path = url ? storagePathFromUrl(url) : null;
  if (!path || !path.startsWith("sitios/")) return;
  await supabase.storage.from(LOGO_BUCKET).remove([path]);
}
