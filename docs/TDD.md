# Technical Design Document: Township resident app

**GitHub:** https://github.com/Akarshhk/Isocode
**Live app:** https://township-app.vercel.app (demo logins in deployment.md; no SMS is sent, the code is shown on screen)
**Brief:** 1. Gated township resident app (Company A, Pune). Software Engineering core build.
**Author:** Akarsh, November 2026. Built with AI assistance (Claude Code) for drafting and code. The decisions, numbers and trade-offs below are mine, and I can defend them in the interview.

## 1. Summary

Company A runs a 2,400-flat township whose money and complaints still live in Excel, cheques, paper and 28 WhatsApp groups. The brief prices the pain at **₹83.57 lakh a year**: ₹64.8 L never collected, ₹8.64 L of staff time matching payments by hand, and ₹10.13 L lost to reopened complaints.

I built the core slice end to end, aimed at those three numbers:

| Cost in the brief | What the build does about it | How the committee sees progress |
|---|---|---|
| ₹64.8 L uncollected (3%); on-time payments at 70% | Dues in one card on the resident's home screen, pay in two taps, interest that is visible and explained | "Paid by the due date" against the 90% target, dues ageing |
| ₹8.64 L matching payments by hand | Bank statement CSV matched to flats automatically; only unclear credits reach a person, with suggestions | "Matched automatically" %, queue size, time in queue |
| ₹10.13 L reopened complaints (25%) | AI category and urgency, auto-assignment, response timer, status updates, close-with-rating or reopen by the resident | Reopen rate against the under-8% target, response and resolution times |

The brief says to build a small part really well instead of the whole scope badly. Gate visitors, amenity booking and Marathi/Hindi screens are deliberately cut (section 11).

## 2. What is built

| Core build item | Built | Where to see it |
|---|---|---|
| Resident login | OTP login tied to a flat (owner or tenant). Mocked SMS: the code is shown on screen in demo mode | `/login` |
| Maintenance bills with test payment | Area × rate billing, late interest, per-flat ledger and bills, test-mode checkout (success and decline), printable receipts showing what each payment cleared | `/home`, `/dues`, `/pay`, `/receipts/:id` |
| Bank statement matching | CSV upload, decision table, accounts queue with suggestions, results per row with the reason, sample statement generator | `/desk/reconcile` |
| Complaints with assignment and status | Text and photo, AI category and urgency, safety rule, duplicate linking, auto-assignment, response timer, status timeline, rating or reopen | `/complaints`, `/desk` |
| Committee view | Collections, on-time rate, dues ageing, complaint times, reopen rate, AI override rate, matching stats, CSV export | `/committee` |
| Roles | Resident, help desk (also runs the accounts queue), committee (read-only, added) | Every page and action checks the role server-side |

Extras beyond the core: monthly billing run, flat ledger lookup for staff, installable app manifest, and a sample bank statement built from live data so a reviewer can test matching in one click.

## 3. Architecture

```
 Phone / desktop browser                Vercel (Next.js 15, Node runtime)                 Neon Postgres
 ┌─────────────────────┐   HTTPS   ┌──────────────────────────────────────────┐   Prisma   ┌──────────────┐
 │ Resident (PWA)      │ ────────▶ │ Middleware: session JWT, role per path   │ ─────────▶ │ flats, bills │
 │ Help desk           │           │ Server components: read and render       │            │ payments     │
 │ Committee           │ ◀──────── │ Server actions: validated writes (zod)   │            │ bank lines   │
 └─────────────────────┘   HTML    │ Domain logic: src/lib (pure, tested)     │            │ complaints   │
                                   └───────────────┬──────────────────────────┘            └──────────────┘
                                                   │ complaint text only
                                                   ▼
                           Gemini API (Gemini Flash) or Anthropic API (Claude Haiku), JSON schema output
       Mocked inside the app: OTP SMS, payment gateway (test mode), WhatsApp/SMS notifications (stored in an outbox table)
```

**Why this shape.**

