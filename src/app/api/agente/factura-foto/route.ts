import { generateText, NoObjectGeneratedError, Output } from "ai";
import { AGENT_MAX_RETRIES, agentModel, mapAgentError, requireUser } from "@/lib/agente/server";
import { toIsoDate } from "@/lib/crm/facturas";
import { invoiceExtractionSchema, normalizeExtraction } from "@/lib/crm/invoiceExtraction";

// The free model can take tens of seconds to read a photo.
export const maxDuration = 60;

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const INVALID_IMAGE = "Sube una imagen PNG, JPG o WEBP de hasta 10 MB.";

function instructions() {
  return [
    `Hoy es ${toIsoDate(new Date())}.`,
    "Eres el asistente de facturación de un CRM. Lee la factura de la imagen y devuelve sus datos.",
    "El cliente es el destinatario de la factura, no quien la emite.",
    "Fechas en formato AAAA-MM-DD. Importes en euros como números.",
    "IVA como porcentaje (iva_pct: 21, 10, 4 o 0), nunca como importe.",
    "Si un dato no se lee con claridad, devuélvelo como null. No inventes datos.",
  ].join("\n");
}

async function readImage(request: Request) {
  try {
    const image = (await request.formData()).get("image");
    return image instanceof File && IMAGE_TYPES.includes(image.type) && image.size <= MAX_IMAGE_BYTES ? image : null;
  } catch {
    return null;
  }
}

// When the model answers valid JSON that does not match the schema (e.g. "1.234,56" as a string), the
// normalizer can still clean it; anything that is not JSON stays an error.
function salvageOutput(error: unknown) {
  if (!NoObjectGeneratedError.isInstance(error) || !error.text) return null;
  try {
    return JSON.parse(error.text) as unknown;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const user = await requireUser(request);
  if (user instanceof Response) return user;

  const image = await readImage(request);
  if (!image) return Response.json({ error: INVALID_IMAGE }, { status: 400 });

  try {
    const { output } = await generateText({
      model: agentModel(),
      maxRetries: AGENT_MAX_RETRIES,
      output: Output.object({ schema: invoiceExtractionSchema }),
      instructions: instructions(),
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Extrae los datos de esta factura." },
            { type: "file", mediaType: image.type, data: new Uint8Array(await image.arrayBuffer()) },
          ],
        },
      ],
    });
    return Response.json({ extraction: normalizeExtraction(output) });
  } catch (error) {
    const salvaged = salvageOutput(error);
    if (salvaged !== null) return Response.json({ extraction: normalizeExtraction(salvaged) });
    const { status, message } = mapAgentError(error);
    return Response.json({ error: message }, { status });
  }
}
