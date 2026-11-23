import { randomBytes } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Check, Ext } from "./documentsRules";

export const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");

// A file must at least start like the type it claims to be (stops renamed .exe files).
export function hasSignature(buf: Buffer, ext: Ext) {
  return ext === "pdf" ? buf.subarray(0, 1024).toString("latin1").includes("%PDF-") : buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b;
}

export function pdfPageCount(buf: Buffer) {
  const s = buf.toString("latin1"); let max = 0, m: RegExpExecArray | null;
  const re = /\/Type\s*\/Pages[^>]*?\/Count\s+(\d+)|\/Count\s+(\d+)[^>]*?\/Type\s*\/Pages/g;
  while ((m = re.exec(s))) max = Math.max(max, Number(m[1] ?? m[2]));
  return max;
}

// Basic technical checks only. Reading the content is the professor's job.
export function precheck(buf: Buffer, ext: Ext): Check[] {
  const out: Check[] = [{ ok: true, label: "File type and size accepted" }];
  if (ext === "pdf") {
    const complete = buf.subarray(Math.max(0, buf.length - 2048)).toString("latin1").includes("%%EOF");
    out.push({ ok: complete, label: complete ? "Opens correctly" : "File looks incomplete. Try exporting it again" });
    const pages = complete ? pdfPageCount(buf) : 0;
    if (pages) out.push({ ok: true, label: `${pages} page${pages === 1 ? "" : "s"} found` });
    if (buf.includes("/Encrypt")) out.push({ ok: false, label: "Password-protected. Your professor may not be able to open it" });
  } else {
    const word = buf.includes("word/document.xml");
    out.push({ ok: word, label: word ? "Opens correctly" : "Doesn't look like a valid Word document" });
  }
  if (buf.length < 2048) out.push({ ok: false, label: "File is very small. Check it's the right one" });
  return out;
}

export async function saveFile(docId: string, ext: Ext, buf: Buffer) {
  await mkdir(UPLOAD_DIR, { recursive: true });
  const key = `uploads/${docId}-${randomBytes(8).toString("hex")}.${ext}`;
  await writeFile(path.resolve(process.cwd(), key), buf);
  return key;
}
export async function removeFile(key?: string | null) {
  if (!key) return;
  const p = path.resolve(process.cwd(), key);
  if (p.startsWith(UPLOAD_DIR + path.sep)) await unlink(p).catch(() => {});
}