- **One deployable.** The real project budget is ₹9 L over 8 weeks, and this build was one person in one day. A single Next.js app with server components and server actions gives UI, API and auth in one codebase, with no separate API to secure and version.
- **Every write runs on the server.** Each one is validated with zod and checked against the session, the role and flat ownership. The browser never sees other flats' data.
- **PostgreSQL**, because the ledger needs transactions and unique constraints. A whole statement import commits or rolls back as one unit. A flat can't get two bills for the same month. The same UTR or gateway reference can't be posted twice.
- **Prisma** gives typed queries and versioned migrations. Migrations run automatically on every deploy.
- **Pure domain logic in `src/lib`.** Billing, interest, matching, the safety rules and linking are plain functions with no database, so they are unit-tested directly. Screens in `src/app` stay thin.
- **Vercel and Neon** both have free tiers, which gives a live demo for ₹0 and scales to 2,400 flats without change.

## 4. Data model

| Entity | Key fields | Why it is shaped this way |
|---|---|---|
| Tower, Flat | `code` "T07-1203", `areaSqft` | The flat is the billing and access unit |
| User, FlatMember | `phone` (unique), `role`, OWNER or TENANT | One account per phone; a resident is linked to one flat |
| UpiHandle | `vpa` (unique) → flat | The strongest matching signal: a registered UPI ID |
| BillingConfig | rate in paise per sq ft, interest in basis points, due day, effective from | Rules are data, not code; changing them doesn't rewrite history |
| Bill | flat, period, amount, **snapshot of area, rate and interest**, issued and due dates; unique (flat, period) | A bill keeps the rules it was issued under |
| Payment | amount, method (GATEWAY or BANK), date, unique `utr`, `gatewayRef`, `idempotencyKey`, `bankLineId` | Each unique key blocks one kind of double posting |
| BankImport, BankLine | every statement row with its decision, `reasons` and `candidates`; unique `fingerprint` | An audit trail of why each credit was or wasn't posted |
| Complaint | category, urgency, scope (FLAT or COMMON), **AI suggestion stored separately from the final values**, `safetyKeyword`, assignee, `duplicateOfId`, response deadline and times, rating, reopen count | Lets us measure how often the AI was overridden, and enforce the safety lock |
| ComplaintEvent | type, message, actor, time | The timeline residents see, and the audit log |
| OtpChallenge, Notification | hashed code, attempts, expiry; mock outbox | Real sign-in mechanics with mocked delivery |

**Two decisions that matter:**

1. **Money is integer paise everywhere.** No floats in stored amounts.
2. **The ledger is replayed, not stored.** Bills and payments are the only facts. A pure function, `buildStatement`, replays them in date order to produce interest, allocation, balance, days overdue and the ledger lines. That gives one source of truth: the resident's card, the receipt, the matcher's view of what's due and the committee report can never disagree. The trade-off is that past months aren't frozen; that is in section 12.

## 5. Main flows

### 5.1 Sign-in

1. The resident enters a mobile number.
2. The server creates a 6-digit one-time code and stores only an HMAC hash of it. The code lasts 5 minutes, allows 5 attempts, and a phone can request at most 3 codes in 10 minutes.
3. In demo mode the code is shown on screen; otherwise an SMS is "sent" (mocked).
4. When the code is verified, the challenge is consumed atomically, so it can't be reused in parallel.
5. A signed session cookie (HS256, httpOnly, 7 days) carries the user, role and flat.

### 5.2 Billing and late fee

- **Monthly bill = area × ₹6.50, rounded to the rupee.** This reproduces the brief's sample exactly: 1150 → ₹7,475, 980 → ₹6,370, 1640 → ₹10,660.
- **Interest on overdue maintenance = 21% a year, simple, counted daily after the due date** (assumption A3).
  - When a payment arrives, interest accrued up to that day is charged, and the payment clears interest first, then the oldest bill.
  - Anything left over is advance credit, used when the next bill is issued.
- **The sample flats come out as the brief describes them:**
  - **Neeraj:** paid, nothing due.
  - **Aamir:** paid ₹5,000 of ₹10,660 before the due date. 18 days overdue, interest ₹5,660 × 21% × 18/365 = **₹59**, so **₹5,719** due.
  - **Swati:** 47 days overdue on a monthly cycle means two bills are unpaid. That is ₹12,740 plus ₹275 interest, so **₹13,015** due.
- **Staff run each month's billing in one click.** Running it twice adds nothing, because a flat can have only one bill per month.

### 5.3 Test payment

