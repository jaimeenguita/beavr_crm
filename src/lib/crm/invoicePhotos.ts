import { IMAGE_EXTENSIONS } from "@/lib/crm/rrhhStorage";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

// Photos of the invoices registered with "Desde foto", in the public bucket of 20261029120100_facturas_fotos_bucket.sql.
export const INVOICE_PHOTO_BUCKET = "facturas-fotos";

// `<id>/<timestamp>.<ext>`: the folder is the invoice id, generated in the browser before the insert.
export function invoicePhotoPath(invoiceId: string, type: string, now = Date.now()) {
  return `${invoiceId}/${now}.${IMAGE_EXTENSIONS[type] ?? "bin"}`;
}

function bucket() {
  return createSupabaseBrowserClient().storage.from(INVOICE_PHOTO_BUCKET);
}

/** Uploads the photo of a new invoice and returns its storage path, to store as `foto_path`. */
export async function uploadInvoicePhoto(invoiceId: string, file: File) {
  const path = invoicePhotoPath(invoiceId, file.type);
  const { error } = await bucket().upload(path, file, { contentType: file.type, cacheControl: "3600" });
  if (error) throw error;
  return path;
}

export function invoicePhotoUrl(path: string) {
  return bucket().getPublicUrl(path).data.publicUrl;
}

/** Best effort: removes a photo whose invoice could not be saved. */
export async function removeInvoicePhoto(path: string) {
  await bucket().remove([path]);
}
