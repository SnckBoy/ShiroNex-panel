import { Request, Response } from "express";
import axios from "axios";
import { readJSON, writeJSON } from "../services/db.js";
import { createServerContainer, startContainer, stopContainer, restartContainer, deleteContainer, getContainerStatus, sendContainerCommand, attachContainerSocket, getContainerStats, SUPPORTED_JAVA_VERSIONS } from "../services/docker.js";
import { createSftpUser, deleteSftpUser } from "../services/sftp.js";
import crypto from "crypto";
import fs from "fs-extra";
import path from "path";
import { ZipArchive } from "archiver";
import extract from "extract-zip";
import {decryptSecret} from "../services/security.js";
import {nodeControl} from "../services/nodeClient.js";
import {audit} from "../services/security.js";
import { copyDirectorySafely, extractZipSafely } from "../services/archiveSafety.js";


const remoteForServer=async(server:any)=>{
 if(!server?.nodeId||server.nodeId==="local") return null;
 const nodes=await readJSON("nodes.json")||[]; const n=nodes.find((x:any)=>x.id===server.nodeId);
 if(!n) throw new Error("Node not found");
 return {id:n.id,baseUrl:`${n.tls===false?"http":"https"}://${n.fqdn||n.hostname}:${n.apiPort}`,credential:decryptSecret(n.credential)};
};

const canManageServer = (req: Request, server: any) => {
  const user = (req as any).user;
  return user?.role === "admin" || user?.role === "owner" || server?.owner === user?.id;
};

export const getServers = async (req: Request, res: Response) => {
  const user = (req as any).user;
  const servers = await readJSON("servers.json") || [];
  
  // Filter for normal users
  const userServers = user.role === "admin" || user.role === "owner" ? servers : servers.filter((s: any) => s.owner === user.id);

  // Update statuses
  const updatedServers = await Promise.all(userServers.map(async (server: any) => {
    if (server.containerId) {
      const status = await getContainerStatus(server.containerId, server.nodeId);
      server.status = status?.State?.Running ? "online" : "offline";
    }
    return server;
  }));

  res.json(updatedServers);
};

export const getServer = async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = (req as any).user;
  const servers = await readJSON("servers.json") || [];
  const server = servers.find((s: any) => s.id === id);
  if (!server) {
    res.status(404).json({ error: "Server not found" });
    return;
  }
  if (user.role !== "admin" && user.role !== "owner" && server.owner !== user.id) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const status = await getContainerStatus(server.containerId, server.nodeId);
  server.status = status?.State?.Running ? "online" : "offline";
  res.json(server);
};

export const getServerStats = async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = (req as any).user;
  const servers = await readJSON("servers.json") || [];
  const server = servers.find((s: any) => s.id === id);
  if (!server) {
    res.status(404).json({ error: "Server not found" });
    return;
  }
  if (user.role !== "admin" && user.role !== "owner" && server.owner !== user.id) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const limitRamBytes = server.ram ? Number(server.ram) * 1024 * 1024 * 1024 : null;
  const limitDiskBytes = server.disk ? Number(server.disk) * 1024 * 1024 * 1024 : null;
  if (server.containerId) {
    const stats = await getContainerStats(server.containerId, server.nodeId);
    res.json({
      ...stats,
      timestamp: stats?.timestamp ?? Date.now(),
      limitRamBytes,
      limitDiskBytes,
      limitCpu: server.cpu ? Number(server.cpu) : null,
      // Legacy fields remain for older clients; new clients use the byte fields above.
      limitRam: server.ram ? Number(server.ram) * 1024 : null,
      limitDisk: server.disk ? Number(server.disk) : null,
    });
  } else {
    res.json({
      available: false,
      timestamp: Date.now(),
      cpu: null,
      ram: null,
      disk: null,
      networkRxBytes: null,
      networkTxBytes: null,
      limitRamBytes,
      limitDiskBytes,
      limitCpu: server.cpu ? Number(server.cpu) : null,
      limitRam: server.ram ? Number(server.ram) * 1024 : null,
      limitDisk: server.disk ? Number(server.disk) : null,
    });
  }
};

