# One-day build plan: Township resident app (Brief #1)

**Goal:** ship the CORE BUILD slice end to end, deployed, with a TDD and a deployment.md, in one day.
**Who does what:** Claude builds, tests, writes docs and commits. You spend about 1 to 1.5 hours in total: accounts and keys, two quick check-ins, reading the TDD and submitting.

---

## 1. What we ship (core slice only)

| # | Screen | Role | What it proves |
|---|---|---|---|
| 1 | Login: phone + OTP (mock, demo OTP shown on screen) | all | Sign-in, OTP tied to a flat, roles |
| 2 | Resident home: dues, open complaints, quick actions | resident | "Everything within two taps", phone-first |
| 3 | Dues and ledger: bills, interest, payments, receipts | resident | Billing by area × rate, late fee, ledger per flat |
| 4 | Test checkout, then receipt | resident | Online payment (mock gateway, test mode) |
| 5 | Complaints: list, raise (text and photo), detail with timeline and rating | resident | AI category and urgency, status, rating on closure |
| 6 | Help-desk queue and complaint detail | staff | Auto-assignment, change category in one tap, status, response timer, linked duplicates |
| 7 | Bank reconciliation: upload CSV, see results, work the accounts queue | staff | **Hard part:** payments match themselves, unclear rows never posted |
| 8 | Committee dashboard | committee (read-only) | Collections, dues ageing, complaint times, matching stats |

**Roles:** `RESIDENT` (owner or tenant), `STAFF` (help desk and accounts), `COMMITTEE` (read-only). The committee role is our addition and is labelled as an assumption.

**Cut (named in the TDD under "What I cut and what's next"):** gate visitors and guest codes, amenity booking, notices, managing family and tenant members (we seed only a tenant flag), Marathi and Hindi UI, real SMS, OTP or payment gateway, Tally export, offline mode, push notifications.
**No dead buttons:** cut features don't appear in the UI at all.

---

## 2. Stack (picked for speed *and* defensibility)

| Layer | Choice | Why |
|---|---|---|
| App | Next.js 15 (App Router) + TypeScript | One codebase for UI and API, server actions, deploys to Vercel in minutes |
| DB | Postgres + Prisma 6 | Relational ledger, transactions, unique constraints for idempotent imports |
| Local DB | Docker Postgres (`docker-compose.yml`) | Reviewer runs it with one command |
| Hosted DB | Neon (free tier) | Postgres without servers, integrates with Vercel |
| Auth | Mock OTP + signed session JWT in an httpOnly cookie (`jose`) | Real auth mechanics, mock delivery only |
| Validation | `zod` on every server action and route | "Validated inputs" requirement |
| AI | Anthropic API, Claude Haiku, forced tool call that returns typed JSON | Fast, cheap, structured; the commercial API doesn't train on inputs |
| CSV | `papaparse` | Handles quoted bank narrations |
| UI | Tailwind 4 with our own tokens, `lucide-react` icons, no heavy kit | Looks designed rather than default; restrained palette |
| Tests | Vitest | Matcher, billing, interest, safety rule, access control |
| Hosting | Vercel | Free, preview URL for the TDD |

Money is stored as **integer paise** everywhere, never floats. Worth saying in the interview.

---

## 3. Data model (Prisma)

```
Tower(code "T07")
Flat(code "T07-1203", tower, areaSqft)
User(phone unique, name, role, staffTeam?, isDutyManager)
FlatMember(user, flat, relation OWNER | TENANT)
UpiHandle(vpa unique, flat)                         -- registered payer UPI IDs
BillingConfig(ratePaisePerSqft=650, interestPctPa=21, dueDay=10, effectiveFrom)
Bill(flat, period "2026-10", amountPaise, dueDate)   -- unique(flat, period)
LedgerEntry(flat, type BILL|INTEREST|PAYMENT|ADJUSTMENT, amountPaise, date, billId?, paymentId?)
Payment(flat, amountPaise, method GATEWAY|BANK, gatewayRef?, utr?, receiptNo, paidAt, bankLineId?)
BankImport(filename, uploadedBy, rows, createdAt)
BankLine(import, date, narration, utr, amountPaise, fingerprint unique,
         status AUTO_POSTED|ALREADY_POSTED|QUEUED|RESOLVED|IGNORED|DUPLICATE,
         matchedFlat?, reasons json, candidates json)
Complaint(flat, raisedBy, description, photo?, category, urgency,
          aiCategory, aiUrgency, aiConfidence, source AI|FALLBACK|SAFETY_RULE,
          safetyKeyword?, status, assignee?, duplicateOf?, slaDueAt,
          firstResponseAt?, resolvedAt?, closedAt?, rating?, reopenCount)
ComplaintEvent(complaint, actor, type, data json, at)   -- timeline + audit trail
OtpChallenge(phone, codeHash, expiresAt, attempts, consumedAt)
Notification(user?, channel SMS|WHATSAPP, body, at)     -- mock outbox, visible in UI
```

