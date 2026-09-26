import type {
  Customer,
  CustomerPhase,
  CustomerStage,
  LifecycleActor,
  LifecycleEvent,
} from "./types";

/*
 * The funnel, and the only moves it allows:
 *
 *           stage (sales, inside the demo only)
 *      new → contacted → interested → won ─┐           lost
 *                                          │             │
 *   ┌──────┐  won + ready + email  ┌───────▼────┐        │
 *   │ demo │ ────────────────────► │ onboarding │        │
 *   └──┬───┘ ◄─────── undo ─────── └──────┬─────┘        │
 *      │ lost                             │ checklist done
 *      ▼                                  ▼
 *   ┌─────────┐ ◄──── churn ──── ┌────────────┐
 *   │ churned │                  │ production │
 *   └─────────┘ ── reopen → demo └────────────┘
 *
 * Every move returns the events to record, so the history is written by the
 * same code that decides the move.
 */

export const STAGE_LABEL: Record<CustomerStage, string> = {
  new: "New",
  contacted: "Contacted",
  interested: "Interested",
  won: "Won",
  lost: "Lost",
};

export const PHASE_LABEL: Record<CustomerPhase, string> = {
  demo: "Demo",
  onboarding: "Onboarding",
  production: "Production",
  churned: "Churned",
};

export const PHASE_TRANSITIONS: Record<CustomerPhase, readonly CustomerPhase[]> = {
  demo: ["onboarding", "churned"],
  onboarding: ["production", "demo", "churned"],
  production: ["onboarding", "churned"],
  churned: ["demo"],
};

export type LifecycleContext = {
  now: string;
  newId: () => string;
  /** Whether a passing preflight exists for the current setup (M5). */
  preflightOk?: boolean;
};

export type ChecklistItem = {
  id: "contactEmail" | "knowledge" | "preflight" | "phoneConnected";
  ok: boolean;
  label: string;
  manual?: boolean;
};

type Blocked = { ok: false; reasons: string[] };
type Moved = { ok: true; customer: Customer; events: LifecycleEvent[] };

const phaseOf = (customer: Customer): CustomerPhase => customer.phase ?? "demo";
const stageOf = (customer: Customer): CustomerStage => customer.stage ?? "new";

/** What has to be true before production. Shown to the operator as-is. */
export function checklist(
  customer: Customer,
  ctx: Pick<LifecycleContext, "preflightOk">,
): ChecklistItem[] {
  const { profile } = customer;
  return [
    {
      id: "contactEmail",
      ok: Boolean(customer.contactEmail?.trim()),
      label: "Contact email to sign in with",
    },
    {
      id: "knowledge",
      ok: Boolean(profile.address?.trim() && profile.phone?.trim() && profile.hours?.length),
      label: "Knowledge has an address, a phone number and hours",
    },
    {
      id: "preflight",
      ok: Boolean(ctx.preflightOk),
      label: "Preflight passed for the current setup",
    },
    {
      id: "phoneConnected",
      ok: Boolean(customer.checklist?.phoneConnected),
      label: "Phone number connected (marked by hand until Twilio is wired)",
      manual: true,
    },
  ];
}

export function canTransition(
  customer: Customer,
  to: CustomerPhase,
  ctx: Pick<LifecycleContext, "preflightOk">,
): { ok: true } | Blocked {
  const from = phaseOf(customer);
  if (from === to) return { ok: false, reasons: [`Already in ${PHASE_LABEL[to]}.`] };
  if (!PHASE_TRANSITIONS[from].includes(to)) {
    const article = from === "onboarding" ? "An" : "A";
    return {
      ok: false,
      reasons: [`${article} ${PHASE_LABEL[from].toLowerCase()} cannot go straight to ${PHASE_LABEL[to].toLowerCase()}.`],
    };
  }

  const reasons: string[] = [];
  if (from === "demo" && to === "onboarding") {
    if (stageOf(customer) !== "won") reasons.push("Mark the deal Won first.");
    if (customer.status !== "ready") reasons.push("Research has not finished.");
    if (!customer.contactEmail?.trim()) reasons.push("Add a contact email; it is how they sign in.");
  }
  if (to === "production") {
    for (const item of checklist(customer, ctx)) {
      if (!item.ok) reasons.push(item.label);
    }
  }
  return reasons.length ? { ok: false, reasons } : { ok: true };
}

function event(
  ctx: LifecycleContext,
  actor: LifecycleActor,
  kind: LifecycleEvent["kind"],
  from: string,
  to: string,
  reason?: string,
): LifecycleEvent {
  return { id: ctx.newId(), at: ctx.now, kind, from, to, actor, ...(reason ? { reason } : {}) };
}

export function applyTransition(
  customer: Customer,
  to: CustomerPhase,
  ctx: LifecycleContext,
  actor: LifecycleActor,
  reason?: string,
): Moved | Blocked {
  const allowed = canTransition(customer, to, ctx);
  if (!allowed.ok) return allowed;

  const from = phaseOf(customer);
  const fromStage = stageOf(customer);
  // Lost means "left during the demo"; leaving later keeps the Won it earned.
  // Coming back from churned starts the conversation again.
  const stage: CustomerStage =
    from === "demo" && to === "churned" ? "lost" : to === "demo" && from === "churned" ? "contacted" : fromStage;

  const events = [event(ctx, actor, "phase", from, to, reason)];
  if (stage !== fromStage) events.push(event(ctx, actor, "stage", fromStage, stage));

  return {
    ok: true,
    customer: { ...customer, phase: to, stage, phaseChangedAt: ctx.now, updatedAt: ctx.now },
    events,
  };
}

export function applyStage(
  customer: Customer,
  stage: CustomerStage,
  ctx: LifecycleContext,
  actor: LifecycleActor,
): Moved | Blocked {
  const phase = phaseOf(customer);
  const current = stageOf(customer);
  if (stage === current) return { ok: true, customer, events: [] };

  if (phase === "churned") {
    if (stage === "lost") {
      // Already handled above when the stage is already Lost; reaching here
      // means the customer churned after onboarding, where the stage stays
      // Won on purpose. Lost means "left during the demo".
      return {
        ok: false,
        reasons: ["Left after onboarding, so the stage stays Won. It was not lost."],
      };
    }
    const reopened = applyTransition(customer, "demo", ctx, actor);
    if (!reopened.ok) return reopened;
    return stage === reopened.customer.stage
      ? reopened
      : {
          ok: true,
          customer: { ...reopened.customer, stage },
          events: [...reopened.events.filter((e) => e.kind === "phase"), event(ctx, actor, "stage", current, stage)],
        };
  }
  if (phase !== "demo") {
    return { ok: false, reasons: ["The stage stays Won once onboarding starts. Move the phase instead."] };
  }
  if (stage === "lost") return applyTransition(customer, "churned", ctx, actor);

  return {
    ok: true,
    customer: { ...customer, stage, updatedAt: ctx.now },
    events: [event(ctx, actor, "stage", current, stage)],
  };
}
