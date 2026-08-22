import { readJSON, writeJSON } from "./db.js";
import crypto from "crypto";
import { decryptSecret, encryptSecret } from "./security.js";

const API="https://api.cloudflare.com/client/v4";
const cfFetch=async (token:string,path:string,options:any={})=>{
  const r=await fetch(API+path,{...options,headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json",...(options.headers||{})}});
  const data:any=await r.json().catch(()=>({}));
  if(!r.ok || data.success===false) throw new Error(data?.errors?.map((e:any)=>e.message).join(", ") || `Cloudflare API ${r.status}`);
  return data;
};
export const connectCloudflare=async(token:string,accountId?:string)=>{
  const me=await cfFetch(token,"/user/tokens/verify",{method:"GET"});
  if(me.result?.status!=="active") throw new Error("Cloudflare token is not active");
  if(accountId) await cfFetch(token,`/accounts/${accountId}`,{method:"GET"});
  const accounts=await cfFetch(token,"/accounts?per_page=50");
  const accountsList=accounts.result||[];
  const chosen=accountId || accountsList[0]?.id;
  if(!chosen) throw new Error("No Cloudflare account is accessible by this token");
  const records=await readJSON("cloudflare_accounts.json")||[];
  const id=crypto.randomUUID();
  const item={id,accountId:chosen,token:encryptSecret(token),createdAt:new Date().toISOString()};
  records.push(item); await writeJSON("cloudflare_accounts.json",records);
  return {id,accountId:chosen,tokenStatus:me.result.status};
};
export const getAccount=async(id?:string)=>{
 const records=await readJSON("cloudflare_accounts.json")||[]; const r=id?records.find((x:any)=>x.id===id):records[0];
 if(!r) throw new Error("Cloudflare account is not connected"); return r;
};
export const listZones=async(id?:string)=>{const a=await getAccount(id); return (await cfFetch(decryptSecret(a.token),`/zones?account.id=${a.accountId}&per_page=100`)).result||[]};
export const listDns=async(zoneId:string,id?:string)=>{const a=await getAccount(id); return (await cfFetch(decryptSecret(a.token),`/zones/${zoneId}/dns_records?per_page=100`)).result||[]};
export const createDns=async(zoneId:string,data:any,id?:string)=>{const a=await getAccount(id); return (await cfFetch(decryptSecret(a.token),`/zones/${zoneId}/dns_records`,{method:"POST",body:JSON.stringify(data)})).result};
export const updateDns=async(zoneId:string,recordId:string,data:any,id?:string)=>{const a=await getAccount(id); return (await cfFetch(decryptSecret(a.token),`/zones/${zoneId}/dns_records/${recordId}`,{method:"PUT",body:JSON.stringify(data)})).result};
export const deleteDns=async(zoneId:string,recordId:string,id?:string)=>{const a=await getAccount(id); return (await cfFetch(decryptSecret(a.token),`/zones/${zoneId}/dns_records/${recordId}`,{method:"DELETE"})).result};
export const getZone=async(zoneId:string,id?:string)=>{const a=await getAccount(id); return (await cfFetch(decryptSecret(a.token),`/zones/${zoneId}`)).result};
