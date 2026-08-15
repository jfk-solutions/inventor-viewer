const ICON_URL = `${import.meta.env.BASE_URL}brand/jfk-solutions-icon.png`;
const WORDMARK_URL = `${import.meta.env.BASE_URL}brand/jfk-solutions-wordmark.png`;

export function Brand() {
  return (
    <a className="brand" href="https://jfk-solutions.de" target="_blank" rel="noreferrer" aria-label="JFK Solutions website">
      <img className="brand-symbol" src={ICON_URL} alt="" aria-hidden="true" />
      <img className="brand-wordmark" src={WORDMARK_URL} alt="" aria-hidden="true" />
    </a>
  );
}

export function BrandIcon({ className = "" }: { className?: string }) {
  return <img className={className} src={ICON_URL} alt="" aria-hidden="true" />;
}