export const createServer = async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (user.role !== "admin" && user.role !== "owner") {
    return res.status(403).json({ error: "Only admins can create servers" });
  }
  const { name, ram, port, version, theme, cpu, disk, owner, ipAlias, type, nodeId, allocationId, javaVersion } = req.body;
  const normalizedJavaVersion = javaVersion ? String(javaVersion) : "";
  if (normalizedJavaVersion && !SUPPORTED_JAVA_VERSIONS.includes(normalizedJavaVersion as typeof SUPPORTED_JAVA_VERSIONS[number])) {
    return res.status(400).json({ error: `Unsupported Java version. Choose one of: ${SUPPORTED_JAVA_VERSIONS.join(", ")}` });
  }
  if (!name || !ram || !port) {
    res.status(400).json({ error: "Missing required fields (name, ram, port)" });
    return;
  }

  const allocations = await readJSON("allocations.json") || [];
  let selectedAllocation:any = null;
  if (nodeId && nodeId !== "local") {
    if (!allocationId) return res.status(400).json({ error: "An allocation is required for a remote node." });
    selectedAllocation = allocations.find((a:any)=>a.id===allocationId && a.nodeId===nodeId && !a.assignedServerId);
    if (!selectedAllocation) return res.status(409).json({ error: "Allocation is unavailable or belongs to another node." });
    if (Number(port) < selectedAllocation.portStart || Number(port) > selectedAllocation.portEnd) return res.status(400).json({ error: "Server port is outside the selected allocation." });
  }
  const id = crypto.randomUUID();
  const serverData = {
    id,
    name,
    owner: owner || user.id, // Support assigning owner at creation
    ram,
    cpu: cpu || 100,
    disk: disk || 10,
    port,
    ipAlias: ipAlias || "",
    nodeId: nodeId || "local",
    type: type || "PAPER",
    version: version || "1.21.1",
    javaVersion: normalizedJavaVersion || "",
    theme: theme || "default",
    status: "installing",
    createdAt: new Date().toISOString(),
    containerId: null as string | null,
  };

  const servers = await readJSON("servers.json") || [];
  
  if (servers.find((s: any) => s.port == port)) {
    res.status(400).json({ error: "Port is already in use by another server." });
    return;
  }

  servers.push(serverData);
  await writeJSON("servers.json", servers);
  if (selectedAllocation) { selectedAllocation.assignedServerId = id; await writeJSON("allocations.json", allocations); }

  try {
    const containerId = await createServerContainer(serverData);
    serverData.containerId = containerId;
    serverData.status = "offline";
    await writeJSON("servers.json", Object.assign(servers, servers.map((s:any)=>s.id===id?serverData:s)));
    await createSftpUser(id).catch(e => console.error("SFTP user creation failed:", e));
    await audit("server.created",req,{serverId:id,nodeId:serverData.nodeId});
    res.json(serverData);
  } catch (err: any) {
    console.error(err);
    if (selectedAllocation) { selectedAllocation.assignedServerId = null; await writeJSON("allocations.json", allocations); }
    const current = await readJSON("servers.json") || []; await writeJSON("servers.json", current.filter((x:any)=>x.id!==id));
    res.status(500).json({ error: err.message });
  }
};

export const updateOwner = async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (user.role !== "admin" && user.role !== "owner") {
    return res.status(403).json({ error: "Only admins can update owner" });
  }

  const { id } = req.params;
  const { owner } = req.body;

  if (!owner) return res.status(400).json({ error: "Owner required" });

  const servers = await readJSON("servers.json") || [];
  const server = servers.find((s: any) => s.id === id);

  if (!server) return res.status(404).json({ error: "Server not found" });

  server.owner = owner;
  await writeJSON("servers.json", servers);
  
  res.json({ success: true });
};

export const updateIpAlias = async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { id } = req.params;
  const { ipAlias } = req.body;

  const servers = await readJSON("servers.json") || [];
  const server = servers.find((s: any) => s.id === id);

  if (!server) return res.status(404).json({ error: "Server not found" });

  if (user.role !== "admin" && user.role !== "owner" && server.owner !== user.id) {
    return res.status(403).json({ error: "Forbidden" });
  }

  server.ipAlias = ipAlias;
  await writeJSON("servers.json", servers);
  
  res.json({ success: true });
};

export const deleteServer = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = (req as any).user;
    
    let servers = await readJSON("servers.json") || [];
    const server = servers.find((s: any) => s.id === id);
    
    if (!server) {
      return res.status(404).json({ error: "Server not found" });
    }

    if (user.role !== "admin" && user.role !== "owner") {
      return res.status(403).json({ error: "Only admins can delete servers" });
    }

    if (server.containerId) {
      await deleteContainer(server.containerId, server.nodeId);
    }
    
    servers = servers.filter((s: any) => s.id !== id);
    await writeJSON("servers.json", servers);
    
    // Remove files
    const serverDir = path.join(process.cwd(), ".data", "servers", id);
    try {
      await fs.remove(serverDir);
    } catch (e) {
      console.error("Failed to remove server directory", e);
    }
    
    await deleteSftpUser(id).catch(e => console.error("SFTP user deletion failed:", e));
    
    await audit("server.deleted",req,{serverId:id,nodeId:server.nodeId});
    res.json({ success: true });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

export const startServer = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const servers = await readJSON("servers.json") || [];
    
    const server = servers.find((s: any) => s.id === id);
    if (!server || !server.containerId) {
      return res.status(404).json({ error: "Not found" });
    }
    if (!canManageServer(req, server)) return res.status(403).json({ error: "Forbidden" });
    if (server.suspended) {
      return res.status(403).json({ error: "Server is suspended" });
    }

    try {
      const io = req.app.get("io");
      if (io) io.to(`server_${id}`).emit("clear_logs");
      
      await startContainer(server.containerId, server.nodeId);
    } catch (startErr: any) {
      if (startErr.statusCode === 404 || (startErr.message && startErr.message.toLowerCase().includes("no such container"))) {
        console.log(`Container missing for server ${server.id}. Recreating...`);
        server.containerId = await createServerContainer(server);
        await writeJSON("servers.json", servers);
        await startContainer(server.containerId, server.nodeId);
      } else {
        throw startErr;
      }
    }
    await attachContainerSocket(server.containerId, server.id, server.nodeId);
    await audit("server.started",req,{serverId:id,nodeId:server.nodeId});
    res.json({ success: true });
  } catch (err: any) {
    console.error("Start server error:", err);
    res.status(500).json({ error: err.message || "Failed to start server" });
  }
};

