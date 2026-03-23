import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.resolve(currentDir, "../.."),
  typedRoutes: true
};

export default nextConfig;
