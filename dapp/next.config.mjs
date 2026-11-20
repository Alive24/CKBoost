/** @type {import('next').NextConfig} */
import nextra from "nextra";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { getIsolatedRuntime } from "./lib/ckb/isolated-runtime.mjs";

const withNextra = nextra({
  contentDirBasePath: "/docs",
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const isolated = getIsolatedRuntime();
const isolatedDist = isolated ? `.next-isolated-${isolated.profileHash.slice(2, 14)}` : undefined;
if (isolated && process.env.CKBOOST_NEXT_DIST_DIR !== isolatedDist) throw new Error("Isolated QA requires its exact separate build directory.");

export default withNextra({
  ...(isolatedDist ? { distDir: isolatedDist } : {}),
  env: {
    NEXT_PUBLIC_CKBOOST_ISOLATED_QA: isolated ? "1" : "0",
    NEXT_PUBLIC_CKBOOST_ISOLATED_RUNTIME_PROFILE: isolated ? JSON.stringify(isolated) : "",
    // This is public contract configuration, already shipped by the full
    // deployment manager. Inline only current records for read-only discovery.
    NEXT_PUBLIC_CKBOOST_CURRENT_DEPLOYMENTS: JSON.stringify(
      isolated?.current ?? JSON.parse(readFileSync(path.join(repoRoot, "deployments.json"), "utf8")).current
    ),
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  webpack: (config, { isServer }) => {
    // Ignore pino-pretty in browser builds (it's Node.js only)
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        "pino-pretty": false,
      };
    }
    return config;
  },
  turbopack: {
    root: repoRoot,
    resolveAlias: {
      "next-mdx-import-source-file": "./mdx-components.ts",
    },
  },
});
