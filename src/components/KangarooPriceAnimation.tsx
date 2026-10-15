export default function KangarooPriceAnimation() {
  return (
    <div className="kangaroo-scene" aria-hidden="true">
      <div className="kangaroo-stage">
        <article className="price-ticket ticket-regular">
          <span>Regular</span>
          <strong>$42.00</strong>
        </article>
        <article className="price-ticket ticket-off">
          <span>30% off</span>
          <del>$42.00</del>
          <strong>$29.40</strong>
        </article>
        <article className="price-ticket ticket-half">
          <span>1/2 off</span>
          <del>$42.00</del>
          <strong>$21.00</strong>
        </article>
        {/* Twemoji kangaroo, CC-BY 4.0 https://github.com/twitter/twemoji */}
        <img
          className="kangaroo-runner"
          src="/illustrations/kangaroo.svg"
          width={72}
          height={72}
          alt=""
        />
      </div>
      <span>Checking prices across Australian retailers</span>
    </div>
  );
}
