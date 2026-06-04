import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "500mb",
    },
    proxyClientMaxBodySize: "500mb",
  },
  // Allow opening dev server from phone via LAN IP (e.g. 192.168.0.110:3000)
  allowedDevOrigins: [
    "192.168.0.110",
    "172.30.64.1",
    "192.168.0.*",
    "192.168.1.*",
    "*.loca.lt",
  ],
};

export default nextConfig;
