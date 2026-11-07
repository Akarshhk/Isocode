/** Normalises an Indian mobile number to E.164 (+91XXXXXXXXXX). Returns null if invalid. */
export function normalisePhone(raw: string): string | null {
  let digits = raw.replace(/[^\d]/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (!/^[6-9]\d{9}$/.test(digits)) return null;
  return `+91${digits}`;
}

/** "+91 90000 00001" */
export function formatPhone(e164: string): string {
  const d = e164.replace("+91", "");
  return `+91 ${d.slice(0, 5)} ${d.slice(5)}`;
}
