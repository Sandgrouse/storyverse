// Server only. Custom-voice audio and invite storage: Vercel Blob in
// production (random suffixes), files under .data/voice/ otherwise.
// Tests set VOICE_STORE_MEMORY=1 for an in-memory store and never touch
// disk or Blob.

import { randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

if (typeof window !== "undefined") {
  throw new Error("lib/voice-store.ts is server only");
}

/** One audio file is at most 4MB. */
export const MAX_VOICE_FILE_BYTES = 4 * 1024 * 1024;

/** An invite holds at most 12 files per character. */
export const MAX_FILES_PER_CHARACTER = 12;

/** Invites expire after 14 days. */
export const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export const VOICE_FILE_TOO_LARGE_MESSAGE =
  "That recording is too large. Keep each file under 4MB.";
export const VOICE_FILE_TYPE_MESSAGE =
  "That file type isn't audio. Use MP3, WAV, M4A or WebM.";
export const VOICE_CHARACTER_LIMIT_MESSAGE =
  "That character already has 12 takes. Remove one before adding another.";
export const VOICE_INVITE_MISSING_MESSAGE =
  "That link has expired or never existed.";

const ALLOWED_MIME = new Map<string, string>([
  ["audio/mpeg", "mp3"],
  ["audio/mp3", "mp3"],
  ["audio/wav", "wav"],
  ["audio/x-wav", "wav"],
  ["audio/wave", "wav"],
  ["audio/vnd.wave", "wav"],
  ["audio/mp4", "m4a"],
  ["audio/x-m4a", "m4a"],
  ["audio/aac", "m4a"],
  ["audio/webm", "webm"],
  ["audio/ogg", "ogg"],
]);

export function mimeToExt(mime: string): string | null {
  return ALLOWED_MIME.get(mime.toLowerCase()) ?? null;
}

export class VoiceStoreError extends Error {
  code: "TOO_LARGE" | "BAD_TYPE" | "LIMIT" | "NOT_FOUND" | "EXPIRED";
  constructor(code: VoiceStoreError["code"], message: string) {
    super(message);
    this.name = "VoiceStoreError";
    this.code = code;
  }
}

export function checkAudioFile(mime: string, size: number): string {
  const ext = mimeToExt(mime);
  if (!ext) throw new VoiceStoreError("BAD_TYPE", VOICE_FILE_TYPE_MESSAGE);
  if (size > MAX_VOICE_FILE_BYTES || size <= 0) {
    throw new VoiceStoreError("TOO_LARGE", VOICE_FILE_TOO_LARGE_MESSAGE);
  }
  return ext;
}

export interface InviteCharacter {
  id: string;
  name: string;
  brief: string;
  lines: string[];
}

export interface InviteRecord {
  token: string;
  projectTitle: string;
  note: string;
  characters: InviteCharacter[];
  createdAt: number;
  submissions: SubmissionRecord[];
}

export interface SubmissionRecord {
  id: string;
  characterId: string;
  lineIndex: number;
  artistName: string;
  consentText: string;
  consentAt: number;
  mimeType: string;
  size: number;
  fileId: string;
  /** Blob URL when stored in Vercel Blob; local files use the audio route. */
  url: string | null;
}

export function makeInviteToken(): string {
  return randomBytes(24).toString("base64url");
}

export function isInviteExpired(createdAt: number, now: number = Date.now()): boolean {
  return now - createdAt > INVITE_TTL_MS;
}

function isMemoryStore(): boolean {
  return process.env.VOICE_STORE_MEMORY === "1";
}

function hasBlobToken(): boolean {
  return !isMemoryStore() && !!process.env.BLOB_READ_WRITE_TOKEN;
}

function dataRoot(): string {
  return process.env.VOICE_DATA_DIR ?? join(process.cwd(), ".data", "voice");
}

// In-memory store for tests.
const memInvites = new Map<string, InviteRecord>();
const memAudio = new Map<string, { bytes: Uint8Array; mime: string; url: string | null }>();

/** Test-only reset of the in-memory store. */
export function __resetVoiceStore(): void {
  memInvites.clear();
  memAudio.clear();
}

function randomId(): string {
  return randomBytes(12).toString("base64url");
}

function safeSegment(raw: string): string {
  const clean = raw.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return clean.length > 0 ? clean.slice(0, 48) : "char";
}

async function writeInviteRecord(record: InviteRecord): Promise<void> {
  if (isMemoryStore()) {
    memInvites.set(record.token, record);
    return;
  }
  if (hasBlobToken()) {
    const { put } = await import("@vercel/blob");
    await put(`storyverse-voice/invites/${record.token}.json`, JSON.stringify(record), {

      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return;
  }
  const path = join(dataRoot(), "invites", `${record.token}.json`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(record), "utf-8");
}

async function removeInviteRecord(token: string): Promise<void> {
  if (isMemoryStore()) {
    memInvites.delete(token);
    return;
  }
  if (hasBlobToken()) {
    try {
      const { del, list } = await import("@vercel/blob");
      const found = await list({
        prefix: `storyverse-voice/invites/${token}.json`,
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });
      const urls = found.blobs.map((b) => b.url);
      if (urls.length > 0) await del(urls, { token: process.env.BLOB_READ_WRITE_TOKEN });
    } catch {
      // A storage failure must never block a calm response by itself.
    }
    return;
  }
  await rm(join(dataRoot(), "invites", `${token}.json`), { force: true });
}

export async function saveInvite(record: InviteRecord): Promise<void> {
  await writeInviteRecord(record);
}

export async function readInvite(token: string): Promise<InviteRecord | null> {
  let record: InviteRecord | null = null;
  if (isMemoryStore()) {
    record = memInvites.get(token) ?? null;
  } else if (hasBlobToken()) {
    try {
      const { list } = await import("@vercel/blob");
      const found = await list({
        prefix: `storyverse-voice/invites/${token}.json`,
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });
      const match =
        found.blobs.find((b) => b.pathname === `storyverse-voice/invites/${token}.json`) ??
        found.blobs[0];
      if (match) {
        const res = await fetch(match.url, { cache: "no-store" });
        if (res.ok) record = (await res.json()) as InviteRecord;
      }
    } catch {
      record = null;
    }
  } else {
    try {
      const raw = await readFile(join(dataRoot(), "invites", `${token}.json`), "utf-8");
      record = JSON.parse(raw) as InviteRecord;
    } catch {
      record = null;
    }
  }
  if (!record || record.token !== token) return null;
  if (isInviteExpired(record.createdAt)) return null;
  return record;
}

/** Public invite: the invite without submissions or anything owner-only. */
export function publicInvite(record: InviteRecord): {
  token: string;
  projectTitle: string;
  note: string;
  characters: InviteCharacter[];
  createdAt: number;
} {
  return {
    token: record.token,
    projectTitle: record.projectTitle,
    note: record.note,
    characters: record.characters,
    createdAt: record.createdAt,
  };
}

export async function putAudio(
  bytes: Uint8Array,
  mime: string,
  prefix: string,
): Promise<{ fileId: string; url: string | null }> {
  const ext = checkAudioFile(mime, bytes.length);
  const fileId = `${safeSegment(prefix)}-${randomId()}.${ext}`;
  if (isMemoryStore()) {
    memAudio.set(fileId, { bytes, mime, url: null });
    return { fileId, url: null };
  }
  if (hasBlobToken()) {
    const { put } = await import("@vercel/blob");
    const stored = await put(`storyverse-voice/audio/${fileId}`, Buffer.from(bytes), {
      access: "public",
      addRandomSuffix: true,
      contentType: mime,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return { fileId, url: stored.url };
  }
  const path = join(dataRoot(), "audio", fileId);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
  return { fileId, url: null };
}

export async function getAudio(fileId: string): Promise<{ bytes: Uint8Array; mime: string } | null> {
  if (fileId.includes("..") || fileId.includes("/")) {
    const parts = fileId.split("/");
    if (parts.length !== 2 || parts.some((p) => p.includes(".."))) return null;
  }
  if (isMemoryStore()) {
    const found = memAudio.get(fileId);
    return found ? { bytes: found.bytes, mime: found.mime } : null;
  }
  if (hasBlobToken()) {
    try {
      const { list } = await import("@vercel/blob");
      const base = fileId.split("/").pop() ?? fileId;
      const found = await list({
        prefix: `storyverse-voice/audio/${base}`,
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });
      const match = found.blobs[0];
      if (!match) return null;
      const res = await fetch(match.url, { cache: "no-store" });
      if (!res.ok) return null;
      const bytes = new Uint8Array(await res.arrayBuffer());
      const mime =
        (match as unknown as { contentType?: string }).contentType ?? "audio/mpeg";
      return { bytes, mime };
    } catch {
      return null;
    }
  }
  try {
    const bytes = new Uint8Array(await readFile(join(dataRoot(), "audio", fileId)));
    return { bytes, mime: "audio/mpeg" };
  } catch {
    return null;
  }
}

async function deleteAudioFile(fileId: string): Promise<void> {
  if (isMemoryStore()) {
    memAudio.delete(fileId);
    return;
  }
  if (hasBlobToken()) {
    return;
  }
  await rm(join(dataRoot(), "audio", fileId), { force: true });
}

export async function appendSubmission(
  token: string,
  submission: Omit<SubmissionRecord, "id">,
): Promise<SubmissionRecord> {
  const record = await readInvite(token);
  if (!record) throw new VoiceStoreError("NOT_FOUND", VOICE_INVITE_MISSING_MESSAGE);
  const forCharacter = record.submissions.filter((s) => s.characterId === submission.characterId);
  if (forCharacter.length >= MAX_FILES_PER_CHARACTER) {
    throw new VoiceStoreError("LIMIT", VOICE_CHARACTER_LIMIT_MESSAGE);
  }
  const full: SubmissionRecord = { ...submission, id: randomId() };
  await writeInviteRecord({ ...record, submissions: [...record.submissions, full] });
  return full;
}

export async function listSubmissions(token: string): Promise<SubmissionRecord[]> {
  const record = await readInvite(token);
  if (!record) throw new VoiceStoreError("NOT_FOUND", VOICE_INVITE_MISSING_MESSAGE);
  return record.submissions;
}

export async function deleteInviteAndFiles(token: string): Promise<boolean> {
  const record = await readInvite(token);
  if (!record) return false;
  for (const submission of record.submissions) {
    await deleteAudioFile(submission.fileId).catch(() => {});
  }
  await removeInviteRecord(token);
  return true;
}

// Owner samples: stored under a per-character prefix. The sample id
// carries that prefix so the custom-voice route can find the bytes.

export async function putSample(
  characterId: string,
  bytes: Uint8Array,
  mime: string,
): Promise<string> {
  const { fileId } = await putAudio(bytes, mime, safeSegment(characterId || "sample"));
  if (isMemoryStore()) return fileId;
  if (hasBlobToken()) return fileId;
  return fileId;
}

export async function getSample(sampleId: string): Promise<{ bytes: Uint8Array; mime: string } | null> {
  if (!/^[A-Za-z0-9_-]+\.[a-z0-9]+$/.test(sampleId)) return null;
  return getAudio(sampleId);
}

export async function deleteSamples(sampleIds: string[]): Promise<void> {
  for (const id of sampleIds) {
    if (!/^[A-Za-z0-9_-]+\.[a-z0-9]+$/.test(id)) continue;
    await deleteAudioFile(id).catch(() => {});
  }
}
