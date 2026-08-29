import express from "express";
import {readJSON,writeJSON} from "../services/db.js";
import {hashSecret,encryptSecret,decryptSecret,rateLimit} from "../services/security.js";
import crypto from "crypto";
const r=express.Router();r.use(express.json(),rateLimit());
const isLoopback=(address:string)=>["127.0.0.1","::1"].includes(address.replace(/^::ffff:/,""));
const matchesBootstrapSecret=(provided:string,expected:string)=>{const a=Buffer.from(provided);const b=Buffer.from(expected);return a.length===b.length&&a.length>0&&crypto.timingSafeEqual(a,b)};
r.post("/local-bootstrap",async(req,res)=>{
 const remote=String(req.socket.remoteAddress||"");
 if(!isLoopback(remote))return res.status(403).json({error:"Local bootstrap is only available from the panel host"});
 if(!matchesBootstrapSecret(String(req.headers["x-shironex-bootstrap"]||""),String(process.env.NODE_AUTH_SECRET||"")))return res.status(401).json({error:"Invalid local bootstrap secret"});
 const nodes=await readJSON("nodes.json")||[];let n=nodes.find((x:any)=>x.id==="local");
 const credential=crypto.randomBytes(48).toString("base64url");
 if(!n){n={id:"local",name:"Local Node",description:"Panel host",hostname:"127.0.0.1",fqdn:"127.0.0.1",publicIp:"127.0.0.1",apiPort:Number(req.body?.port)||6768,tls:false,isLocal:true,disabled:false,createdAt:new Date().toISOString()};nodes.push(n)}
 n.apiPort=Number(req.body?.port)||n.apiPort||6768;n.isLocal=true;n.hostname="127.0.0.1";n.fqdn="127.0.0.1";n.tls=false;n.disabled=false;n.maintenance=false;n.error=null;n.credential=encryptSecret(credential);n.credentialHash=hashSecret(credential);n.daemonVersion=String(req.body?.daemonVersion||n.daemonVersion||"1.1.0");n.lastHeartbeat=null;n.lastStats=null;
 await writeJSON("nodes.json",nodes);res.json({nodeId:"local",credential,port:n.apiPort});
});
r.post("/register",async(req,res)=>{const {setupToken,nodeId,daemonVersion}=req.body;const tokens=await readJSON("node_setup_tokens.json")||[];const t=tokens.find((x:any)=>x.nodeId===nodeId&&x.hash===hashSecret(String(setupToken||""))&&!x.used&&x.expiresAt>Date.now());if(!t)return res.status(401).json({error:"Invalid or expired setup token"});const nodes=await readJSON("nodes.json")||[];const n=nodes.find((x:any)=>x.id===nodeId);if(!n)return res.status(404).json({error:"Node not found"});const secret=crypto.randomBytes(48).toString("base64url");n.credential=encryptSecret(secret);n.credentialHash=hashSecret(secret);n.daemonVersion=daemonVersion;n.lastHeartbeat=null;t.used=true;await writeJSON("nodes.json",nodes);await writeJSON("node_setup_tokens.json",tokens);res.json({nodeId,credential:secret})});
r.post("/heartbeat",async(req,res)=>{const bodyCredential=String(req.body?.credential||"");const header=String(req.headers.authorization||"");const credential=header.startsWith("Bearer ")?header.slice(7):bodyCredential;const {nodeId,stats}=req.body;const nodes=await readJSON("nodes.json")||[];const n=nodes.find((x:any)=>x.id===nodeId);if(!n||hashSecret(String(credential||""))!==n.credentialHash)return res.status(401).json({error:"Invalid node credentials"});if(n.disabled)return res.status(403).json({error:"Node disabled"});n.lastHeartbeat=new Date().toISOString();n.lastStats=stats;n.restartingAt=null; n.daemonVersion=stats?.daemonVersion||n.daemonVersion;await writeJSON("nodes.json",nodes);res.json({ok:true})});
export default r;