---

## 4. The logic that matters

### 4a. Billing and late fee
- Monthly bill = area × ₹6.50, rounded to the rupee. All three sample rows match exactly: 1150 → ₹7,475, 980 → ₹6,370, 1640 → ₹10,660.
- Interest on arrears: **21% a year, simple**, on overdue principal from the day after the due date. It's configurable. *Assumption: we take 21% as the cap in the Maharashtra model bye-laws; the committee should confirm.*
  - Swati: ₹6,370 × 21% × 47/365 = **₹172**
  - Aamir: ₹5,660 × 21% × 18/365 = **₹59**
- Payments are applied to interest first, then to the oldest bill (FIFO). *Assumption.*
- Staff can run "Generate bills for month": idempotent, because a flat can have only one bill per period.

### 4b. Bank statement matching (the hard part)
Each credit row in the CSV goes through a **decision table**, not a magic score, so it's easy to test and to explain:

| Order | Check | Result |
|---|---|---|
| 0 | Row fingerprint (date + amount + UTR + narration) already imported | `DUPLICATE`, skipped. Re-uploading a file posts nothing twice |
| 1 | Debit row, or zero amount | `IGNORED` |
| 2 | UTR or gateway ref equals a payment already posted through the test gateway | `ALREADY_POSTED`. **No double posting** of money that reached us through the gateway |
| 3 | Registered UPI ID found in narration → flat A, and no conflicting flat code | `AUTO_POSTED` to A |
| 4 | Flat code parsed from narration (`T07-1203`, `T7 1203`, `T071203`, `TWR 7 FLAT 1203`) → existing flat A, and no conflicting UPI ID | `AUTO_POSTED` to A |
| 5 | UPI ID says A, reference says B | `QUEUED` (conflict) |
| 6 | Only amount or payer name matches | `QUEUED` with ranked suggestions. **Amount alone never posts**: every 980 sq ft flat bills ₹6,370 |
| 7 | Amount is more than outstanding + 3 months' bills | `QUEUED` (unusual amount) |

- Partial payments with a clear flat still post: Aamir's ₹5,000 leaves ₹5,660 due.
- Overpayments with a clear flat become an advance credit.
- Accounts queue actions: assign to a flat (writes the posting and an audit event), or mark as "not maintenance".
- All of this runs in **one DB transaction per import**.
- The sample CSV (`samples/bank-statement-2026-11.csv`, about 30 rows) includes **every case above**, and the screen has a "Download sample statement" link so reviewers can try it.

### 4c. Complaint AI, plus rules that win when the AI is wrong
1. **The safety rule runs first and can't be overridden.**
   - Keywords: fire, smoke, gas, gas leak, lift stuck, trapped, shock, sparking, current, plus Hindi and Marathi variants (आग, गैस, करंट, लिफ्ट अडकली).
   - On a match: urgency = Critical, escalate to the duty manager (mock SMS in the outbox), and the timer starts at 15 minutes.
   - The AI can never lower this.
