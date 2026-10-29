import { describe, expect, it } from "vitest";
import { invoicePhotoPath } from "@/lib/crm/invoicePhotos";

describe("invoicePhotoPath", () => {
  it("stores the photo under the invoice id with the extension of its type", () => {
    expect(invoicePhotoPath("inv-1", "image/jpeg", 1700000000000)).toBe("inv-1/1700000000000.jpg");
    expect(invoicePhotoPath("inv-1", "image/png", 1)).toBe("inv-1/1.png");
    expect(invoicePhotoPath("inv-1", "image/webp", 1)).toBe("inv-1/1.webp");
  });

  it("falls back to a generic extension for an unknown type", () => {
    expect(invoicePhotoPath("inv-1", "application/octet-stream", 1)).toBe("inv-1/1.bin");
  });
});
