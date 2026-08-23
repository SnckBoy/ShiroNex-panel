import "dotenv/config";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import fs from "fs-extra";
import path from "path";
import readline from "readline";
import { execSync } from "child_process";

const DATA_DIR = path.join(process.cwd(), ".data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const TTY_PATH = "/dev/tty";

type Role = "owner" | "admin" | "user";

const rl = readline.createInterface({
  input: fs.createReadStream(TTY_PATH),
  output: process.stdout,
  terminal: true,
});

const ask = (question: string) => new Promise<string>((resolve) => rl.question(question, resolve));
const askHidden = async (question: string) => {
  try {
    execSync("stty -echo </dev/tty");
    return await ask(question);
  } finally {
    execSync("stty echo </dev/tty", { stdio: "ignore" });
    process.stdout.write("\n");
  }
};

const validUsername = (value: string) => /^[A-Za-z0-9_.-]{3,32}$/.test(value);
const validEmail = (value: string) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const validPassword = (value: string) => value.length >= 8 && value.length <= 256;

async function main() {
  await fs.ensureDir(DATA_DIR);
  if (!(await fs.pathExists(USERS_FILE))) await fs.writeJson(USERS_FILE, [], { spaces: 2 });

  const users = await fs.readJson(USERS_FILE);
  if (!Array.isArray(users)) throw new Error(".data/users.json must contain a JSON array");

  console.log("=== ShiroNex User Management ===");
  console.log("Passwords must be at least 8 characters and are stored as bcrypt hashes.");

  let keepGoing = true;
  while (keepGoing) {
    const username = (await ask("Username: ")).trim();
    if (!validUsername(username)) throw new Error("Username must be 3-32 characters using letters, numbers, dots, underscores, or hyphens.");

    const email = (await ask("Email (optional): ")).trim().toLowerCase();
    if (!validEmail(email)) throw new Error("Enter a valid email address or leave it empty.");

    const password = await askHidden("Password: ");
    if (!validPassword(password)) throw new Error("Password must be 8-256 characters.");
    const confirmPassword = await askHidden("Confirm password: ");
    if (password !== confirmPassword) throw new Error("Passwords do not match.");

    const existingIndex = users.findIndex((user: any) => user.username?.toLowerCase() === username.toLowerCase());
    const existing = existingIndex >= 0 ? users[existingIndex] : undefined;
    let role: Role = "user";

    if (users.length === 0) {
      role = "owner";
      console.log("No users exist. This first account will be created as Owner.");
    } else {
      const requestedRole = (await ask("Role [owner/admin/user] (default user): ")).trim().toLowerCase() || "user";
      if (!["owner", "admin", "user"].includes(requestedRole)) throw new Error("Role must be owner, admin, or user.");
      role = requestedRole as Role;
    }

    const record = {
      ...(existing || {}),
      id: existing?.id || `user-${crypto.randomUUID()}`,
      username,
      ...(email ? { email } : {}),
      password: await bcrypt.hash(password, 12),
      role,
      passwordVersion: existing?.passwordVersion || 0,
      createdAt: existing?.createdAt || new Date().toISOString(),
    };

    if (existingIndex >= 0) users[existingIndex] = record;
    else users.push(record);
    await fs.writeJson(USERS_FILE, users, { spaces: 2 });
    console.log(existing ? `User ${username} updated successfully.` : `User ${username} created successfully.`);

    keepGoing = (await ask("Create another user? [y/N] ")).trim().toLowerCase() === "y";
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "User management failed.");
    process.exitCode = 1;
  })
  .finally(() => rl.close());
