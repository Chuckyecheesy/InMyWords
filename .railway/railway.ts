import { defineRailway, github, postgres, preserve, project, service, volume } from "railway/iac";

// In My Words on Railway — three app services + Postgres (pgvector).
//   api     — FastAPI backend; start.sh also runs the four MCP servers on
//             127.0.0.1 inside the same container (they are never public).
//   web     — Next.js app (web/). Talks to the api server-side via API_BASE_URL.
//   booking — mock booking page; builds from the repo root because it imports
//             mcp/store.py.
// Secrets are preserve(): set them with `railway variables --set` so values
// never land in this file. DATABASE_URL comes from the Postgres service.

const REPO = "Chuckyecheesy/InMyWords";

export default defineRailway(() => {
  const Postgres = postgres("Postgres", { region: "sfo" });
  Postgres.networking = { privateNetworkEndpoint: "postgres" };
  const postgresVolume = volume("postgres-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "sfo", sizeMB: 500 });

  const api = service("api", {
    source: github(REPO, { branch: "main" }),
    start: "bash start.sh",
    healthcheck: "/",
    env: {
      DATABASE_URL: Postgres.env.DATABASE_URL,
      GEMINI_API_KEY: preserve(),
      ELEVENLABS_ID: preserve(),
      ELEVENLABS_API_KEY: preserve(),
      ELEVENLABS_STORY_AGENT_ID: preserve(),
      ELEVENLABS_COACH_AGENT_ID: preserve(),
      CLOUDINARY_CLOUD_NAME: preserve(),
      CLOUDINARY_API_KEY: preserve(),
      CLOUDINARY_API_SECRET: preserve(),
      CLOUDINARY_UPLOAD_PRESET: preserve(),
      EMAIL_SENDER_ADDRESS: preserve(),
      EMAIL_SENDER_PASSWORD: preserve(),
      GOOGLE_SERVICE_ACCOUNT_JSON: preserve(),
      GOOGLE_CALENDAR_STAFF_EMAILS: preserve(),
      DEMO_CONTACT_EMAIL: preserve(),
    },
  });

  const web = service("web", {
    source: github(REPO, { branch: "main", rootDirectory: "web" }),
    healthcheck: "/",
    env: {
      API_BASE_URL: preserve(),
      CLOUDINARY_CLOUD_NAME: preserve(),
    },
  });

  const booking = service("booking", {
    source: github(REPO, { branch: "main" }),
    start: "uvicorn app:app --app-dir mock-booking --host 0.0.0.0 --port $PORT",
    healthcheck: "/",
    env: {
      DATABASE_URL: Postgres.env.DATABASE_URL,
    },
  });

  return project("inmywords", {
    variables: { managed: true },
    resources: [Postgres, postgresVolume, api, web, booking],
  });
});
