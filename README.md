# Township: maintenance dues, payment matching and complaints

A resident app, help desk and committee report for a 2,400-flat gated township in Pune.
Residents pay maintenance (test mode) and raise complaints. The help desk triages complaints with AI and fixed safety rules, and reconciles bank statements that match payments to flats on their own. The committee sees a monthly report built from the ledger.

- **Design document:** see `docs/TDD.md` (also submitted as Word).
- **Run it, deploy it, demo logins:** see [deployment.md](deployment.md).
- **Plan the build followed:** [plan.md](plan.md).

```bash
npm install && cp .env.example .env   # set SESSION_SECRET
npm run db:up && npx prisma migrate deploy && npm run db:seed
npm run dev
npm test
```

Stack: Next.js 15 (App Router, server actions) · TypeScript · PostgreSQL + Prisma · Tailwind CSS · Anthropic API (Claude Haiku) · Vitest · Vercel + Neon.
