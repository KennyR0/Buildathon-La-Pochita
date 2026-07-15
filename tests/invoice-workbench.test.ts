import { describe, expect, it } from "vitest";
import { canShowHumanDecision, canShowSupplierDecision, readApiResponse } from "@/components/invoice-workbench-helpers";
import type { InvoiceResult } from "@/lib/contracts/types";

const supplierReviewResult = (overrides: Partial<InvoiceResult> = {}): InvoiceResult => ({
  invoice_id: "invoice-id",
  processing_id: "processing-id",
  duplicate_of_invoice_id: null,
  extracted_data: {
    invoice_number: "INV-1",
    supplier_name: "Proveedor Nuevo",
    tax_id: "1792456789001",
    purchase_order_number: "PO-1",
    total: 100,
    invalid_fields: [],
    extraction_source: "OPENAI",
    fallback_reason: null,
  },
  validations: [{ code: "SUPPLIER_EXISTS", status: "FAILED", message: "No existe" }],
  automatic_decision: "NEEDS_REVIEW_HIGH_RISK",
  human_decision: null,
  human_justification: null,
  effective_decision: "NEEDS_REVIEW_HIGH_RISK",
  reasons: ["SUPPLIER_EXISTS"],
  ...overrides,
});

describe("invoice workbench interaction guards", () => {
  it("turns a non-JSON service failure into an actionable error", async () => {
    const response = new Response("<html>Service unavailable</html>", { status: 503 });

    await expect(readApiResponse(response)).rejects.toThrow("El servidor no pudo completar la solicitud. Intenta de nuevo.");
  });

  it("keeps the backend message for a conflicting human decision", async () => {
    const response = new Response(
      JSON.stringify({ code: "CONFLICT", message: "La factura ya tiene una decisión humana." }),
      { status: 409, headers: { "content-type": "application/json" } },
    );

    await expect(readApiResponse(response)).rejects.toThrow("La factura ya tiene una decisión humana.");
  });

  it("hides human decision actions for an automatically rejected duplicate", () => {
    expect(canShowHumanDecision("REJECTED", null)).toBe(false);
  });

  it("shows supplier review only for a complete unknown supplier", () => {
    expect(canShowSupplierDecision(supplierReviewResult())).toBe(true);
    expect(canShowSupplierDecision(supplierReviewResult({
      extracted_data: { ...supplierReviewResult().extracted_data, supplier_name: null, invalid_fields: ["supplier_name"] },
    }))).toBe(false);
    expect(canShowSupplierDecision(supplierReviewResult({
      automatic_decision: "REJECTED",
      effective_decision: "REJECTED",
      reasons: ["DUPLICATE_INVOICE"],
      validations: [{ code: "DUPLICATE_INVOICE", status: "FAILED", message: "Duplicada" }],
    }))).toBe(false);
  });
});
