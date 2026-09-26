import fs from "fs-extra";
import path from "path";

const DATA_DIR = path.join(process.cwd(), ".data");

export const readJSON = async (filename: string) => {
  const filePath = path.join(DATA_DIR, filename);
  try {
    return await fs.readJson(filePath);
  } catch (err) {
    return null;
  }
};

export const writeJSON = async (filename: string, data: any) => {
  const filePath = path.join(DATA_DIR, filename);
  await fs.ensureDir(DATA_DIR);
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.writeJson(tempPath, data, { spaces: 2, mode: 0o600 });
    await fs.rename(tempPath, filePath);
  } finally {
    await fs.remove(tempPath);
  }
};
