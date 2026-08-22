import express from "express";
import crypto from "crypto";
import dns from "dns/promises";
import tls from "tls";
import {readJSON,writeJSON} from "../services/db.js";
import {requireAdmin} from "../middleware/auth.js";
import {audit,encryptSecret,hashSecret,randomSecret,rateLimit,decryptSecret} from "../services/security.js";
import {createDns} from "../services/cloudflare.js";
import {nodeControl} from "../services/nodeClient.js";
const router=express.Router();router.use(requireAdmin,rateLimit());
const file="nodes.json", setupFile="node_setup_tokens.json";
const initNodes=async()=>{const n=await readJSON(file);if(!n){await writeJSON(file,[{id:"local",name:"Local Node",description:"Panel host",hostname:"127.0.0.1",fqdn:"127.0.0.1",publicIp:"127.0.0.1",apiPort:6767,tls:false,isLocal:true,disabled:false,createdAt:new Date().toISOString(),lastHeartbeat:null,lastStats:null}])}};initNodes();

const sanitize=(n:any)=>{const {credential,...safe}=n;return safe};

async function publicNodes(){
 const nodes=await readJSON(file)||[]; const now=Date.now();
 return nodes.map((n:any)=>({...sanitize(n),status:n.disabled?"DISABLED":(n.lastHeartbeat && now-Date.parse(n.lastHeartbeat)<30000?"ONLINE":"OFFLINE"),lastHeartbeat:n.lastHeartbeat||null}));
}
router.get("/",async(req,res)=>res.json(await publicNodes()));
router.get("/:id",async(req,res)=>{const n=(await readJSON(file)||[]).find((x:any)=>x.id===req.params.id);if(!n)return res.status(404).json({error:"Node not found"});res.json(sanitize(n))});
router.post("/",async(req,res)=>{
 const b=req.body; if(!b.name||!b.hostname||!b.apiPort)return res.status(400).json({error:"name, hostname and apiPort are required"});
 const nodes=await readJSON(file)||[];const id=crypto.randomUUID();const setupToken=randomSecret(32);
 const node={id,name:b.name,description:b.description||"",hostname:b.hostname,fqdn:b.fqdn||b.hostname,publicIp:b.publicIp||"",internalIp:b.internalIp||"",apiPort:Number(b.apiPort),location:b.location||"",tls:b.tls!==false,memory:b.memory||0,disk:b.disk||0,cpu:b.cpu||0,serverDirectory:b.serverDirectory||"/var/lib/shironex/servers",dockerHost:b.dockerHost||"/var/run/docker.sock",disabled:false,cloudflareZoneId:b.cloudflareZoneId||null,cloudflareRecordId:null,credential:encryptSecret(randomSecret(48)),credentialHash:"",createdAt:new Date().toISOString(),lastHeartbeat:null,daemonVersion:null};
 node.credentialHash=hashSecret(decryptSecret(node.credential));
 nodes.push(node);await writeJSON(file,nodes);
 let dnsWarning:any=null;
 if(b.createCloudflareDns && b.cloudflareZoneId){
   try{const rec=await createDns(String(b.cloudflareZoneId),{type:"A",name:b.fqdn||b.hostname,content:b.publicIp,ttl:300,proxied:false});node.cloudflareRecordId=rec.id;await writeJSON(file,nodes);}
   catch(e:any){dnsWarning=e.message}
 }
 const tokens=await readJSON(setupFile)||[];tokens.push({hash:hashSecret(setupToken),nodeId:id,expiresAt:Date.now()+15*60*1000,used:false});await writeJSON(setupFile,tokens);
 await audit("node.created",req,{nodeId:id,name:node.name});
 res.status(201).json({...sanitize(node),setupToken,dnsWarning});
});
router.post("/:id/rotate",async(req,res)=>{const nodes=await readJSON(file)||[];const n=nodes.find((x:any)=>x.id===req.params.id);if(!n)return res.status(404).json({error:"Node not found"});const secret=randomSecret(48);n.credential=encryptSecret(secret);n.credentialHash=hashSecret(secret);await writeJSON(file,nodes);await audit("node.credentials.rotated",req,{nodeId:n.id});res.json({success:true})});
router.patch("/:id",async(req,res)=>{const nodes=await readJSON(file)||[];const n=nodes.find((x:any)=>x.id===req.params.id);if(!n)return res.status(404).json({error:"Node not found"});for(const k of ["name","description","hostname","fqdn","publicIp","internalIp","location","apiPort","tls","memory","disk","cpu","serverDirectory","dockerHost"])if(req.body[k]!==undefined)n[k]=req.body[k];await writeJSON(file,nodes);res.json(sanitize(n))});
router.post("/:id/enable",async(req,res)=>{const nodes=await readJSON(file)||[];const n=nodes.find((x:any)=>x.id===req.params.id);if(!n)return res.status(404).json({error:"Node not found"});n.disabled=false;await writeJSON(file,nodes);await audit("node.enabled",req,{nodeId:n.id});res.json({success:true})});
router.post("/:id/disable",async(req,res)=>{const nodes=await readJSON(file)||[];const n=nodes.find((x:any)=>x.id===req.params.id);if(!n)return res.status(404).json({error:"Node not found"});n.disabled=true;await writeJSON(file,nodes);await audit("node.disabled",req,{nodeId:n.id});res.json({success:true})});
router.delete("/:id",async(req,res)=>{const nodes=await readJSON(file)||[];const n=nodes.find((x:any)=>x.id===req.params.id);if(!n)return res.status(404).json({error:"Node not found"});const servers=await readJSON("servers.json")||[];if(servers.some((s:any)=>s.nodeId===n.id))return res.status(409).json({error:"Cannot delete a node with assigned servers"});await writeJSON(file,nodes.filter((x:any)=>x.id!==n.id));await audit("node.deleted",req,{nodeId:n.id});res.json({success:true})});
router.post("/:id/test",async(req,res)=>{try{const nodes=await readJSON(file)||[];const n=nodes.find((x:any)=>x.id===req.params.id);if(!n)return res.status(404).json({error:"Node not found"});const secret=decryptSecret(n.credential);const base=`${n.tls?"https":"http"}://${n.fqdn||n.hostname}:${n.apiPort}`;const result=await nodeControl.health({id:n.id,baseUrl:base,credential:secret});res.json({success:true,health:result})}catch(e:any){res.status(502).json({success:false,error:e.message})}});
router.get("/:id/stats",async(req,res)=>{const nodes=await readJSON(file)||[];const n=nodes.find((x:any)=>x.id===req.params.id);if(!n)return res.status(404).json({error:"Node not found"});if(n.disabled)return res.status(409).json({error:"Node disabled"});res.json(n.lastStats||{error:"No heartbeat received yet"})});
router.get("/:id/health",async(req,res)=>{const nodes=await readJSON(file)||[];const n=nodes.find((x:any)=>x.id===req.params.id);if(!n)return res.status(404).json({error:"Node not found"});const checks:any={cloudflare:{status:"not_checked"},dns:{status:"not_checked"},node:{status:"offline"},docker:{status:"unknown"},system:{status:"unknown"}};try{
 const host=n.fqdn||n.hostname; const resolved=await dns.lookup(host); checks.dns={status:"ok",address:resolved.address};
 if(n.tls){await new Promise((resolve,reject)=>{const socket=tls.connect({host,port:n.apiPort,servername:host,rejectUnauthorized:true},()=>{socket.end();resolve(true)});socket.on("error",reject);setTimeout(()=>{socket.destroy();reject(new Error("TLS timeout"))},5000)});checks.node.tls="valid"}
 const secret=decryptSecret(n.credential);const base=`${n.tls?"https":"http"}://${host}:${n.apiPort}`;const started=Date.now();const h=await nodeControl.health({id:n.id,baseUrl:base,credential:secret});checks.node={status:"ok",latencyMs:Date.now()-started,tls:checks.node.tls,...h};checks.docker=h.docker;checks.system=h.system;
}catch(e:any){checks.node={status:"error",error:e.message};checks.dns=checks.dns.status==="not_checked"?{status:"error",error:e.message}:checks.dns}res.json(checks)});
export default router;