export const stopServer = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const servers = await readJSON("servers.json") || [];
    const server = servers.find((s: any) => s.id === id);
    if (!server || !server.containerId) {
      return res.status(404).json({ error: "Not found" });
    }
    if (!canManageServer(req, server)) return res.status(403).json({ error: "Forbidden" });
    try {
      await stopContainer(server.containerId, server.nodeId);
    } catch (stopErr: any) {
      if (stopErr.statusCode === 404 || (stopErr.message && stopErr.message.toLowerCase().includes("no such container"))) {
        console.log(`Container already missing for server ${server.id}. Assuming stopped.`);
      } else {
        throw stopErr;
      }
    }
    await audit("server.stopped",req,{serverId:id,nodeId:server.nodeId});
    res.json({ success: true });
  } catch (err: any) {
    console.error("Stop server error:", err);
    res.status(500).json({ error: err.message || "Failed to stop server" });
  }
};

export const restartServer = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const servers = await readJSON("servers.json") || [];
    const server = servers.find((s: any) => s.id === id);
    if (!server || !server.containerId) {
      return res.status(404).json({ error: "Not found" });
    }
    if (!canManageServer(req, server)) return res.status(403).json({ error: "Forbidden" });
    if (server.suspended) return res.status(403).json({ error: "Server is suspended" });
    try {
      const io = req.app.get("io");
      if (io) io.to(`server_${id}`).emit("clear_logs");

      await restartContainer(server.containerId, server.nodeId);
    } catch (startErr: any) {
      if (startErr.statusCode === 404 || (startErr.message && startErr.message.toLowerCase().includes("no such container"))) {
        console.log(`Container missing for server ${server.id}. Recreating...`);
        server.containerId = await createServerContainer(server);
        await writeJSON("servers.json", servers);
        await startContainer(server.containerId, server.nodeId);
      } else {
        throw startErr;
      }
    }
    await attachContainerSocket(server.containerId, server.id, server.nodeId);
    await audit("server.restarted",req,{serverId:id,nodeId:server.nodeId});
    res.json({ success: true });
  } catch (err: any) {
    console.error("Restart server error:", err);
    res.status(500).json({ error: err.message || "Failed to restart server" });
  }
};

export const sendCommand = async (req: Request, res: Response) => {
  
  try {
    const { id } = req.params;
    const { command } = req.body;
    const servers = await readJSON("servers.json") || [];
    const server = servers.find((s: any) => s.id === id);
    if (!server || !server.containerId) {
      return res.status(404).json({ error: "Not found" });
    }
    if (!canManageServer(req, server)) return res.status(403).json({ error: "Forbidden" });
    if (typeof command !== "string" || command.length === 0 || command.length > 4096) return res.status(400).json({ error: "Invalid command" });
    await sendContainerCommand(server.containerId, command, server.nodeId);
    res.json({ success: true });
  } catch (err: any) {
    console.error("Command error:", err);
    res.status(500).json({ error: err.message || "Failed to send command" });
  }
};

export const changeServerVersion = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { version, type, javaVersion } = req.body;
    const user = (req as any).user;
    const normalizedJavaVersion = javaVersion ? String(javaVersion) : "";
    
    if (!version) return res.status(400).json({ error: "Version is required" });
    if (normalizedJavaVersion && !SUPPORTED_JAVA_VERSIONS.includes(normalizedJavaVersion as typeof SUPPORTED_JAVA_VERSIONS[number])) {
      return res.status(400).json({ error: `Unsupported Java version. Choose one of: ${SUPPORTED_JAVA_VERSIONS.join(", ")}` });
    }
    
    let servers = await readJSON("servers.json") || [];
    const server = servers.find((s: any) => s.id === id);
    
    if (!server) {
      return res.status(404).json({ error: "Server not found" });
    }

    if (user.role !== "admin" && user.role !== "owner" && server.owner !== user.id) {
      return res.status(403).json({ error: "Only admins or owners can change version" });
    }

    if (server.containerId) {
      const status = await getContainerStatus(server.containerId, server.nodeId);
      if (status?.State?.Running) {
        return res.status(400).json({ error: "Server must be stopped before changing version. Please stop the server first." });
      }
      // Delete old container
      await deleteContainer(server.containerId, server.nodeId);
    }
    
    // Automatically delete config files to avoid issues when switching versions/types
    const serverDir = path.join(process.cwd(), ".data", "servers", id);
    const filesToDelete = [
      "paper-global.yml", "paper-world-defaults.yml", "paper.yml",
      "config/paper-global.yml", "config/paper-world-defaults.yml",
      "world/data/random_sequences.dat"
    ];
    
    for (const file of filesToDelete) {
      const filePath = path.join(serverDir, file);
      try {
        if (await fs.pathExists(filePath)) {
          await fs.remove(filePath);
        }
      } catch (e) {
        console.error(`Failed to delete ${file}`, e);
      }
    }
    
    server.version = version;
    if (type) {
      server.type = type;
    }
    server.javaVersion = normalizedJavaVersion;
    // Recreate container with new version env
    const newContainerId = await createServerContainer(server);
    server.containerId = newContainerId;
    
    await writeJSON("servers.json", servers);
    
    res.json({ success: true, version, type: server.type });
  } catch (err: any) {
    console.error("Change version error", err);
    res.status(500).json({ error: err.message });
  }
};

