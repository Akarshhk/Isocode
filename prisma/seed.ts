/* Seeds realistic, synthetic data. Deterministic (fixed random seed) apart from dates, which are
 * relative to the day the seed runs so the client's sample rows read exactly as given on that day.
 * Run: npm run db:seed            (wipes and reseeds)
 *      tsx prisma/seed.ts --if-empty   (used on deploy: seeds only an empty database)
 * No real personal data: names are fictional, phone numbers are in the unused +91 90000 0xxxx range. */
import { PrismaClient, type Category, type Urgency, type Team, type EventType, type User } from "@prisma/client";
import { buildStatement, dueDateFor, monthlyBillPaise, type StatementBill, type StatementPayment } from "../src/lib/billing";
import { addDays, daysBetween, periodStart, todayIST } from "../src/lib/dates";
import { fingerprintOf } from "../src/lib/matching/parse";
import { flatCode } from "../src/lib/matching/refs";
import { SAMPLE_FLATS, SCENARIOS } from "../src/lib/matching/scenarios";
import { RESPONSE_MINUTES, TEAM_FOR_CATEGORY, CATEGORY_LABEL, URGENCY_LABEL } from "../src/lib/complaints/rules";

const prisma = new PrismaClient();

// ---------- deterministic randomness ----------
let state = 20261107;
function rand(): number {
  state |= 0;
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const int = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
const chance = (p: number) => rand() < p;

const RATE = 650; // paise per sq ft
const INTEREST_BPS = 2100; // 21% a year
const DUE_DAY = 10;
const PERIODS = ["2026-07", "2026-08", "2026-09", "2026-10"];

const FIRST = ["Aditya", "Ajay", "Amruta", "Anand", "Ashwini", "Bhagyashree", "Chetan", "Deepa", "Gauri", "Girish", "Hemant", "Isha", "Jayant", "Kavita", "Ketan", "Madhuri", "Manish", "Mrunal", "Nandini", "Omkar", "Pallavi", "Pooja", "Pranav", "Rahul", "Rajesh", "Ritu", "Sachin", "Sakshi", "Sameer", "Shilpa", "Shreyas", "Smita", "Sneha", "Sudhir", "Tanvi", "Tejas", "Uday", "Varsha", "Yash", "Zoya"];
const LAST = ["Apte", "Bapat", "Chavan", "Dandekar", "Dixit", "Gadgil", "Ghorpade", "Godbole", "Hegde", "Inamdar", "Jog", "Karandikar", "Khare", "Lele", "Limaye", "Mane", "Mehta", "Nadkarni", "Oak", "Paranjpe", "Phadke", "Pradhan", "Ranade", "Sathe", "Sawant", "Shah", "Thakur", "Vaidya", "Wagh", "Pinto", "Fernandes", "Qureshi", "Ansari", "Reddy", "Agarwal"];
const BANKS = ["okhdfcbank", "okicici", "oksbi", "okaxis", "ybl", "paytm"];
const AREAS = [650, 820, 980, 980, 980, 1150, 1150, 1150, 1380, 1640, 1890];

type FlatSeed = {
  code: string;
  tower: string;
  areaSqft: number;
  resident: string;
  phone: string;
  relation: "OWNER" | "TENANT";
  vpa: string | null;
  profile: "SAMPLE" | "SCENARIO" | "REGULAR" | "LATE" | "PARTIAL" | "DEFAULTER" | "OCT_UNPAID" | "RECENT_ONLINE";
};

async function wipe() {
  await prisma.$transaction([
    prisma.notification.deleteMany(),
    prisma.complaintEvent.deleteMany(),
    prisma.complaintPhoto.deleteMany(),
    prisma.complaint.updateMany({ data: { duplicateOfId: null } }),
  ]);
  await prisma.$transaction([
    prisma.complaint.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.bankLine.deleteMany(),
    prisma.bankImport.deleteMany(),
    prisma.bill.deleteMany(),
    prisma.upiHandle.deleteMany(),
    prisma.flatMember.deleteMany(),
    prisma.otpChallenge.deleteMany(),
    prisma.user.deleteMany(),
    prisma.flat.deleteMany(),
    prisma.tower.deleteMany(),
    prisma.billingConfig.deleteMany(),
  ]);
  // Restart receipt and complaint numbering.
  await prisma.$executeRawUnsafe(`ALTER SEQUENCE "Payment_id_seq" RESTART WITH 1`);
  await prisma.$executeRawUnsafe(`ALTER SEQUENCE "Complaint_number_seq" RESTART WITH 1001`);
}

function buildFlats(): FlatSeed[] {
  const flats: FlatSeed[] = [];
  const used = new Set<string>();
  const usedNames = new Set<string>();
  let phoneSeq = 1001;

  for (const s of SAMPLE_FLATS) {
    flats.push({ code: s.code, tower: s.code.slice(0, 3), areaSqft: s.areaSqft, resident: s.name, phone: s.phone, relation: s.relation, vpa: s.vpa, profile: "SAMPLE" });
    used.add(s.code);
    usedNames.add(s.name);
  }
  for (const s of SCENARIOS) {
    flats.push({ code: s.code, tower: s.code.slice(0, 3), areaSqft: s.areaSqft, resident: s.name, phone: `+9190000${String(phoneSeq++).padStart(5, "0")}`, relation: "OWNER", vpa: s.vpa, profile: "SCENARIO" });
    used.add(s.code);
    usedNames.add(s.name);
  }

  // At least 4 flats in every tower (12 in T12, for the lift incident), then extra flats at random.
  const towersToFill: number[] = [];
  for (let tower = 1; tower <= 28; tower++) {
    const tc = `T${String(tower).padStart(2, "0")}`;
    const wanted = tower === 12 ? 12 : 4;
    const have = flats.filter((f) => f.tower === tc).length;
    for (let i = have; i < wanted; i++) towersToFill.push(tower);
  }
  while (flats.length + towersToFill.length < 134) towersToFill.push(int(1, 28));

  for (const tower of towersToFill) {
    let code = "";
    do code = flatCode(tower, int(1, 18) * 100 + int(1, 4));
    while (used.has(code));
    used.add(code);
    let name = "";
    do name = `${pick(FIRST)} ${pick(LAST)}`;
    while (usedNames.has(name));
    usedNames.add(name);
    const r = rand();
    const profile: FlatSeed["profile"] =
      r < 0.58 ? "REGULAR" : r < 0.7 ? "OCT_UNPAID" : r < 0.8 ? "LATE" : r < 0.86 ? "RECENT_ONLINE" : r < 0.93 ? "PARTIAL" : "DEFAULTER";
    const [first, last] = name.toLowerCase().split(" ");
    flats.push({
      code,
      tower: code.slice(0, 3),
      areaSqft: pick(AREAS),
      resident: name,
      phone: `+9190000${String(phoneSeq++).padStart(5, "0")}`,
      relation: chance(0.18) ? "TENANT" : "OWNER",
      vpa: chance(0.65) ? `${first}.${last}${chance(0.3) ? int(1, 99) : ""}@${pick(BANKS)}` : null,
      profile,
    });
  }
  return flats;
}

let utrSeq = 430600000000;
const nextUtr = () => String(++utrSeq + int(1, 9) * 1000);
let gwSeq = 0;
const nextGatewayRef = () => `pay_TEST_${(++gwSeq).toString(36).padStart(4, "0")}${Math.floor(rand() * 1e8).toString(36)}`;

type PlannedPayment = StatementPayment & { flatCode: string; utr: string | null; gatewayRef: string | null };

function planPayments(f: FlatSeed, bills: StatementBill[], today: Date): PlannedPayment[] {
  const pays: PlannedPayment[] = [];
  const dueAt = (date: Date) => buildStatement(bills, pays, date).totalDuePaise;
  const add = (date: Date, amount: number, online: boolean) => {
    if (amount <= 0 || date >= today) return;
    pays.push({
      id: pays.length + 1,
      amountPaise: amount,
      paidOn: date,
      method: online ? "GATEWAY" : "BANK",
      flatCode: f.code,
      utr: online ? null : nextUtr(),
      gatewayRef: online ? nextGatewayRef() : null,
    });
  };
  const onTime = (b: StatementBill) => {
    const d = addDays(b.issuedOn, int(1, DUE_DAY - 1));
    add(d, dueAt(d), chance(0.45));
  };

  for (const b of bills) {
    const isOct = b.period === "2026-10";
    switch (f.profile) {
      case "SAMPLE":
        if (f.code === "T07-1203") add(addDays(b.issuedOn, int(2, 6)), b.amountPaise, true);
        if (f.code === "T12-0408" && (b.period === "2026-07" || b.period === "2026-08")) onTime(b);
        if (f.code === "T21-1601") {
          if (isOct) add(addDays(b.issuedOn, 7), 500000, false);
          else onTime(b);
        }
        break;
      case "SCENARIO":
        if (!isOct) onTime(b);
        break;
      case "REGULAR":
        if (chance(0.88)) onTime(b);
        else {
          const d = addDays(b.dueOn, int(4, 25));
          add(d, dueAt(d), chance(0.5));
        }
        break;
      case "OCT_UNPAID":
        if (!isOct) onTime(b);
        break;
      case "RECENT_ONLINE":
        if (!isOct) onTime(b);
        else {
          const d = addDays(today, -int(1, 3));
          add(d, dueAt(d), true);
        }
        break;
      case "LATE": {
        const d = addDays(b.dueOn, int(6, 32));
        add(d, dueAt(d), chance(0.4));
        break;
      }
      case "PARTIAL": {
        const d = addDays(b.dueOn, int(-4, 12));
        const due = dueAt(d);
        add(d, Math.max(100000, Math.round((due * 0.5) / 100000) * 100000), false);
        break;
      }
      case "DEFAULTER":
        if (b.period === "2026-07" && chance(0.5)) onTime(b);
        break;
    }
  }
  return pays;
}

const COMPLAINT_TEXTS: { cat: Category; urg: Urgency; scope: "FLAT" | "COMMON"; text: string }[] = [
  { cat: "PLUMBING", urg: "MEDIUM", scope: "FLAT", text: "Kitchen tap is leaking continuously, the washer looks worn out." },
  { cat: "PLUMBING", urg: "MEDIUM", scope: "FLAT", text: "Bathroom flush not working since morning." },
  { cat: "PLUMBING", urg: "MEDIUM", scope: "FLAT", text: "Wash basin drain is choked, water is not going down." },
  { cat: "PLUMBING", urg: "LOW", scope: "FLAT", text: "Geyser takes very long to heat water, please check." },
  { cat: "PLUMBING", urg: "MEDIUM", scope: "FLAT", text: "Bathroom mein paani leak ho raha hai, jaldi plumber bhejiye." },
  { cat: "PLUMBING", urg: "MEDIUM", scope: "FLAT", text: "किचन मध्ये सिंकच्या खाली पाणी गळत आहे." },
  { cat: "PLUMBING", urg: "HIGH", scope: "COMMON", text: "No water supply in the whole tower since 6 am." },
  { cat: "ELECTRICAL", urg: "MEDIUM", scope: "FLAT", text: "MCB keeps tripping in the bedroom whenever the AC is switched on." },
  { cat: "ELECTRICAL", urg: "LOW", scope: "FLAT", text: "Two switches on the hall switch board are loose." },
  { cat: "ELECTRICAL", urg: "MEDIUM", scope: "COMMON", text: "Corridor lights on our floor have been off for three days." },
  { cat: "ELECTRICAL", urg: "MEDIUM", scope: "COMMON", text: "Street light near the podium garden is not working." },
  { cat: "LIFT", urg: "HIGH", scope: "COMMON", text: "Lift B is not working, elderly residents are struggling with the stairs." },
  { cat: "LIFT", urg: "MEDIUM", scope: "COMMON", text: "Lift makes a grinding noise between the 4th and 5th floor." },
  { cat: "SECURITY", urg: "HIGH", scope: "COMMON", text: "Unknown people roaming in the basement parking late at night." },
  { cat: "SECURITY", urg: "MEDIUM", scope: "COMMON", text: "Gate 2 guard let a delivery person in without calling us." },
  { cat: "HOUSEKEEPING", urg: "LOW", scope: "COMMON", text: "Garbage was not collected from our floor today." },
  { cat: "HOUSEKEEPING", urg: "LOW", scope: "COMMON", text: "The staircase on the 5th floor is very dirty." },
  { cat: "CIVIL", urg: "MEDIUM", scope: "FLAT", text: "Seepage on the bedroom wall after the rain, paint is peeling." },
  { cat: "CIVIL", urg: "MEDIUM", scope: "FLAT", text: "Cracks appearing in the balcony plaster." },
  { cat: "PEST_CONTROL", urg: "LOW", scope: "FLAT", text: "Cockroaches in the kitchen, we need pest control." },
  { cat: "PEST_CONTROL", urg: "MEDIUM", scope: "COMMON", text: "Rats seen near the garbage room in the basement." },
  { cat: "PARKING", urg: "LOW", scope: "COMMON", text: "Someone has parked in my allotted slot again." },
  { cat: "OTHER", urg: "LOW", scope: "FLAT", text: "Intercom handset in our flat is not working." },
];

async function main() {
  const ifEmpty = process.argv.includes("--if-empty");
  if (ifEmpty && (await prisma.flat.count()) > 0) {
    console.log("Database already has data; skipping seed.");
    return;
  }
  const today = todayIST();
  const now = new Date();
  console.log(`Seeding as of ${today.toISOString().slice(0, 10)}...`);
  await wipe();

  await prisma.billingConfig.create({
    data: { ratePaisePerSqft: RATE, interestBpsPerYear: INTEREST_BPS, dueDay: DUE_DAY, effectiveFrom: new Date("2026-04-01") },
  });

  // ---------- staff and committee ----------
  const staffDefs: { phone: string; name: string; team: Team; duty?: boolean }[] = [
    { phone: "+919000000100", name: "Rekha Pawar", team: "HELPDESK" },
    { phone: "+919000000101", name: "Sunil Jadhav", team: "PLUMBING" },
    { phone: "+919000000102", name: "Imran Sayyed", team: "PLUMBING" },
    { phone: "+919000000103", name: "Prakash More", team: "ELECTRICAL" },
    { phone: "+919000000104", name: "Vinod Gaikwad", team: "ELECTRICAL" },
    { phone: "+919000000105", name: "Ganesh Shinde", team: "LIFT" },
    { phone: "+919000000106", name: "Sangeeta Kamble", team: "HOUSEKEEPING" },
    { phone: "+919000000107", name: "Mahesh Bhosale", team: "SECURITY" },
    { phone: "+919000000108", name: "Dattatray Kale", team: "CIVIL" },
    { phone: "+919000000109", name: "Anil Deshmukh", team: "HELPDESK", duty: true },
  ];
  const staff: User[] = [];
  for (const s of staffDefs) {
    staff.push(await prisma.user.create({ data: { phone: s.phone, name: s.name, role: "STAFF", team: s.team, isDutyManager: !!s.duty } }));
  }
  await prisma.user.create({ data: { phone: "+919000000200", name: "Vaishali Apte", role: "COMMITTEE" } });
  const helpdesk = staff[0];
  const dutyManager = staff.find((s) => s.isDutyManager)!;
  const byTeam = (team: Team) => staff.filter((s) => s.team === team);

  // ---------- towers, flats, residents ----------
  const flatSeeds = buildFlats();
  const towerIds = new Map<string, string>();
  for (let i = 1; i <= 28; i++) {
    const code = `T${String(i).padStart(2, "0")}`;
    towerIds.set(code, (await prisma.tower.create({ data: { code } })).id);
  }
  const flatIds = new Map<string, string>();
  const residentIds = new Map<string, string>();
  for (const f of flatSeeds) {
    const flat = await prisma.flat.create({ data: { code: f.code, towerId: towerIds.get(f.tower)!, areaSqft: f.areaSqft } });
    flatIds.set(f.code, flat.id);
    const user = await prisma.user.create({
      data: { phone: f.phone, name: f.resident, role: "RESIDENT", membership: { create: { flatId: flat.id, relation: f.relation } } },
    });
    residentIds.set(f.code, user.id);
    if (f.vpa) await prisma.upiHandle.create({ data: { vpa: f.vpa.toLowerCase(), flatId: flat.id } });
  }

  // ---------- bills and payments ----------
  const allPayments: PlannedPayment[] = [];
  const billRows: { flatId: string; period: string; amountPaise: number; areaSqft: number; ratePaisePerSqft: number; interestBpsPerYear: number; issuedOn: Date; dueOn: Date }[] = [];
  for (const f of flatSeeds) {
    const bills: StatementBill[] = PERIODS.map((p) => ({
      id: `${f.code}-${p}`,
      period: p,
      amountPaise: monthlyBillPaise(f.areaSqft, RATE),
      issuedOn: periodStart(p),
      dueOn: dueDateFor(p, DUE_DAY),
      interestBpsPerYear: INTEREST_BPS,
    }));
    // Assumption A-data: the sample's 47 and 18 days overdue can't both come from one due day,
    // so those two bills' due dates are set relative to the seed date.
    if (f.code === "T12-0408") {
      const sep = bills.find((b) => b.period === "2026-09")!;
      const d = addDays(today, -47);
      if (d > sep.issuedOn) sep.dueOn = d;
    }
    if (f.code === "T21-1601") {
      const oct = bills.find((b) => b.period === "2026-10")!;
      const d = addDays(today, -18);
      if (d > oct.issuedOn) oct.dueOn = d;
    }
    for (const b of bills) {
      billRows.push({ flatId: flatIds.get(f.code)!, period: b.period, amountPaise: b.amountPaise, areaSqft: f.areaSqft, ratePaisePerSqft: RATE, interestBpsPerYear: INTEREST_BPS, issuedOn: b.issuedOn, dueOn: b.dueOn });
    }
    allPayments.push(...planPayments(f, bills, today));
  }
  await prisma.bill.createMany({ data: billRows });

  allPayments.sort((a, b) => a.paidOn.getTime() - b.paidOn.getTime() || a.flatCode.localeCompare(b.flatCode));
  const flatByCode = new Map(flatSeeds.map((f) => [f.code, f]));

  // October bank statement, imported earlier: bank payments are linked to its lines.
  const octImport = await prisma.bankImport.create({
    data: { filename: "federation-account-oct-2026.csv", uploadedById: helpdesk.id, rowCount: 0, createdAt: new Date("2026-11-02T05:30:00Z") },
  });
  let row = 0;
  for (const p of allPayments) {
    const f = flatByCode.get(p.flatCode)!;
    let bankLineId: string | null = null;
    if (p.method === "BANK" && p.paidOn >= new Date("2026-10-01") && p.paidOn <= new Date("2026-10-31")) {
      const narration = f.vpa
        ? `UPI/CR/${p.utr}/${f.resident.toUpperCase()}/${f.vpa}/MAINTENANCE`
        : `NEFT CR-HDFC0001234-${f.resident.toUpperCase()}-${f.code} MAINT OCT`;
      const line = await prisma.bankLine.create({
        data: {
          importId: octImport.id,
          rowNumber: ++row,
          txnDate: p.paidOn,
          narration,
          reference: p.utr,
          amountPaise: p.amountPaise,
          fingerprint: fingerprintOf(p.paidOn, p.amountPaise, p.utr, narration),
          status: "AUTO_POSTED",
          flatId: flatIds.get(f.code)!,
          reasons: [f.vpa ? `UPI ID ${f.vpa} is registered to ${f.code}.` : `Reference names ${f.code}.`],
          candidates: [],
        },
      });
      bankLineId = line.id;
    }
    await prisma.payment.create({
      data: {
        flatId: flatIds.get(p.flatCode)!,
        amountPaise: p.amountPaise,
        method: p.method,
        paidOn: p.paidOn,
        utr: p.utr,
        gatewayRef: p.gatewayRef,
        bankLineId,
        createdAt: addDays(p.paidOn, 0),
      },
    });
  }
  // Two unclear credits from October still waiting in the accounts queue.
  const queued = [
    { date: new Date("2026-10-07"), narration: "NEFT CR-SBIN0004567-MR A K-MAINTENANCE", ref: "SBIN426100071234", amount: 747500, reasons: ["₹7,475 matches several flats. Many flats share a layout and a bill, so the amount alone can't identify the payer."] },
    { date: new Date("2026-10-12"), narration: "UPI/CR/428512349876/SURESH P/suresh.p77@ybl/society", ref: "428512349876", amount: 900000, reasons: ["UPI ID suresh.p77@ybl isn't registered to any flat.", "No UPI ID, flat reference, resident name or amount matches a flat."] },
  ];
  const sevenFour = flatSeeds.filter((f) => f.areaSqft === 1150).slice(0, 4).map((f) => ({ flatCode: f.code, why: "Amount equals this flat's monthly bill" }));
  for (const q of queued) {
    await prisma.bankLine.create({
      data: {
        importId: octImport.id,
        rowNumber: ++row,
        txnDate: q.date,
        narration: q.narration,
        reference: q.ref,
        amountPaise: q.amount,
        fingerprint: fingerprintOf(q.date, q.amount, q.ref, q.narration),
        status: "QUEUED",
        reasons: q.reasons,
        candidates: q.amount === 747500 ? sevenFour : [],
      },
    });
  }
  await prisma.bankImport.update({ where: { id: octImport.id }, data: { rowCount: row } });

  // ---------- complaints ----------
  type Ev = { type: EventType; message: string; at: Date; actorId: string | null; data?: object };
  const created: { id: string; towerCode: string }[] = [];
  const nonSampleFlats = flatSeeds.filter((f) => f.profile !== "SAMPLE");

  async function makeComplaint(opts: {
    flat: FlatSeed;
    cat: Category;
    urg: Urgency;
    scope: "FLAT" | "COMMON";
    text: string;
    at: Date;
    state: "ASSIGNED" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
    reopened?: boolean;
    rating?: number;
    safety?: string | null;
    needsReview?: boolean;
    confidence?: number;
    duplicateOfId?: string | null;
    assigneeId?: string;
    lateResponse?: boolean;
  }) {
    const team = TEAM_FOR_CATEGORY[opts.cat];
    const assigneeId = opts.assigneeId ?? pick(byTeam(team).length ? byTeam(team) : [helpdesk]).id;
    const assignee = staff.find((s) => s.id === assigneeId)!;
    const target = RESPONSE_MINUTES[opts.urg];
    const responseDueAt = new Date(opts.at.getTime() + target * 60_000);
    const respondMins = opts.lateResponse ? Math.round(target * (1.3 + rand())) : Math.round(target * (0.1 + rand() * 0.7));
    const resolveHours = opts.urg === "CRITICAL" ? int(1, 4) : opts.urg === "HIGH" ? int(3, 20) : int(8, 60);
    // Never invent timestamps in the future: step the state back if a time hasn't happened yet.
    let st = opts.state;
    let firstResponseAt: Date | null = st !== "ASSIGNED" ? new Date(opts.at.getTime() + respondMins * 60_000) : null;
    if (firstResponseAt && firstResponseAt > now) {
      firstResponseAt = st === "IN_PROGRESS" ? new Date(Math.min(now.getTime() - 60_000, opts.at.getTime() + 20 * 60_000)) : null;
      if (!firstResponseAt || firstResponseAt < opts.at) {
        firstResponseAt = null;
        st = "ASSIGNED";
      }
    }
    let resolvedAt: Date | null = st === "RESOLVED" || st === "CLOSED" ? new Date(opts.at.getTime() + resolveHours * 3_600_000) : null;
    if (resolvedAt && (resolvedAt > now || !firstResponseAt)) {
      resolvedAt = null;
      st = firstResponseAt ? "IN_PROGRESS" : "ASSIGNED";
    }
    let closedAt: Date | null = st === "CLOSED" && resolvedAt ? new Date(resolvedAt.getTime() + int(2, 30) * 3_600_000) : null;
    if (closedAt && closedAt > now) {
      closedAt = null;
      st = "RESOLVED";
    }
    const reopened = !!opts.reopened && st === "CLOSED";
    const residentId = residentIds.get(opts.flat.code)!;
    const conf = opts.confidence ?? Math.round((0.72 + rand() * 0.26) * 100) / 100;

    const c = await prisma.complaint.create({
      data: {
        flatId: flatIds.get(opts.flat.code)!,
        towerId: towerIds.get(opts.flat.tower)!,
        raisedById: residentId,
        description: opts.text,
        category: opts.cat,
        urgency: opts.urg,
        scope: opts.scope,
        aiCategory: opts.cat,
        aiUrgency: opts.safety ? (opts.urg === "CRITICAL" ? "HIGH" : opts.urg) : opts.urg,
        aiConfidence: conf,
        aiReason: opts.needsReview ? "The description is vague; it could be plumbing or civil." : `Mentions ${CATEGORY_LABEL[opts.cat].toLowerCase()} issue.`,
        classifiedBy: "AI",
        needsReview: !!opts.needsReview,
        safetyKeyword: opts.safety ?? null,
        status: st,
        assigneeId,
        duplicateOfId: opts.duplicateOfId ?? null,
        responseDueAt,
        firstResponseAt,
        resolvedAt,
        closedAt,
        rating: st === "CLOSED" ? (opts.rating ?? int(3, 5)) : null,
        reopenCount: reopened ? 1 : 0,
        createdAt: opts.at,
      },
    });
    const evs: Ev[] = [
      { type: "CREATED", message: "Complaint raised", at: opts.at, actorId: residentId },
      { type: "CLASSIFIED", message: `AI: ${CATEGORY_LABEL[opts.cat]} · ${URGENCY_LABEL[opts.urg]} · ${Math.round(conf * 100)}% sure`, at: opts.at, actorId: null },
    ];
    if (opts.safety) {
      evs.push({ type: "SAFETY_ESCALATED", message: `Safety word "${opts.safety}": set to Critical and escalated to ${dutyManager.name} (duty manager)`, at: opts.at, actorId: null });
    }
    if (opts.duplicateOfId) {
      evs.push({ type: "LINKED", message: "Linked to an earlier report of the same issue in this tower", at: opts.at, actorId: null });
    }
    evs.push({ type: "ASSIGNED", message: `Auto-assigned to ${assignee.name} (${assignee.team?.toLowerCase()})`, at: opts.at, actorId: null });
    if (firstResponseAt) evs.push({ type: "STATUS_CHANGED", message: "Work started", at: firstResponseAt, actorId: assigneeId, data: { to: "IN_PROGRESS" } });
    if (reopened && resolvedAt) {
      const firstFix = new Date(opts.at.getTime() + (resolveHours / 2) * 3_600_000);
      evs.push({ type: "STATUS_CHANGED", message: "Marked resolved", at: firstFix, actorId: assigneeId, data: { to: "RESOLVED" } });
      evs.push({ type: "REOPENED", message: "Reopened by resident: still not fixed", at: new Date(firstFix.getTime() + 3 * 3_600_000), actorId: residentId });
    }
    if (resolvedAt) evs.push({ type: "STATUS_CHANGED", message: "Marked resolved", at: resolvedAt, actorId: assigneeId, data: { to: "RESOLVED" } });
    if (closedAt) evs.push({ type: "RATED", message: `Closed by resident, rated ${c.rating}/5`, at: closedAt, actorId: residentId });
    await prisma.complaintEvent.createMany({ data: evs.map((e) => ({ ...e, complaintId: c.id, data: e.data ?? undefined })) });
    created.push({ id: c.id, towerCode: opts.flat.tower });
    return c;
  }

  // History: Aug 1 to 3 days ago. Reopen rate ~24% (the client's baseline is 25%).
  const start = new Date("2026-08-01T04:00:00Z");
  const spanDays = daysBetween(new Date("2026-08-01"), today) - 3;
  for (let i = 0; i < 120; i++) {
    const t = pick(COMPLAINT_TEXTS);
    const at = new Date(start.getTime() + int(0, spanDays * 24) * 3_600_000 + int(0, 59) * 60_000);
    const ageDays = (now.getTime() - at.getTime()) / 86_400_000;
    const state = ageDays > 6 ? "CLOSED" : pick(["RESOLVED", "CLOSED", "IN_PROGRESS"] as const);
    await makeComplaint({
      flat: pick(nonSampleFlats),
      ...t,
      at,
      state,
      reopened: state === "CLOSED" && chance(0.24),
      rating: chance(0.15) ? int(1, 2) : int(3, 5),
      lateResponse: chance(0.18),
    });
  }
  // A past safety escalation: gas smell, resolved fast.
  await makeComplaint({
    flat: flatSeeds.find((f) => f.code === "T03-0502")!,
    cat: "SECURITY",
    urg: "CRITICAL",
    scope: "COMMON",
    text: "Strong smell of gas near the meter room in the T03 basement.",
    at: new Date("2026-10-18T14:20:00Z"),
    state: "CLOSED",
    rating: 5,
    safety: "gas",
    assigneeId: dutyManager.id,
  });

  // Open work right now.
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);
  await makeComplaint({
    flat: flatSeeds.find((f) => f.code === "T12-0408")!,
    cat: "PLUMBING",
    urg: "MEDIUM",
    scope: "FLAT",
    text: "Water leaking from the bathroom ceiling, it seems to come from the flat above. The wall is getting damp.",
    at: hoursAgo(46),
    state: "IN_PROGRESS",
    assigneeId: byTeam("PLUMBING")[0].id,
  });
  for (let i = 0; i < 9; i++) {
    const t = pick(COMPLAINT_TEXTS.filter((x) => x.urg !== "LOW"));
    await makeComplaint({ flat: pick(nonSampleFlats), ...t, at: hoursAgo(int(1, 60)), state: pick(["ASSIGNED", "IN_PROGRESS", "ASSIGNED"] as const), lateResponse: chance(0.3) });
  }
  await makeComplaint({
    flat: pick(nonSampleFlats),
    cat: "OTHER",
    urg: "MEDIUM",
    scope: "FLAT",
    text: "Problem in the flat again, please send someone today.",
    at: hoursAgo(3),
    state: "ASSIGNED",
    needsReview: true,
    confidence: 0.41,
    assigneeId: helpdesk.id,
  });

  // The T12 lift incident: ten flats report the same stuck lift within two hours.
  const t12 = flatSeeds.filter((f) => f.tower === "T12" && f.code !== "T12-0408");
  const liftTexts = [
    "Lift stuck between 7th and 8th floor, people are inside!",
    "T12 lift not working at all.",
    "Lift is stuck, someone is trapped, please send help.",
    "Lift band ho gaya hai, koi andar atka hai.",
    "Both lifts in T12 stopped. Is someone stuck?",
    "Lift not coming to any floor since 20 minutes.",
    "Elevator alarm is ringing in our tower.",
    "Lift jammed on the 7th floor.",
    "Lift not working, my father can't climb stairs.",
    "लिफ्ट अडकली आहे, लोक आत आहेत.",
  ];
  const liftTech = byTeam("LIFT")[0];
  const root = await makeComplaint({
    flat: t12[0],
    cat: "LIFT",
    urg: "CRITICAL",
    scope: "COMMON",
    text: liftTexts[0],
    at: hoursAgo(2.2),
    state: "IN_PROGRESS",
    safety: "lift stuck",
    assigneeId: liftTech.id,
  });
  for (let i = 1; i < liftTexts.length && i < t12.length; i++) {
    const text = liftTexts[i];
    const safety = /stuck|trapped|atka|अडकली|jammed/i.test(text) ? "lift stuck" : null;
    await makeComplaint({
      flat: t12[i],
      cat: "LIFT",
      urg: safety ? "CRITICAL" : "HIGH",
      scope: "COMMON",
      text,
      at: hoursAgo(2.1 - i * 0.18),
      state: "ASSIGNED",
      safety,
      duplicateOfId: root.id,
      assigneeId: liftTech.id,
    });
  }

  await prisma.notification.createMany({
    data: [
      { userId: dutyManager.id, channel: "SMS", body: `CRITICAL #${root.number}: lift stuck reported in T12. Escalated by safety rule.`, at: hoursAgo(2.2) },
      { userId: liftTech.id, channel: "WHATSAPP", body: `New job #${root.number}: lift stuck, T12. Response due in 15 minutes.`, at: hoursAgo(2.2) },
    ],
  });

  const counts = {
    flats: await prisma.flat.count(),
    bills: await prisma.bill.count(),
    payments: await prisma.payment.count(),
    complaints: await prisma.complaint.count(),
    queued: await prisma.bankLine.count({ where: { status: "QUEUED" } }),
  };
  console.log("Seeded:", counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
