import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ExtractionUnavailableError,
  OpenAIInvoiceExtractor,
  extractInvoice,
  type InvoiceExtractor,
  type InvoiceFileInput,
} from "@/lib/extraction";
import type { ExtractedData } from "@/lib/contracts/types";

const file: InvoiceFileInput = { name: "invoice.png", type: "image/png", bytes: Buffer.from("invoice") };
const complete: ExtractedData = {
  invoice_number: "INV-1",
  supplier_name: "Proveedor",
  tax_id: "RUC-1",
  purchase_order_number: "PO-1",
  total: 1500,
  invalid_fields: [],
  extraction_source: "OPENAI",
  fallback_reason: null,
};

afterEach(() => vi.unstubAllEnvs());

describe("extraction errors", () => {
  it("exposes the stable unavailable code", () => {
    expect(new ExtractionUnavailableError("x").code).toBe("EXTRACTION_UNAVAILABLE");
  });

  it("accepts a contract-compatible primary extractor", async () => {
    const primary: InvoiceExtractor = { extract: vi.fn().mockResolvedValue(complete) };
    await expect(extractInvoice(file, primary)).resolves.toEqual(complete);
  });

  it("preserves partial structured extraction for correction", async () => {
    const partial = { ...complete, supplier_name: null, invalid_fields: ["supplier_name"] } as ExtractedData;
    const primary: InvoiceExtractor = { extract: vi.fn().mockResolvedValue(partial) };
    await expect(extractInvoice(file, primary)).resolves.toEqual(partial);
  });

  it("uses a compatible fallback extractor after a primary failure", async () => {
    const primary: InvoiceExtractor = { extract: vi.fn().mockRejectedValue(new Error("OpenAI unavailable")) };
    const fallback = {
      ...complete,
      extraction_source: "FIXTURE_FALLBACK" as const,
      fallback_reason: "OpenAI no estuvo disponible; se utilizó el fixture de demostración.",
    };
    const fallbackExtractor: InvoiceExtractor = { extract: vi.fn().mockResolvedValue(fallback) };

    await expect(extractInvoice(file, primary, () => fallbackExtractor)).resolves.toEqual(fallback);
  });

  it("returns the stable unavailable error when no fallback matches", async () => {
    const primary: InvoiceExtractor = { extract: vi.fn().mockRejectedValue(new Error("OpenAI unavailable")) };
    const fallback: InvoiceExtractor = { extract: vi.fn().mockResolvedValue(null) };
    await expect(extractInvoice(file, primary, () => fallback)).rejects.toBeInstanceOf(ExtractionUnavailableError);
  });

  it("sends an image to Responses API and validates structured output", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("OPENAI_VISION_MODEL", "gpt-5.4");
    const create = vi.fn().mockResolvedValue({
      output_text: JSON.stringify({
        invoice_number: " INV-1 ", supplier_name: "Proveedor", tax_id: "RUC-1",
        purchase_order_number: "PO-1", total: 1500,
      }),
    });
    const extractor = new OpenAIInvoiceExtractor(() => ({ responses: { create } }));

    await expect(extractor.extract(file)).resolves.toMatchObject({ invoice_number: "INV-1", invalid_fields: [] });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ model: "gpt-5.4" }));
    const request = create.mock.calls[0][0] as { input: Array<{ content: Array<{ type: string; image_url?: string }> }> };
    expect(request.input[0].content[1]).toMatchObject({ type: "input_image" });
    expect(request.input[0].content[1].image_url).toMatch(/^data:image\/png;base64,/);
  });

  it("rasterizes every PDF page as PNG input", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("OPENAI_VISION_MODEL", "");
    const create = vi.fn().mockResolvedValue({
      output_text: JSON.stringify({
        invoice_number: "INV-PDF", supplier_name: null, tax_id: "RUC-1",
        purchase_order_number: "PO-1", total: 1500,
      }),
    });
    const rasterize = vi.fn().mockResolvedValue([Buffer.from("page-1"), Buffer.from("page-2")]);
    const extractor = new OpenAIInvoiceExtractor(() => ({ responses: { create } }), rasterize);

    const result = await extractor.extract({ ...file, name: "invoice.pdf", type: "application/pdf" });
    expect(result.invalid_fields).toEqual(["supplier_name"]);
    expect(rasterize).toHaveBeenCalledWith(file.bytes);
    const request = create.mock.calls[0][0] as { model: string; input: Array<{ content: Array<{ type: string; image_url?: string }> }> };
    expect(request.model).toBe("gpt-5.4");
    expect(request.input[0].content.filter(item => item.type === "input_image")).toHaveLength(2);
    expect(request.input[0].content[1].image_url).toMatch(/^data:image\/png;base64,/);
  });
});
