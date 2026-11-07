// Flats the seed creates on purpose so the sample bank statement exercises every matching rule.
// Shared by prisma/seed.ts and the "Download sample statement" generator.

export type Scenario = {
  code: string;
  name: string;
  areaSqft: number;
  vpa: string | null; // registered UPI ID
  /** What the sample statement row for this flat demonstrates. */
  demo:
    | "UPI_FULL"
    | "NEFT_CODE"
    | "SPACED_CODE_PART"
    | "UNREGISTERED_UPI_WITH_CODE"
    | "COMPACT_CODE"
    | "CHEQUE"
    | "CONFLICT_UPI"
    | "CONFLICT_OTHER"
    | "NAME_ONLY"
    | "UNUSUAL_AMOUNT"
    | "ADVANCE";
};

export const SCENARIOS: Scenario[] = [
  { code: "T03-0502", name: "Rohan Deshpande", areaSqft: 1150, vpa: "rohan.deshpande@okaxis", demo: "UPI_FULL" },
  { code: "T05-0302", name: "Meera Iyer", areaSqft: 980, vpa: null, demo: "NEFT_CODE" },
  { code: "T07-0904", name: "Kunal Patil", areaSqft: 1380, vpa: null, demo: "SPACED_CODE_PART" },
  { code: "T09-0702", name: "Priya Nair", areaSqft: 820, vpa: null, demo: "UNREGISTERED_UPI_WITH_CODE" },
  { code: "T11-1104", name: "Sanjay Kulkarni", areaSqft: 1150, vpa: null, demo: "COMPACT_CODE" },
  { code: "T14-0201", name: "Anita Rao", areaSqft: 1640, vpa: null, demo: "CHEQUE" },
  { code: "T16-0603", name: "Vikram Joshi", areaSqft: 980, vpa: "vikram.joshi@okicici", demo: "CONFLICT_UPI" },
  { code: "T16-0306", name: "Leena Kapoor", areaSqft: 980, vpa: null, demo: "CONFLICT_OTHER" },
  { code: "T18-1002", name: "Nikhil Gokhale", areaSqft: 1150, vpa: null, demo: "NAME_ONLY" },
  { code: "T20-1501", name: "Harish Menon", areaSqft: 1380, vpa: null, demo: "UNUSUAL_AMOUNT" },
  { code: "T22-0802", name: "Farah Siddiqui", areaSqft: 1150, vpa: "farah.s@okhdfcbank", demo: "ADVANCE" },
];

/** The three rows from the client's sample data, seeded exactly. */
export const SAMPLE_FLATS = [
  { code: "T07-1203", name: "Neeraj Kulkarni", areaSqft: 1150, relation: "OWNER" as const, phone: "+919000000001", vpa: "neeraj.kulkarni@okhdfcbank" },
  { code: "T12-0408", name: "Swati Joshi", areaSqft: 980, relation: "TENANT" as const, phone: "+919000000002", vpa: "swati.joshi@oksbi" },
  { code: "T21-1601", name: "Aamir Shaikh", areaSqft: 1640, relation: "OWNER" as const, phone: "+919000000003", vpa: "aamir.shaikh@okicici" },
];
