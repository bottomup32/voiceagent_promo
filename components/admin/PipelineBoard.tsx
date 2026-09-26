"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { StatusBadge } from "@/components/admin/shared";
import { FOLLOW_UP_ICON, HEAT_KIND, PHASE_LABEL, STAGE_LABEL, sinceLabel } from "@/components/admin/crm-shared";
import { formatDuration } from "@/lib/analytics";
import type { CustomerPhase, CustomerStage, CustomerWithStats } from "@/lib/types";

/** The last thing that happened, whichever it was. */
function lastActivity(customer: CustomerWithStats): string | undefined {
  const { lastCallAt, lastViewAt } = customer.stats;
  if (lastCallAt && lastViewAt) return lastCallAt > lastViewAt ? lastCallAt : lastViewAt;
  return lastCallAt ?? lastViewAt;
}

/**
 * The sales stages while a prospect is still a demo, then one column per
 * phase after it. Lost is not a column of its own any more: a lost demo is
 * churned, and so is anyone who leaves later.
 */
const DEMO_STAGES = ["new", "contacted", "interested", "won"] as const;
type Column =
  | { key: string; label: string; kind: "stage"; stage: CustomerStage }
  | { key: string; label: string; kind: "phase"; phase: Exclude<CustomerPhase, "demo"> };
const COLUMNS: Column[] = [
  ...DEMO_STAGES.map((stage) => ({ key: stage, label: STAGE_LABEL[stage], kind: "stage" as const, stage })),
  ...(["onboarding", "production", "churned"] as const).map((phase) => ({
    key: phase,
    label: PHASE_LABEL[phase],
    kind: "phase" as const,
    phase,
  })),
];

function inColumn(customer: CustomerWithStats, column: Column): boolean {
  const phase = customer.phase ?? "demo";
  return column.kind === "stage"
    ? phase === "demo" && (customer.stage ?? "new") === column.stage
    : phase === column.phase;
}

function Card({
  customer,
  overdue,
  onOpen,
  onMove,
  onPhase,
}: {
  customer: CustomerWithStats;
  overdue: boolean;
  onOpen: () => void;
  onMove: (stage: CustomerStage) => void;
  onPhase: (to: CustomerPhase) => void;
}) {
  const stage = customer.stage ?? "new";
  const at = lastActivity(customer);
  const minutes = Math.round((customer.stats.totalSec / 60) * 10) / 10;

  const phase = customer.phase ?? "demo";
  const stageIndex = DEMO_STAGES.indexOf(stage as (typeof DEMO_STAGES)[number]);
  const back: { label: string; go: () => void } | null =
    phase === "demo"
      ? stageIndex > 0
        ? { label: `Move back to ${STAGE_LABEL[DEMO_STAGES[stageIndex - 1]]}`, go: () => onMove(DEMO_STAGES[stageIndex - 1]) }
        : null
      : phase === "onboarding"
        ? { label: "Back to the demo", go: () => onPhase("demo") }
        : phase === "production"
          ? { label: "Back to onboarding", go: () => onPhase("onboarding") }
          : { label: "Reopen as a demo", go: () => onPhase("demo") };
  const forward: { label: string; go: () => void } | null =
    phase === "demo"
      ? stage === "won"
        ? { label: "Start onboarding", go: () => onPhase("onboarding") }
        : stageIndex >= 0
          ? { label: `Move on to ${STAGE_LABEL[DEMO_STAGES[stageIndex + 1]]}`, go: () => onMove(DEMO_STAGES[stageIndex + 1]) }
          : null
      : phase === "onboarding"
        ? { label: "Go to production", go: () => onPhase("production") }
        : null;

  return (
    <li className="group hover:border-ring/60 rounded-lg border p-2.5 transition-colors">
      <button type="button" onClick={onOpen} className="w-full space-y-1.5 text-left">
        <span className="ta-label-1 line-clamp-2 block">
          {customer.profile.name || customer.businessName || "Unnamed"}
        </span>
        <span className="ta-caption-2 text-muted-foreground block font-mono">{customer.code ?? "—"}</span>
        <span className="flex flex-wrap items-center gap-1.5">
          <StatusBadge kind={HEAT_KIND[customer.heat.level]}>
            {customer.heat.level}
          </StatusBadge>
          {at ? (
            <span className="ta-caption-2 text-muted-foreground">{sinceLabel(at)}</span>
          ) : (
            <span className="ta-caption-2 text-muted-foreground">no activity</span>
          )}
        </span>
        <span className="ta-caption-2 text-muted-foreground block tabular-nums">
          {customer.stats.calls} call{customer.stats.calls === 1 ? "" : "s"}
          {minutes >= 0.1 ? ` · ${formatDuration(customer.stats.totalSec)}` : ""}
        </span>
        {overdue ? (
          <span className="ta-caption-2 text-warning flex items-center gap-1">
            <FOLLOW_UP_ICON className="size-3" aria-hidden />
            Follow up due
          </span>
        ) : null}
      </button>

      {/*
        A board nobody can move things on is a list with extra whitespace, and
        a drag library is a lot of weight for seven columns. Two arrows nudge a
        card one column either way; the drawer has the full picker.
      */}
      <div className="mt-1.5 flex justify-between opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        <button
          type="button"
          disabled={!back}
          onClick={back?.go}
          aria-label={back?.label ?? "Nothing before this"}
          className="text-muted-foreground hover:text-foreground disabled:opacity-20"
        >
          <ChevronLeft className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          disabled={!forward}
          onClick={forward?.go}
          aria-label={forward?.label ?? "Nothing after this"}
          className="text-muted-foreground hover:text-foreground disabled:opacity-20"
        >
          <ChevronRight className="size-4" aria-hidden />
        </button>
      </div>
    </li>
  );
}

export function PipelineBoard({
  customers,
  overdueIds,
  onOpen,
  onMove,
  onPhase,
}: {
  customers: CustomerWithStats[];
  overdueIds: Set<string>;
  onOpen: (customer: CustomerWithStats) => void;
  onMove: (customer: CustomerWithStats, stage: CustomerStage) => void;
  onPhase: (customer: CustomerWithStats, to: CustomerPhase) => void;
}) {
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <div className="grid min-w-[72rem] grid-cols-7 gap-3">
        {COLUMNS.map((column) => {
          // Hottest first inside a column: the stage says where it stands, the
          // order says who to call.
          const inThisColumn = customers
            .filter((customer) => inColumn(customer, column))
            .sort((a, b) => b.heat.score - a.heat.score);
          return (
            <section key={column.key} className="flex flex-col gap-2">
              <header className="flex items-baseline justify-between gap-2 px-0.5">
                <h3 className="ta-label-1">{column.label}</h3>
                <span className="ta-caption-2 text-muted-foreground tabular-nums">
                  {inThisColumn.length}
                </span>
              </header>
              {inThisColumn.length === 0 ? (
                <div className="bg-muted/30 ta-caption-2 text-muted-foreground flex min-h-24 items-center justify-center rounded-lg px-2 text-center">
                  Nobody here
                </div>
              ) : (
                <ul className="space-y-2">
                  {inThisColumn.map((customer) => (
                    <Card
                      key={customer.id}
                      customer={customer}
                      overdue={overdueIds.has(customer.id)}
                      onOpen={() => onOpen(customer)}
                      onMove={(next) => onMove(customer, next)}
                      onPhase={(to) => onPhase(customer, to)}
                    />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
