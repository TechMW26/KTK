import Image from "next/image";
import { Diamond } from "lucide-react";

/**
 * Shared golden game emblem. `compact` fits the local and online match headers.
 */
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "logo brand-emblem compact" : "logo brand-emblem"}>
      <Image
        className="brand-logo-art"
        src="/cards/ktk-emblem-gold.webp"
        alt="Kill the King golden logo"
        width={720}
        height={720}
        unoptimized
      />
    </div>
  );
}

/** The ◆ rule that separates a heading from the copy beneath it. */
export function Ornament() {
  return (
    <div className="ornament" aria-hidden="true">
      <span>
        <Diamond fill="currentColor" strokeWidth={1} />
      </span>
    </div>
  );
}

/** The small-caps label that sits above a heading. */
export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="eyebrow">{children}</p>;
}
