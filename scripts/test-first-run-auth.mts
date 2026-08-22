import express from "express";
import http from "http";
import fs from "fs-extra";
import path from "path";

process.env.NODE_ENV = "production";
process.env.JWT_SECRET = "test-jwt-secret-please-do-not-use-in-production-123456";
process.env.NODE_ENCRYPTION_KEY = "test-encryption-key-please-do-not-use-in-production";

const repoRoot = process.cwd();
const dataDir = path.join(repoRoot, ".data");
const backupDir = path.join(repoRoot, ".data.first-run-test-backup");

await fs.remove(backupDir);
if (await fs.pathExists(dataDir)) await fs.move(dataDir, backupDir);
await fs.ensureDir(dataDir);

const cleanup = async () => {
  await fs.remove(dataDir);
  if (await fs.pathExists(backupDir)) await fs.move(backupDir, dataDir);
};

try {
  const { default: apiRoutes } = await import("../src/server/routes/api.ts");
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.use("/api", apiRoutes);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not start");
  const base = `http://127.0.0.1:${address.port}`;

  const request = async (url: string, options: RequestInit = {}) => fetch(`${base}${url}`, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) },
  });
  const json = (value: unknown) => JSON.stringify(value);
  const assert = (condition: unknown, message: string) => {
    if (!condition) throw new Error(message);
  };

  let response = await request("/api/auth/setup-status");
  let body: any = await response.json();
  assert(response.status === 200 && body.setupRequired === true, "fresh database must require setup");

  const ownerPassword = "Owner-Test-Password!42";
  response = await request("/api/auth/setup", { method: "POST", body: json({ username: "owner", email: "owner@example.com", password: ownerPassword, confirmPassword: ownerPassword }) });
  body = await response.json();
  assert(response.status === 201 && body.user?.role === "owner" && !body.token, "setup must create an Owner without auto-login");

  response = await request("/api/auth/setup-status");
  body = await response.json();
  assert(body.setupRequired === false, "setup status must close after first account");

  response = await request("/api/auth/setup", { method: "POST", body: json({ username: "second", email: "second@example.com", password: ownerPassword, confirmPassword: ownerPassword }) });
  assert(response.status === 409, "setup must reject a second bootstrap attempt");

  response = await request("/api/auth/setup", { method: "POST", body: json({ username: "weak", email: "weak@example.com", password: "weak", confirmPassword: "weak" }) });
  assert(response.status === 409, "completed setup must not disclose or revalidate bootstrap credentials");

  response = await request("/api/auth/login", { method: "POST", body: json({ username: "owner", password: ownerPassword }) });
  body = await response.json();
  assert(response.status === 200 && body.user?.role === "owner" && body.token, "Owner must be able to log in");
  const ownerToken = body.token;
  const ownerHeaders = { authorization: `Bearer ${ownerToken}` };

  response = await request("/api/auth/logout", { method: "POST", headers: ownerHeaders });
  assert(response.status === 200, "logout endpoint must succeed");
  response = await request("/api/auth/login", { method: "POST", body: json({ username: "owner", password: ownerPassword }) });
  body = await response.json();
  assert(response.status === 200 && body.user?.role === "owner", "Owner must be able to log in again after logout");
  const ownerTokenAgain = body.token;
  const ownerAgainHeaders = { authorization: `Bearer ${ownerTokenAgain}` };

  const normalPassword = "Normal-Test-Password!42";
  const currentUsers = await fs.readJson(path.join(dataDir, "users.json"));
  const ownerId = currentUsers[0].id;
  response = await request("/api/system/users", { method: "POST", headers: ownerAgainHeaders, body: json({ username: "normal", password: normalPassword, role: "user" }) });
  assert(response.status === 200, "Owner must be able to create a normal user");

  response = await request("/api/auth/login", { method: "POST", body: json({ username: "normal", password: normalPassword }) });
  body = await response.json();
  assert(response.status === 200 && body.user?.role === "user", "normal user must be able to log in");
  const normalHeaders = { authorization: `Bearer ${body.token}` };

  await fs.writeJson(path.join(dataDir, "servers.json"), [
    { id: "owner-server", name: "Owner Server", owner: ownerId, nodeId: "local", containerId: null },
    { id: "other-server", name: "Other Server", owner: "user-other", nodeId: "local", containerId: null },
  ]);
  const checks: Array<[string, RequestInit, number, string]> = [
    ["/api/system/users", { headers: ownerAgainHeaders }, 200, "Owner users access"],
    ["/api/nodes", { headers: ownerAgainHeaders }, 200, "Owner nodes access"],
    ["/api/admin/api-keys", { headers: ownerAgainHeaders }, 200, "Owner API key access"],
    ["/api/system/settings", { method: "PUT", headers: ownerAgainHeaders, body: json({ panelName: "ShiroNex Test" }) }, 200, "Owner settings access"],
    ["/api/servers/other-server/backups", { headers: ownerAgainHeaders }, 200, "Owner backup access"],
    ["/api/system/users", { headers: normalHeaders }, 403, "normal user users denial"],
    ["/api/nodes", { headers: normalHeaders }, 403, "normal user nodes denial"],
    ["/api/admin/api-keys", { headers: normalHeaders }, 403, "normal user API key denial"],
    ["/api/system/settings", { method: "PUT", headers: normalHeaders, body: json({ panelName: "Should Not Apply" }) }, 403, "normal user settings denial"],
    ["/api/servers/other-server/backups", { headers: normalHeaders }, 403, "normal user foreign backup denial"],
    ["/api/servers/other-server/start", { method: "POST", headers: normalHeaders }, 403, "normal user foreign server control denial"],
  ];
  for (const [url, options, expected, label] of checks) {
    response = await request(url, options);
    assert(response.status === expected, `${label}: expected ${expected}, received ${response.status}`);
  }

  response = await request("/api/servers", { headers: ownerAgainHeaders });
  body = await response.json();
  assert(response.status === 200 && body.length === 2, "Owner must see all servers");
  response = await request("/api/servers", { headers: normalHeaders });
  body = await response.json();
  assert(response.status === 200 && body.length === 0, "normal user must not see unrelated servers");

  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  console.log("first-run Owner setup integration tests: PASS");
} finally {
  await cleanup();
}
