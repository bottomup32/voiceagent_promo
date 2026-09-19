"use client";

import { useEffect, useRef } from "react";
import type { TranscriptEntry } from "@/lib/types";

type TranscriptProps = {
  entries: TranscriptEntry[];
  thinking?: boolean;
  emptyMessage?: string;
  className?: string;
};

export function Transcript({
  entries,
  thinking,
  emptyMessage = "The transcript appears here once the call starts.",
  className,
}: TranscriptProps) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [entries, thinking]);

  if (!entries.length && !thinking) {
    return (
      <div className={`flex h-full items-center justify-center p-6 ${className ?? ""}`}>
        <p className="ta-body-2 text-center text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col gap-3 p-4 ${className ?? ""}`}
      aria-live="polite"
      aria-label="Call transcript"
    >
      {entries.map((entry) => (
        <div
          key={entry.id}
          className={`flex flex-col gap-1 ${
            entry.speaker === "caller" ? "items-end" : "items-start"
          }`}
        >
          <span className="ta-caption-1 px-1 text-muted-foreground">
            {entry.speaker === "caller" ? "You" : "Receptionist"}
          </span>
          <p
            className={`ta-body-2 max-w-[85%] rounded-xl px-3 py-2 ${
              entry.speaker === "caller"
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground"
            }`}
          >
            {entry.text.trim()}
          </p>
        </div>
      ))}

      {thinking ? (
        <div className="flex items-center gap-2 px-1">
          <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground" aria-hidden />
          <span className="ta-caption-1 text-muted-foreground">
            Receptionist is checking
          </span>
        </div>
      ) : null}

      <div ref={endRef} />
    </div>
  );
}