- **Checkout.** It shows the amount due, which the resident can lower for a part payment, and a choice of UPI, card or net banking. There are two buttons: pay, and "simulate a declined payment".
- **Success** posts a GATEWAY payment straight away, as a gateway webhook would. It then shows a receipt listing what the money cleared, for example: interest ₹275, September ₹6,370, October ₹6,370.
- **Double taps and retries** carry an idempotency key, so they land on the same receipt.
- **Decline** shows an error, and nothing is posted.

### 5.4 Bank statement matching (the hard part)

The CSV parser handles typical Indian bank exports:
- account-detail lines above the header
- varying column names (Narration, Description, Particulars)
- day-first dates in several formats
- `1,50,000.00` style numbers
- footer lines

It refuses the whole file if any row can't be read, so a half-imported statement never happens.

Each credit row then goes through a **decision table, checked in order**. A table rather than a weighted score, because every outcome must be explainable to an accountant and testable:

| # | Check | Outcome |
|---|---|---|
| 0 | Same fingerprint (date, amount, reference, narration) or same bank reference seen before | **Duplicate**: re-uploading a statement posts nothing twice |
| 1 | Debit or zero row | **Ignored** |
| 2 | Gateway settlement `SETL_yyyymmdd` whose amount equals that day's online payments | **Already on ledger**: it was posted when paid. A wrong amount goes to the queue |
| 3 | UTR already on a payment (overlapping statement downloads) | **Already on ledger** |
| 4 | Registered UPI ID, or a flat code in the narration (`T07-1203`, `T7 1203`, `T071203`, `TWR 7 FLAT 1203`, `FLAT 1203 T7`), naming exactly one real flat | **Posted automatically** (full, part, or with advance credit) |
| 5 | UPI ID and reference name different flats | **Queue**: conflict |
| 6 | Amount far above dues plus 3 months' bills | **Queue**: unusual amount |
| 7 | Only the payer's name or the amount matches | **Queue**, with ranked suggestions: name and amount, then name, then amount |

**Why the amount never posts on its own:** every 980 sq ft flat is billed exactly ₹6,370. In a township of standard layouts, an amount-only match is a guess, and posting a guess to a ledger creates two wrong balances.

- **Earlier rows inform later ones.** Within a file, later rows see earlier decisions: in-file duplicates, and a flat's dues reduced by its first payment.
- **One transaction.** The import, all its lines and all auto-posted payments are written in a single transaction.
- **The accounts queue** shows each credit with the narration, the reason in plain English and the suggested flats.
  - Staff post to a flat in one click, or mark the credit "not maintenance".
  - Claiming a row is guarded, so two people can't post the same credit.
- **Payment date counts.** Payments post with the bank's transaction date, so interest is correct to the day.
- **Result on the generated sample** (31 rows):
  - 17 posted automatically and 5 queued. That is 77% of new credits needing no person.
  - 6 recognised as already on the ledger, 1 duplicate, 2 debits ignored.
  - Everything is visible per row with its reason.

### 5.5 Complaints

1. **Raise.** The resident writes in any language and can add a photo. The photo is compressed on the phone to 1280 px JPEG, and its type is checked from the file's bytes on the server.
2. **Classify.** See section 6: the safety rule runs, then the AI, then the fallback.
3. **Link.** A common-area report links to the first open report of the same category in the same tower within 24 hours, for example ten flats reporting the same stuck lift. In-flat issues are never linked: two leaks in two flats are two jobs.
4. **Assign.** The category maps to a team. Within the team, the person with the fewest open jobs gets it; linked reports follow the first report's assignee. The assignee gets a WhatsApp message (mocked); a safety case also sends an SMS to the duty manager.
5. **Respond.** A response timer runs against the target for the urgency. Staff start work, add notes and mark resolved. Linked reports can be resolved together, deliberately.
6. **Close.** Only the resident closes a complaint, with a 1–5 rating, or reopens it within 7 days. Reopens are counted, because "reopened complaints from 25% to under 8%" is a success metric.

### 5.6 Committee report

Every figure is computed from the same replayed ledger and complaint records, with the definitions printed on the page:
- **On time:** a bill cleared in full by its due date.
- **Response time:** from a complaint being raised to the first staff action.
- **Reopen rate:** reopened complaints as a share of resolved ones.

