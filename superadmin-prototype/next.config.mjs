import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// Permite que `next dev` vea los bindings de Wrangler (.dev.vars) como process.env.
initOpenNextCloudflareForDev();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
