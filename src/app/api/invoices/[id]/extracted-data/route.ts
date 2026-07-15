import { NextResponse } from "next/server";
import { normalizeExtractedData } from "@/lib/contracts/validation";
import { getPersistedResult } from "@/lib/invoice-processing";
import { evaluateInvoice } from "@/lib/rules";
import { InvoiceRepository, SupabaseRepositoryError } from "@/lib/supabase";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    const justification = typeof body.justification === "string" ? body.justification.trim() : "";
    if (!justification) return NextResponse.json({ code: "INVALID_CORRECTION", message: "La justificación es obligatoria." }, { status: 422 });
    const extracted = normalizeExtractedData({
      invoice_number: typeof body.invoice_number === "string" ? body.invoice_number : null,
      supplier_name: typeof body.supplier_name === "string" ? body.supplier_name : null,
      tax_id: typeof body.tax_id === "string" ? body.tax_id : null,
      purchase_order_number: typeof body.purchase_order_number === "string" ? body.purchase_order_number : null,
      total: typeof body.total === "number" ? body.total : null,
      extraction_source: "OPENAI", fallback_reason: null,
    });
    const repository = new InvoiceRepository();
    const before = await repository.getInvoice(id);
    if (!before) return NextResponse.json({ code: "NOT_FOUND", message: "Factura no encontrada." }, { status: 404 });
    if (before.missing_or_invalid_fields.length === 0 || before.human_decision) {
      return NextResponse.json(
        { code: "CORRECTION_CONFLICT", message: "Solo una factura incompleta y no resuelta puede corregirse." },
        { status: 409 },
      );
    }
    const supplier = await repository.findSupplier(extracted.tax_id);
    const order = await repository.findPurchaseOrder(extracted.purchase_order_number);
    const foundDuplicate = await repository.findDuplicateRoot(extracted.invoice_number);
    const outcome = evaluateInvoice({ extracted, supplier, purchaseOrder: order, duplicateRootId: foundDuplicate === id ? null : foundDuplicate });
    await repository.updateAfterCorrection({
      invoiceId: id, extracted, supplierId: supplier?.id ?? null, purchaseOrderId: order?.id ?? null,
      duplicateOfInvoiceId: outcome.duplicateOfInvoiceId, automaticDecision: outcome.decision,
      reasons: outcome.reasons, justification, validations: outcome.validations, before: before as unknown as Record<string, unknown>,
    });
    return NextResponse.json(await getPersistedResult(id, repository));
  } catch (error) {
    if (error instanceof SupabaseRepositoryError) {
      const status = error.kind === "CONFLICT" ? 409 : error.kind === "NOT_FOUND" ? 404 : 503;
      return NextResponse.json({ code: error.kind, message: error.message }, { status });
    }
    return NextResponse.json({ code: "CORRECTION_FAILED", message: "No fue posible corregir y reprocesar la factura." }, { status: 500 });
  }
}
