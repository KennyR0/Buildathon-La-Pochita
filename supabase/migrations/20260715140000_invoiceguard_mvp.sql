create extension if not exists pgcrypto;

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  tax_id text not null unique check (tax_id = upper(btrim(tax_id)) and tax_id <> ''),
  name text not null check (btrim(name) <> ''),
  created_at timestamptz not null default now()
);

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_number text not null unique check (po_number = upper(btrim(po_number)) and po_number <> ''),
  supplier_id uuid not null references public.suppliers(id),
  authorized_amount numeric(14,2) not null check (authorized_amount >= 0),
  created_at timestamptz not null default now()
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  processing_id uuid not null unique,
  invoice_number_raw text,
  invoice_number_normalized text,
  supplier_name_extracted text,
  tax_id_extracted text,
  purchase_order_number text,
  total numeric(14,2) check (total is null or total >= 0),
  supplier_id uuid references public.suppliers(id),
  purchase_order_id uuid references public.purchase_orders(id),
  duplicate_of_invoice_id uuid references public.invoices(id),
  missing_or_invalid_fields jsonb not null default '[]'::jsonb check (jsonb_typeof(missing_or_invalid_fields) = 'array'),
  automatic_decision text not null check (automatic_decision in ('APPROVED','NEEDS_REVIEW_HIGH_RISK','REJECTED')),
  automatic_reasons jsonb not null default '[]'::jsonb check (jsonb_typeof(automatic_reasons) = 'array'),
  human_decision text check (human_decision is null or human_decision in ('APPROVED','REJECTED')),
  human_justification text,
  human_decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((human_decision is null and human_justification is null and human_decided_at is null)
      or (human_decision is not null and automatic_decision = 'NEEDS_REVIEW_HIGH_RISK'
          and human_justification is not null and btrim(human_justification) <> ''
          and human_decided_at is not null)),
  check (invoice_number_normalized is null
      or (invoice_number_normalized = upper(btrim(invoice_number_normalized)) and invoice_number_normalized <> '')),
  check (tax_id_extracted is null
      or (tax_id_extracted = upper(btrim(tax_id_extracted)) and tax_id_extracted <> '')),
  check (purchase_order_number is null
      or (purchase_order_number = upper(btrim(purchase_order_number)) and purchase_order_number <> '')),
  check (duplicate_of_invoice_id is null
      or (duplicate_of_invoice_id <> id and automatic_decision = 'REJECTED'))
);

create index invoices_invoice_number_normalized_idx on public.invoices(invoice_number_normalized);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  processing_id uuid not null,
  invoice_id uuid references public.invoices(id) on delete cascade,
  event_type text not null check (btrim(event_type) <> ''),
  status text not null check (status in ('STARTED','PASSED','FAILED','COMPLETED')),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);

create index audit_logs_processing_created_idx on public.audit_logs(processing_id, created_at, id);
create index audit_logs_invoice_created_idx on public.audit_logs(invoice_id, created_at, id);

alter table public.suppliers enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.invoices enable row level security;
alter table public.audit_logs enable row level security;

revoke all on public.suppliers, public.purchase_orders, public.invoices, public.audit_logs from anon, authenticated;
grant select, insert, update, delete on public.suppliers, public.purchase_orders, public.invoices, public.audit_logs to service_role;
