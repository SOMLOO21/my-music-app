import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permet de tester depuis un téléphone sur le même Wi-Fi (http://<IP du Mac>:3000).
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "*.local"],
  // SYNCOPE lit sa page et lance ffmpeg à l'exécution : fichiers à embarquer dans la fonction.
  outputFileTracingIncludes: {
    "/syncope/[[...path]]": ["./src/syncope/index.html", "./node_modules/ffmpeg-static/ffmpeg"],
  },
  // Ancienne page « Mes réalisations », remplacée par le mode favoris du fil.
  async redirects() {
    return [{ source: "/realisations", destination: "/inspire", permanent: true }];
  },
};

export default nextConfig;
