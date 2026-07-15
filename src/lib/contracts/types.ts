export const DECISIONS = ["APPROVED", "NEEDS_REVIEW_HIGH_RISK", "REJECTED"] as const;
export type Decision = (typeof DECISIONS)[number];
export type ExtractionSource = "OPENAI" | "OCR_SPACE_OPENAI" | "FIXTURE_FALLBACK";
export type FieldName = "invoice_number" | "supplier_name" | "tax_id" | "purchase_order_number" | "total";

export interface ExtractedData {
  invoice_number: string | null;
  supplier_name: string | null;
  tax_id: string | null;
  purchase_order_number: string | null;
  total: number | null;
  invalid_fields: FieldName[];
  extraction_source: ExtractionSource;
  fallback_reason: string | null;
}

export interface ValidationResult {
  code: string;
  status: "PASSED" | "FAILED" | "SKIPPED";
  message: string;
}

export interface AuditEvent {
  id: string;
  event_type: string;
  status: string;
  details: Record<string, unknown>;
  created_at: string;
}

export interface InvoiceResult {
  invoice_id: string;
  processing_id: string;
  duplicate_of_invoice_id: string | null;
  extracted_data: ExtractedData;
  validations: ValidationResult[];
  automatic_decision: Decision;
  human_decision: "APPROVED" | "REJECTED" | null;
  human_justification: string | null;
  effective_decision: Decision;
  reasons: string[];
}

export interface ApiError {
  code: string;
  message: string;
  processing_id?: string | null;
}
