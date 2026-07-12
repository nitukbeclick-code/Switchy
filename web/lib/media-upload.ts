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
  // Normalize the MIME before the extension lookup: browsers append codec params
  // (e.g. "audio/webm;codecs=opus"), which would miss the EXT map. Keep the real
  // blob.type for contentType below (it correctly carries the codecs).
  const base = (blob.type || "").split(";")[0].trim();
  const ext = EXT[base] ?? (v.kind === "image" ? "jpg" : v.kind === "audio" ? "webm" : "mp4");
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

// ── Image downscale (canvas) ─────────────────────────────────────────────────

/** Longest edge for an uploaded avatar — a 4000px selfie becomes a ~256px square-ish
 *  thumbnail before it ever leaves the browser. */
export const AVATAR_MAX_DIM = 256;

/** Downscale an image blob in the browser (canvas) so its longest edge is at most
 *  `maxDim` px. FAIL-SOFT by design: any decode/canvas/encode problem — or a
 *  "downscale" that didn't actually shrink the bytes — returns the ORIGINAL blob,
 *  so the upload path never breaks because of this optimization. GIFs are passed
 *  through untouched (canvas would flatten the animation). */
export async function downscaleImage(blob: Blob, maxDim = AVATAR_MAX_DIM): Promise<Blob> {
  if (!blob.type.startsWith("image/") || blob.type === "image/gif") return blob;
  let objectUrl: string | null = null;
  try {
    objectUrl = URL.createObjectURL(blob);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("image decode failed"));
      el.src = objectUrl as string;
    });
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) return blob;
    const scale = maxDim / Math.max(w, h);
    if (scale >= 1) return blob; // already small enough
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return blob;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const out = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85),
    );
    // Only take the re-encode when it genuinely shrank the payload.
    return out && out.size > 0 && out.size < blob.size ? out : blob;
  } catch {
    return blob;
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
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
      new Promise((resolve, reject) => {
        // Guard against a MediaRecorder that never fires onstop (some browsers /
        // states), which would otherwise leave the composer stuck in busy.
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          stopTracks();
          resolve({
            blob: new Blob(chunks, { type: rec.mimeType || "audio/webm" }),
            durationMs: Date.now() - started,
          });
        };
        const fail = (err: Error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          stopTracks();
          reject(err);
        };
        const timer = setTimeout(
          () => fail(new Error("עצירת ההקלטה נכשלה. נסו שוב.")),
          15000,
        );
        rec.onstop = finish;
        rec.onerror = () => fail(new Error("אירעה שגיאה בהקלטה. נסו שוב."));
        // If the recorder is already inactive, onstop won't fire — resolve now.
        if (rec.state === "inactive") {
          finish();
          return;
        }
        try {
          rec.stop();
        } catch {
          fail(new Error("עצירת ההקלטה נכשלה. נסו שוב."));
        }
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
