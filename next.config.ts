import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle → `.next/standalone/server.js`.
  // Lets the "Build App" workflow ship a directly runnable web artifact.
  output: "standalone",
};

export default nextConfig;
