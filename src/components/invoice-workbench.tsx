"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { AuditEvent, Decision, ExtractedData, FieldName, InvoiceResult } from "@/lib/contracts/types";
import { canShowHumanDecision, readApiResponse } from "@/components/invoice-workbench-helpers";

type LoadState = "idle" | "processing" | "success" | "error";
type EditableData = Pick<ExtractedData, "invoice_number" | "supplier_name" | "tax_id" | "purchase_order_number" | "total">;

const fieldLabels: Record<FieldName, string> = {
  invoice_number: "Numero de factura",
  supplier_name: "Proveedor",
  tax_id: "RUC / identificacion tributaria",
  purchase_order_number: "Orden de compra",
  total: "Total facturado",
};

const decisionLabels: Record<Decision, string> = {
  APPROVED: "Aprobada",
  NEEDS_REVIEW_HIGH_RISK: "Revision requerida",
  REJECTED: "Rechazada",
};

const auditEventLabels: Record<string, string> = {
  PROCESSING_STARTED: "Procesamiento iniciado",
  EXTRACTION_COMPLETED: "Extraccion completada",
  EXTRACTION_FALLBACK_USED: "Extraccion con respaldo",
  EXTRACTION_INVALID: "Extraccion incompleta",
  STRUCTURE_VALIDATED: "Estructura validada",
  SUPPLIER_CHECKED: "Proveedor verificado",
  PURCHASE_ORDER_CHECKED: "Orden de compra verificada",
  DUPLICATE_CHECKED: "Duplicado verificado",
  AMOUNT_COMPARED: "Monto comparado",
  RULES_EVALUATED: "Reglas evaluadas",
  INVOICE_PERSISTED: "Factura guardada",
  PERSISTENCE_FAILED: "Persistencia fallida",
  FIELDS_CORRECTED: "Campos corregidos",
  HUMAN_DECISION_RECORDED: "Decision humana registrada",
};

const validationLabels: Record<string, string> = {
  DUPLICATE_INVOICE: "Factura duplicada",
  EXTRACTION_COMPLETE: "Extraccion completa",
  SUPPLIER_EXISTS: "Proveedor existe",
  PURCHASE_ORDER_EXISTS: "Orden de compra existe",
  SUPPLIER_MATCHES_ORDER: "Proveedor coincide con la orden",
  AMOUNT_MATCHES: "Monto coincide",
};

const detailLabels: Record<string, string> = {
  after: "Despues",
  automatic_decision: "Decision automatica",
  authorized_amount: "Monto autorizado",
  before: "Antes",
  decision: "Decision",
  description: "Descripcion",
  duplicate_of_invoice_id: "Duplicado de la factura",
  invoice_total: "Total de factura",
  invalid_fields: "Campos invalidos",
  justification: "Justificacion",
  message: "Mensaje",
  purchase_order_id: "ID de orden de compra",
  reason: "Motivo",
  reasons: "Motivos",
  skipped: "Omitido",
  source: "Fuente",
  supplier_id: "ID de proveedor",
  validations: "Validaciones",
};

const sourceLabels: Record<string, string> = {
  OPENAI: "OpenAI",
  OCR_SPACE_OPENAI: "OCR de respaldo + OpenAI",
  FIXTURE_FALLBACK: "Datos de demostracion",
};

const emptyCorrection: EditableData = {
  invoice_number: null,
  supplier_name: null,
  tax_id: null,
  purchase_order_number: null,
  total: null,
};

