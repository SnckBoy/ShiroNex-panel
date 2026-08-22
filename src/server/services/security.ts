import crypto from "crypto";
import { readJSON, writeJSON } from "./db.js";

// Centralized JWT secret accessor. There is no hardcoded fallback: a predictable
// default secret would let anyone forge admin tokens for any ShiroNex install that
// forgot to set one. install.sh always generates a random JWT_SECRET into .env, so
// this only fails fast for manual/dev setups that skipped that step.
export const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "JWT_SECRET is not set (or too short). Set a long random value in .env, e.g.: " +
      "JWT_SECRET=$(openssl rand -hex 32)"
    );
  }
  return secret;
};

const keyMaterial = () => {
  const raw = process.env.NODE_ENCRYPTION_KEY || "";
  if (!raw) throw new Error("NODE_ENCRYPTION_KEY is required for encrypted infrastructure secrets");
  return crypto.createHash("sha256").update(raw).digest();
};

export const encryptSecret = (value:string) => {
  const iv = crypto.randomBytes(12), key = keyMaterial();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value,"utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
};
export const decryptSecret = (value:string) => {
  const [ivB64, tagB64, dataB64] = value.split(".");
  const decipher = crypto.createDecipheriv("aes-256-gcm", keyMaterial(), Buffer.from(ivB64,"base64url"));
  decipher.setAuthTag(Buffer.from(tagB64,"base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64,"base64url")),decipher.final()]).toString("utf8");
};
export const hashSecret = (value:string) => crypto.createHash("sha256").update(value).digest("hex");
export const randomSecret = (bytes=32) => crypto.randomBytes(bytes).toString("base64url");

export const audit = async (action:string, req:any, metadata:any={}) => {
  const logs = await readJSON("audit_logs.json") || [];
  logs.push({
    id: crypto.randomUUID(), action, actorId:req?.user?.id || "node",
    ip:req?.ip, createdAt:new Date().toISOString(), metadata
  });
  await writeJSON("audit_logs.json", logs.slice(-5000));
};

const buckets = new Map<string,{count:number,reset:number}>();
export const rateLimit = (limit=120, windowMs=60_000) => (req:any,res:any,next:any) => {
  const key = `${req.ip}:${req.path}`;
  const now=Date.now(); const b=buckets.get(key);
  if (!b || b.reset<=now) buckets.set(key,{count:1,reset:now+windowMs});
  else { b.count++; if (b.count>limit) return res.status(429).json({error:"Too many requests"}); }
  next();
};
