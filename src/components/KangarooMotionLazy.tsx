'use client';

import dynamic from 'next/dynamic';

// Same size and spot as the moving kangaroo, so nothing shifts when it loads.
function StillKangaroo() {
  return (
    <div className="roo-travel is-static">
      {/* eslint-disable-next-line @next/next/no-img-element -- 6 KB still frame */}
      <img
        className="roo roo-gif"
        src="/illustrations/kangaroo-still.webp"
        width={160}
        height={160}
        fetchPriority="high"
        alt=""
      />
    </div>
  );
}

const KangarooMotion = dynamic(() => import('@/components/KangarooMotion'), {
  ssr: false,
  loading: StillKangaroo
});

export default function KangarooMotionLazy() {
  return <KangarooMotion />;
}
