import { providerSlug } from "@/lib/provider-slug";
import {
  providerBrandColor,
  providerInitials,
  providerLogoFile,
} from "@/lib/format";

// ────────────────────────────────────────────────────────────────────────────
// <ProviderLogo> — the carrier/provider brand mark, shared by the comparison
// table, the /providers grid and the provider detail hero.
//
// Shows the REAL logo image when the carrier has a bundled asset
// (web/public/assets/logos/, the same files the static site uses) — on a white
// chip so a transparent or dark wordmark reads on any theme. When there is no
// bundled logo it falls back to a brand-colored monogram avatar: never blank,
// never a wrong/placeholder logo (truth-only). The brand color AND the logo are
// the carrier's OWN — NEVER recolored to the app accent. Decorative: the provider
// name always sits beside it, so the mark is aria-hidden.
// ────────────────────────────────────────────────────────────────────────────

type Rounded = "full" | "2xl";
const ROUND: Record<Rounded, string> = {
  full: "rounded-full",
  "2xl": "rounded-2xl",
};

export function ProviderLogo({
  provider,
  size = 32,
  rounded = "full",
  className = "",
}: {
  provider: string;
  size?: number;
  rounded?: Rounded;
  className?: string;
}) {
  const file = providerLogoFile(providerSlug(provider));
  const box = `inline-flex shrink-0 select-none items-center justify-center ${ROUND[rounded]} shadow-sm ring-1 ring-inset ring-black/10 ${className}`;

  if (file) {
    return (
      <span
        aria-hidden="true"
        className={`${box} overflow-hidden bg-white`}
        style={{ width: size, height: size }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size static brand asset from /public; next/image needs loader config and adds nothing for a tiny logo, while plain <img> stays CSP 'self'-safe and CLS-safe via width/height. */}
        <img
          src={`/assets/logos/${file}`}
          alt={provider}
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-contain p-[12%]"
        />
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`${box} font-bold leading-none text-white`}
      style={{
        width: size,
        height: size,
        backgroundColor: providerBrandColor(provider),
        fontSize: Math.round(size * 0.34),
      }}
    >
      {providerInitials(provider)}
    </span>
  );
}
