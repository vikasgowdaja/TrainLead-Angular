# TrainLead

TrainLead is a teaching-first marketplace prototype for matching trainers with training opportunities. The repository is organized as an npm workspace so each day can add one understandable layer to the same app.

## Current checkpoint

Day 1, step 1 is the runnable baseline: an Angular shell, Requirements and Inbox tabs, a reusable typed requirement card, the Mysuru sample, a shared Zod contract, and an Express health endpoint. MongoDB Compose and the local environment template are ready; CRUD, auth, extraction, and matching are introduced in later workshop steps.

AngularJS 1.x is end-of-life. It appears in the sample as a requested training skill; the product itself is built with modern Angular.

## Pinned toolchain

| Tool | Version |
| --- | --- |
| Node.js | 22.12 or newer (22.x or 24.x recommended) |
| npm | 11.16.0 |
| Angular | 22.2.4 |
| Angular CLI / build | 22.2.5 |
| Angular Material / CDK | 22.2.5 |
| TypeScript (Angular client) | 6.0.2 |
| TypeScript (workspace tools) | 7.0.2 |
| Express | 5.3.0 |
| Zod | 4.6.7 |
| Vitest | 5.0.5 |
| MongoDB Compose image | 8.0 |

Exact package versions are recorded in each workspace `package.json` and `package-lock.json`. The API’s MongoDB models are added in the database lesson.

## Run locally

Prerequisites: Node.js 22.12+ and Docker Desktop (or Docker Engine with Compose).

```powershell
Copy-Item .env.example .env
docker compose up -d
npm install
npm run dev
```

Open the Angular app at <http://127.0.0.1:4200>. The API health check is <http://127.0.0.1:3000/api/health>. `LLM_MODE=mock` is the default; the first checkpoint does not need an API key.

Useful checks:

```powershell
npm test
npm run build
```

For setup notes on Windows, macOS, and Linux, see [docs/setup.md](docs/setup.md). The implementation sequence and teaching materials live under [docs](docs/).

## Step history

Each completed teaching step is committed and tagged `dayN-stepM`. Exercise starters and solutions are stored under `docs/exercises/`; the matching solution branch is created with the step’s Git history.

## Privacy and security note

WhatsApp-derived contact details are personal data. Obtain consent before storing them, keep PII out of logs, and support export and deletion requests. The workshop’s DPDP Act note is educational and is not legal advice.