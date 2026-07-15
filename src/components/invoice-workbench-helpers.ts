import type { ApiError, Decision } from "@/lib/contracts/types";

export async function readApiResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? await response.json() as T | ApiError
    : null;

  if (!response.ok) {
    const message = body && typeof body === "object" && "message" in body && typeof body.message === "string"
      ? body.message
      : "El servidor no pudo completar la solicitud. Intenta de nuevo.";
    throw new Error(message);
  }

  if (body === null) throw new Error("El servidor devolvió una respuesta no válida.");
  return body as T;
}

export function canShowHumanDecision(effectiveDecision: Decision, humanDecision: "APPROVED" | "REJECTED" | null): boolean {
  return effectiveDecision === "NEEDS_REVIEW_HIGH_RISK" && !humanDecision;
}
