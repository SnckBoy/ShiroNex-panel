import fs from "fs";
import express from "express";
import os from "os";
import path from "path";
import Docker from "dockerode";
import crypto from "crypto";
import https from "https";

const cfgPath = process.env.SHIRONEX_CONFIG || "/etc/shironex-node/config.json";
if (!fs.existsSync(cfgPath)) throw new Error(`Missing daemon config: ${cfgPath}`);
const cfg: any = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "20mb" }));
const dockerSocket = cfg.dockerSocket || "/var/run/docker.sock";
const docker = new Docker({ socketPath: dockerSocket });
const dockerError = (error: any) => {
  const code = String(error?.code || "");
  const raw = String(error?.message || error || "Docker operation failed");
  if (code === "ENOENT" || raw.includes("ENOENT") || raw.includes("docker.sock")) return `Docker is unavailable. Install and start Docker Engine, then ensure ${dockerSocket} is accessible to the ShiroNex daemon.`;
  if (code === "EACCES" || raw.includes("EACCES")) return `Docker socket permission denied. Add the ShiroNex daemon user to the docker group or grant access to ${dockerSocket}, then restart the daemon.`;
  if (code === "ECONNREFUSED" || raw.includes("ECONNREFUSED")) return "Docker is installed but not running. Start Docker Engine and restart the ShiroNex daemon.";
  return raw;
};
const dockerStatusCode = (error: any) => {
  const raw = String(error?.code || error?.message || error || "");
  return /ENOENT|EACCES|ECONNREFUSED|docker\.sock/i.test(raw) ? 503 : 502;
};
const serversDir = path.resolve(cfg.serverDirectory || "/var/lib/shironex/servers");
fs.mkdirSync(serversDir, { recursive: true, mode: 0o750 });

