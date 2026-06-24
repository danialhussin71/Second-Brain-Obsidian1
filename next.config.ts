import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "4mb" },
  },
  transpilePackages: ["three"],
  // LanceDB ships native .node binaries — they can't be bundled by webpack
  // and must be loaded at runtime on the server side only.
  serverExternalPackages: ["@lancedb/lancedb", "@modelcontextprotocol/sdk"],
  // The ingested business-doc notes are read from disk at runtime (client-knowledge.ts).
  // Trace them into the agent route's serverless bundle so they ship in prod.
  outputFileTracingIncludes: {
    "/api/agents/chat": ["./content/knowledge/**/*"],
    "/api/brain": ["./content/knowledge/**/*"],
  },
  webpack: (config) => {
    // transformers.js loads ONNX runtime — exclude its node-side fs/sharp
    // imports from the client bundle so it works in the browser.
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      sharp: false,
      "onnxruntime-node$": false,
    };
    return config;
  },
};

export default nextConfig;