export function InvoiceWorkbench() {
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<InvoiceResult | null>(null);
  const [timeline, setTimeline] = useState<AuditEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [correction, setCorrection] = useState<EditableData>(emptyCorrection);
  const [correctionJustification, setCorrectionJustification] = useState("");
  const [humanDecision, setHumanDecision] = useState<"APPROVED" | "REJECTED">("APPROVED");
  const [humanJustification, setHumanJustification] = useState("");
  const [actionPending, setActionPending] = useState(false);

  const hydrateResult = useCallback(async (invoice: InvoiceResult) => {
    setResult(invoice);
    setCorrection({
      invoice_number: invoice.extracted_data.invoice_number,
      supplier_name: invoice.extracted_data.supplier_name,
      tax_id: invoice.extracted_data.tax_id,
      purchase_order_number: invoice.extracted_data.purchase_order_number,
      total: invoice.extracted_data.total,
    });
    localStorage.setItem("invoiceguard:last-invoice", invoice.invoice_id);
    const response = await fetch(`/api/invoices/${invoice.invoice_id}/timeline`, { cache: "no-store" });
    setTimeline(await readApiResponse<AuditEvent[]>(response));
  }, []);

  useEffect(() => {
    const invoiceId = localStorage.getItem("invoiceguard:last-invoice");
    if (!invoiceId) return;
    let active = true;
    void (async () => {
      try {
        setLoadState("processing");
        const response = await fetch(`/api/invoices/${invoiceId}`, { cache: "no-store" });
        const invoice = await readApiResponse<InvoiceResult>(response);
        if (active) {
          await hydrateResult(invoice);
          setLoadState("success");
        }
      } catch {
        if (active) setLoadState("idle");
      }
    })();
    return () => {
      active = false;
    };
  }, [hydrateResult]);

  async function processInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError("Selecciona una imagen o un PDF antes de continuar.");
      return;
    }
    setLoadState("processing");
    setError(null);
    setResult(null);
    setTimeline([]);
    const body = new FormData();
    body.append("file", file);
    try {
      const response = await fetch("/api/invoices/process", { method: "POST", body });
      const invoice = await readApiResponse<InvoiceResult>(response);
      await hydrateResult(invoice);
      setLoadState("success");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo procesar la factura.");
      setLoadState("error");
    }
  }

  async function submitCorrection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!result) return;
    await runAction(async () => {
      const response = await fetch(`/api/invoices/${result.invoice_id}/extracted-data`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...correction, justification: correctionJustification.trim() }),
      });
      await hydrateResult(await readApiResponse<InvoiceResult>(response));
      setCorrectionJustification("");
    });
  }

  async function submitHumanDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!result) return;
    await runAction(async () => {
      const response = await fetch(`/api/invoices/${result.invoice_id}/human-decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: humanDecision, justification: humanJustification.trim() }),
      });
      await hydrateResult(await readApiResponse<InvoiceResult>(response));
      setHumanJustification("");
    });
  }

  async function runAction(action: () => Promise<void>) {
    setActionPending(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar el cambio.");
    } finally {
      setActionPending(false);
    }
  }

  const needsCorrection = Boolean(result?.extracted_data.invalid_fields.length);
  const canResolve = result ? canShowHumanDecision(result.effective_decision, result.human_decision) : false;
  const decisionTone = useMemo(() => result?.effective_decision.toLowerCase().replaceAll("_", "-") ?? "", [result]);

  return (
    <main>
      <header className="hero">
        <div className="brand-mark">IG</div>
        <div>
          <p className="eyebrow">InvoiceGuard AI</p>
          <h1>
            Decisiones de facturas
            <br />
            claras y auditables
          </h1>
          <p className="hero-copy">Carga una factura. Verificamos proveedor, orden, monto y duplicados antes de decidir.</p>
        </div>
        <div className="system-status"><span /> Sistema de reglas activo</div>
      </header>

      <section className="workspace">
        <form className="upload-card" onSubmit={processInvoice}>
          <div className="step-number">01</div>
          <div>
            <h2>Recibir factura</h2>
            <p>Imagen JPG/PNG o documento PDF.</p>
          </div>
          <label className="drop-zone">
            <input
              type="file"
              accept="image/png,image/jpeg,application/pdf"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            <span className="upload-icon">↑</span>
            <strong>{file ? file.name : "Selecciona una factura"}</strong>
            <small>{file ? `${(file.size / 1024).toFixed(0)} KB` : "PNG, JPG o PDF"}</small>
          </label>
          <button className="primary" disabled={loadState === "processing"}>
            {loadState === "processing" ? "Procesando..." : "Procesar factura"}
          </button>
        </form>

        <section className="result-area" aria-live="polite">
          {loadState === "idle" && <EmptyState />}
          {loadState === "processing" && <ProcessingState />}
          {error && <div className="error-banner" role="alert"><strong>No se completo el proceso</strong><span>{error}</span></div>}
          {result && (
            <>
              <div className="result-heading">
                <div><p className="eyebrow">Resultado persistido</p><h2>Factura {result.extracted_data.invoice_number ?? "sin numero"}</h2></div>
                <span className={`decision-badge ${decisionTone}`}>{decisionLabels[result.effective_decision]}</span>
              </div>

              <div className="data-grid">
                {(Object.keys(fieldLabels) as FieldName[]).map((field) => (
                  <div className={result.extracted_data.invalid_fields.includes(field) ? "data-item invalid" : "data-item"} key={field}>
                    <span>{fieldLabels[field]}</span>
                    <strong>{formatField(result.extracted_data[field], field)}</strong>
                  </div>
                ))}
              </div>

              {result.extracted_data.extraction_source !== "OPENAI" && (
                <div className="notice">
                  <strong>{result.extracted_data.extraction_source === "OCR_SPACE_OPENAI" ? "Respaldo OCR utilizado" : "Fixture de respaldo utilizado"}</strong>
                  <span>{result.extracted_data.fallback_reason}</span>
                </div>
              )}

              <section className="panel">
                <div className="panel-title"><span className="step-number small">02</span><div><h3>Validaciones</h3><p>Factura versus datos empresariales</p></div></div>
                <div className="validation-list">
                  {result.validations.map((validation) => (
                    <div className={`validation ${validation.status.toLowerCase()}`} key={validation.code}>
                      <span className="validation-icon">{validation.status === "PASSED" ? "OK" : validation.status === "FAILED" ? "!" : "-"}</span>
                      <div><strong>{translateCode(validation.code)}</strong><p>{validation.message}</p></div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="decision-panel">
                <div><p className="eyebrow">Decision automatica</p><h3>{decisionLabels[result.automatic_decision]}</h3></div>
                <ul>{result.reasons.map((reason) => <li key={reason}>{translateCode(reason)}</li>)}</ul>
                {result.duplicate_of_invoice_id && <p className="reference">Duplicado de: <code>{result.duplicate_of_invoice_id}</code></p>}
                {result.human_decision && <div className="human-result"><strong>Decision humana: {decisionLabels[result.human_decision]}</strong><p>{result.human_justification}</p></div>}
              </section>

              {needsCorrection && <CorrectionForm data={correction} setData={setCorrection} justification={correctionJustification} setJustification={setCorrectionJustification} pending={actionPending} onSubmit={submitCorrection} />}
              {canResolve && !needsCorrection && <HumanDecisionForm decision={humanDecision} setDecision={setHumanDecision} justification={humanJustification} setJustification={setHumanJustification} pending={actionPending} onSubmit={submitHumanDecision} />}

              <Timeline events={timeline} />
            </>
          )}
        </section>
      </section>
    </main>
  );
}

function EmptyState() {
  return <div className="empty-state"><div className="document-shape" /><p className="eyebrow">Esperando factura</p><h2>El analisis aparecera aqui</h2><p>Extraccion, validaciones, decision y trazabilidad en una sola vista.</p></div>;
}

function ProcessingState() {
  return <div className="empty-state"><div className="spinner" /><p className="eyebrow">Procesando</p><h2>Validando contra Supabase</h2><p>Extraemos los datos y ejecutamos las reglas deterministas.</p></div>;
}

function CorrectionForm({ data, setData, justification, setJustification, pending, onSubmit }: { data: EditableData; setData: (data: EditableData) => void; justification: string; setJustification: (value: string) => void; pending: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <form className="action-panel" onSubmit={onSubmit}><p className="eyebrow">Extraccion parcial</p><h3>Corrige los datos para continuar</h3><div className="form-grid">{(Object.keys(fieldLabels) as FieldName[]).map((field) => <label key={field}><span>{fieldLabels[field]}</span><input required type={field === "total" ? "number" : "text"} min={field === "total" ? 0 : undefined} step={field === "total" ? "0.01" : undefined} value={data[field] ?? ""} onChange={(event) => setData({ ...data, [field]: field === "total" ? (event.target.value === "" ? null : Number(event.target.value)) : event.target.value })} /></label>)}</div><label><span>Justificacion de la correccion</span><textarea required value={justification} onChange={(event) => setJustification(event.target.value)} /></label><button className="primary" disabled={pending || !justification.trim()}>{pending ? "Guardando..." : "Corregir y reprocesar"}</button></form>;
}

function HumanDecisionForm({ decision, setDecision, justification, setJustification, pending, onSubmit }: { decision: "APPROVED" | "REJECTED"; setDecision: (value: "APPROVED" | "REJECTED") => void; justification: string; setJustification: (value: string) => void; pending: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <form className="action-panel" onSubmit={onSubmit}><p className="eyebrow">Revision humana</p><h3>Resolver excepcion</h3><div className="segmented"><button type="button" className={decision === "APPROVED" ? "selected" : ""} onClick={() => setDecision("APPROVED")}>Aprobar excepcion</button><button type="button" className={decision === "REJECTED" ? "selected danger" : ""} onClick={() => setDecision("REJECTED")}>Rechazar</button></div><label><span>Justificacion obligatoria</span><textarea required value={justification} onChange={(event) => setJustification(event.target.value)} /></label><button className="primary" disabled={pending || !justification.trim()}>{pending ? "Guardando..." : "Guardar decision humana"}</button></form>;
}

function Timeline({ events }: { events: AuditEvent[] }) {
  return <section className="timeline-panel"><div className="panel-title"><span className="step-number small">03</span><div><h3>Linea de auditoria</h3><p>{events.length} eventos persistidos</p></div></div><ol className="timeline">{events.map((event) => <li key={event.id}><span className={`event-dot ${event.status.toLowerCase()}`} /><div><div className="event-header"><strong>{translateEvent(event.event_type)}</strong><time>{new Date(event.created_at).toLocaleString("es-EC", { dateStyle: "short", timeStyle: "short" })}</time></div><p>{describeDetails(event.details)}</p></div></li>)}</ol></section>;
}

function formatField(value: string | number | null, field: FieldName) {
  if (value === null || value === "") return "Requiere correccion";
  if (field === "total" && typeof value === "number") return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(value);
  return String(value);
}

function humanize(value: string) {
  return value.replaceAll("_", " ").toLowerCase().replace(/^./, (letter) => letter.toUpperCase());
}

function translateEvent(value: string) {
  return auditEventLabels[value] ?? humanize(value);
}

function translateCode(value: string) {
  return validationLabels[value] ?? decisionLabels[value as Decision] ?? sourceLabels[value] ?? humanize(value);
}

function describeDetails(details: Record<string, unknown>) {
  const preferred = details.message ?? details.reason ?? details.description;
  if (typeof preferred === "string") return translateCode(preferred);
  const entries = Object.entries(details)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .slice(0, 4)
    .map(([key, value]) => `${detailLabels[key] ?? humanize(key)}: ${formatDetailValue(value)}`);
  return entries.join(" - ") || "Evento registrado correctamente.";
}

function formatDetailValue(value: unknown): string {
  if (value === null || value === undefined) return "No aplica";
  if (typeof value === "boolean") return value ? "Si" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return translateCode(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "Ninguno";
    return value.map(formatDetailValue).join(", ");
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, nested]) => nested !== null && nested !== undefined && nested !== "")
      .map(([key, nested]) => `${detailLabels[key] ?? humanize(key)}: ${formatDetailValue(nested)}`);
    return entries.join("; ") || "Sin detalles";
  }
  return String(value);
}
