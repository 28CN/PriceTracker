export default function AmbientBackground() {
  return (
    <svg
      className="ambient-background"
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="ambient-ribbon" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent-cyan)" stopOpacity=".08" />
          <stop offset=".55" stopColor="var(--brand)" stopOpacity=".12" />
          <stop offset="1" stopColor="var(--brand)" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="ambient-glow-a">
          <stop offset="0" stopColor="var(--brand)" stopOpacity=".1" />
          <stop offset="1" stopColor="var(--brand)" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="ambient-glow-b">
          <stop offset="0" stopColor="var(--accent-cyan)" stopOpacity=".08" />
          <stop offset="1" stopColor="var(--accent-cyan)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="1240" cy="70" rx="430" ry="330" fill="url(#ambient-glow-a)" />
      <ellipse cx="110" cy="780" rx="470" ry="300" fill="url(#ambient-glow-b)" />
      <path
        d="M-100 760C160 560 350 790 620 635s438-94 650-260 292-80 350-34v180c-100-42-176-22-292 68-214 166-398 104-646 250S178 714-100 894Z"
        fill="url(#ambient-ribbon)"
      />
      <path
        d="M-80 747C182 576 365 785 624 638s430-92 646-263 290-78 350-32"
        fill="none"
        stroke="var(--brand)"
        strokeOpacity=".08"
        strokeWidth="2"
      />
    </svg>
  );
}
