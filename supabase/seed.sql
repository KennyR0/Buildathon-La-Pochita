insert into public.suppliers (id, tax_id, name)
values ('10000000-0000-4000-8000-000000000001', '1790012345001', 'Proveedor Demo S.A.')
on conflict (tax_id) do update set name = excluded.name;

insert into public.purchase_orders (id, po_number, supplier_id, authorized_amount)
values ('20000000-0000-4000-8000-000000000001', 'PO-DEMO-1500',
        (select id from public.suppliers where tax_id = '1790012345001'), 1500.00)
on conflict (po_number) do update set supplier_id = excluded.supplier_id, authorized_amount = excluded.authorized_amount;

insert into public.invoices (
  id, processing_id, invoice_number_raw, invoice_number_normalized, supplier_name_extracted,
  tax_id_extracted, purchase_order_number, total, supplier_id, purchase_order_id,
  missing_or_invalid_fields, automatic_decision, automatic_reasons
)
values (
  '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001',
  'INV-DUP-001', 'INV-DUP-001', 'Proveedor Demo S.A.', '1790012345001', 'PO-DEMO-1500', 1500.00,
  (select id from public.suppliers where tax_id = '1790012345001'),
  (select id from public.purchase_orders where po_number = 'PO-DEMO-1500'),
  '[]'::jsonb, 'APPROVED', '[]'::jsonb
)
on conflict (processing_id) do update set updated_at = now();

insert into public.audit_logs (id, processing_id, invoice_id, event_type, status, details)
values
  ('50000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001',
   (select id from public.invoices where processing_id = '40000000-0000-4000-8000-000000000001'),
   'RULES_EVALUATED', 'COMPLETED', '{"decision":"APPROVED","seed":true}'::jsonb),
  ('50000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001',
   (select id from public.invoices where processing_id = '40000000-0000-4000-8000-000000000001'),
   'INVOICE_PERSISTED', 'COMPLETED', '{"automatic_decision":"APPROVED","seed":true}'::jsonb)
on conflict (id) do update
set invoice_id = excluded.invoice_id,
    event_type = excluded.event_type,
    status = excluded.status,
    details = excluded.details;