export const changeJavaVersion = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const requested = String(req.body?.javaVersion || "");
    const user = (req as any).user;
    if (!SUPPORTED_JAVA_VERSIONS.includes(requested as typeof SUPPORTED_JAVA_VERSIONS[number])) {
      return res.status(400).json({ error: `Unsupported Java version. Choose one of: ${SUPPORTED_JAVA_VERSIONS.join(", ")}` });
    }

    const servers = await readJSON("servers.json") || [];
    const server = servers.find((candidate: any) => candidate.id === id);
    if (!server) return res.status(404).json({ error: "Server not found" });
    if (!canManageServer(req, server)) return res.status(403).json({ error: "Only admins, owners, or the server owner can change Java" });
    if (String(server.javaVersion || "") === requested) return res.json({ success: true, javaVersion: requested, unchanged: true });

    if (server.containerId) {
      const status = await getContainerStatus(server.containerId, server.nodeId);
      if (status?.State?.Running) {
        return res.status(400).json({ error: "Server must be stopped before changing Java. Please stop the server first." });
      }
      await deleteContainer(server.containerId, server.nodeId);
    }

    server.javaVersion = requested;
    server.containerId = await createServerContainer(server);
    await writeJSON("servers.json", servers);
    await audit("server.java_version_changed", req, { serverId: id, javaVersion: requested });
    res.json({ success: true, javaVersion: requested, containerId: server.containerId });
  } catch (err: any) {
    console.error("Change Java version error", err);
    res.status(500).json({ error: err.message || "Failed to change Java version" });
  }
};