Credits waiting in the accounts queue are not counted as collected. The committee sees flat codes and amounts, but not names or phone numbers. It can download flat-level dues as CSV.

## 6. How the AI works, and what happens when it is wrong

**The AI is used for one job only: complaint category, urgency and scope.** Payment matching uses no AI at all, on purpose: money must be deterministic and explainable.

- **The call.** One system prompt defines each category and urgency level. Two providers are supported behind one interface (`src/lib/complaints/provider.ts`), chosen by which key is set:
  - **Gemini** (`gemini-3.8-flash`, via `GEMINI_API_KEY`): the live deployment uses this. Thinking level low, 8-second timeout per attempt, one retry, 15-second hard cap.
  - **Claude Haiku** (`claude-haiku-5-5`, via `ANTHROPIC_API_KEY`): effort low, 8-second timeout, one retry.
  - If both keys are set, `AI_PROVIDER` picks; otherwise Gemini.
  - Either way the output is constrained by a JSON schema at the provider and validated again with zod: category, urgency, scope, confidence 0–1, and a one-line reason. Everything after that (safety rule, fallback, review flags) is the same for both.
- **Why two providers.** The prompt and the checks are the valuable part, not the vendor. Keeping the provider swappable means a price change, an outage or a data-protection requirement can be met with a key change, not a rewrite.
- **Only the complaint text is sent.** No name, phone number or flat code. This is data minimisation under the DPDP Act. See A17 on which API tier may use inputs for training.
- **Cost.** About 1,800 complaints a month is roughly 1.5 M tokens: under US$1 a month on Claude Haiku 5.5 ($0.10 / $0.50 per million tokens). Gemini Flash's current price list should be checked before go-live.

| When the AI is wrong or unsure | What happens |
|---|---|
| A safety word is present (fire, smoke, gas, lift stuck, trapped, shock, sparking, plus Hindi and Marathi forms) | **A rule outside the AI** forces Critical, escalates to the duty manager and starts a 15-minute timer. The AI can't lower it, and the UI locks urgency with the reason shown, including what the AI had suggested |
| The API is down, times out, refuses, or returns something off-schema | Keyword fallback classifies it. The ticket is flagged **"Check category"** and the timeline says the AI was unavailable |
| Confidence is below 0.6 | The AI's guess is kept, but flagged **"Check category"** |
| The category is wrong | The help desk taps the right category once. The ticket is reassigned to that team, and the change is logged as an AI override |
| Duplicates | Linked, never closed. Staff can unlink a report that was linked wrongly |
| Measuring it | The committee sees the **AI override rate**. Rising overrides are the signal to change the prompt or model |

**Honest note:** no AI key was available while building, so neither live call was exercised end to end during the build. Unit tests cover both contracts with mocked responses: success, low confidence, blocked or cut-off replies, timeouts, rate limits, rejected keys and off-schema output. The keyword fallback path has been run for real. `/api/health` shows which provider is active, and each fallback ticket shows the help desk why the AI was skipped (for example "AI rate-limited"), so a misconfigured key is visible straight away.

## 7. UI and design decisions

The brief asks for minimal design: white space, a restrained palette, clear type, nothing without a purpose. It also says residents open the app for seconds at a time. The decisions follow from that:

- **Palette.**
  - One accent, a deep green, for actions and data marks.
  - Warm neutral surfaces and three ink greys.
  - Red and amber only for state (overdue, critical, late), always with words, never colour alone.
- **Type.** Inter, with tabular numbers wherever money or time is shown, so amounts line up.
- **Resident home.** The dues card comes first: the amount, an "Overdue 47 days" pill, and *Pay ₹13,015*. Then open complaints with live response timers, then the last receipt.
  - Paying takes two taps, raising a complaint one, and checking a complaint's status one.
  - Bottom tabs sit within thumb reach; tap targets are at least 44 px.
- **Checkout and receipt.** A test-mode banner, so nobody mistakes the demo for a real payment. The receipt shows how the money was applied: interest, then the oldest bill. That allocation is what builds trust in late fees.
- **Help-desk queue.**
  - Sorted by urgency, then by response deadline.
  - Badges for *Safety*, *Check category* and *+9 linked*. Linked reports collapse under the first one, so a lift incident is one row, not ten.
  - The complaint screen has one-tap category chips and an urgency control that locks with an explanation when the safety rule fired.
  - The AI's suggestion, confidence and reason are shown next to the human decision.