2. **AI classification.** Claude Haiku returns `{category, urgency, confidence, reason}` through a forced tool call, validated with zod, with an 8-second timeout.
3. **Fallback.** If there's no API key, the call errors or times out, the output is invalid, or confidence is below 0.6, a keyword classifier takes over. The ticket is marked **"Unsure, please check"** in the help-desk queue.
4. **Help desk changes the category in one tap.** We log both the AI value and the final value. The dashboard shows an **"AI override rate"** so the client can see how often it's wrong.
5. **Duplicates.** Same tower, same category, an open complaint within 24 hours, and text similarity ≥ 0.5 → **linked** to the first report ("lift in T12: 9 linked reports").
   - Never closed automatically. Help desk can unlink, and can resolve linked tickets together on purpose.
6. **Auto-assignment.** The category maps to a team; within the team, the person with the fewest open tickets gets it.
   - Response targets (*assumption*): Critical 15 min, High 2 h, Medium 8 h, Low 24 h.
7. **Lifecycle.**
   - Statuses: New → Assigned → In progress → Resolved → Closed by the resident with a 1–5 rating, or Reopened within 7 days.
   - Reopens are counted, because the client's success metric is reopened complaints going from 25% to under 8%.

### 4d. Committee dashboard (read-only)
- Billed vs collected this month, and on-time payment % (target: 70% → 90%)
- Dues ageing: 0–30, 31–60, 61–90, 90+ days, with flat counts and amounts
- Complaints: open by category, average first response, average resolution, reopen rate (target < 8%), AI override rate
- Matching: auto-posted %, rows in the queue, and the median time to clear the queue

---

## 5. Seed data (realistic, synthetic, reproducible)
- **The 3 sample flats exactly as given:**
  - Neeraj (paid)
  - Swati (tenant, ₹6,370 unpaid, 47 days overdue, open "water leak" complaint)
  - Aamir (paid ₹5,000 of ₹10,660, 18 days overdue)
- About 120 synthetic flats across all 28 towers, with Aug–Oct 2026 history:
  - About 70% paid on time, to match the client's baseline today
  - A tail of defaulters at 60 and 90+ days
  - About 150 complaints, including a 9-report "lift stuck in T12" duplicate cluster and some reopens
- Staff:
  - A help-desk lead
  - Plumbing, electrical, lift and housekeeping teams
  - A duty manager
- One committee member.
- **Data note for the TDD (a good catch to mention):** the sample's 47 and 18 days overdue are 29 days apart, so they can't both come from one monthly due date. The seed back-dates those two bills so the sample shows exactly on the day of the seed. All other bills use the 10th.
- Fake phone numbers only (`+91 90000 000xx`), and a fixed random seed so every run gives the same data.

---

## 6. Security checklist
- [ ] Every server action and route checks role **and ownership** (a resident can only read their own flat). Tested.
- [ ] zod validates every input. CSV is capped at 2 MB / 5,000 rows. Photos must be JPEG, PNG or WebP, ≤ 1 MB after compression on the phone.
- [ ] OTP: stored hashed, 5-minute expiry, 5 attempts, a basic per-phone rate limit.
- [ ] Session cookie is httpOnly, Secure and SameSite=Lax, signed with `SESSION_SECRET`.
- [ ] No secrets in the repo: `.env.example` lists names only, and `.env` is gitignored.
- [ ] Photos are served only through a route that checks access, never from public URLs.

## 7. Tests (Vitest)
- Billing: area × rate, rounding, idempotent bill run
- Interest: Swati's ₹172 and Aamir's ₹59, zero before the due date
- Payment allocation: interest first, then FIFO
- Reference parser: all formats, plus invalid codes rejected
- Matcher: one test per row of the decision table, including a gateway payment that reappears in the CSV and the same file uploaded twice
- Safety rule: "lift stuck" is classified Critical even when the mocked AI says Low
- AI fallback: timeout, bad JSON or low confidence → keyword result, flagged Unsure
- Access control: resident A can't read flat B's ledger or complaint

---

## 8. Build order (cut from the bottom if time runs short)

