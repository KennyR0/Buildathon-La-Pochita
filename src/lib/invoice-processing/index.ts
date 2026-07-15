import { randomUUID } from "node:crypto";
import type { ExtractedData, InvoiceResult, ValidationResult } from "@/lib/contracts/types";
import { evaluateInvoice } from "@/lib/rules";
import { InvoiceRepository, SupabaseRepositoryError, type AuditWrite, type InvoiceRow } from "@/lib/supabase";

export async function decideAndPersist(extracted: ExtractedData, repository = new InvoiceRepository()): Promise<InvoiceResult> {
  const processingId = randomUUID();
  try {
    const supplier = await repository.findSupplier(extracted.tax_id);
    const order = await repository.findPurchaseOrder(extracted.purchase_order_number);
    const duplicateRootId = await repository.findDuplicateRoot(extracted.invoice_number);
    const outcome = evaluateInvoice({ extracted, supplier, purchaseOrder: order, duplicateRootId });
    const audit: AuditWrite[] = [
      { event_type: "PROCESSING_STARTED", status: "STARTED", details: {} },
      { event_type: extracted.extraction_source === "OPENAI" ? "EXTRACTION_COMPLETED" : "EXTRACTION_FALLBACK_USED", status: "COMPLETED", details: { source: extracted.extraction_source, reason: extracted.fallback_reason } },
      { event_type: extracted.invalid_fields.length ? "EXTRACTION_INVALID" : "STRUCTURE_VALIDATED", status: extracted.invalid_fields.length ? "FAILED" : "PASSED", details: { invalid_fields: extracted.invalid_fields } },
      { event_type: "SUPPLIER_CHECKED", status: supplier ? "PASSED" : "FAILED", details: { supplier_id: supplier?.id ?? null } },
      { event_type: "PURCHASE_ORDER_CHECKED", status: order ? "PASSED" : "FAILED", details: { purchase_order_id: order?.id ?? null, authorized_amount: order?.authorized_amount ?? null } },
      { event_type: "DUPLICATE_CHECKED", status: duplicateRootId ? "FAILED" : "PASSED", details: { duplicate_of_invoice_id: duplicateRootId } },
      { event_type: "AMOUNT_COMPARED", status: outcome.validations.find(v => v.code === "AMOUNT_MATCHES")?.status === "FAILED" ? "FAILED" : outcome.validations.find(v => v.code === "AMOUNT_MATCHES")?.status === "PASSED" ? "PASSED" : "COMPLETED", details: { invoice_total: extracted.total, authorized_amount: order?.authorized_amount ?? null, skipped: !outcome.validations.some(v => v.code === "AMOUNT_MATCHES") } },
      { event_type: "RULES_EVALUATED", status: "COMPLETED", details: { decision: outcome.decision, validations: outcome.validations, reasons: outcome.reasons } },
    ];
    const invoiceId = await repository.persistAttempt({
      processingId, extracted, supplierId: supplier?.id ?? null, purchaseOrderId: order?.id ?? null,
      duplicateOfInvoiceId: outcome.duplicateOfInvoiceId, automaticDecision: outcome.decision, reasons: outcome.reasons, audit,
    });
    const result = toInvoiceResult(await repository.getInvoice(invoiceId) as InvoiceRow, outcome.validations);
    result.extracted_data = extracted;
    return result;
  } catch (error) {
    if (error instanceof SupabaseRepositoryError) {
      await repository.recordLastPossibleEvent(processingId, { event_type: "PERSISTENCE_FAILED", status: "FAILED", details: { message: error.message } }).catch(() => false);
    }
    throw error;
  }
}

export async function getPersistedResult(invoiceId: string, repository = new InvoiceRepository()): Promise<InvoiceResult | null> {
  const invoice = await repository.getInvoice(invoiceId);
  if (!invoice) return null;
  const timeline = await repository.timeline(invoiceId);
  const rules = [...timeline].reverse().find(event => event.event_type === "RULES_EVALUATED");
  const validations = Array.isArray(rules?.details.validations) ? rules.details.validations as ValidationResult[] : [];
  const result = toInvoiceResult(invoice, validations);
  const fallback = [...timeline].reverse().find(event => event.event_type === "EXTRACTION_FALLBACK_USED");
  if (fallback) {
    const source = fallback.details.source;
    result.extracted_data.extraction_source = source === "OCR_SPACE_OPENAI" ? source : "FIXTURE_FALLBACK";
    result.extracted_data.fallback_reason = typeof fallback.details.reason === "string" ? fallback.details.reason : "Fallback de demostración";
  }
  return result;
}

export function toInvoiceResult(invoice: InvoiceRow, validations: ValidationResult[]): InvoiceResult {
  const extracted: ExtractedData = {
    invoice_number: invoice.invoice_number_raw,
    supplier_name: invoice.supplier_name_extracted,
    tax_id: invoice.tax_id_extracted,
    purchase_order_number: invoice.purchase_order_number,
    total: invoice.total,
    invalid_fields: invoice.missing_or_invalid_fields as ExtractedData["invalid_fields"],
    extraction_source: "OPENAI",
    fallback_reason: null,
  };
  return {
    invoice_id: invoice.id, processing_id: invoice.processing_id,
    duplicate_of_invoice_id: invoice.duplicate_of_invoice_id, extracted_data: extracted, validations,
    automatic_decision: invoice.automatic_decision, human_decision: invoice.human_decision,
    human_justification: invoice.human_justification,
    effective_decision: invoice.human_decision ?? invoice.automatic_decision,
    reasons: invoice.automatic_reasons,
  };
}
