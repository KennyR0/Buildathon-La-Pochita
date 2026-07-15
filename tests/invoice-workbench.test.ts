import { describe, expect, it } from "vitest";
import { canShowHumanDecision, readApiResponse } from "@/components/invoice-workbench-helpers";

describe("invoice workbench interaction guards", () => {
  it("turns a non-JSON service failure into an actionable error", async () => {
    const response = new Response("<html>Service unavailable</html>", { status: 503 });

    await expect(readApiResponse(response)).rejects.toThrow("El servidor no pudo completar la solicitud. Intenta de nuevo.");
  });

  it("keeps the backend message for a conflicting human decision", async () => {
    const response = new Response(
      JSON.stringify({ code: "CONFLICT", message: "La factura ya tiene una decisión humana." }),
      { status: 409, headers: { "content-type": "application/json" } },
    );

    await expect(readApiResponse(response)).rejects.toThrow("La factura ya tiene una decisión humana.");
  });

  it("hides human decision actions for an automatically rejected duplicate", () => {
    expect(canShowHumanDecision("REJECTED", null)).toBe(false);
  });
});
