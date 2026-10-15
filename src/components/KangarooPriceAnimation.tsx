export default function KangarooPriceAnimation() {
  return (
    <div className="kangaroo-scene" aria-hidden="true">
      <svg viewBox="0 0 460 300" role="presentation">
        <path
          className="kangaroo-route"
          d="M72 205 C135 118 190 238 255 145 S365 95 405 145"
          fill="none"
        />

        <g className="price-site site-one">
          <rect x="22" y="54" width="118" height="74" rx="16" />
          <circle cx="42" cy="76" r="6" />
          <path d="M55 76h61M40 96h78" />
          <text x="40" y="117">$29</text>
        </g>
        <g className="price-site site-two">
          <rect x="176" y="164" width="118" height="74" rx="16" />
          <circle cx="196" cy="186" r="6" />
          <path d="M209 186h61M194 206h78" />
          <text x="194" y="227">$24</text>
        </g>
        <g className="price-site site-three">
          <rect x="320" y="46" width="118" height="74" rx="16" />
          <circle cx="340" cy="68" r="6" />
          <path d="M353 68h61M338 88h78" />
          <text x="338" y="109">$21</text>
        </g>

        <g className="kangaroo-runner">
          <path className="kangaroo-tail" d="M37 28C13 28 2 42 0 56c18-11 35-13 50-7" />
          <ellipse className="kangaroo-body" cx="57" cy="38" rx="24" ry="29" />
          <path className="kangaroo-chest" d="M66 24c17 7 20 24 14 40" />
          <circle className="kangaroo-head" cx="78" cy="8" r="13" />
          <path className="kangaroo-ear" d="M71-2 68-22c9 4 13 13 12 23M82-2l8-19c5 8 4 17-1 25" />
          <path className="kangaroo-arm" d="M72 31l21 12M69 36l18 16" />
          <path className="kangaroo-leg" d="M52 62 35 83h29M70 62l16 21h25" />
          <circle className="kangaroo-eye" cx="82" cy="5" r="2" />
        </g>

        <g className="price-found">
          <circle cx="396" cy="152" r="19" />
          <path d="m409 166 15 15" />
          <path d="m387 152 6 6 12-14" />
        </g>
      </svg>
      <span>Checking prices across Australian retailers</span>
    </div>
  );
}
