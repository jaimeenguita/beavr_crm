import { APICallError, LoadAPIKeyError, NoObjectGeneratedError, RetryError } from "ai";
import { describe, expect, it, vi } from "vitest";
import { mapAgentError, requireUser } from "@/lib/agente/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));

const GENERIC = "El agente no ha podido responder. Inténtalo de nuevo.";

function apiError(statusCode: number) {
  return new APICallError({ message: "upstream", url: "https://openrouter.ai/api/v1", requestBodyValues: {}, statusCode });
}

describe("mapAgentError", () => {
  it("maps a 429 from OpenRouter to the daily free limit message", () => {
    expect(mapAgentError(apiError(429))).toEqual({
      status: 429,
      message: "El agente ha alcanzado el límite diario gratuito. Inténtalo mañana.",
    });
  });

  it("looks through the retry wrapper for the rate limit", () => {
    const error = new RetryError({ message: "retried", reason: "maxRetriesExceeded", errors: [apiError(429)] });
    expect(mapAgentError(error).status).toBe(429);
  });

  it("maps a missing API key to the configuration message", () => {
    expect(mapAgentError(new LoadAPIKeyError({ message: "missing" }))).toEqual({
      status: 500,
      message: "Falta configurar OPENROUTER_API_KEY.",
    });
  });

  it("maps an unparseable model answer to the generic message", () => {
    const error = new NoObjectGeneratedError({
      text: "not json",
      response: { id: "r", timestamp: new Date(), modelId: "m" },
      usage: {} as never,
      finishReason: "stop",
    });
    expect(mapAgentError(error)).toEqual({ status: 502, message: GENERIC });
  });

  it("maps anything else to the generic message", () => {
    expect(mapAgentError(apiError(500))).toEqual({ status: 502, message: GENERIC });
    expect(mapAgentError(new Error("boom"))).toEqual({ status: 502, message: GENERIC });
    expect(mapAgentError("boom")).toEqual({ status: 502, message: GENERIC });
  });
});

describe("requireUser", () => {
  it("returns 401 without an Authorization header", async () => {
    const result = await requireUser(new Request("http://localhost/api/agente/factura-foto", { method: "POST" }));
    expect(result).toBeInstanceOf(Response);
    const response = result as Response;
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Sesión no válida." });
  });

  it("returns 401 with an empty bearer token", async () => {
    const request = new Request("http://localhost/api/agente/factura-foto", {
      method: "POST",
      headers: { Authorization: "Bearer " },
    });
    expect(((await requireUser(request)) as Response).status).toBe(401);
  });

  function withToken() {
    return new Request("http://localhost/api/agente/factura-foto", {
      method: "POST",
      headers: { Authorization: "Bearer token-123" },
    });
  }

  it("returns a JSON 500 when the Supabase client cannot be created", async () => {
    vi.mocked(createSupabaseServerClient).mockImplementationOnce(() => {
      throw new Error("missing env");
    });
    const response = (await requireUser(withToken())) as Response;
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: GENERIC });
  });

  it("returns a JSON 500 when getUser rejects", async () => {
    vi.mocked(createSupabaseServerClient).mockReturnValueOnce({
      auth: { getUser: vi.fn().mockRejectedValue(new Error("network")) },
    } as never);
    const response = (await requireUser(withToken())) as Response;
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: GENERIC });
  });

  it("returns the token when getUser finds the user", async () => {
    vi.mocked(createSupabaseServerClient).mockReturnValueOnce({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } }, error: null }) },
    } as never);
    expect(await requireUser(withToken())).toEqual({ token: "token-123" });
    expect(createSupabaseServerClient).toHaveBeenLastCalledWith("token-123");
  });
});
