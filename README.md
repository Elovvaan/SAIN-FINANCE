# SAIN Finance

SAIN Finance is a sandbox financial-operations prototype for a worker-centered platform powered by a bank-independent Financial Kernel. The current application includes the public marketing site, Partner Center, and Employment module workspaces for employer, employee, intake, kernel, ledger, assets, treasury, admin, partner, and career workflows.

This application is a sandbox. It does not perform live banking, live payroll, custody, settlement, digital-asset issuance, blockchain activity, or real money movement.

## Architecture

- Framework: Next.js App Router
- Language: TypeScript
- Styling: Tailwind CSS v4 through PostCSS
- UI/runtime libraries: React, Framer Motion, lucide-react
- Package manager: npm with `package-lock.json`
- Application entry point: `src/app/page.tsx`
- Route structure: file-system routes under `src/app`
- Data layer: local typed mock data in React components
- Database: none
- ORM/query layer: none
- Authentication: none
- Health endpoint: `/health`

## Current Sandbox Routes

- `/`
- `/platform/career`
- `/platform/employer`
- `/platform/staffing`
- `/platform/partners`
- `/platform/employment`
- `/platform/employment/employer`
- `/platform/employment/employee`
- `/platform/employment/intake`
- `/platform/employment/kernel`
- `/platform/employment/ledger`
- `/platform/employment/assets`
- `/platform/employment/treasury`
- `/platform/employment/admin`
- `/platform/employment/partner`
- `/platform/employment/career`

## Local Prerequisites

- Node.js 20.9 or newer
- npm

## Installation

```bash
npm ci
```

## Environment Setup

Copy `.env.example` to `.env.local` if a deployment-specific public URL is needed.

```bash
cp .env.example .env.local
```

The current sandbox does not require private environment variables.

## Commands

```bash
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
npm run start
```

`npm run start` runs the production Next.js server with host `0.0.0.0`. Next.js reads the production port from the `PORT` environment variable when provided by Railway, and defaults to port `3000` locally.

## Database Setup

No database is currently configured. The application uses local mock data only. There are no migrations to run and no production seed process.

If a future database is added, configure it through environment variables such as `DATABASE_URL`, keep migrations production-safe, and keep sandbox seed commands separate from production startup.

## Migration Procedure

There are no database migrations in the current application.

## Railway Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | No | Optional public application URL for future canonical links or integration references. Use a safe public Railway domain value. |

Railway provides `PORT` automatically. Do not hardcode it.

## Railway Deployment Steps

1. Create a Railway project.
2. Select **Deploy from GitHub Repo**.
3. Choose `Elovvaan/SAIN-FINANCE`.
4. Add required environment variables. The current sandbox has no required private variables.
5. Do not add PostgreSQL or another database service for the current architecture.
6. Use the default npm install/build behavior, or set build command to `npm run build` and start command to `npm run start`.
7. Configure the `/health` health check.
8. Generate a Railway public domain.
9. Confirm all routes load directly.
10. Confirm sandbox disclosures remain visible.

## Health Check

`GET /health` returns:

```json
{
  "status": "ok",
  "service": "sain-finance",
  "sandbox": true
}
```

The health response intentionally avoids secrets, environment values, and internal diagnostics.

## Deployment Assumptions

- Railway installs dependencies with npm from `package-lock.json`.
- The production server binds to `0.0.0.0`.
- Railway supplies the `PORT` environment variable.
- All current routes are rendered by Next.js App Router pages and can be loaded directly.
- There is no persistent local upload storage in the current application.

## Current Limitations

- Sandbox data only.
- No live banking, payroll, custody, settlement, card issuing, digital-asset issuance, blockchain, or real money movement.
- No authentication or user accounts.
- No database, migrations, or production data persistence.
- No live sponsor-bank, payroll, staffing, BaaS, or payment-rail integrations.
- Automated tests are not yet implemented; the current `npm test` script is a truthful placeholder.

## Security Notes

- Do not commit `.env`, `.env.local`, `.env.production`, credentials, private keys, database files, or local logs.
- `.env.example` must contain only safe placeholder values.
- Sandbox demonstrations must remain clearly labeled and must not imply live financial functionality.
