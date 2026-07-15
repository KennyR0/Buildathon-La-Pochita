import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error("SUPABASE_URL and SUPABASE_SECRET_KEY are required for demo:seed");
  process.exit(1);
}

const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const supplier = { id: "10000000-0000-4000-8000-000000000001", tax_id: "1790012345001", name: "Proveedor Demo S.A." };
const order = { id: "20000000-0000-4000-8000-000000000001", po_number: "PO-DEMO-1500", supplier_id: supplier.id, authorized_amount: 1500 };
const invoice = {
  id: "30000000-0000-4000-8000-000000000001", processing_id: "40000000-0000-4000-8000-000000000001",
  invoice_number_raw: "INV-DUP-001", invoice_number_normalized: "INV-DUP-001", supplier_name_extracted: supplier.name,
  tax_id_extracted: supplier.tax_id, purchase_order_number: order.po_number, total: 1500, supplier_id: supplier.id,
  purchase_order_id: order.id, missing_or_invalid_fields: [], automatic_decision: "APPROVED", automatic_reasons: [],
};
const audit = [
  { id: "50000000-0000-4000-8000-000000000001", processing_id: invoice.processing_id, invoice_id: invoice.id,
    event_type: "RULES_EVALUATED", status: "COMPLETED", details: { decision: "APPROVED", seed: true } },
  { id: "50000000-0000-4000-8000-000000000002", processing_id: invoice.processing_id, invoice_id: invoice.id,
    event_type: "INVOICE_PERSISTED", status: "COMPLETED", details: { automatic_decision: "APPROVED", seed: true } },
];

for (const [table, row, conflict] of [["suppliers", supplier, "tax_id"], ["purchase_orders", order, "po_number"], ["invoices", invoice, "processing_id"], ["audit_logs", audit, "id"]]) {
  const { error } = await db.from(table).upsert(row, { onConflict: conflict });
  if (error) { console.error(`Seed failed for ${table}: ${error.message}`); process.exit(1); }
}
console.log("InvoiceGuard demo seed is ready (supplier, PO-DEMO-1500, duplicate root, audit timeline).");