| Phase | What | Rough time | Needs you? |
|---|---|---|---|
| 0 | **You:** create accounts and keys (see §9) | 15 min, any time before phase 7 | yes |
| 1 | Scaffold, design tokens, Prisma schema, seed, OTP login, roles | 1.5 h | no |
| 2 | Billing engine, resident home, ledger, test checkout, receipt | 1.5 h | 5-min look on your phone |
| 3 | Bank CSV matching, accounts queue, matcher tests | 2 h | no |
| 4 | Complaints: AI, safety rule, fallback, assignment, timeline, duplicates, rating and reopen | 2 h | no |
| 5 | Committee dashboard | 1 h | no |
| 6 | Polish: loading, empty and error states, phone layout, installable app manifest, security pass | 1 h | no |
| 7 | Deploy to Vercel + Neon, seed production | 30 min | 10 min (log in, paste keys) |
| 8 | TDD (.docx), deployment.md, screenshots, zip | 1 h | no |
| 9 | **You:** read the TDD and §10, then submit | 45 min | yes |

**Cut line, if needed:** duplicate linking → photo upload → reopen flow → installable app manifest. The P0 never gets cut: login, bills, payment, matching, complaints with AI and the safety rule, the dashboard, deploy and docs.

**Commits:** small and meaningful, one per feature, because they read the history.

---

## 9. Your to-do (about 15 minutes, while I build)
1. **GitHub:** create an empty **public** repo (e.g. `township-app`) and send me the URL. I'll push to it; git on this machine should already have your login.
2. **Anthropic API key** from console.anthropic.com. Keep it out of chat if you can; you'll paste it into Vercel yourself. Locally I'll read it from a `.env` file you create, or the app runs on the keyword fallback.
3. **Vercel account** (sign in with GitHub). At deploy time: import the repo, add the Neon integration (it sets `DATABASE_URL`), and paste the env vars from §11.
4. **Start Docker Desktop** if you want me to run Postgres locally (it's installed but wasn't running). Otherwise give me a Neon dev database URL.

## 10. What you must be able to say in the interview (read this)
- **Why amount alone never posts a payment**, and the decision table in §4b.
- **The gateway double-posting trap:** why the decision table checks for an existing gateway payment (row 2) before anything else.
- **Why the safety rule sits outside the AI**, and what happens when the AI is down (keyword fallback, marked Unsure).
- **Money in paise, not floats.** One transaction per import. Unique constraints make re-imports safe.
- **The numbers:**
  - ₹83.57 lakh a year in client pain = ₹64.8 L uncollected + ₹8.64 L matching + ₹10.13 L reopens
  - What each feature moves: on-time payments 70 → 90%, matching time −80%, reopened complaints 25 → <8%
- **The interest assumption** (21% a year simple, configurable) and the overdue-days data note.
- **What you cut and why:** a small slice done well beats the whole scope done badly, as the brief itself says.
- **What's next:** gate visitors working offline, Marathi and Hindi, guest codes, 90-day photo deletion job, Tally export, real gateway webhooks.

## 11. Environment variables (names only)
`DATABASE_URL`, `DIRECT_URL` (Neon direct connection, for migrations), `SESSION_SECRET`, `ANTHROPIC_API_KEY` (optional: the app falls back to keywords), `ANTHROPIC_MODEL` (optional), `DEMO_MODE` (shows the OTP on screen; on for the review).

## 12. Demo logins (all use the OTP shown on screen in demo mode)
| Role | Phone | Who |
|---|---|---|
| Resident (owner) | +91 90000 00001 | Neeraj Kulkarni, T07-1203 |
| Resident (tenant) | +91 90000 00002 | Swati Joshi, T12-0408 |
| Resident (owner) | +91 90000 00003 | Aamir Shaikh, T21-1601 |
| Help desk / accounts | +91 90000 00100 | Help-desk lead |
| Committee | +91 90000 00200 | Committee treasurer |

## 13. Definition of done (maps to the assignment's Must-haves)
- [ ] Main flows work on realistic sample data, with no dead buttons
- [ ] Frontend, backend, DB, sign-in, three roles
- [ ] AI works live, *and* the safety rule, fallback and one-tap fix are visible
- [ ] Consistent design, works on a phone, loading, empty and error states everywhere
- [ ] Tests pass for matcher, billing, safety rule and access control. No secrets. Inputs validated
- [ ] Live URL + public GitHub repo at the top of the TDD
- [ ] TDD lists every assumption (A1…An) and an honest "limits" section
- [ ] `deployment.md`: run locally, how it's deployed, env names, demo logins
