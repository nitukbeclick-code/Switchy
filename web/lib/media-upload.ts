"use client";

// ────────────────────────────────────────────────────────────────────────────
// media-upload.ts — image / video / voice for community posts.
//
// Uploads to the EXISTING `community-media` bucket at <uid>/<uuid>.<ext> (its RLS
// already lets a user write their own folder), returns a public URL + Media meta
// the data layer stores on the post. Also a small MediaRecorder wrapper for voice
// notes. Client-only.
// ────────────────────────────────────────────────────────────────────────────

import { getBrowserSupabase } from "./supabase-browser";
import type { Media, MediaType } from "./community";

const BUCKET = "community-media";
const MAX_IMAGE = 8 * 1024 * 1024; // 8 MB
const MAX_AUDIO = 12 * 1024 * 1024; // 12 MB
const MAX_VIDEO = 60 * 1024 * 1024; // 60 MB

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
};

export function kindOf(mime: string): MediaType | null {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return null;
}

function capFor(kind: MediaType): number {
  return kind === "image" ? MAX_IMAGE : kind === "audio" ? MAX_AUDIO : MAX_VIDEO;
}

export type Validation = { ok: true; kind: MediaType } | { ok: false; error: string };

export function validateMedia(file: { type: string; size: number }): Validation {
  const kind = kindOf(file.type);
  if (!kind) return { ok: false, error: "סוג קובץ לא נתמך." };
  if (file.size > capFor(kind)) {
    return {
      ok: false,
      error:
        kind === "image"
          ? "התמונה גדולה מדי (עד 8MB)."
          : kind === "audio"
            ? "ההקלטה גדולה מדי."
            : "הווידאו גדול מדי (עד 60MB).",
    };
  }
  return { ok: true, kind };
}

function uuid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return "m" + Date.now().toString(36) + Math.floor(Math.random() * 1e9).toString(36);
  }
}

/** Upload a blob (picked file OR recorded audio) → its public URL + Media meta.
 *  Throws a Hebrew Error on validation/upload failure so the caller can toast it. */
export async function uploadMedia(userId: string, blob: Blob, durationMs?: number): Promise<Media> {
  const v = validateMedia({ type: blob.type, size: blob.size });
  if (!v.ok) throw new Error(v.error);
  const ext = EXT[blob.type] ?? (v.kind === "image" ? "jpg" : v.kind === "audio" ? "webm" : "mp4");
  const path = `${userId}/${uuid()}.${ext}`;
  const sb = getBrowserSupabase();
  const { error } = await sb.storage.from(BUCKET).upload(path, blob, {
    contentType: blob.type || undefined,
    upsert: false,
  });
  if (error) throw new Error("העלאת המדיה נכשלה. נסו שוב.");
  const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
  return { type: v.kind, url: data.publicUrl, durationMs: durationMs ?? null };
}

// ── Voice recording (MediaRecorder) ──────────────────────────────────────────

export interface Recorder {
  stop: () => Promise<{ blob: Blob; durationMs: number }>;
  cancel: () => void;
}

/** Start a mic recording. Rejects if the mic is denied/unavailable. */
export async function startRecording(): Promise<Recorder> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mime = typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("audio/webm")
    ? "audio/webm"
    : "";
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks: BlobPart[] = [];
  const started = Date.now();
  rec.ondataavailable = (e) => {
    if (e.data && e.data.size) chunks.push(e.data);
  };
  rec.start();
  const stopTracks = () => stream.getTracks().forEach((t) => t.stop());
  return {
    stop: () =>
      new Promise((resolve) => {
        rec.onstop = () => {
          stopTracks();
          resolve({
            blob: new Blob(chunks, { type: rec.mimeType || "audio/webm" }),
            durationMs: Date.now() - started,
          });
        };
        rec.stop();
      }),
    cancel: () => {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
      stopTracks();
    },
  };
}
