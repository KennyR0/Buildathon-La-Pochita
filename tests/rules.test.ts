import { describe, expect, it } from "vitest";
import { evaluateInvoice, normalizeKey } from "@/lib/rules";
import type { ExtractedData } from "@/lib/contracts/types";

const extracted = (overrides: Partial<ExtractedData> = {}): ExtractedData => ({
  invoice_number: "INV-OK-001", supplier_name: "Proveedor Demo S.A.", tax_id: "1790012345001",
  purchase_order_number: "PO-DEMO-1500", total: 1500, invalid_fields: [],
  extraction_source: "OPENAI", fallback_reason: null, ...overrides,
});
const supplier = { id: "supplier-1" };
const order = { id: "po-1", supplier_id: "supplier-1", authorized_amount: 1500 };

describe("deterministic invoice rules", () => {
  it("approves only a complete matching invoice", () => {
    expect(evaluateInvoice({ extracted: extracted(), supplier, purchaseOrder: order, duplicateRootId: null }).decision).toBe("APPROVED");
  });

  it("escalates an amount mismatch and accumulates its reason", () => {
    const result = evaluateInvoice({ extracted: extracted({ total: 2300 }), supplier, purchaseOrder: order, duplicateRootId: null });
    expect(result.decision).toBe("NEEDS_REVIEW_HIGH_RISK");
    expect(result.reasons).toContain("AMOUNT_MATCHES");
  });

  it("gives duplicate rejection precedence and keeps the root reference", () => {
    const result = evaluateInvoice({ extracted: extracted({ total: 2300 }), supplier: null, purchaseOrder: null, duplicateRootId: "root-id" });
    expect(result).toMatchObject({ decision: "REJECTED", duplicateOfInvoiceId: "root-id", reasons: ["DUPLICATE_INVOICE"] });
  });

  it("escalates missing supplier, order, and incomplete extraction", () => {
    const result = evaluateInvoice({ extracted: extracted({ supplier_name: null, invalid_fields: ["supplier_name"] }), supplier: null, purchaseOrder: null, duplicateRootId: null });
    expect(result.decision).toBe("NEEDS_REVIEW_HIGH_RISK");
    expect(result.reasons).toEqual(expect.arrayContaining(["EXTRACTION_COMPLETE", "SUPPLIER_EXISTS", "PURCHASE_ORDER_EXISTS"]));
  });

  it("normalizes lookup keys after trim and rejects whitespace-only values", () => {
    expect(normalizeKey("  inv-ab-001  ")).toBe("INV-AB-001");
    expect(normalizeKey("   ")).toBeNull();
    expect(normalizeKey(null)).toBeNull();
  });

  it("escalates when the supplier does not own the purchase order", () => {
    const result = evaluateInvoice({
      extracted: extracted(),
      supplier,
      purchaseOrder: { ...order, supplier_id: "supplier-2" },
      duplicateRootId: null,
    });

    expect(result.decision).toBe("NEEDS_REVIEW_HIGH_RISK");
    expect(result.reasons).toEqual(["SUPPLIER_MATCHES_ORDER"]);
    expect(result.validations).toContainEqual(expect.objectContaining({ code: "AMOUNT_MATCHES", status: "PASSED" }));
  });

  it("does not invent supplier-match or amount validations when the order is absent", () => {
    const result = evaluateInvoice({ extracted: extracted(), supplier, purchaseOrder: null, duplicateRootId: null });
    const validationCodes = result.validations.map(validation => validation.code);

    expect(result.decision).toBe("NEEDS_REVIEW_HIGH_RISK");
    expect(result.reasons).toEqual(["PURCHASE_ORDER_EXISTS"]);
    expect(validationCodes).not.toContain("SUPPLIER_MATCHES_ORDER");
    expect(validationCodes).not.toContain("AMOUNT_MATCHES");
  });
});
