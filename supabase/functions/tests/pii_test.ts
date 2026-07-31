// Unit tests for the PII masking helpers used by the CRM before contact data
// leaves the edge function. Run from supabase/functions/:  deno task test

import { assertEquals } from "@std/assert";
import { maskEmail, maskEmailN, maskPhone } from "../_shared/pii.ts";

Deno.test("maskPhone keeps the last 3 chars and masks the rest, same length", () => {
  assertEquals(maskPhone("972501234567"), "•••••••••567");
  assertEquals(maskPhone("0501234567"), "•••••••567");
  assertEquals(maskPhone("972501234567").length, "972501234567".length);
});

Deno.test("maskPhone fully masks very short values and handles empty/null", () => {
  assertEquals(maskPhone("12"), "••");
  assertEquals(maskPhone("123"), "•••");
  assertEquals(maskPhone(""), "");
  assertEquals(maskPhone(null), "");
  assertEquals(maskPhone(undefined), "");
});

Deno.test("maskPhone trims surrounding whitespace before masking", () => {
  assertEquals(maskPhone("  0501234567  "), "•••••••567");
});

Deno.test("maskEmail masks the local part but keeps the domain", () => {
  assertEquals(maskEmail("dan.cohen@gmail.com"), "d••••••••@gmail.com");
  assertEquals(maskEmail("a@x.com"), "a•@x.com"); // single-char local still gets a mask char
});

Deno.test("maskEmail treats a non-email as opaque and fully masks it", () => {
  assertEquals(maskEmail("notanemail"), "••••••••••");
  assertEquals(maskEmail("trailing@"), "•••••••••");
  assertEquals(maskEmail("@leading.com"), "••••••••••••");
});

Deno.test("maskEmailN preserves null / empty instead of returning a string", () => {
  assertEquals(maskEmailN(null), null);
  assertEquals(maskEmailN(""), null);
  assertEquals(maskEmailN("  "), null);
  assertEquals(maskEmailN("dan@gmail.com"), "d••@gmail.com");
});
