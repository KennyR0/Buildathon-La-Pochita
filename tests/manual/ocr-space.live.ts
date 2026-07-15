import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { recognizeWithOcrSpace } from "@/lib/ocr-space";

describe("OCR.space live API", () => {
  it("recognizes the approved invoice fixture using the real service", async () => {
    expect(
      process.env.OCR_SPACE_API_KEY?.trim(),
      "Set OCR_SPACE_API_KEY in .env before running the live OCR test",
    ).toBeTruthy();

    const bytes = await readFile(new URL("../../fixtures/invoice-approved.png", import.meta.url));
    const result = await recognizeWithOcrSpace(
      {
        name: "invoice-approved.png",
        type: "image/png",
        bytes,
      },
      { language: "spa", engine: 1 },
    );
    const normalized = result.text.toUpperCase().replace(/[^A-Z0-9]/g, "");

    expect(result.pages.length).toBeGreaterThan(0);
    expect(normalized).toContain("PROVEEDORDEMOSA");
    expect(normalized).toContain("1790012345001");
    expect(normalized).toContain("PODEMO1500");
  }, 90_000);
});
