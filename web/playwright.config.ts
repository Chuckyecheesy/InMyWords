import { defineConfig } from "@playwright/test";
import path from "node:path";

const runtime = "/tmp/imw-t3-4-runtime.json";
const python = process.env.IMW_PYTHON || "python";

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  retries: 1,
  use: {
    baseURL: "http://127.0.0.1:3210",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: `${python} profile_server.py`,
      cwd: path.join(__dirname, "../mcp"),
      port: 8101,
      reuseExistingServer: false,
      env: { ...process.env, IMW_RUNTIME_FILE: runtime },
    },
    {
      command: `${python} -m uvicorn main:app --host 127.0.0.1 --port 8000`,
      cwd: path.join(__dirname, "../api"),
      port: 8000,
      reuseExistingServer: false,
      env: {
        ...process.env,
        MCP_PROFILE_URL: "http://127.0.0.1:8101",
        IMW_RUNTIME_FILE: runtime,
      },
    },
    {
      command: "npx next dev --hostname 127.0.0.1 --port 3210",
      cwd: __dirname,
      port: 3210,
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
});
