import { describe, it, expect } from "vitest";
import { safeJsonForScript } from "../safe-json";

const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);

describe("safeJsonForScript", () => {
  it("neutralizes a </script> breakout in a user-supplied string", () => {
    const evil = { body: "</script><script>alert(1)</script>" };
    const out = safeJsonForScript(evil);
    // No raw </script> survives to close the host <script> block.
    expect(out.includes("</script>")).toBe(false);
    expect(out.includes("<script>")).toBe(false);
    // The angle brackets are escaped as \uXXXX.
    expect(out).toContain("\\u003c");
    expect(out).toContain("\\u003e");
  });

  it("escapes & so entity/context tricks can't survive either", () => {
    expect(safeJsonForScript({ a: "Tom & Jerry" })).toContain("\\u0026");
  });

  it("escapes the U+2028 / U+2029 line terminators (valid in JSON, illegal in JS)", () => {
    const out = safeJsonForScript({ a: `x${LS}y${PS}z` });
    expect(out.includes(LS)).toBe(false);
    expect(out.includes(PS)).toBe(false);
    expect(out).toContain("\\u2028");
    expect(out).toContain("\\u2029");
  });

  it("still round-trips to the identical value (escapes are valid JSON)", () => {
    const value = { body: "</script>", amp: "a&b", sep: `p${LS}q`, n: 42, nested: { x: [1, "<", ">"] } };
    expect(JSON.parse(safeJsonForScript(value))).toEqual(value);
  });

  it("leaves safe content untouched apart from the escaped code points", () => {
    expect(safeJsonForScript({ hello: "world", n: 1 })).toBe('{"hello":"world","n":1}');
  });
});
