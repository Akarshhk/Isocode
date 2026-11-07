// All money is integer paise. Never floats for stored amounts.

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const inrPaise = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** "₹6,370" (or "₹6,370.50" when there are paise). */
export function formatINR(paise: number): string {
  return paise % 100 === 0 ? inr.format(paise / 100) : inrPaise.format(paise / 100);
}

export function roundToRupee(paise: number): number {
  return Math.round(paise / 100) * 100;
}

/** Parses bank-statement amounts like "6,370.00", "₹ 6370", "1,50,000". Returns paise or null. */
export function parseAmountToPaise(raw: string | undefined | null): number | null {
  if (raw == null) return null;
  const s = String(raw).replace(/[₹,\s]/g, "").replace(/^INR/i, "");
  if (s === "" || s === "-") return null;
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return null;
  const negative = s.startsWith("-");
  const [whole, frac = ""] = s.replace("-", "").split(".");
  const paise = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return negative ? -paise : paise;
}
