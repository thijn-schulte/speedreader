import type { NextConfig } from "next";

// The Sites version keeps its existing build. GitHub Actions exports a static site.
const pages = process.env.GITHUB_PAGES === "true";
const nextConfig: NextConfig = pages ? {
  output: "export",
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
  trailingSlash: true,
  images: { unoptimized: true },
} : {};

export default nextConfig;