const timingSafe = (a: string, b: string) => {
  const aa = Buffer.from(a); const bb = Buffer.from(b);
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
};
const auth = (req: any, res: any, next: any) => {
  const h = String(req.headers.authorization || "");
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token || !timingSafe(token, String(cfg.credential || ""))) return res.status(401).json({ error: "Unauthorized" });
  next();
};
const safeId = (id: string) => { if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error("Invalid server id"); return id; };
const safePath = (serverId: string, rel: string) => {
  const base = path.resolve(serversDir, safeId(serverId));
  fs.mkdirSync(base, { recursive: true, mode: 0o750 });
  const target = path.resolve(base, rel || ".");
  if (target !== base && !target.startsWith(base + path.sep)) throw new Error("Invalid path");
  const realBase = fs.realpathSync(base);
  let probe = target;
  while (!fs.existsSync(probe) && probe !== path.dirname(probe)) probe = path.dirname(probe);
  const realProbe = fs.realpathSync(probe);
  if (realProbe !== realBase && !realProbe.startsWith(realBase + path.sep)) throw new Error("Symlink escapes server directory");
  return target;
};
let prevCpu: { idle: number; total: number } | null = null;
const cpu = () => {
  const c = os.cpus(); let idle = 0, total = 0;
  for (const x of c) { idle += x.times.idle; total += x.times.user + x.times.nice + x.times.sys + x.times.idle + x.times.irq; }
  if (!prevCpu) { prevCpu = { idle, total }; return 0; }
  const di = idle - prevCpu.idle, dt = total - prevCpu.total; prevCpu = { idle, total };
  return dt > 0 ? Math.max(0, Math.min(100, (1 - di / dt) * 100)) : 0;
};
const disk = () => { try { const st = fs.statfsSync(serversDir); const total=st.blocks*st.bsize, free=st.bfree*st.bsize; return { total, free, used: total-free }; } catch { return {total:0,free:0,used:0}; } };
const net = () => { try { let rx=0,tx=0; for (const l of fs.readFileSync("/proc/net/dev","utf8").split("\n").slice(2)) { const p=l.trim().split(":"); if(!p[1]) continue; const v=p[1].trim().split(/\s+/); rx += Number(v[0])||0; tx += Number(v[8])||0; } return {rxBytes:rx,txBytes:tx}; } catch { return {rxBytes:0,txBytes:0}; } };
const dockerCheck = async () => { try { await docker.ping(); return true; } catch { return false; } };
const stats = async () => {
  const containers = await docker.listContainers({all:true}).catch(()=>[] as any[]);
  return { daemonVersion: cfg.daemonVersion || "1.1.0", cpuUsage: cpu(), memory:{total:os.totalmem(),free:os.freemem(),used:os.totalmem()-os.freemem()}, disk:disk(), network:net(), docker:await dockerCheck(), uptime:os.uptime(), hostname:os.hostname(), servers:{total:containers.length,running:containers.filter((x:any)=>x.State==="running").length,stopped:containers.filter((x:any)=>x.State!=="running").length}, timestamp:new Date().toISOString() };
};
app.get("/v1/health", auth, async (_req,res) => { const s=await stats(); res.json({ok:true,...s}); });
app.get("/v1/stats", auth, async (_req,res) => res.json(await stats()));
const find = (id:string) => docker.getContainer(id);
app.post("/v1/servers", auth, async (req,res) => {
 try {
  const d=req.body||{}, id=safeId(String(d.id||"")); const dir=safePath(id,"."); fs.mkdirSync(dir,{recursive:true,mode:0o750});
  const type=String(d.type||"PAPER").toUpperCase();
  const javaVersion=String(d.javaVersion||"");
  if(javaVersion && !["8","11","17","21","25"].includes(javaVersion)) throw new Error("Unsupported Java version");
  const isProxy=["VELOCITY","BUNGEECORD","WATERFALL"].includes(type);
  const defaultImage=isProxy ? "itzg/bungeecord:latest" : `itzg/minecraft-server:${javaVersion ? `java${javaVersion}` : "latest"}`;
  const image=String(d.image||defaultImage);
  await new Promise<void>((resolve, reject) => docker.pull(image, (e: any, s: any) => e ? reject(e) : docker.modem.followProgress(s, (x: any) => x ? reject(x) : resolve())));
  const port=Number(d.port); if(!Number.isInteger(port)||port<1||port>65535) throw new Error("Invalid port");
  const ramGb=Number(d.ram||1); if(ramGb<=0) throw new Error("Invalid RAM");
  const env=[`TYPE=${type}`,`VERSION=${d.version||"latest"}`,"EULA=TRUE",`SERVER_PORT=${port}`,"ENABLE_RCON=true",`RCON_PASSWORD=${d.rconPassword||crypto.randomBytes(24).toString("hex")}`];
  const c=await docker.createContainer({Image:image,name:`shironex-${id}`,Labels:{"com.shironex.server":id,"com.shironex.managed":"true"},Env:env,Tty:true,OpenStdin:true,ExposedPorts:{[`${port}/tcp`]:{}},HostConfig:{Memory:Math.floor(ramGb*1024*1024*1024),NanoCpus:Math.max(1,Number(d.cpu||100))*10_000_000,PortBindings:{[`${port}/tcp`]:[{HostPort:String(port)}]},Binds:[`${dir}:/data`],RestartPolicy:{Name:"unless-stopped"}}});
  res.status(201).json({containerId:c.id});
 } catch(e:any){ res.status(dockerStatusCode(e)).json({error:dockerError(e),dockerUnavailable:dockerStatusCode(e)===503}); }
});
for (const [route,method] of [["start","start"],["stop","stop"],["restart","restart"],["kill","kill"]] as const) app.post(`/v1/servers/:id/${route}`,auth,async(req,res)=>{try{const container:any=await find(req.params.id);await container[method]();res.json({success:true})}catch(e:any){res.status(dockerStatusCode(e)).json({error:dockerError(e),dockerUnavailable:dockerStatusCode(e)===503})}});
app.delete("/v1/servers/:id",auth,async(req,res)=>{try{const c=find(req.params.id);try{const i=await c.inspect();if(i.State.Running)await c.stop({t:10})}catch{}await c.remove({force:true});res.json({success:true})}catch(e:any){res.status(dockerStatusCode(e)).json({error:dockerError(e),dockerUnavailable:dockerStatusCode(e)===503})}});
app.get("/v1/servers/:id/status",auth,async(req,res)=>{try{res.json(await find(req.params.id).inspect())}catch(e:any){res.status(dockerStatusCode(e)).json({error:dockerError(e),dockerUnavailable:dockerStatusCode(e)===503})}});
app.get("/v1/servers/:id/stats",auth,async(req,res)=>{try{const c=find(req.params.id),i=await c.inspect();if(!i.State.Running)return res.json({available:true,timestamp:Date.now(),cpu:0,ram:0,disk:null,networkRxBytes:0,networkTxBytes:0});const x:any=await c.stats({stream:false});const cpuDelta=x.cpu_stats.cpu_usage.total_usage-x.precpu_stats.cpu_usage.total_usage;const sysDelta=x.cpu_stats.system_cpu_usage-x.precpu_stats.system_cpu_usage;const cpus=x.cpu_stats.online_cpus||1;const cache=x.memory_stats.stats?.cache||x.memory_stats.stats?.inactive_file||0;const cpu=sysDelta>0&&cpuDelta>=0?cpuDelta/sysDelta*cpus*100:null;const usedMemory=Number(x.memory_stats.usage)-Number(cache);let networkRxBytes=0,networkTxBytes=0,networkAvailable=false;for(const n of Object.values(x.networks||{}) as any[]){networkRxBytes+=Number(n.rx_bytes)||0;networkTxBytes+=Number(n.tx_bytes)||0;networkAvailable=true;}res.json({available:true,timestamp:Date.now(),cpu,ram:Number.isFinite(usedMemory)&&usedMemory>=0?usedMemory/1024/1024:null,disk:null,networkRxBytes:networkAvailable?networkRxBytes:null,networkTxBytes:networkAvailable?networkTxBytes:null})}catch(e:any){res.status(502).json({available:false,timestamp:Date.now(),cpu:null,ram:null,disk:null,networkRxBytes:null,networkTxBytes:null,error:e.message})}});
app.get("/v1/servers/:id/logs",auth,async(req,res)=>{try{const b=await find(req.params.id).logs({stdout:true,stderr:true,tail:200});res.type("text/plain").send(b.toString("utf8"))}catch(e:any){res.status(dockerStatusCode(e)).json({error:dockerError(e),dockerUnavailable:dockerStatusCode(e)===503})}});
app.post("/v1/servers/:id/command",auth,async(req,res)=>{try{const e=await find(req.params.id).exec({Cmd:["rcon-cli",String(req.body.command||"")],AttachStdout:true,AttachStderr:true});await e.start({});res.json({success:true})}catch(e:any){res.status(dockerStatusCode(e)).json({error:dockerError(e),dockerUnavailable:dockerStatusCode(e)===503})}});
app.post("/v1/servers/:id/files/list",auth,async(req,res)=>{try{const p=safePath(req.params.id,req.body.path||"."),entries=fs.readdirSync(p,{withFileTypes:true}).map(x=>({name:x.name,isDirectory:x.isDirectory(),size:x.isDirectory()?0:fs.statSync(path.join(p,x.name)).size}));res.json(entries)}catch(e:any){res.status(400).json({error:e.message})}});
app.post("/v1/servers/:id/files/read",auth,async(req,res)=>{try{res.json({isFile:true,content:fs.readFileSync(safePath(req.params.id,req.body.path),"utf8")})}catch(e:any){res.status(400).json({error:e.message})}});
app.post("/v1/servers/:id/files/write",auth,async(req,res)=>{try{const p=safePath(req.params.id,req.body.path);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,String(req.body.content||""),"utf8");res.json({success:true})}catch(e:any){res.status(400).json({error:e.message})}});
app.post("/v1/servers/:id/files/write-base64",auth,async(req,res)=>{try{const p=safePath(req.params.id,req.body.path);const value=String(req.body.content||"");if(value.length>80*1024*1024)throw new Error("File payload is too large");fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,Buffer.from(value,"base64"));res.json({success:true,bytes:Buffer.byteLength(value,"base64")})}catch(e:any){res.status(400).json({error:e.message})}});
app.post("/v1/servers/:id/files/replace-batch",auth,async(req,res)=>{try{const base=safePath(req.params.id,".");const files=Array.isArray(req.body?.files)?req.body.files:[];if(!files.length||files.length>10000)throw new Error("A valid file list is required");const total=files.reduce((sum:any,file:any)=>sum+String(file?.content||"").length,0);if(total>512*1024*1024)throw new Error("Archive payload is too large");const existing=fs.readdirSync(base);if(existing.length&&!Boolean(req.body?.confirmReplace)){return res.status(409).json({error:"Remote server files exist; confirm replacement after backup",requiresConfirmation:true})}let backupPath=null;if(existing.length){backupPath=path.join(serversDir,".backups",safeId(req.params.id),new Date().toISOString().replace(/[:.]/g,"-"));fs.mkdirSync(backupPath,{recursive:true,mode:0o750});for(const entry of existing)fs.cpSync(path.join(base,entry),path.join(backupPath,entry),{recursive:true});for(const entry of existing)fs.rmSync(path.join(base,entry),{recursive:true,force:true})}for(const file of files){const target=safePath(req.params.id,String(file?.path||""));fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,Buffer.from(String(file?.content||""),"base64"))}res.json({success:true,files:files.length,backupPath})}catch(e:any){res.status(400).json({error:e.message})}});
app.post("/v1/servers/:id/files/mkdir",auth,async(req,res)=>{try{fs.mkdirSync(safePath(req.params.id,req.body.path),{recursive:true});res.json({success:true})}catch(e:any){res.status(400).json({error:e.message})}});
app.post("/v1/servers/:id/files/rename",auth,async(req,res)=>{try{fs.renameSync(safePath(req.params.id,req.body.oldPath),safePath(req.params.id,req.body.newPath));res.json({success:true})}catch(e:any){res.status(400).json({error:e.message})}});
app.post("/v1/servers/:id/files/delete",auth,async(req,res)=>{try{for(const p of req.body.paths||[])fs.rmSync(safePath(req.params.id,p),{recursive:true,force:true});res.json({success:true})}catch(e:any){res.status(400).json({error:e.message})}});
const heartbeat=async()=>{try{const s=await stats();const url=`${String(cfg.panelUrl).replace(/\/$/,"")}/api/node-agent/heartbeat`;const r=await fetch(url,{method:"POST",headers:{"content-type":"application/json","authorization":`Bearer ${cfg.credential}`},body:JSON.stringify({nodeId:cfg.nodeId,stats:s})});if(!r.ok)console.error("Heartbeat failed",r.status)}catch(e:any){console.error("Heartbeat error",e.message)}};
setInterval(heartbeat,Math.max(5000,Number(cfg.heartbeatIntervalMs||10000)));heartbeat();
const port=Number(cfg.port||6768); if(cfg.tlsKey&&cfg.tlsCert) https.createServer({key:fs.readFileSync(cfg.tlsKey),cert:fs.readFileSync(cfg.tlsCert)},app).listen(port,"0.0.0.0",()=>console.log(`ShiroNex Node Daemon HTTPS listening on ${port}`)); else app.listen(port,"0.0.0.0",()=>console.log(`ShiroNex Node Daemon HTTP listening on ${port}; use TLS in production`));
