import { defineConfig } from "@playwright/test";
import path from "node:path";
import os from "node:os";

const runtime = path.join(os.tmpdir(), "imw-t3-4-runtime.json");
const python = process.env.IMW_PYTHON || "python";

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  retries: 1,
  use: {
    baseURL: "http://localhost:3210",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: `${python} actions_server.py`,
      cwd: path.join(__dirname, "../mcp"),
      port: 8103,
      reuseExistingServer: false,
      env: { ...process.env, DATABASE_URL: "", IMW_RUNTIME_FILE: runtime },
    },
    {
      command: `${python} memory_server.py`,
      cwd: path.join(__dirname, "../mcp"),
      port: 8102,
      reuseExistingServer: false,
      env: { ...process.env, DATABASE_URL: "", IMW_RUNTIME_FILE: runtime },
    },
    {
      command: `${python} profile_server.py`,
      cwd: path.join(__dirname, "../mcp"),
      port: 8101,
      reuseExistingServer: false,
      env: { ...process.env, DATABASE_URL: "", IMW_RUNTIME_FILE: runtime },
    },
    {
      command: `${python} -m uvicorn main:app --host 127.0.0.1 --port 8000`,
      cwd: path.join(__dirname, "../api"),
      port: 8000,
      reuseExistingServer: false,
      env: {
        ...process.env,
        DATABASE_URL: "",
        MCP_MEMORY_URL: "http://127.0.0.1:8102",
        MCP_PROFILE_URL: "http://127.0.0.1:8101",
        IMW_RUNTIME_FILE: runtime,
      },
    },
    {
      command: "npm run dev -- --hostname localhost --port 3210",
      env: { ...process.env, API_BASE_URL: "http://127.0.0.1:8000" },
      cwd: __dirname,
      port: 3210,
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
});