// File manager basics
export const getFiles = async (req: Request, res: Response) => {
  const { id } = req.params;
  const servers=await readJSON("servers.json")||[]; const server=servers.find((x:any)=>x.id===id); const remote=await remoteForServer(server);
  const dirPath = req.query.path ? String(req.query.path) : "/";
  if(remote){ try { const data=await nodeControl.files(remote,id,"list",{path:dirPath}); return res.json(data); } catch(e:any){ return res.status(502).json({error:e.message}); } }
  const targetPath = path.join(process.cwd(), ".data", "servers", id, dirPath);
  
  if (!targetPath.startsWith(path.join(process.cwd(), ".data", "servers", id))) {
    return res.status(403).json({ error: "Invalid path" });
  }

  try {
    const stats = await fs.stat(targetPath).catch(() => null);
    if (!stats) {
      // Return empty if not found
      return res.json([]);
    }
    if (stats.isFile()) {
       const content = await fs.readFile(targetPath, "utf-8");
       return res.json({ isFile: true, content });
    }
    const files = await fs.readdir(targetPath, { withFileTypes: true });
    res.json(files.map(f => ({
      name: f.name,
      isDirectory: f.isDirectory(),
      size: f.isDirectory() ? 0 : fs.statSync(path.join(targetPath, f.name)).size
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const uploadFile = async (req: Request, res: Response) => {
  const { id } = req.params;
  const dirPath = req.body.path || "/";
  const targetPath = path.join(process.cwd(), ".data", "servers", id, dirPath);
  
  if (req.file) {
    await fs.ensureDir(targetPath);
    await fs.move(req.file.path, path.join(targetPath, req.file.originalname), { overwrite: true });
  }
  res.json({ success: true });
};

export const deleteFile = async (req: Request, res: Response) => {
  const { id } = req.params;
  const filePaths = req.body.paths || (req.body.path ? [req.body.path] : []);
  const server=(await readJSON("servers.json")||[]).find((x:any)=>x.id===id); const remote=await remoteForServer(server);
  if(remote){try{return res.json(await nodeControl.files(remote,id,"delete",{paths:filePaths}))}catch(e:any){return res.status(502).json({error:e.message})}}
  
  try {
    for (const filePath of filePaths) {
      const targetPath = path.join(process.cwd(), ".data", "servers", id, filePath);
      
      if (!targetPath.startsWith(path.join(process.cwd(), ".data", "servers", id))) {
        return res.status(403).json({ error: "Invalid path" });
      }
      
      await fs.remove(targetPath);
    }
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

export const zipFiles = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { dirPath, fileNames, outputName } = req.body;
  
  const baseDir = path.join(process.cwd(), ".data", "servers", id, dirPath);
  const outZipPath = path.join(baseDir, outputName || "archive.zip");

  if (!baseDir.startsWith(path.join(process.cwd(), ".data", "servers", id))) {
    return res.status(403).json({ error: "Invalid path" });
  }

  try {
    const output = fs.createWriteStream(outZipPath);
    const archive = new ZipArchive({ zlib: { level: 9 } });

    output.on("close", () => {
      res.json({ success: true, filename: outputName || "archive.zip" });
    });

    archive.on("error", (err: any) => {
      console.error("Archive error:", err);
      if (!res.headersSent) res.status(500).json({ error: err.message });
    });

    archive.pipe(output);

    for (const name of fileNames) {
      const filePath = path.join(baseDir, name);
      const stat = await fs.stat(filePath);
      if (stat.isDirectory()) {
        archive.directory(filePath, name);
      } else {
        archive.file(filePath, { name });
      }
    }

    await archive.finalize();
  } catch (e: any) {
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
};

export const renameFile = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { oldPath, newPath } = req.body;
  const server=(await readJSON("servers.json")||[]).find((x:any)=>x.id===id); const remote=await remoteForServer(server);
  if(remote){try{return res.json(await nodeControl.files(remote,id,"rename",{oldPath,newPath}))}catch(e:any){return res.status(502).json({error:e.message})}}

  const targetOldPath = path.join(process.cwd(), ".data", "servers", id, oldPath);
  const targetNewPath = path.join(process.cwd(), ".data", "servers", id, newPath);

  if (!targetOldPath.startsWith(path.join(process.cwd(), ".data", "servers", id)) ||
      !targetNewPath.startsWith(path.join(process.cwd(), ".data", "servers", id))) {
    return res.status(403).json({ error: "Invalid path" });
  }

  try {
    await fs.rename(targetOldPath, targetNewPath);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}

export const downloadFile = async (req: Request, res: Response) => {
  const { id } = req.params;
  let rawPaths: string[] = [];
  if (req.query.paths) {
    rawPaths = Array.isArray(req.query.paths) ? (req.query.paths as string[]) : String(req.query.paths).split(",");
  } else if (req.query.path) {
    rawPaths = [String(req.query.path)];
  }

  if (rawPaths.length === 0) {
    return res.status(400).json({ error: "No path specified" });
  }

  const serverBaseDir = path.join(process.cwd(), ".data", "servers", id);

  try {
    if (rawPaths.length === 1) {
      const singlePath = rawPaths[0];
      const targetPath = path.join(serverBaseDir, singlePath);

      if (!targetPath.startsWith(serverBaseDir)) {
        return res.status(403).json({ error: "Invalid path" });
      }

      const stat = await fs.stat(targetPath);
      if (!stat.isDirectory()) {
        return res.download(targetPath, path.basename(targetPath));
      }
    }

    // Multiple items OR a single directory -> stream as ZIP
    const zipName = rawPaths.length === 1 
      ? `${path.basename(rawPaths[0]) || "folder"}.zip`
      : `download-${Date.now()}.zip`;

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${zipName}"`);

    const archive = new ZipArchive({ zlib: { level: 9 } });
    archive.on("error", (err: any) => {
      if (!res.headersSent) res.status(500).json({ error: err.message });
    });
    archive.pipe(res);

    for (const relPath of rawPaths) {
      const targetPath = path.join(serverBaseDir, relPath);
      if (!targetPath.startsWith(serverBaseDir)) continue;
      const itemName = path.basename(targetPath);
      const stat = await fs.stat(targetPath).catch(() => null);
      if (!stat) continue;

      if (stat.isDirectory()) {
        archive.directory(targetPath, itemName);
      } else {
        archive.file(targetPath, { name: itemName });
      }
    }

    await archive.finalize();
  } catch (e: any) {
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
};

export const unzipFile = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { path: filePath } = req.body;

  const targetPath = path.join(process.cwd(), ".data", "servers", id, filePath);
  
  if (!targetPath.startsWith(path.join(process.cwd(), ".data", "servers", id))) {
    return res.status(403).json({ error: "Invalid path" });
  }

  try {
    const destDir = path.dirname(targetPath);
    await extract(targetPath, { dir: destDir });
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};


export const createFile = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { filePath } = req.body;
  const targetPath = path.join(process.cwd(), ".data", "servers", id, filePath);
  if (!targetPath.startsWith(path.join(process.cwd(), ".data", "servers", id))) {
    return res.status(403).json({ error: "Invalid path" });
  }
  try {
    await fs.writeFile(targetPath, "", "utf-8");
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

export const createDirectory = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { filePath } = req.body;
  const server=(await readJSON("servers.json")||[]).find((x:any)=>x.id===id); const remote=await remoteForServer(server);
  if(remote){try{return res.json(await nodeControl.files(remote,id,"mkdir",{path:filePath}))}catch(e:any){return res.status(502).json({error:e.message})}}
  const targetPath = path.join(process.cwd(), ".data", "servers", id, filePath);
  if (!targetPath.startsWith(path.join(process.cwd(), ".data", "servers", id))) {
    return res.status(403).json({ error: "Invalid path" });
  }
  try {
    await fs.mkdir(targetPath, { recursive: true });
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

export const saveFileContent = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { filePath, content } = req.body;
  const server=(await readJSON("servers.json")||[]).find((x:any)=>x.id===id); const remote=await remoteForServer(server);
  if(remote){try{return res.json(await nodeControl.files(remote,id,"write",{path:filePath,content}))}catch(e:any){return res.status(502).json({error:e.message})}}

  const targetPath = path.join(process.cwd(), ".data", "servers", id, filePath);

  if (!targetPath.startsWith(path.join(process.cwd(), ".data", "servers", id))) {
    return res.status(403).json({ error: "Invalid path" });
  }

  try {
    await fs.writeFile(targetPath, content, "utf-8");
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}

export const getBackups = async (req: Request, res: Response) => {
  const { id } = req.params;
  const backupsDir = path.join(process.cwd(), ".data", "backups", id);
  await fs.ensureDir(backupsDir);

  try {
    const files = await fs.readdir(backupsDir);
    const backups = [];
    for (const file of files) {
      if (file.endsWith(".zip")) {
        const stats = await fs.stat(path.join(backupsDir, file));
        backups.push({
          filename: file,
          size: stats.size,
          createdAt: stats.birthtime,
        });
      }
    }
    backups.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    res.json(backups);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

export const createBackup = async (req: Request, res: Response) => {
  const { id } = req.params;
  const serverDir = path.join(process.cwd(), ".data", "servers", id);
  const backupsDir = path.join(process.cwd(), ".data", "backups", id);
  await fs.ensureDir(backupsDir);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `backup-${timestamp}.zip`;
  const backupPath = path.join(backupsDir, filename);

  try {
    const serverExists = await fs.pathExists(serverDir);
    if (!serverExists) {
       await fs.ensureDir(serverDir); // ensure it acts properly if empty
    }

    const output = fs.createWriteStream(backupPath);
    const archive = new ZipArchive({ zlib: { level: 9 } });

    output.on("close", () => {
      if (!res.headersSent) res.json({ success: true, filename });
    });

    archive.on("error", (err: any) => {
      console.error("Archive error:", err);
      if (!res.headersSent) res.status(500).json({ error: err.message });
    });

    archive.pipe(output);
    archive.directory(serverDir, false);
    await archive.finalize();
  } catch (e: any) {
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
};

export const downloadBackup = async (req: Request, res: Response) => {
  const { id, filename } = req.params;
  const backupPath = path.join(process.cwd(), ".data", "backups", id, filename);

  // basic path traversal prevention
  if (!backupPath.startsWith(path.join(process.cwd(), ".data", "backups", id))) {
    return res.status(403).send("Invalid path");
  }

  if (await fs.pathExists(backupPath)) {
    res.download(backupPath);
  } else {
    res.status(404).send("Backup not found");
  }
};

export const deleteBackup = async (req: Request, res: Response) => {
  const { id, filename } = req.params;
  const backupPath = path.join(process.cwd(), ".data", "backups", id, filename);

  if (!backupPath.startsWith(path.join(process.cwd(), ".data", "backups", id))) {
    return res.status(403).json({ error: "Invalid path" });
  }

  try {
    await fs.remove(backupPath);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};
export const installPlugin = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { source, pluginId, pluginName } = req.body;
  
  // Allow direct downloadUrl fallback for backward compatibility
  if (req.body.downloadUrl) {
     try {
        const serverDir = path.join(process.cwd(), ".data", "servers", id);
        const pluginsDir = path.join(serverDir, "plugins");
        await fs.ensureDir(pluginsDir);
        const filePath = path.join(pluginsDir, req.body.filename);
        if (req.body.downloadUrl === 'dummy') {
          await fs.writeFile(filePath, '');
        } else {
          const axios = (await import("axios")).default;
          const response = await axios({ url: req.body.downloadUrl, method: 'GET', responseType: 'stream' });
          const writer = fs.createWriteStream(filePath);
          response.data.pipe(writer);
          await new Promise<void>((resolve, reject) => { writer.on('finish', resolve); writer.on('error', reject); });
        }
        return res.json({ success: true, message: "Plugin installed successfully" });
     } catch(e) {
        return res.status(500).json({ error: "Failed to install plugin" });
     }
  }

  if (!source || !pluginId || !pluginName) {
    return res.status(400).json({ error: "Missing source, pluginId, or pluginName" });
  }

  try {
    const serverDir = path.join(process.cwd(), ".data", "servers", id);
    const pluginsDir = path.join(serverDir, "plugins");
    await fs.ensureDir(pluginsDir);
    
    let downloadUrl = null;
    let filename = `${pluginName.replace(/[^a-zA-Z0-9]/g, '_')}.jar`;
    const axios = (await import("axios")).default;

    const resolveGithubRelease = async (extUrl: string) => {
      if (extUrl.includes('github.com') && extUrl.includes('/releases/')) {
        let apiUrl = null;
        const match = extUrl.match(/github\.com\/([^\/]+)\/([^\/]+)\/releases\/tag\/([^\/]+)/);
        if (match) {
          apiUrl = `https://api.github.com/repos/${match[1]}/${match[2]}/releases/tags/${match[3]}`;
        } else {
          const matchLatest = extUrl.match(/github\.com\/([^\/]+)\/([^\/]+)\/releases\/latest/);
          if (matchLatest) {
            apiUrl = `https://api.github.com/repos/${matchLatest[1]}/${matchLatest[2]}/releases/latest`;
          }
        }
        if (apiUrl) {
          try {
            const ghRes = await axios.get(apiUrl);
            if (ghRes.data && ghRes.data.assets) {
              const jarAsset = ghRes.data.assets.find((a: any) => a.name.endsWith('.jar'));
              if (jarAsset) {
                return { url: jarAsset.browser_download_url, filename: jarAsset.name };
              }
            }
          } catch(e) {
            console.error('GitHub API error:', e);
          }
        }
      }
      return null;
    };

    if (source === 'modrinth') {
      const verRes = await axios.get(`https://api.modrinth.com/v2/project/${pluginId}/version`);
      if (verRes.data && verRes.data.length > 0) {
        const file = verRes.data[0].files.find((f: any) => f.primary) || verRes.data[0].files[0];
        if (file) {
           downloadUrl = file.url;
           filename = file.filename || filename;
        }
      }
    } else if (source === 'spigot') {
       const apiRes = await axios.get(`https://api.spiget.org/v2/resources/${pluginId}`);
       if (apiRes.data && apiRes.data.file) {
         if (apiRes.data.file.type === 'external' && apiRes.data.file.externalUrl) {
           const extUrl = apiRes.data.file.externalUrl;
           const ghAsset = await resolveGithubRelease(extUrl);
           if (ghAsset) {
             downloadUrl = ghAsset.url;
             filename = ghAsset.filename;
           }
           if (!downloadUrl) {
             return res.status(400).json({ error: "This plugin must be downloaded externally from: " + extUrl });
           }
         } else {
           downloadUrl = `https://api.spiget.org/v2/resources/${pluginId}/download`;
         }
       } else {
         downloadUrl = `https://api.spiget.org/v2/resources/${pluginId}/download`;
       }
    } else if (source === 'hangar') {
       const [owner, slug] = pluginId.split('/');
       const verRes = await axios.get(`https://hangar.papermc.io/api/v1/projects/${owner}/${slug}/versions`);
       if (verRes.data && verRes.data.result && verRes.data.result.length > 0) {
         const version = verRes.data.result[0];
         const download = version.downloads.PAPER || Object.values(version.downloads)[0];
         if (download && (download as any).downloadUrl) {
            downloadUrl = (download as any).downloadUrl;
            if ((download as any).fileInfo && (download as any).fileInfo.name) {
                filename = (download as any).fileInfo.name;
            }
         } else if (download && (download as any).externalUrl) {
            const extUrl = (download as any).externalUrl;
            const ghAsset = await resolveGithubRelease(extUrl);
            if (ghAsset) {
              downloadUrl = ghAsset.url;
              filename = ghAsset.filename;
            } else {
              return res.status(400).json({ error: "This plugin must be downloaded externally from: " + extUrl });
            }
         }
       }
    }

    if (!downloadUrl) {
      return res.status(404).json({ error: "Could not find a valid download URL for this plugin." });
    }

    const filePath = path.join(pluginsDir, filename);
    const response = await axios({
      url: downloadUrl,
      method: 'GET',
      responseType: 'stream',
      headers: {
         'User-Agent': 'React-Minecraft-Panel/1.0'
      }
    });

    const writer = fs.createWriteStream(filePath);
    response.data.pipe(writer);

    await new Promise<void>((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    res.json({ success: true, message: "Plugin installed successfully" });
  } catch (error: any) {
    console.error("Plugin installation failed:", error.message);
    res.status(500).json({ error: "Plugin installation failed: " + error.message });
  }
};

export const installMod = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { pluginId, pluginName } = req.body; 

  if (!pluginId || !pluginName) {
    return res.status(400).json({ error: "Missing pluginId or pluginName" });
  }

  try {
    const serverDir = path.join(process.cwd(), ".data", "servers", id);
    const modsDir = path.join(serverDir, "mods");
    await fs.ensureDir(modsDir);
    
    let downloadUrl = null;
    let filename = `${pluginName.replace(/[^a-zA-Z0-9]/g, '_')}.jar`;
    const axios = (await import("axios")).default;

    const verRes = await axios.get(`https://api.modrinth.com/v2/project/${pluginId}/version`);
    if (verRes.data && verRes.data.length > 0) {
      const file = verRes.data[0].files.find((f: any) => f.primary) || verRes.data[0].files[0];
      if (file) {
          downloadUrl = file.url;
          filename = file.filename || filename;
      }
    }

    if (!downloadUrl) {
      return res.status(404).json({ error: "Could not find a valid download URL for this mod." });
    }

    const filePath = path.join(modsDir, filename);
    const response = await axios({
      url: downloadUrl,
      method: 'GET',
      responseType: 'stream',
      headers: {
         'User-Agent': 'React-Minecraft-Panel/1.0'
      }
    });

    const writer = fs.createWriteStream(filePath);
    response.data.pipe(writer);

    await new Promise<void>((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    res.json({ success: true, message: "Mod installed successfully" });
  } catch (error: any) {
    console.error("Mod installation failed:", error.message);
    res.status(500).json({ error: "Mod installation failed: " + error.message });
  }
};

export const updateResources = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { ram, cpu, disk } = req.body;
    const servers = await readJSON("servers.json") || [];
    const server = servers.find((s: any) => s.id === id);
    if (!server) return res.status(404).json({ error: "Server not found" });
    if (!canManageServer(req, server)) return res.status(403).json({ error: "Unauthorized" });

    server.ram = Number(ram);
    server.cpu = Number(cpu);
    server.disk = Number(disk);
    await writeJSON("servers.json", servers);

    // Stop container if running
    if (server.containerId) {
       try {
         await stopContainer(server.containerId, server.nodeId);
       } catch(e) {}
    }

    res.json(server);
  } catch (error) {
    res.status(500).json({ error: "Failed to update resources" });
  }
};

export const updateSuspend = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { suspendDuration } = req.body; // permanent, 1_month, 2_months, 24_hours, 1_week, or null
    const servers = await readJSON("servers.json") || [];
    const server = servers.find((s: any) => s.id === id);
    if (!server) return res.status(404).json({ error: "Server not found" });
    if (!canManageServer(req, server)) return res.status(403).json({ error: "Unauthorized" });

    server.suspended = suspendDuration !== null;
    server.suspendDuration = suspendDuration;
    await writeJSON("servers.json", servers);

    if (server.suspended && server.containerId) {
       try {
         await stopContainer(server.containerId, server.nodeId);
       } catch(e) {}
    }

    res.json(server);
  } catch (error) {
    res.status(500).json({ error: "Failed to suspend server" });
  }
};


export const installModpackFromMarketplace = async (req: Request, res: Response) => {
  const { provider, projectId, gameVersion, loader } = req.body || {};
  if (provider !== "modrinth") return res.status(400).json({ error: "Only the official Modrinth modpack provider is supported for remote imports" });
  if (typeof projectId !== "string" || !/^[a-zA-Z0-9_-]{2,80}$/.test(projectId)) {
    return res.status(400).json({ error: "Invalid modpack project id" });
  }
  if (!canManageServer(req, (req as any).server)) return res.status(403).json({ error: "Unauthorized" });

  const tempDir = path.join(process.cwd(), ".data", "temp");
  const tempPath = path.join(tempDir, `marketplace-${crypto.randomUUID()}.mrpack`);
  try {
    await fs.ensureDir(tempDir);
    const versionResponse = await axios.get(`https://api.modrinth.com/v2/project/${encodeURIComponent(projectId)}/version`, {
      params: {
        loaders: typeof loader === "string" && loader.trim() ? JSON.stringify([loader.trim()]) : undefined,
        game_versions: typeof gameVersion === "string" && gameVersion.trim() ? JSON.stringify([gameVersion.trim()]) : undefined,
      },
      timeout: 12_000,
      headers: { "User-Agent": "ShiroNex-Panel/1.0 modpack-import" },
    });
    const versions = Array.isArray(versionResponse.data) ? versionResponse.data : [];
    const version = versions.find((candidate: any) => Array.isArray(candidate.files) && candidate.files.length > 0);
    const file = version?.files?.find((candidate: any) => candidate.primary) || version?.files?.[0];
    const downloadUrl = typeof file?.url === "string" ? file.url : "";
    if (!downloadUrl || !downloadUrl.startsWith("https://cdn.modrinth.com/")) {
      return res.status(404).json({ error: "No safe Modrinth archive was found for this modpack" });
    }

    const response = await axios.get(downloadUrl, {
      responseType: "stream",
      timeout: 60_000,
      maxContentLength: 512 * 1024 * 1024,
      maxBodyLength: 512 * 1024 * 1024,
      headers: { "User-Agent": "ShiroNex-Panel/1.0 modpack-import" },
    });
    const output = fs.createWriteStream(tempPath);
    response.data.pipe(output);
    await new Promise<void>((resolve, reject) => {
      output.on("finish", resolve);
      output.on("error", reject);
      response.data.on("error", reject);
    });

    (req as any).file = {
      path: tempPath,
      originalname: path.basename(typeof file?.filename === "string" ? file.filename : `${projectId}.mrpack`),
    };
    return importModpack(req, res);
  } catch (error: any) {
    await fs.remove(tempPath).catch(() => undefined);
    if (error?.response?.status === 404) return res.status(404).json({ error: "Modpack project or version not found" });
    res.status(502).json({ error: "Could not download the modpack from Modrinth" });
  }
};

export const importModpack = async (req: Request, res: Response) => {
  const { id } = req.params;
  const uploaded = (req as any).file as { path?: string; originalname?: string } | undefined;
  if (!uploaded?.path) return res.status(400).json({ error: "A .zip or .mrpack archive is required" });
  if (!canManageServer(req, (req as any).server)) return res.status(403).json({ error: "Unauthorized" });

  const originalName = String(uploaded.originalname || "").toLowerCase();
  if (!originalName.endsWith(".zip") && !originalName.endsWith(".mrpack")) {
    await fs.remove(uploaded.path);
    return res.status(400).json({ error: "Only .zip and .mrpack archives are supported" });
  }

  const serverDir = path.join(process.cwd(), ".data", "servers", id);
  const backupsDir = path.join(process.cwd(), ".data", "backups", id);
  const tempDir = path.join(process.cwd(), ".data", "temp", `modpack-${crypto.randomUUID()}`);
  const confirmReplace = req.body?.confirmReplace === true || req.body?.confirmReplace === "true";

  try {
    await fs.ensureDir(serverDir);
    const existing = await fs.readdir(serverDir);
    if (existing.length > 0 && !confirmReplace) {
      return res.status(409).json({ error: "This server already contains files. Create a backup and confirm replacement before importing.", requiresConfirmation: true });
    }

    let backupFilename: string | null = null;
    if (existing.length > 0) {
      await fs.ensureDir(backupsDir);
      backupFilename = `pre-modpack-${new Date().toISOString().replace(/[:.]/g, "-")}.zip`;
      const backupPath = path.join(backupsDir, backupFilename);
      const output = fs.createWriteStream(backupPath);
      const archive = new ZipArchive({ zlib: { level: 9 } });
      archive.pipe(output);
      archive.directory(serverDir, false);
      await archive.finalize();
      await new Promise<void>((resolve, reject) => { output.on("close", () => resolve()); output.on("error", reject); });
    }

    const entries = await extractZipSafely(uploaded.path, tempDir);
    const manifestPath = path.join(tempDir, "modrinth.index.json");
    const overridesPath = path.join(tempDir, "overrides");
    const sourcePath = await fs.pathExists(overridesPath) ? overridesPath : tempDir;
    await copyDirectorySafely(sourcePath, serverDir);
    await fs.remove(uploaded.path);
    await fs.remove(tempDir);
    res.json({ success: true, entries: entries.length, backupFilename, message: "Archive validated and imported. Review the server files before starting." });
  } catch (error: any) {
    await fs.remove(uploaded.path).catch(() => undefined);
    await fs.remove(tempDir).catch(() => undefined);
    res.status(400).json({ error: error?.message || "Modpack import failed" });
  }
};