- **Bank matching.** The accounts queue is the main column, because that is the work. Every row says why it is there and suggests flats. The upload sits in the side column, with a sample statement to try.
- **Committee report.**
  - Headline tiles carry the brief's own targets (90% on time, under 8% reopened).
  - Ageing bars and an on-time column chart with a dashed 90% target line.
  - A table under the chart, and printed definitions, because the committee asked for a report it can trust.
- **States everywhere.**
  - Skeletons while pages load.
  - Empty states with a next step ("Queue is clear").
  - Buttons that show progress and can't be double-submitted.
  - Inline validation messages, and an error page that gives a reference code.

## 8. Security and privacy

- **Access control in three layers.**
  - Middleware checks the session and role for every path.
  - Every page and server action checks again with `requireRole`.
  - Resident data is always queried by the session's flat. A receipt or photo from another flat returns "not found", so receipt numbers don't leak.
  - The rules are unit-tested.
- **Validated inputs.**
  - zod on every action.
  - CSV limited to 2 MB and 5,000 rows.
  - Photos limited to 1.5 MB, with the type checked from the file's bytes.
  - Payment amounts bounded by dues plus 3 months.
  - Phone numbers normalised to Indian mobile format.
- **Concurrency and double posting.**
  - Unique keys on UTR, gateway reference, checkout idempotency key, bank-row fingerprint, and (flat, month) for bills.
  - Status changes and queue claims are conditional updates on the old status.
- **Secrets.** Only in environment variables: `.env` is git-ignored and `.env.example` lists names only.
- **Security headers.** nosniff, frame-deny and a referrer policy. Cookies are httpOnly, Secure and SameSite=Lax.
- **Privacy (DPDP Act 2023).**
  - Fictional people and phone numbers only.
  - The AI receives only the complaint text.
  - Photos are served only to the flat's residents and staff, with private caching.
  - The committee view hides names and phone numbers.
  - The sign-in page carries a short privacy notice.

## 9. Testing

**94 unit tests (Vitest)** cover the logic that matters most:

- **Billing.** The sample bills, rounding, interest worked examples, interest-first FIFO allocation, advance credit, not-yet-due bills, and the running balance.
- **Matching.**
  - One test per decision-table row: UPI, flat code, amount-only refused, conflict, name-only, unknown flat, unusual amount, advance, gateway settlement and mismatch, overlapping UTR, duplicate by fingerprint and by reference, debit.
  - Five reference spellings.
  - CSV parsing of headers, Indian numbers, dates and bad rows.
- **Complaints.**
  - The safety rule in three languages, including when the AI says Low and when the AI is down.
  - Fallback, low confidence and the lift scope.
  - Duplicate linking: tower, window, never in-flat.
  - Least-loaded assignment.
- **AI providers.** Which provider is chosen from the keys set; Gemini replies that are blocked, cut off, empty, not JSON or off-schema; the reason shown to the help desk for each kind of failure; and the fallback when Gemini is rate-limited.
- **Security.** Flat access by role, route-to-role mapping, phone normalisation, and OTP hash matching.

**Manual end-to-end checks on the running app:**
- Sign-in.
- Resident home at phone width.
- A declined and then a successful test payment; the receipt allocation was correct.
- Uploading the generated statement: 31 rows decided as designed, and the resident's new online payment recognised as a settlement and not posted twice.
- Posting a queued credit.
- The complaint pipeline through the keyword fallback, with safety escalation and linking.
- The committee report.

**Not done:** automated browser tests (Playwright) and load tests.

## 10. Assumptions

The brief is the only source. Everything else below is an assumption, labelled so it can be checked with the committee.

