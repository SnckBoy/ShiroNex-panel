import "dotenv/config";
import express from "express";
import path from "path";
import cors from "cors";
import { createServer as createHttpServer } from "http";
import { createServer as createHttpsServer } from "https";
import { Server as SocketIOServer } from "socket.io";
import { createServer as createViteServer } from "vite";
import fs from "fs-extra";
import jwt from "jsonwebtoken";
import { TarArchive } from "archiver";

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  console.error(
    "\n[FATAL] JWT_SECRET is missing or too short in your .env file.\n" +
    "Generate one and add it, e.g.:\n" +
    "  echo \"JWT_SECRET=$(openssl rand -hex 32)\" >> .env\n" +
    "(install.sh does this automatically for you.)\n"
  );
  process.exit(1);
}

const app = express();
const httpServer = process.env.PANEL_TLS_KEY && process.env.PANEL_TLS_CERT ? createHttpsServer({key:fs.readFileSync(process.env.PANEL_TLS_KEY),cert:fs.readFileSync(process.env.PANEL_TLS_CERT)},app) : createHttpServer(app);
export const io = new SocketIOServer(httpServer, {
  cors: { origin: "*" },
});
app.set("io", io);

// Initialize data folders
const DATA_DIR = path.join(process.cwd(), ".data");
const SERVERS_DIR = path.join(DATA_DIR, "servers");
const BACKUPS_DIR = path.join(process.cwd(), "backups");

fs.ensureDirSync(DATA_DIR);
fs.ensureDirSync(SERVERS_DIR);
fs.ensureDirSync(BACKUPS_DIR);
fs.ensureDirSync(path.join(DATA_DIR, "temp"));

if (!fs.existsSync(path.join(DATA_DIR, "users.json"))) fs.writeFileSync(path.join(DATA_DIR, "users.json"), "[]");
if (!fs.existsSync(path.join(DATA_DIR, "servers.json"))) fs.writeFileSync(path.join(DATA_DIR, "servers.json"), "[]");
if (!fs.existsSync(path.join(DATA_DIR, "settings.json"))) fs.writeFileSync(path.join(DATA_DIR, "settings.json"), "{}");

import { attachContainerSocket, getContainerLogs, setSocketIO } from "./src/server/services/docker.js";
setSocketIO(io);
import { getJwtSecret } from "./src/server/services/security.js";

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error("Authentication error"));
  try {
    const verified = jwt.verify(token, getJwtSecret());
    (socket as any).user = verified;
    next();
  } catch (err) {
    next(new Error("Authentication error"));
  }
});

io.on("connection", (socket) => {
  socket.on("joinServer", async (serverId) => {
    socket.join(`server_${serverId}`);
    
    // Ensure logs are streamed if container is already running
    try {
      const serversJSON = await fs.readFile(path.join(DATA_DIR, "servers.json"), "utf8");
      const servers = JSON.parse(serversJSON);
      const server = Array.isArray(servers) ? servers.find((s: any) => s.id === serverId) : null;
      if (server && server.containerId) {
        const logs = await getContainerLogs(server.containerId, server.nodeId);
        if (logs) {
           socket.emit("log", logs.trim() + "\n");
        }
        await attachContainerSocket(server.containerId, serverId, server.nodeId);
      }
      if(server && server.containerId && server.nodeId && server.nodeId !== "local"){
        const poll=setInterval(async()=>{try{const latest=await getContainerLogs(server.containerId,server.nodeId);if(latest)socket.emit("log",latest)}catch{}},3000);
        (socket.data as any).logPolls=(socket.data as any).logPolls||{};(socket.data as any).logPolls[serverId]=poll;
      }
    } catch (e) {
      console.error(e);
    }
  });
  socket.on("leaveServer", (serverId) => {
    const poll=(socket.data as any).logPolls?.[serverId];if(poll)clearInterval(poll);
    socket.leave(`server_${serverId}`);
  });
});

const PORT = Number(process.env.PORT || 6767);
const HOST = process.env.HOST || "0.0.0.0";

// Actual file uploads go through multer (disk-backed, see servers.ts), which never
// touches these parsers. A 50gb limit here only meant any client could send an
// oversized JSON/form body and exhaust server RAM before a single upload happened.
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cors());
app.get("/health", (_req, res) => res.json({ ok: true, service: "shironex-panel", timestamp: new Date().toISOString() }));

import apiRoutes from "./src/server/routes/api.js";
app.use("/api", apiRoutes);

// Public bootstrap artifacts used by the one-time node setup command. The setup
// token itself is still validated by /api/node-agent/register and expires quickly.
app.get("/node.sh", (_req, res) => {
  const installer = path.join(process.cwd(), "node-daemon", "install.sh");
  if (!fs.existsSync(installer)) return res.status(404).send("Node installer unavailable");
  res.type("text/x-shellscript").send(fs.readFileSync(installer, "utf8"));
});

app.get("/shironex-node.tar.gz", (_req, res) => {
  const daemonDir = path.join(process.cwd(), "node-daemon");
  if (!fs.existsSync(path.join(daemonDir, "package.json"))) return res.status(404).send("Node daemon unavailable");
  res.type("application/gzip");
  const archive = new TarArchive({ gzip: true });
  archive.on("error", (err: Error) => {
    console.error("Node bundle archive error:", err);
    if (!res.headersSent) res.status(500);
    res.end();
  });
  archive.pipe(res);
  for (const file of ["package.json", "tsconfig.json", "update.sh", "uninstall.sh"]) {
    const fullPath = path.join(daemonDir, file);
    if (fs.existsSync(fullPath)) archive.file(fullPath, { name: file });
  }
  archive.directory(path.join(daemonDir, "src"), "src");
  archive.finalize();
});

import { initSFTPServer } from "./src/server/services/sftp.js";

async function startServer() {
  await initSFTPServer();

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, HOST, () => {
    console.log(`ShiroNex Panel running on http://${HOST}:${PORT}`);
  });
}

startServer();

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
  fs.writeFileSync('crash.log', String(err.stack));
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION:', reason);
  fs.writeFileSync('crash.log', String(reason));
});
