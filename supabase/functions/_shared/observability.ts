// Observability — fail-soft error/message capture to Sentry.
//
// Dark by default: with NO Sentry DSN configured, captureError/captureMessage
// are no-ops (they optionally jlog so a developer tailing the function logs can
// still see the event). The instant the owner stores a `sentry_dsn` Vault
// secret (see observability-sentry-2026-06.sql + config.ts), the SAME calls
// begin POSTing a minimal Sentry "store" envelope — no code change, no redeploy
// of call sites required.
//
// Hard rules (mirrors the rest of the edge codebase):
//   • NEVER throw to the caller. Every public function swallows its own errors.
//   • NEVER block. The POST is fire-and-forget (we don't await the response in
//     the hot path) and bounded by a short timeout so a hung Sentry can't stall
//     a request.
//   • NO secrets in logs. We never log the DSN, the public key, or the auth
//     header — only that a send was attempted/failed.
//
// Nothing in this module is wired into any function yet; call sites are added in
// a later, careful pass.

import { jlog } from "./log.ts";

// Parsed Sentry DSN → the pieces needed to address the legacy "store" endpoint.
//   DSN format:  {protocol}://{publicKey}@{host}[:port]/{projectId}
//   store URL:   {protocol}://{host}[:port]/api/{projectId}/store/
//   auth header: X-Sentry-Auth: Sentry sentry_version=7, sentry_key={publicKey}
export type SentryTarget = {
  storeUrl: string;
  publicKey: string;
  host: string;
  projectId: string;
};

// Parse a Sentry DSN into its store endpoint + public key. Returns null for an
// empty/garbage DSN (the dark path). Never throws.
export function parseDsn(dsn: string): SentryTarget | null {
  const raw = (dsn ?? "").trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const publicKey = u.username;
    // projectId is the last non-empty path segment (Sentry DSNs are
    // .../{projectId}; a path prefix is allowed for self-hosted setups).
    const segments = u.pathname.split("/").filter((s) => s !== "");
    const projectId = segments.length ? segments[segments.length - 1] : "";
    if (!publicKey || !projectId) return null;
    const prefix = segments.slice(0, -1).join("/");
    const apiPath = `${prefix ? `/${prefix}` : ""}/api/${projectId}/store/`;
    const storeUrl = `${u.protocol}//${u.host}${apiPath}`;
    return { storeUrl, publicKey, host: u.host, projectId };
  } catch (_) {
    return null; // malformed DSN → stay dark
  }
}

// Resolve the DSN from the config loader without importing it eagerly (config
// pulls in the whole Vault stack). Callers may also pass an explicit dsn to
// avoid the config round-trip entirely (used by tests + future hot-path wiring).
async function resolveDsn(explicit?: string): Promise<string> {
  if (typeof explicit === "string") return explicit;
  try {
    const { resolveCfgCached } = await import("./config.ts");
    const cfg = await resolveCfgCached();
    return cfg.sentryDsn ?? "";
  } catch (_) {
    return ""; // any failure resolving config → dark, never throw
  }
}

// A flattened, JSON-safe context bag attached to the event as `extra` + `tags`.
export type CaptureCtx = Record<string, unknown>;

// Coerce arbitrary context into a shallow, JSON-safe record. Never throws.
function safeExtra(ctx?: CaptureCtx): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!ctx) return out;
  try {
    for (const [k, v] of Object.entries(ctx)) {
      if (v === undefined) continue;
      if (v === null || ["string", "number", "boolean"].includes(typeof v)) {
        out[k] = v;
      } else {
        try {
          out[k] = JSON.stringify(v);
        } catch (_) {
          out[k] = String(v);
        }
      }
    }
  } catch (_) { /* ignore — best-effort */ }
  return out;
}

