"use client";

import ReactMarkdown from "react-markdown";
import { ExternalLink, FileSearch } from "lucide-react";
import { EmptyState } from "@/components/admin/shared";
import type { ResearchSource } from "@/lib/types";

type Props = {
  dossier: string;
  sources: ResearchSource[];
  researchedAt?: string;
};

export function SourcesPanel({ dossier, sources, researchedAt }: Props) {
  if (!dossier && sources.length === 0) {
    return (
      <EmptyState
        icon={<FileSearch className="size-6" />}
        message="No research yet. Run research to collect the business data."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="ta-headline-2">Sources</h3>
        {researchedAt ? (
          <p className="ta-caption-1 text-muted-foreground">
            Collected {new Date(researchedAt).toLocaleString()}
          </p>
        ) : null}
        {sources.length === 0 ? (
          <p className="ta-caption-1 text-muted-foreground">No sources were cited.</p>
        ) : (
          <ul className="space-y-1.5">
            {sources.map((source) => (
              <li key={source.url}>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="ta-label-1 text-primary inline-flex items-center gap-1.5 hover:underline"
                >
                  <ExternalLink className="size-3.5" aria-hidden />
                  {source.title}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="ta-headline-2">Raw research</h3>
        <div className="ta-body-2-reading prose-sm max-w-none space-y-3 [&_h1]:ta-headline-1 [&_h2]:ta-headline-2 [&_h3]:ta-label-1 [&_li]:ml-4 [&_li]:list-disc [&_strong]:font-semibold">
          <ReactMarkdown>{dossier}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
