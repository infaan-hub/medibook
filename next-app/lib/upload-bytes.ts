/**
 * Writes raw bytes into the media root (used by the social-login avatar
 * download; regular uploads go through lib/upload.saveUpload).
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { mediaRoot } from "./upload";

export async function saveUploadBytes(
  bytes: Uint8Array,
  subdir: string,
  filename: string
): Promise<string> {
  const safe = filename.replace(/[^\w.\-]+/g, "_");
  const relative = path.posix.join(subdir, safe);
  const absolute = path.join(mediaRoot(), ...relative.split("/"));
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, bytes);
  return relative;
}
