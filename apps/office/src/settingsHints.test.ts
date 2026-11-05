import { describe, expect, it } from "vitest";
import { gstinStateHint, groupPhone, hintFor } from "./settingsHints";

describe("settings hints use the backend wording (QA-11)", () => {
  it("required phone", () => {
    expect(hintFor("phone", "  ")).toBe("Enter the shop phone number.");
  });
  it("FSSAI length", () => {
    expect(hintFor("fssaiNo", "1234567890123")).toBe("FSSAI number must be 14 digits. You typed 13.");
    expect(hintFor("fssaiNo", "12345678901234")).toBeUndefined();
  });
  it("FSSAI with letters says digits only, even at 14 characters", () => {
    expect(hintFor("fssaiNo", "ABCDEFGHIJKLMN")).toBe("FSSAI number can have digits only.");
    expect(hintFor("fssaiNo", "1234567890123A")).toBe("FSSAI number can have digits only.");
  });
  it("GSTIN length and state check", () => {
    expect(hintFor("gstin", "33ABCDE1234F1Z")).toBe("GSTIN must be 15 characters. You typed 14.");
    expect(gstinStateHint("33ABCDE1234F1Z5")).toBe("33 = Tamil Nadu");
    expect(gstinStateHint("99")).toBe("");
  });
  it("optional empty fields are fine; phone is shown grouped", () => {
    expect(hintFor("gstin", "")).toBeUndefined();
    expect(groupPhone("9876543210")).toBe("98765 43210");
  });
});
