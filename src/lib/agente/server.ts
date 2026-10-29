import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { APICallError, LoadAPIKeyError, RetryError } from "ai";
import { AGENT_ERROR_MESSAGE } from "@/lib/agente/chat";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const DEFAULT_MODEL = "nvidia/nemotron-3.5-super-vl:free";
const RATE_LIMIT_STATUS = 429;

// The key is only read here, on the server. A missing key surfaces as LoadAPIKeyError when the model is called.
// The free tier's quota is small: one retry covers a transient failure without spending several requests.
export const AGENT_MAX_RETRIES = 1;

export function agentModel() {
  const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });
  // Response healing repairs malformed JSON in non-streaming structured outputs.
  return openrouter.chat(process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL, {
    plugins: [{ id: "response-healing" }],
  });
}

// Server Supabase client acting as the signed-in user.
export function supabaseForToken(token: string) {
  return createSupabaseServerClient(token);
}

function invalidSession() {
  return Response.json({ error: "Sesión no válida." }, { status: 401 });
}

export async function requireUser(request: Request): Promise<{ token: string } | Response> {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return invalidSession();
  try {
    const { data, error } = await supabaseForToken(token).auth.getUser(token);
    return error || !data.user ? invalidSession() : { token };
  } catch {
    // Missing Supabase env or a network failure: answer JSON instead of a bare 500.
    return Response.json({ error: AGENT_ERROR_MESSAGE }, { status: 500 });
  }
}

function isRateLimit(error: unknown): boolean {
  if (RetryError.isInstance(error)) return isRateLimit(error.lastError);
  return APICallError.isInstance(error) && error.statusCode === RATE_LIMIT_STATUS;
}

export function mapAgentError(error: unknown): { status: number; message: string } {
  if (isRateLimit(error)) {
    return {
      status: RATE_LIMIT_STATUS,
      message: "El agente ha alcanzado el límite diario gratuito. Inténtalo mañana.",
    };
  }
  if (LoadAPIKeyError.isInstance(error)) {
    return { status: 500, message: "Falta configurar OPENROUTER_API_KEY." };
  }
  return { status: 502, message: AGENT_ERROR_MESSAGE };
}
