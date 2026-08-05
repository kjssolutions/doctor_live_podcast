import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "500mb",
    },
    proxyClientMaxBodySize: "500mb",
  },
  // Allow opening dev server from phone via LAN IP / tunnels
  allowedDevOrigins: [
    "192.168.0.110",
    "192.168.0.147",
    "172.30.64.1",
    "192.168.0.*",
    "192.168.1.*",
    "*.loca.lt",
    "*.trycloudflare.com",
  ],
};

export default nextConfig;