// Build the minimal Sentry "store" event payload. Kept deliberately small:
// just enough for the issue to be actionable (message + level + a stack-ish
// exception value + context). No PII is added here — callers control `ctx`.
function buildEvent(
  level: "error" | "info",
  message: string,
  exceptionType: string | null,
  exceptionValue: string | null,
  ctx?: CaptureCtx,
): Record<string, unknown> {
  const event: Record<string, unknown> = {
    // event_id: 32 lowercase hex chars, no dashes (Sentry's required format).
    event_id: crypto.randomUUID().replace(/-/g, ""),
    timestamp: new Date().toISOString(),
    platform: "javascript",
    level,
    logger: "switchy-edge",
    message,
    extra: safeExtra(ctx),
  };
  if (exceptionType || exceptionValue) {
    event.exception = {
      values: [{ type: exceptionType ?? "Error", value: exceptionValue ?? message }],
    };
  }
  return event;
}

// Fire the POST. Fire-and-forget: we kick off the fetch with a short abort
// timeout and DO NOT await it from the hot path (the public functions return
// immediately). Any failure is swallowed (optionally jlog'd). Never throws.
function send(target: SentryTarget, event: Record<string, unknown>): void {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      try {
        ctrl.abort();
      } catch (_) { /* ignore */ }
    }, 2500);
    // X-Sentry-Auth carries only the PUBLIC key — safe to send, never logged.
    const auth = `Sentry sentry_version=7, sentry_client=switchy-edge/1.0, sentry_key=${target.publicKey}`;
    fetch(target.storeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Sentry-Auth": auth },
      body: JSON.stringify(event),
      signal: ctrl.signal,
    })
      .then(() => {/* discard the response body — we don't read it */})
      .catch((e) => {
        // A thrown/rejected fetch (network down, abort, Sentry 5xx) is expected
        // to be harmless here — log without the DSN/key.
        jlog({ at: "observability.send_failed", error: String(e?.message ?? e) });
      })
      .finally(() => clearTimeout(timer));
  } catch (e) {
    // Even constructing/launching the fetch must never escape.
    jlog({ at: "observability.send_threw", error: String((e as Error)?.message ?? e) });
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

// Capture an error. Dark when no DSN: optionally jlog, no network. Configured:
// fire one fail-soft Sentry envelope. Never throws, never blocks the caller.
// `dsn` may be passed explicitly to skip the config round-trip (tests / future
// hot-path wiring that already has the cfg in hand).
export async function captureError(
  err: unknown,
  ctx?: CaptureCtx,
  dsn?: string,
): Promise<void> {
  try {
    const e = err as { name?: string; message?: string; stack?: string } | undefined;
    const message = String(e?.message ?? err ?? "unknown error");
    const type = e?.name ?? "Error";
    const resolved = await resolveDsn(dsn);
    const target = parseDsn(resolved);
    if (!target) {
      // Dark path — leave a structured breadcrumb in the function logs.
      jlog({ at: "observability.capture_error_dark", message, type, ...safeExtra(ctx) });
      return;
    }
    const event = buildEvent("error", message, type, message, ctx);
    send(target, event);
  } catch (e2) {
    // Absolute backstop — capture must never become the failure.
    try {
      jlog({ at: "observability.capture_error_threw", error: String((e2 as Error)?.message ?? e2) });
    } catch (_) { /* give up silently */ }
  }
}

// Capture an informational message (no exception). Same dark/configured
// semantics as captureError.
export async function captureMessage(
  msg: string,
  ctx?: CaptureCtx,
  dsn?: string,
): Promise<void> {
  try {
    const message = String(msg ?? "");
    const resolved = await resolveDsn(dsn);
    const target = parseDsn(resolved);
    if (!target) {
      jlog({ at: "observability.capture_message_dark", message, ...safeExtra(ctx) });
      return;
    }
    const event = buildEvent("info", message, null, null, ctx);
    send(target, event);
  } catch (e2) {
    try {
      jlog({ at: "observability.capture_message_threw", error: String((e2 as Error)?.message ?? e2) });
    } catch (_) { /* give up silently */ }
  }
}
