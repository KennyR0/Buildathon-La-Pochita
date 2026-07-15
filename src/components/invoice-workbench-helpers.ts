import type { ApiError, Decision, InvoiceResult } from "@/lib/contracts/types";

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

export function canShowSupplierDecision(result: InvoiceResult): boolean {
  return result.effective_decision === "NEEDS_REVIEW_HIGH_RISK"
    && !result.human_decision
    && result.extracted_data.invalid_fields.length === 0
    && Boolean(result.extracted_data.supplier_name?.trim())
    && Boolean(result.extracted_data.tax_id?.trim())
    && result.validations.some(validation => validation.code === "SUPPLIER_EXISTS" && validation.status === "FAILED");
}
