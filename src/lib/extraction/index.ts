import OpenAI from "openai";
import type { ExtractedData } from "@/lib/contracts/types";
import { normalizeExtractedData } from "@/lib/contracts/validation";
import { fixtureFallback } from "./fixtures";
import { pdfPagesToPng } from "./pdf";
import { recognizeWithOcrSpace } from "@/lib/ocr-space";

const extractionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["invoice_number", "supplier_name", "tax_id", "purchase_order_number", "total"],
  properties: {
    invoice_number: { type: ["string", "null"] },
    supplier_name: { type: ["string", "null"] },
    tax_id: { type: ["string", "null"] },
    purchase_order_number: { type: ["string", "null"] },
    total: { type: ["number", "null"] },
  },
} as const;

export type ModelExtraction = Pick<
  ExtractedData,
  "invoice_number" | "supplier_name" | "tax_id" | "purchase_order_number" | "total"
>;

export interface InvoiceFileInput {
  name: string;
  type: string;
  bytes: Buffer;
}

export interface InvoiceExtractor {
  extract(file: InvoiceFileInput): Promise<ExtractedData | null>;
}

interface ResponsesClient {
  responses: {
    create(input: unknown): Promise<{ output_text: string }>;
  };
}

export class ExtractionUnavailableError extends Error {
  readonly code = "EXTRACTION_UNAVAILABLE";
}

function toDataUrl(bytes: Buffer, mime: string): string {
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

export class OpenAIInvoiceExtractor implements InvoiceExtractor {
  constructor(
    private readonly createClient: (apiKey: string) => ResponsesClient = (apiKey) =>
      new OpenAI({ apiKey }) as unknown as ResponsesClient,
    private readonly rasterizePdf: (bytes: Buffer) => Promise<Buffer[]> = pdfPagesToPng,
  ) {}

  async extract(file: InvoiceFileInput): Promise<ExtractedData> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY no está configurada");
    const client = this.createClient(apiKey);
    const images = file.type === "application/pdf" ? await this.rasterizePdf(file.bytes) : [file.bytes];
    const content: Array<Record<string, unknown>> = [{
      type: "input_text",
      text: "Extrae exactamente número de factura, proveedor, RUC o identificación tributaria, orden de compra y total. Usa null si un campo no está visible.",
    }];
    for (const image of images) {
      content.push({
        type: "input_image",
        image_url: toDataUrl(image, file.type === "application/pdf" ? "image/png" : file.type),
        detail: "high",
      });
    }
    const response = await client.responses.create({
      model: process.env.OPENAI_VISION_MODEL || "gpt-5.4",
      input: [{ role: "user", content: content as never }],
      text: { format: { type: "json_schema", name: "invoice_extraction", strict: true, schema: extractionSchema } },
    });
    const parsed = JSON.parse(response.output_text) as ModelExtraction;
    return normalizeExtractedData({ ...parsed, extraction_source: "OPENAI", fallback_reason: null });
  }
}

export class FixtureInvoiceExtractor implements InvoiceExtractor {
  constructor(private readonly reason: string) {}

  extract(file: InvoiceFileInput): Promise<ExtractedData | null> {
    return fixtureFallback(file.name, file.bytes, this.reason);
  }
}

export async function extractInvoice(
  file: InvoiceFileInput,
  primary: InvoiceExtractor = new OpenAIInvoiceExtractor(),
  fallbackFactory: (reason: string) => InvoiceExtractor = (reason) => new FixtureInvoiceExtractor(reason),
): Promise<ExtractedData> {
  try {
    const result = await primary.extract(file);
    if (result) return result;
    throw new Error("El extractor principal no devolvió datos");
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Fallo desconocido de OpenAI";
    const fallback = await fallbackFactory(reason).extract(file).catch(() => null);
    if (fallback) return fallback;
    throw new ExtractionUnavailableError(
      "No fue posible extraer la factura y no existe un fixture de demostración coincidente.",
    );
  }
}
