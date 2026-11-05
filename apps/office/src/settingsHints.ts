import type { ShopSettings } from "@gokul/ui";

/**
 * Cheap hints shown when the owner leaves a field. They are NOT the rules: Rust checks every
 * field on save and its messages win. Keep this list short so it can never disagree with Rust.
 */
export type SettingsKey = keyof ShopSettings;

export interface FieldSpec {
  key: SettingsKey;
  label: string;
  required: boolean;
  maxLength: number;
  transform?: "upper";
}

/** Form order (top to bottom). */
export const FIELDS: FieldSpec[] = [
  { key: "shopName", label: "Shop name", required: true, maxLength: 40 },
  { key: "addressLine1", label: "Address line 1", required: true, maxLength: 48 },
  { key: "addressLine2", label: "Address line 2", required: false, maxLength: 48 },
  { key: "addressLine3", label: "Town and pincode", required: false, maxLength: 48 },
  { key: "phone", label: "Phone", required: true, maxLength: 20 },
  { key: "gstin", label: "GSTIN", required: false, maxLength: 15, transform: "upper" },
  { key: "fssaiNo", label: "FSSAI number", required: false, maxLength: 14 },
  { key: "billFooter", label: "Bill footer", required: false, maxLength: 48 },
];

const REQUIRED_MESSAGE: Partial<Record<SettingsKey, string>> = {
  shopName: "Enter the shop name.",
  addressLine1: "Enter the first address line.",
  phone: "Enter the shop phone number.",
};

export function hintFor(key: SettingsKey, rawValue: string): string | undefined {
  const value = rawValue.trim();
  const spec = FIELDS.find((f) => f.key === key);
  if (value === "") return spec?.required ? REQUIRED_MESSAGE[key] : undefined;
  if (key === "gstin") {
    const g = value.replace(/\s+/g, "");
    if (g.length !== 15) return `GSTIN must be 15 characters. You typed ${g.length}.`;
  }
  if (key === "fssaiNo") {
    if (!/^\d+$/.test(value)) return "FSSAI number can have digits only.";
    if (value.length !== 14) return `FSSAI number must be 14 digits. You typed ${value.length}.`;
  }
  return undefined;
}

/** GST state codes, for the visual check next to the GSTIN box only. */
const STATE_NAMES: Record<string, string> = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman and Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
};

/** "33 = Tamil Nadu" for the first two GSTIN digits, or "" when unknown. A visual check, never a block. */
export function gstinStateHint(gstin: string): string {
  const code = gstin.trim().slice(0, 2);
  const name = STATE_NAMES[code];
  return name ? `${code} = ${name}` : "";
}

/** 9876543210 -> "98765 43210" (display only; Rust stores 10 digits). */
export function groupPhone(phone: string): string {
  return /^\d{10}$/.test(phone) ? `${phone.slice(0, 5)} ${phone.slice(5)}` : phone;
}
