# Setup guide

## Windows

Install Node.js 22.12 or newer, npm 11.16.0, and Docker Desktop with Compose enabled. From PowerShell in the repository root:

```powershell
Copy-Item .env.example .env
docker compose up -d
npm install
npm run dev
```

## macOS and Linux

Install Node.js 22.12 or newer, npm 11.16.0, and Docker Engine/Desktop with the Compose plugin. From a terminal in the repository root:

```sh
cp .env.example .env
docker compose up -d
npm install
npm run dev
```

The app runs at `http://127.0.0.1:4200`; the API health check runs at `http://127.0.0.1:3000/api/health`. MongoDB is available on port 27017. The current checkpoint does not yet connect the API to MongoDB; that connection is introduced on Day 3.

Set `LLM_MODE=mock` to keep extraction offline. Leave `ANTHROPIC_API_KEY` blank unless the optional paid integration is explicitly enabled in a later lesson.