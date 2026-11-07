# Deployment

**Repository:** https://github.com/Akarshhk/Isocode
**Live app:** _added after the first Vercel deploy (see below)_

The app is a single Next.js 15 project (UI and server in one), backed by PostgreSQL through Prisma.
The test payment gateway, OTP SMS and WhatsApp/SMS notifications are mocked inside the app.

---

## 1. Run it locally

You need **Node.js 20 or newer** (built and tested on Node 22) and **Docker** (for Postgres). Any other Postgres 14+ works too: just point `DATABASE_URL` at it.

```bash
git clone https://github.com/Akarshhk/Isocode.git
cd Isocode
npm install                      # also runs `prisma generate`
cp .env.example .env             # then set SESSION_SECRET (see below)
npm run db:up                    # starts Postgres 16 on localhost:5433 (docker compose)
npx prisma migrate deploy        # creates the tables
npm run db:seed                  # loads the demo data (wipes and reseeds; safe to rerun)
npm run dev                      # http://localhost:3000
```

Generate a session secret for `.env`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Other commands:

| Command | What it does |
|---|---|
| `npm test` | Unit tests (Vitest): billing and interest, bank matching, safety rule and AI fallback, access control |
| `npm run typecheck` | TypeScript check |
| `npm run build` | Production build |
| `npx tsx scripts/check-samples.ts` | Prints the three sample flats from the brief, as computed by the ledger |
| `npx tsx --conditions=react-server scripts/try-complaint.ts T12-0304 "Lift stuck, people inside"` | Runs one complaint through classification, safety rule, linking and assignment |

Without `ANTHROPIC_API_KEY` the app still works: complaints are classified by the keyword fallback and flagged for the help desk to check.

---

## 2. How it is deployed

| Piece | Where |
|---|---|
| Web app and API (Next.js server actions and route handlers) | **Vercel**, from the `main` branch of the GitHub repo |
| Database | **Neon** serverless Postgres, connected through Vercel's Storage (Marketplace) integration |
| AI | Anthropic API, Claude Haiku (`claude-haiku-5-5`), called from the server only |

On every deploy Vercel runs the `vercel-build` script:

```
prisma migrate deploy  →  tsx prisma/seed.ts --if-empty  →  next build
```

Migrations are applied automatically. The demo data is loaded only if the database is empty, so redeploys never overwrite data entered by reviewers.
To reset the demo data, run `npm run db:seed` locally with `DATABASE_URL` pointed at the Neon database.

### Steps to deploy a fresh copy

1. Vercel → **Add New → Project** → import the GitHub repo. Framework preset: Next.js (detected). Leave build settings as they are: `vercel-build` is picked up from `package.json`.
2. **Storage → Create Database → Neon** (free plan) and connect it to the project. This adds `DATABASE_URL` and `DATABASE_URL_UNPOOLED`.
3. **Settings → Environment Variables:** add `SESSION_SECRET`, `DEMO_MODE` = `true`, and optionally `ANTHROPIC_API_KEY`.
4. **Deployments → Redeploy.**

### Environment variables (names only)

| Name | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Pooled Postgres connection used by the app (set by the Neon integration) |
| `DATABASE_URL_UNPOOLED` | yes | Direct connection used by `prisma migrate deploy` (set by the Neon integration) |
| `SESSION_SECRET` | yes | At least 32 random characters. Signs session cookies and hashes one-time codes |
| `DEMO_MODE` | yes, for review | `true` shows the one-time code on the sign-in screen instead of sending an SMS |
| `ANTHROPIC_API_KEY` | optional | Enables AI complaint classification. Without it the keyword fallback is used |
| `ANTHROPIC_MODEL` | optional | Defaults to `claude-haiku-5-5` |

No secrets are committed: `.env` is git-ignored and `.env.example` holds names and local defaults only.

---

## 3. Demo logins

Sign-in is by mobile number and one-time code. **No SMS is sent**: with `DEMO_MODE=true` the code is shown on screen after you tap *Send code*. The sign-in page also lists these accounts; tap one to fill the number.

| Role | Mobile number | Who | What to try |
|---|---|---|---|
| Resident (tenant) | `90000 00002` | Swati Joshi, T12-0408 | ₹13,015 due (47 days overdue, includes interest). Pay it in test mode, see the receipt; follow the open water-leak complaint |
| Resident (owner) | `90000 00003` | Aamir Shaikh, T21-1601 | Part paid: ₹5,000 of ₹10,660, 18 days overdue. Pay part of the balance |
| Resident (owner) | `90000 00001` | Neeraj Kulkarni, T07-1203 | Fully paid. Raise a complaint (try "lift stuck" or "smell of gas") |
| Help desk and accounts | `90000 00100` | Rekha Pawar | Complaint queue, one-tap category change, the T12 lift incident with 9 linked reports; **Bank matching → Download a sample statement → upload it** |
| Committee (read-only) | `90000 00200` | Vaishali Apte | Monthly report, dues ageing, complaint times, dues CSV |

A suggested five-minute walkthrough:

1. **Help desk:** sign in as `90000 00100` → *Bank matching* → *Download a sample statement to try* → upload that file. All 31 rows are decided: posted automatically, sent to the accounts queue (conflicts, name-only, amount-only, unknown flat, unusual amount), already on the ledger (gateway settlements, overlapping statements), duplicate, or ignored. Post one queued credit to a suggested flat.
2. **Resident:** sign in as `90000 00002` → *Pay* → *Simulate a declined payment*, then pay properly → receipt shows interest cleared first, then September and October.
3. **Help desk again:** download a fresh sample statement → today's online payment shows up as a gateway settlement and is **not** posted twice.
4. **Resident:** raise a complaint containing "lift stuck". It's Critical, escalated to the duty manager, and linked to the existing T12 lift incident if raised from T12.
5. **Committee:** sign in as `90000 00200` → the monthly report.
