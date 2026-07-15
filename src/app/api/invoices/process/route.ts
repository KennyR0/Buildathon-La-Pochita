import { NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { extractInvoice, ExtractionUnavailableError } from "@/lib/extraction";
import { decideAndPersist } from "@/lib/invoice-processing";
import { SupabaseRepositoryError } from "@/lib/supabase";

export const runtime = "nodejs";

const acceptedTypes = new Set(["image/png", "image/jpeg", "application/pdf"]);

async function saveDevelopmentUpload(originalName: string, bytes: Buffer) {
  if (process.env.NODE_ENV !== "development") return;

  const uploadDirectory = path.join(process.cwd(), "dev", "uploads");
  const extension = path.extname(originalName).toLowerCase();
  const baseName = path.basename(originalName, extension)
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "upload";
  const storedName = `${baseName}-${randomUUID()}${extension}`;

  await mkdir(uploadDirectory, { recursive: true });
  await writeFile(path.join(uploadDirectory, storedName), bytes, { flag: "wx" });
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !acceptedTypes.has(file.type)) {
      return NextResponse.json({ code: "INVALID_FILE", message: "Carga una imagen PNG/JPG o un PDF de factura." }, { status: 400 });
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    await saveDevelopmentUpload(file.name, bytes);
    const extracted = await extractInvoice({ name: file.name, type: file.type, bytes });
    return NextResponse.json(await decideAndPersist(extracted));
  } catch (error) {
    if (error instanceof ExtractionUnavailableError) {
      return NextResponse.json({ code: error.code, message: error.message, processing_id: null }, { status: 503 });
    }
    if (error instanceof SupabaseRepositoryError) {
      return NextResponse.json({ code: "PERSISTENCE_UNAVAILABLE", message: "No fue posible consultar o guardar la factura. El proceso no se completó." }, { status: 503 });
    }
    return NextResponse.json({ code: "PROCESSING_FAILED", message: "No fue posible procesar la factura." }, { status: 500 });
  }
}
