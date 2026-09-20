import { cn } from "@/lib/utils";

/** The build this page came from. Set in next.config.ts. */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "v0";

export function VersionBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn("ta-caption-2 text-muted-foreground tabular-nums", className)}
      title="Build version"
    >
      {APP_VERSION}
    </span>
  );
}
