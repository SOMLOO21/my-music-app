import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permet de tester depuis un téléphone sur le même Wi-Fi (http://<IP du Mac>:3000).
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "*.local"],
  // Ancienne page « Mes réalisations », remplacée par le mode favoris du fil.
  async redirects() {
    return [{ source: "/realisations", destination: "/inspire", permanent: true }];
  },
};

export default nextConfig;
