import Image from "next/image";

/**
 * The TecAce wordmark, from tecace.com. The file is the site's own PNG
 * (980 × 272, navy on white), so it belongs on white surfaces; the sticky
 * bar and header are both white. Height comes from the caller, width follows.
 */
export function Logo({ className = "h-6" }: { className?: string }) {
  return (
    <Image
      src="/tecace-logo.png"
      alt="TecAce"
      width={980}
      height={272}
      priority
      className={`w-auto ${className}`}
    />
  );
}
