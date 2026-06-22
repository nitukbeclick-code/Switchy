import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

// Pin the Turbopack workspace root to THIS app. Without it, Next walks up and
// picks the parent Flutter repo's package-lock.json (multiple lockfiles), which
// produces a wrong-root warning and can mis-resolve files.
const projectRoot = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;
