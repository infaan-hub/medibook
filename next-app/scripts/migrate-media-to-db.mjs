/**
 * One-time: copy files from MEDIA_ROOT (uploads/) into the MediaFile table
 * so every existing image also lives in the database (works on Vercel).
 *
 * Usage: node scripts/migrate-media-to-db.mjs
 */
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import envPkg from "@next/env";
import { PrismaClient } from "@prisma/client";

const { loadEnvConfig } = envPkg;

loadEnvConfig(process.cwd(), process.argv[2] !== "production");

const prisma = new PrismaClient();

const EXT_TYPE = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".pdf": "application/pdf",
  ".svg": "image/svg+xml",
};

function mediaRoot() {
  const configured = process.env.MEDIA_ROOT?.trim();
  const root = configured && configured.length > 0 ? configured : "uploads";
  return path.isAbsolute(root) ? root : path.join(process.cwd(), root);
}

async function walk(dir, prefix = "") {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(abs, rel)));
    else out.push({ rel, abs });
  }
  return out;
}

const root = mediaRoot();
const files = await walk(root);
console.log(`Found ${files.length} file(s) under ${root}`);

let inserted = 0;
let skipped = 0;
for (const { rel, abs } of files) {
  const posixRel = rel.split(path.sep).join("/");
  try {
    const st = await stat(abs);
    if (st.size > 15 * 1024 * 1024) {
      console.log(`SKIP (too large): ${posixRel}`);
      skipped++;
      continue;
    }
    const data = await readFile(abs);
    const contentType = EXT_TYPE[path.extname(abs).toLowerCase()] ?? "application/octet-stream";
    const filename = posixRel.split("/").pop();
    await prisma.mediaFile.upsert({
      where: { path: posixRel },
      create: { path: posixRel, filename, contentType, data, size: data.length },
      update: {},
    });
    inserted++;
    console.log(`OK ${posixRel} (${data.length} bytes)`);
  } catch (err) {
    skipped++;
    console.error(`FAIL ${posixRel}:`, err.message);
  }
}
console.log(`Done. inserted/updated=${inserted} skipped=${skipped}`);
await prisma.$disconnect();
