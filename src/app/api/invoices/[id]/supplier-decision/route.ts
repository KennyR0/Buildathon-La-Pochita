import { NextResponse } from "next/server";
import { decideSupplierForInvoice } from "@/lib/invoice-processing";
import { SupabaseRepositoryError } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json() as { decision?: string; justification?: string };
    if (!(body.decision === "APPROVED" || body.decision === "REJECTED")) {
      return NextResponse.json({ code: "INVALID_SUPPLIER_DECISION", message: "Selecciona una decision para el proveedor." }, { status: 422 });
    }
    const justification = body.justification?.trim() ?? "";
    if (body.decision === "REJECTED" && !justification) {
      return NextResponse.json({ code: "INVALID_SUPPLIER_DECISION", message: "La justificacion es obligatoria para rechazar la factura." }, { status: 422 });
    }
    return NextResponse.json(await decideSupplierForInvoice(id, body.decision, justification));
  } catch (error) {
    if (error instanceof SupabaseRepositoryError) {
      const status = error.kind === "CONFLICT" ? 409 : error.kind === "NOT_FOUND" ? 404 : 503;
      return NextResponse.json({ code: error.kind, message: error.message }, { status });
    }
    return NextResponse.json({ code: "SUPPLIER_DECISION_FAILED", message: "No fue posible resolver la revision del proveedor." }, { status: 500 });
  }
}
