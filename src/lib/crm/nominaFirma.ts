import { PDFDocument } from "pdf-lib";

/**
 * Zona de firma del PDF de referencia (A4, nomina.pdf).
 * Etiqueta «Firma del trabajador» ≈ (434, 321) en coordenadas PDF (origen abajo-izquierda).
 * Espacio libre a la derecha, bajo la etiqueta y encima de los importes de bases (~245).
 */
export const NOMINA_FIRMA_REF = {
  pageWidth: 595.32,
  pageHeight: 841.92,
  x: 410,
  y: 250,
  width: 160,
  height: 65,
} as const;

export async function stampSignatureOnNominaPdf(
  pdfBytes: ArrayBuffer,
  signaturePngBytes: ArrayBuffer,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const signature = await pdfDoc.embedPng(signaturePngBytes);
  const page = pdfDoc.getPages()[0];
  if (!page) {
    throw new Error("El PDF no tiene páginas.");
  }

  const { width: pageW, height: pageH } = page.getSize();
  const scaleX = pageW / NOMINA_FIRMA_REF.pageWidth;
  const scaleY = pageH / NOMINA_FIRMA_REF.pageHeight;

  page.drawImage(signature, {
    x: NOMINA_FIRMA_REF.x * scaleX,
    y: NOMINA_FIRMA_REF.y * scaleY,
    width: NOMINA_FIRMA_REF.width * scaleX,
    height: NOMINA_FIRMA_REF.height * scaleY,
  });

  return pdfDoc.save();
}

export async function fetchPdfBytes(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`No se pudo descargar el PDF (${response.status}).`);
  }
  return response.arrayBuffer();
}
