import KangarooMotionLazy from '@/components/KangarooMotionLazy';

// The aisle and shelf tickets are plain server-rendered markup. Only the hopping
// kangaroo needs JavaScript, and that chunk loads after the page is interactive.
export default function KangarooPriceAnimation() {
  return (
    <div className="kangaroo-scene is-paused">
      <div className="shelf" aria-hidden="true">
        <svg className="aisle" viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice">
          <rect className="aisle-cooler" x="14" y="18" width="84" height="292" rx="8" />
          <path className="aisle-cooler-shine" d="M28 36h8v256h-8z" />
          <rect className="aisle-handle" x="82" y="150" width="6" height="36" rx="3" />
          <rect className="aisle-shelf-board" x="14" y="108" width="612" height="11" rx="2" />
          <rect className="aisle-shelf-board" x="14" y="214" width="612" height="11" rx="2" />
          <rect className="aisle-shelf-board" x="14" y="322" width="612" height="12" rx="2" />

          <g className="aisle-can">
            <rect x="248" y="62" width="22" height="42" rx="9" />
            <ellipse className="aisle-label" cx="259" cy="64" rx="11" ry="4" />
            <rect x="278" y="70" width="22" height="34" rx="9" />
            <ellipse className="aisle-label" cx="289" cy="72" rx="11" ry="4" />
            <rect x="308" y="58" width="22" height="46" rx="9" />
            <ellipse className="aisle-label" cx="319" cy="60" rx="11" ry="4" />
          </g>
          <g className="aisle-warm">
            <rect x="340" y="66" width="22" height="38" rx="9" />
            <ellipse className="aisle-label" cx="351" cy="68" rx="11" ry="4" />
            <rect x="370" y="74" width="22" height="30" rx="9" />
            <ellipse className="aisle-label" cx="381" cy="76" rx="11" ry="4" />
          </g>
          <g className="aisle-box">
            <rect x="188" y="64" width="50" height="40" rx="4" />
            <rect className="aisle-label" x="194" y="76" width="38" height="12" rx="2" />
            <rect x="404" y="72" width="58" height="32" rx="4" />
            <rect className="aisle-label" x="412" y="82" width="42" height="10" rx="2" />
          </g>

          <g className="aisle-can">
            <rect x="118" y="164" width="24" height="46" rx="10" />
            <ellipse className="aisle-label" cx="130" cy="166" rx="12" ry="4.5" />
            <rect x="148" y="174" width="24" height="36" rx="10" />
            <ellipse className="aisle-label" cx="160" cy="176" rx="12" ry="4.5" />
            <rect x="520" y="160" width="24" height="50" rx="10" />
            <ellipse className="aisle-label" cx="532" cy="162" rx="12" ry="4.5" />
            <rect x="550" y="172" width="24" height="38" rx="10" />
            <ellipse className="aisle-label" cx="562" cy="174" rx="12" ry="4.5" />
            <rect x="580" y="166" width="24" height="44" rx="10" />
            <ellipse className="aisle-label" cx="592" cy="168" rx="12" ry="4.5" />
          </g>
          <g className="aisle-box">
            <rect x="186" y="162" width="64" height="48" rx="4" />
            <rect className="aisle-label" x="194" y="176" width="48" height="14" rx="2" />
            <rect x="430" y="168" width="72" height="42" rx="4" />
            <rect className="aisle-label" x="440" y="180" width="52" height="12" rx="2" />
          </g>

          <g className="aisle-box">
            <rect x="112" y="268" width="78" height="50" rx="4" />
            <rect className="aisle-label" x="122" y="284" width="58" height="14" rx="2" />
            <rect x="198" y="280" width="56" height="38" rx="4" />
            <rect className="aisle-label" x="206" y="292" width="40" height="12" rx="2" />
            <rect x="470" y="266" width="70" height="52" rx="4" />
            <rect className="aisle-label" x="480" y="282" width="50" height="14" rx="2" />
            <rect x="548" y="278" width="62" height="40" rx="4" />
            <rect className="aisle-label" x="556" y="290" width="46" height="12" rx="2" />
          </g>
        </svg>

        <article className="shelf-ticket ticket-regular">
          <header>Shelf price</header>
          <strong>$42.00</strong>
          <small>each</small>
          <i />
        </article>
        <article className="shelf-ticket ticket-special">
          <header>Special</header>
          <del>Was $42.00</del>
          <strong>$29.40</strong>
          <em>30% off</em>
          <i />
        </article>
        <article className="shelf-ticket ticket-half">
          <header>Half price</header>
          <del>Was $42.00</del>
          <strong>$21.00</strong>
          <em>1/2 off</em>
          <i />
        </article>

        <KangarooMotionLazy />
      </div>
    </div>
  );
}
