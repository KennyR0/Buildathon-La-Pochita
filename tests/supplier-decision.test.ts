import { describe, expect, it, vi } from "vitest";
import { decideSupplierForInvoice } from "@/lib/invoice-processing";
import type { InvoiceRepository, InvoiceRow } from "@/lib/supabase";
import { POST as postSupplierDecision } from "@/app/api/invoices/[id]/supplier-decision/route";

const pendingInvoice = (overrides: Partial<InvoiceRow> = {}): InvoiceRow => ({
  id: "invoice-id",
  processing_id: "processing-id",
  invoice_number_raw: "INV-NEW-1",
  supplier_name_extracted: "Proveedor Nuevo S.A.",
  tax_id_extracted: "1792456789001",
  purchase_order_number: "PO-MISSING",
  total: 100,
  supplier_id: null,
  purchase_order_id: null,
  duplicate_of_invoice_id: null,
  missing_or_invalid_fields: [],
  automatic_decision: "NEEDS_REVIEW_HIGH_RISK",
  automatic_reasons: ["SUPPLIER_EXISTS", "PURCHASE_ORDER_EXISTS"],
  human_decision: null,
  human_justification: null,
  ...overrides,
});

describe("supplier decision orchestration", () => {
  it("returns 422 when a rejection has no justification", async () => {
    const request = new Request("http://localhost/api/invoices/invoice-id/supplier-decision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "REJECTED" }),
    });

    const response = await postSupplierDecision(request, { params: Promise.resolve({ id: "invoice-id" }) });

    expect(response.status).toBe(422);
  });

  it("creates the supplier and revalidates the same invoice while preserving other failures", async () => {
    const before = pendingInvoice();
    const after = pendingInvoice({
      supplier_id: "supplier-id",
      automatic_reasons: ["PURCHASE_ORDER_EXISTS"],
    });
    const updateAfterSupplierApproval = vi.fn().mockResolvedValue(undefined);
    const repository = {
      getInvoice: vi.fn().mockResolvedValueOnce(before).mockResolvedValueOnce(after),
      createSupplier: vi.fn().mockResolvedValue({ supplier: { id: "supplier-id", tax_id: "1792456789001", name: "Proveedor Nuevo S.A." }, created: true }),
      findPurchaseOrder: vi.fn().mockResolvedValue(null),
      findDuplicateRoot: vi.fn().mockResolvedValue("invoice-id"),
      updateAfterSupplierApproval,
      timeline: vi.fn().mockResolvedValue([{
        id: "audit-id",
        event_type: "RULES_EVALUATED",
        status: "COMPLETED",
        details: {
          decision: "NEEDS_REVIEW_HIGH_RISK",
          reasons: ["PURCHASE_ORDER_EXISTS"],
          validations: [
            { code: "EXTRACTION_COMPLETE", status: "PASSED", message: "Completa" },
            { code: "SUPPLIER_EXISTS", status: "PASSED", message: "Existe" },
            { code: "PURCHASE_ORDER_EXISTS", status: "FAILED", message: "No existe" },
          ],
        },
        created_at: new Date().toISOString(),
      }]),
    } as unknown as InvoiceRepository;

    const result = await decideSupplierForInvoice("invoice-id", "APPROVED", "", repository);

    expect(updateAfterSupplierApproval).toHaveBeenCalledWith(expect.objectContaining({
      invoice: before,
      supplierCreated: true,
      automaticDecision: "NEEDS_REVIEW_HIGH_RISK",
      reasons: ["PURCHASE_ORDER_EXISTS"],
    }));
    expect(result.reasons).toEqual(["PURCHASE_ORDER_EXISTS"]);
    expect(result.validations).toContainEqual(expect.objectContaining({ code: "SUPPLIER_EXISTS", status: "PASSED" }));
  });

  it("rejects the invoice with justification without creating a supplier", async () => {
    const recordHumanDecision = vi.fn().mockResolvedValue(undefined);
    const createSupplier = vi.fn();
    const repository = {
      getInvoice: vi.fn()
        .mockResolvedValueOnce(pendingInvoice())
        .mockResolvedValueOnce(pendingInvoice({ human_decision: "REJECTED", human_justification: "RUC no confiable" })),
      recordHumanDecision,
      createSupplier,
      timeline: vi.fn().mockResolvedValue([{
        id: "audit-id",
        event_type: "RULES_EVALUATED",
        status: "COMPLETED",
        details: { validations: [{ code: "SUPPLIER_EXISTS", status: "FAILED", message: "No existe" }] },
        created_at: new Date().toISOString(),
      }]),
    } as unknown as InvoiceRepository;

    const result = await decideSupplierForInvoice("invoice-id", "REJECTED", "RUC no confiable", repository);

    expect(recordHumanDecision).toHaveBeenCalledWith("invoice-id", "REJECTED", "RUC no confiable", { review_type: "SUPPLIER", reason: "SUPPLIER_REJECTED" });
    expect(createSupplier).not.toHaveBeenCalled();
    expect(result.effective_decision).toBe("REJECTED");
  });

  it("rejects a repeated supplier decision before any write", async () => {
    const createSupplier = vi.fn();
    const repository = {
      getInvoice: vi.fn().mockResolvedValue(pendingInvoice({ automatic_reasons: ["PURCHASE_ORDER_EXISTS"] })),
      createSupplier,
    } as unknown as InvoiceRepository;

    await expect(decideSupplierForInvoice("invoice-id", "APPROVED", "", repository)).rejects.toMatchObject({ kind: "CONFLICT" });
    expect(createSupplier).not.toHaveBeenCalled();
  });
});
