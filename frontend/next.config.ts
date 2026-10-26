import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["react-plotly.js"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
