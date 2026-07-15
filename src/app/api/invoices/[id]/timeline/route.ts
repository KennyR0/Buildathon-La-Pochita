import { NextResponse } from "next/server";
import { InvoiceRepository, SupabaseRepositoryError } from "@/lib/supabase";

export const runtime = "nodejs";

const eventOrder: Record<string, number> = {
  PROCESSING_STARTED: 0,
  EXTRACTION_COMPLETED: 1,
  EXTRACTION_FALLBACK_USED: 1,
  EXTRACTION_INVALID: 2,
  STRUCTURE_VALIDATED: 2,
  SUPPLIER_CHECKED: 3,
  PURCHASE_ORDER_CHECKED: 4,
  DUPLICATE_CHECKED: 5,
  AMOUNT_COMPARED: 6,
  FIELDS_CORRECTED: 7,
  RULES_EVALUATED: 8,
  INVOICE_PERSISTED: 9,
  HUMAN_DECISION_RECORDED: 10,
  PERSISTENCE_FAILED: 11,
};

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const timeline = await new InvoiceRepository().timeline(id);
    timeline.sort((left, right) => {
      const byTime = Date.parse(left.created_at) - Date.parse(right.created_at);
      if (byTime !== 0) return byTime;
      return (eventOrder[left.event_type] ?? 99) - (eventOrder[right.event_type] ?? 99);
    });
    return NextResponse.json(timeline);
  } catch (error) {
    if (error instanceof SupabaseRepositoryError) return NextResponse.json({ code: "PERSISTENCE_UNAVAILABLE", message: "No fue posible consultar el timeline." }, { status: 503 });
    return NextResponse.json({ code: "READ_FAILED", message: "No fue posible consultar el timeline." }, { status: 500 });
  }
}
