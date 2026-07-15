import { describe, expect, it, vi } from "vitest";
import { InvoiceRepository, SupabaseRepositoryError } from "@/lib/supabase";
import type { ExtractedData } from "@/lib/contracts/types";
import type { SupabaseClient } from "@supabase/supabase-js";

const extracted: ExtractedData = {
  invoice_number: "INV-1", supplier_name: "Proveedor Demo S.A.", tax_id: "1790012345001",
  purchase_order_number: "PO-DEMO-1500", total: 1500, invalid_fields: [],
  extraction_source: "OPENAI", fallback_reason: null,
};

describe("Supabase repository failures", () => {
  it("turns a supplier query failure into an explicit technical error", async () => {
    const db = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: "offline" } }) }) }) }) } as unknown as SupabaseClient;
    const repository = new InvoiceRepository(db);
    await expect(repository.findSupplier("1790012345001")).rejects.toMatchObject({ kind: "QUERY", status: 503 });
  });

  it("does not attempt audit when the invoice write fails", async () => {
    const auditInsert = vi.fn();
    const db = { from: (table: string) => table === "invoices"
      ? ({ insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { message: "write failed" } }) }) }) })
      : ({ insert: auditInsert }) } as unknown as SupabaseClient;
    const repository = new InvoiceRepository(db);
    await expect(repository.persistAttempt({ processingId: crypto.randomUUID(), extracted, supplierId: null, purchaseOrderId: null, duplicateOfInvoiceId: null, automaticDecision: "APPROVED", reasons: [], audit: [] }))
      .rejects.toBeInstanceOf(SupabaseRepositoryError);
    expect(auditInsert).not.toHaveBeenCalled();
  });

  it("compensates the invoice row when timeline persistence fails", async () => {
    const deleteEq = vi.fn(async () => ({ error: null }));
    const db = { from: (table: string) => table === "invoices"
      ? ({
          insert: () => ({ select: () => ({ single: async () => ({ data: { id: "invoice-id" }, error: null }) }) }),
          delete: () => ({ eq: deleteEq }),
        })
      : ({ insert: async () => ({ error: { message: "audit failed" } }) }) } as unknown as SupabaseClient;
    const repository = new InvoiceRepository(db);
    await expect(repository.persistAttempt({ processingId: crypto.randomUUID(), extracted, supplierId: null, purchaseOrderId: null, duplicateOfInvoiceId: null, automaticDecision: "APPROVED", reasons: [], audit: [] }))
      .rejects.toMatchObject({ kind: "WRITE", status: 503 });
    expect(deleteEq).toHaveBeenCalledWith("id", "invoice-id");
  });
});

describe("Supabase duplicate lookup", () => {
  it("returns the original/root invoice for both original and duplicate matches", async () => {
    const maybeSingle = vi.fn()
      .mockResolvedValueOnce({ data: { id: "original-id", duplicate_of_invoice_id: null }, error: null })
      .mockResolvedValueOnce({ data: { id: "duplicate-id", duplicate_of_invoice_id: "root-id" }, error: null });
    const chain = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle,
    };
    const repository = new InvoiceRepository({ from: () => chain } as unknown as SupabaseClient);

    await expect(repository.findDuplicateRoot(" inv-1 ")).resolves.toBe("original-id");
    await expect(repository.findDuplicateRoot("INV-1")).resolves.toBe("root-id");
  });
});

describe("Supabase human decision guard", () => {
  it("rejects a second resolution before changing the invoice or audit history", async () => {
    const update = vi.fn();
    const auditInsert = vi.fn();
    const invoiceQuery = {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              processing_id: "processing-id",
              automatic_decision: "NEEDS_REVIEW_HIGH_RISK",
              human_decision: "APPROVED",
            },
            error: null,
          }),
        }),
      }),
      update,
    };
    const db = {
      from: (table: string) => table === "invoices" ? invoiceQuery : { insert: auditInsert },
    } as unknown as SupabaseClient;
    const repository = new InvoiceRepository(db);

    await expect(repository.recordHumanDecision("invoice-id", "REJECTED", "Segundo intento"))
      .rejects.toMatchObject({ kind: "CONFLICT", status: 503, message: "Invoice cannot be resolved again" });
    expect(update).not.toHaveBeenCalled();
    expect(auditInsert).not.toHaveBeenCalled();
  });
});

describe("Supabase supplier lookup", () => {
  it("skips whitespace-only RUC values and queries normalized identifiers", async () => {
    const eq = vi.fn(() => ({
      maybeSingle: async () => ({ data: { id: "supplier-id", tax_id: "ABC123", name: "Proveedor" }, error: null }),
    }));
    const from = vi.fn(() => ({ select: () => ({ eq }) }));
    const repository = new InvoiceRepository({ from } as unknown as SupabaseClient);

    await expect(repository.findSupplier("   ")).resolves.toBeNull();
    expect(from).not.toHaveBeenCalled();

    await expect(repository.findSupplier("  abc123 ")).resolves.toMatchObject({ id: "supplier-id", tax_id: "ABC123" });
    expect(eq).toHaveBeenCalledWith("tax_id", "ABC123");
  });
});
