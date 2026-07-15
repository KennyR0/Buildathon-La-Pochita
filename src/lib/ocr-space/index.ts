const OCR_SPACE_ENDPOINT = "https://api.ocr.space/parse/image";

type Fetch = typeof fetch;

interface OcrSpacePage {
  FileParseExitCode?: number | string;
  ParsedText?: string | null;
  ErrorMessage?: string | null;
  ErrorDetails?: string | null;
}

interface OcrSpaceResponse {
  ParsedResults?: OcrSpacePage[];
  OCRExitCode?: number | string;
  IsErroredOnProcessing?: boolean;
  ErrorMessage?: string | string[] | null;
  ErrorDetails?: string | null;
  ProcessingTimeInMilliseconds?: string;
}

export interface OcrSpaceResult {
  text: string;
  pages: string[];
  processingTimeMilliseconds: number | null;
}

export interface OcrSpaceOptions {
  language?: string;
  engine?: 1 | 2 | 3;
}

export class OcrSpaceError extends Error {
  constructor(
    message: string,
    readonly code: "OCR_NOT_CONFIGURED" | "OCR_REQUEST_FAILED" | "OCR_PROCESSING_FAILED",
  ) {
    super(message);
    this.name = "OcrSpaceError";
  }
}

function errorMessage(payload: OcrSpaceResponse): string {
  const topLevel = Array.isArray(payload.ErrorMessage)
    ? payload.ErrorMessage.join("; ")
    : payload.ErrorMessage;
  const pageErrors = payload.ParsedResults
    ?.flatMap((page) => [page.ErrorMessage, page.ErrorDetails])
    .filter((value): value is string => Boolean(value));
  return [topLevel, payload.ErrorDetails, ...(pageErrors ?? [])].filter(Boolean).join("; ");
}

export async function recognizeWithOcrSpace(
  file: { name: string; type: string; bytes: Buffer },
  options: OcrSpaceOptions = {},
  fetcher: Fetch = fetch,
): Promise<OcrSpaceResult> {
  const apiKey = process.env.OCR_SPACE_API_KEY?.trim();
  if (!apiKey) {
    throw new OcrSpaceError("OCR_SPACE_API_KEY no está configurada.", "OCR_NOT_CONFIGURED");
  }

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(file.bytes)], { type: file.type }), file.name);
  form.append("language", options.language ?? "spa");
  form.append("OCREngine", String(options.engine ?? 2));
  form.append("isOverlayRequired", "false");
  form.append("detectOrientation", "true");
  form.append("scale", "true");
  form.append("isTable", "true");

  let response: Response;
  try {
    response = await fetcher(OCR_SPACE_ENDPOINT, {
      method: "POST",
      headers: { apikey: apiKey },
      body: form,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Error de red desconocido";
    throw new OcrSpaceError(`No fue posible contactar OCR.space: ${reason}`, "OCR_REQUEST_FAILED");
  }

  if (!response.ok) {
    throw new OcrSpaceError(`OCR.space respondió HTTP ${response.status}.`, "OCR_REQUEST_FAILED");
  }

  let payload: OcrSpaceResponse;
  try {
    payload = await response.json() as OcrSpaceResponse;
  } catch {
    throw new OcrSpaceError("OCR.space devolvió una respuesta JSON inválida.", "OCR_REQUEST_FAILED");
  }

  const pages = payload.ParsedResults
    ?.map((page) => page.ParsedText?.trim() ?? "")
    .filter(Boolean) ?? [];
  if (payload.IsErroredOnProcessing || pages.length === 0) {
    const detail = errorMessage(payload) || "La respuesta no contiene texto reconocido.";
    throw new OcrSpaceError(`OCR.space no pudo procesar el archivo: ${detail}`, "OCR_PROCESSING_FAILED");
  }

  const processingTime = Number(payload.ProcessingTimeInMilliseconds);
  return {
    text: pages.join("\n\n"),
    pages,
    processingTimeMilliseconds: Number.isFinite(processingTime) ? processingTime : null,
  };
}
