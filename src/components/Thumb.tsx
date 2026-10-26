"use client";
/* eslint-disable @next/next/no-img-element */

import { useState } from "react";
import { PLATFORM_LABEL, type Video } from "@/lib/types";

/** Vignette servie par /thumb/<id> (renouvelée quand TikTok l'a expirée), avec repli propre. */
export default function Thumb({ video, className }: { video: Video; className: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className={`flex items-center justify-center bg-zinc-900 text-sm text-white/40 ${className}`}>
        {video.tags.type[0] ?? PLATFORM_LABEL[video.platform]}
      </div>
    );
  }
  return <img src={`/thumb/${video.id}`} alt="" loading="lazy" onError={() => setFailed(true)} className={className} />;
}