- **A1.** Rate ₹6.50 per sq ft per month (given) applied to the area as given; bills rounded to the rupee.
- **A2.** Bills are issued on the 1st and fall due on the 10th. This is inferred from "most bills are paid in the first 10 days" and is configurable.
- **A3.** The late fee is simple interest at **21% a year** on overdue maintenance, from the day after the due date. I took 21% to be the ceiling in the Maharashtra model bye-laws; the committee must confirm its own resolution. Configurable, and snapshotted on each bill.
- **A4.** Payments clear interest first, then the oldest bill; anything extra is advance credit.
- **A5.** The sample's 47 and 18 days overdue are 29 days apart, so they can't both come from one monthly due date. The seed sets those two bills' due dates relative to the day it runs, so the sample reads exactly as given on that day. 47 days overdue on a monthly cycle means Swati has two unpaid months.
- **A6.** Help-desk staff also work the accounts queue, since the brief names only resident and help-desk roles for the core build. A read-only committee role is added for the committee view.
- **A7.** First-response targets: Critical 15 minutes, High 2 hours, Medium 8 hours, Low 24 hours.
- **A8.** Duplicate rule: a common-area issue, same tower, same category, still open, within 24 hours.
- **A9.** The safety word list is broad on purpose; over-escalating is the safe failure. Duty manager and teams are seeded staff.
- **A10.** A credit larger than dues plus 3 months' bills is "unusual" and goes to a person, even when the flat is clear.
- **A11.** The test gateway settles each day's online payments as one bank credit, `SETL_yyyymmdd`, with no fees deducted. A real gateway's fees would be added to the comparison.
- **A12.** Bank CSV format: a generic Indian bank export with Date, Narration, Ref, Debit, Credit and Balance; day-first dates.
- **A13.** One flat per resident account. Owners and tenants can both pay.
- **A14.** Demo data:
  - 134 of the 2,400 flats, across all 28 towers, with July to October 2026 history.
  - Behaviour tuned to the brief's baseline of about 70% paid on time and about 25% of complaints reopened.
  - Fictional names; phone numbers in an unused range.
- **A15.** GST on maintenance is not modelled; the brief is silent on it. Flag for the committee: maintenance above ₹7,500 a month per member can attract GST for larger housing societies. Aamir's ₹10,660 bill would be affected, so a CA should confirm before go-live.
- **A16.** English interface only for this phase.
- **A17.** The demo classifies complaints with a Gemini API key. Under Google's terms, inputs on the Gemini API's unpaid tier may be used to improve Google's products; the paid tier, like the Anthropic API, does not train on inputs. That is acceptable here because every resident is fictional, but production must use a paid tier (or Claude), and the committee should record that choice under the DPDP Act.

## 11. What I cut, and what I would do next

**Cut, deliberately.** None of these appear in the UI, so there are no dead buttons:
- Gate visitor management: guard tablet working offline, visitor photos with 90-day deletion, resident approval, guest codes.
- Amenity booking.
- Notices.
- Managing family and tenant members.
- Marathi and Hindi screens.
- A real OTP, SMS or payment gateway.
- Tally export.
- Push notifications.
- Automated browser tests.

**Next, in order of value against the ₹83.57 L:**

1. **A unique UPI ID or virtual account per flat** through the bank or gateway. Every credit then identifies its flat, and the accounts queue shrinks to near zero. This is the biggest lever on matching time.
2. **A real gateway in test then live mode,** with signed webhooks, plus reminders before and after the due date by SMS or WhatsApp. This targets on-time payments, 70% to 90%.
3. **A maker-checker step** for queue postings above a threshold, and monthly period close (freezing a month's statements).
4. **Gate visitors with an offline-first guard tablet** and the 90-day photo deletion job.
5. **Marathi and Hindi screens.**
6. **An evaluation set of real, anonymised complaints** to measure classification accuracy before and after prompt changes.
7. **Tally export.**

## 12. Known limits

- **The live AI call** wasn't run against either API during the build (section 6).
- **Past months aren't frozen.** The ledger is recomputed from bills and payments, so there is no monthly close; correcting a past payment changes past statements. Production needs period close and adjustment entries.
- **Report queries.** The committee report and matcher load every flat's bills and payments into memory. That is fine for 2,400 flats, about 30,000 bills a year. Beyond that, move the aggregates into SQL.
- **Photos are stored in Postgres,** which is acceptable for a demo; production should use object storage with a lifecycle policy.
- **OTP rate limits are simple,** counted in the database per phone. There is no device or IP throttling and no bot protection.
- **The sample statement generator is a demo tool.** It reads live data to build realistic rows, and is staff-only.
