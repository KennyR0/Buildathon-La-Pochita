import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260715140000_invoiceguard_mvp.sql", "utf8");
const seed = readFileSync("supabase/seed.sql", "utf8");

describe("Supabase MVP schema", () => {
  it("creates exactly the four allowed tables and closes RLS", () => {
    const tables = [...migration.matchAll(/create table public\.(\w+)/gi)].map(match => match[1]);
    expect(tables).toEqual(["suppliers", "purchase_orders", "invoices", "audit_logs"]);
    for (const table of tables) expect(migration).toContain(`alter table public.${table} enable row level security`);
    expect(migration.toLowerCase()).not.toContain("create policy");
  });

  it("uses a non-unique duplicate lookup index and a root reference", () => {
    expect(migration).toContain("create index invoices_invoice_number_normalized_idx");
    expect(migration).not.toContain("create unique index invoices_invoice_number_normalized_idx");
    expect(migration).toContain("duplicate_of_invoice_id uuid references public.invoices(id)");
  });

  it("has idempotent seed conflicts for supplier, order, original invoice, and timeline", () => {
    expect(seed.match(/on conflict/gi)).toHaveLength(4);
    expect(seed).toContain("PO-DEMO-1500");
    expect(seed).toContain("INV-DUP-001");
    expect(seed).toContain("INVOICE_PERSISTED");
  });
});
