import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OcrSpaceError, recognizeWithOcrSpace } from "@/lib/ocr-space";

const file = { name: "factura.png", type: "image/png", bytes: Buffer.from("image") };

describe("recognizeWithOcrSpace", () => {
  beforeEach(() => {
    process.env.OCR_SPACE_API_KEY = "test-secret";
  });

  afterEach(() => {
    delete process.env.OCR_SPACE_API_KEY;
    vi.restoreAllMocks();
  });

  it("sends the configured key and invoice-oriented multipart options", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      ParsedResults: [{ FileParseExitCode: 1, ParsedText: "Factura 123" }],
      OCRExitCode: 1,
      IsErroredOnProcessing: false,
      ProcessingTimeInMilliseconds: "42",
    }), { status: 200, headers: { "content-type": "application/json" } }));

    const result = await recognizeWithOcrSpace(file, {}, fetcher);

    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.ocr.space/parse/image");
    expect(init?.headers).toEqual({ apikey: "test-secret" });
    const body = init?.body as FormData;
    expect(body.get("language")).toBe("spa");
    expect(body.get("OCREngine")).toBe("2");
    expect(body.get("detectOrientation")).toBe("true");
    expect(body.get("scale")).toBe("true");
    expect(body.get("isTable")).toBe("true");
    expect(body.get("file")).toBeInstanceOf(File);
    expect(result).toEqual({ text: "Factura 123", pages: ["Factura 123"], processingTimeMilliseconds: 42 });
  });

  it("fails before making a request when the API key is missing", async () => {
    delete process.env.OCR_SPACE_API_KEY;
    const fetcher = vi.fn<typeof fetch>();

    await expect(recognizeWithOcrSpace(file, {}, fetcher)).rejects.toMatchObject<OcrSpaceError>({
      code: "OCR_NOT_CONFIGURED",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("turns API processing errors into a stable application error", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      ParsedResults: [],
      OCRExitCode: 4,
      IsErroredOnProcessing: true,
      ErrorMessage: ["Invalid API key"],
    }), { status: 200 }));

    await expect(recognizeWithOcrSpace(file, {}, fetcher)).rejects.toMatchObject<OcrSpaceError>({
      code: "OCR_PROCESSING_FAILED",
      message: expect.stringContaining("Invalid API key"),
    });
  });
});
