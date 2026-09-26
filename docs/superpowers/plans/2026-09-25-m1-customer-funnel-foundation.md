# M1: Customer Funnel Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every customer an immutable readable code and a lifecycle phase (`demo → onboarding → production`, `churned`), moved only through a tested state machine that records every change, and show it on the admin CRM.

**Architecture:** Two new pure modules (`lib/customer-code.ts`, `lib/lifecycle.ts`) hold all the rules and are safe for client components. The `Store` gains two atomic primitives (`setIfAbsent`, `take`) that the code index uses now and the magic-link tokens use in M2. Phase changes and stage changes become `LifecycleEvent`s in an append-only `lifecycle:{id}` list, following the `notes:{id}` pattern in `lib/crm.ts`, and flow into `timeline()` / `activityFeed()`.

**Tech Stack:** Next.js 16.3.5 (App Router, route handlers), TypeScript, vitest, shadcn/ui on Base UI, Upstash-style Redis REST or JSON files via `lib/kv.ts`.

**Spec:** `docs/superpowers/specs/2026-09-25-customer-lifecycle-design.md` (section "M1"). Later milestones (M2 portal, M3 limits, M4 harness, M5 preflight) get their own plans.

## Global Constraints

- Tests are plain vitest over `lib/`, no DOM, no network; the whole suite stays under a second. Run with `npx vitest run`.
- `npm run lint` must stay clean (zero warnings), `npx tsc --noEmit` must pass.
- Any `lib/` module a client component imports must not import `node:fs` or `lib/calls.ts` (CLAUDE.md). `lib/customer-code.ts` and `lib/lifecycle.ts` are client-imported.
- `Customer.stage` is operator-only; nothing moves it on the operator's behalf except the documented stage side-effects of an operator-triggered phase change.
- Customer code: `slug` + `-` + 3 Crockford base32 chars from `0123456789abcdefghjkmnpqrstvwxyz`; slug max 24 chars; immutable after assignment; the public link stays `/c/{nanoid}`.
- Codes are assigned only in the create route and the backfill route; `saveCustomer` stays side-effect free.
- Phase is the source of truth. `stage === "lost"` ⇔ went `demo → churned`. `phase ∈ {onboarding, production}` ⇒ `stage === "won"`.
- UI: Base UI composition (`render={<Link />}`, `nativeButton={false}` for anchors), `.ta-*` type classes, cards `rounded-xl border shadow-none`, never hand-edit `app/globals.css`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A business name with no ASCII letters (Korean, emoji only) must still get a sensible code (domain label, then category noun, then `biz`), never an empty slug or a leading `-`. Test in Task 2.
2. Apostrophes and ampersands (`Joe's Pizza`, `Kim & Lee LLP`) must give `joes-pizza`, `kim-lee`, not `joe-s-pizza`. Test in Task 2.
3. Changing the stage of a customer who is already in onboarding (from the drawer's select) must be refused with a reason, not silently applied. Test in Task 4 and route behaviour in Task 7.
4. Old records with no `phase`: `stage: "lost"` reads as `churned`, `stage: "won"` stays `demo` (no automatic promotion). Test in Task 3.
5. Running the code backfill twice must not issue a second code to anyone or create two index entries. Test in Task 5.

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/kv.ts` (modify) | `setIfAbsent`, `take` on both drivers |
| `tests/helpers/memory-store.ts` (create) | In-memory `Store` for store-level tests (reused by M2) |
| `lib/customer-code.ts` (create) | Pure slug/code rules |
| `lib/types.ts` (modify) | `CUSTOMER_PHASES`, `CustomerPhase`, `LifecycleEvent`, new `Customer` fields |
| `lib/store.ts` (modify) | `phase` backfill in `normalize`, `assignCode`, `findByCode`, delete cleanup |
| `lib/lifecycle.ts` (create) | Pure state machine, checklist, labels |
| `lib/lifecycle-store.ts` (create) | `lifecycle:{id}` list read/write |
| `lib/analytics.ts` (modify) | lifecycle entries in `timeline`/`activityFeed`, `phaseCounts` |
| `app/api/admin/customers/route.ts` (modify) | assign code + `phase: "demo"` on create |
| `app/api/admin/customers/[id]/route.ts` (modify) | stage via `applyStage`, lifecycle in GET |
| `app/api/admin/customers/[id]/phase/route.ts` (create) | phase transitions |
| `app/api/admin/maintenance/codes/route.ts` (create) | idempotent code backfill |
| `app/api/admin/crm/route.ts` (modify) | lifecycle in the feed |
| `components/admin/crm-shared.tsx`, `PipelineBoard.tsx`, `CrmTab.tsx`, `CrmDrawer.tsx`, `CustomerTable.tsx`, `app/admin/(dashboard)/crm/page.tsx` (modify) | UI |

---

### Task 1: Atomic store primitives

**Files:**
- Modify: `lib/kv.ts` (the `Store` type, `fsStore`, `redisStore`)
- Modify: `tests/kv.test.ts` (fake redis + contract)
- Create: `tests/helpers/memory-store.ts`

**Interfaces:**
- Produces: `Store.setIfAbsent(key: string, value: unknown, ttlSec?: number): Promise<boolean>` and `Store.take<T>(key: string): Promise<T | null>`; `memoryStore(): Store` for tests.

- [ ] **Step 1: Teach the fake Redis `SET … NX [EX n]` and `GETDEL`.** In `tests/kv.test.ts`, replace the `case "SET":` block and add a `GETDEL` case:

```ts
        case "SET": {
          const nx = args.includes("NX");
          if (nx && kv.has(args[0])) {
            result = null;
            break;
          }
          kv.set(args[0], args[1]);
          result = "OK";
          break;
        }
        case "GETDEL":
          result = kv.get(args[0]) ?? null;
          kv.delete(args[0]);
          break;
```

- [ ] **Step 2: Add the failing contract tests** inside `behavesLikeAStore`, after the log test:

```ts
    it("claims a key only once", async () => {
      const store = await make();
      expect(await store.setIfAbsent("code:joes-pizza-k7q", "abc", 60)).toBe(true);
      expect(await store.setIfAbsent("code:joes-pizza-k7q", "xyz", 60)).toBe(false);
      expect(await store.getJson("code:joes-pizza-k7q")).toBe("abc");
    });

    it("hands a value out once and then forgets it", async () => {
      const store = await make();
      await store.setIfAbsent("magic:t1", { customerId: "abc" });
      expect(await store.take("magic:t1")).toEqual({ customerId: "abc" });
      expect(await store.take("magic:t1")).toBeNull();
      expect(await store.take("magic:never")).toBeNull();
    });
```

- [ ] **Step 3: Run and watch them fail**

Run: `npx vitest run tests/kv.test.ts`
Expected: FAIL, `store.setIfAbsent is not a function`.

- [ ] **Step 4: Implement.** In `lib/kv.ts` add to the `Store` type after `del`:

```ts
  /**
   * Write only if nothing is there yet; true when this call wrote it. The one
   * atomic step the store offers, used where two requests must not both win:
   * a customer code, a single-use sign-in token.
   *
   * The file driver has no expiry, so callers that need one also store an
   * `expiresAt` and check it.
   */
  setIfAbsent(key: string, value: unknown, ttlSec?: number): Promise<boolean>;
  /** Read and delete in one step, so a value can be used exactly once. */
  take<T>(key: string): Promise<T | null>;
```

In `fsStore`, add after `del`:

```ts
    async setIfAbsent(key, value) {
      const target = filePath(key);
      await fs.mkdir(path.dirname(target), { recursive: true });
      try {
        await fs.writeFile(target, JSON.stringify(value, null, 2), { encoding: "utf8", flag: "wx" });
        return true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
        throw error;
      }
    },

    // Renaming is atomic on one filesystem, so of two callers only one gets
    // the file; the other finds it gone.
    async take<T>(key: string): Promise<T | null> {
      const target = filePath(key);
      const claimed = `${target}.taken-${process.pid}-${Math.random().toString(36).slice(2)}`;
      try {
        await fs.rename(target, claimed);
      } catch {
        return null;
      }
      try {
        return JSON.parse(await fs.readFile(claimed, "utf8")) as T;
      } catch {
        return null;
      } finally {
        await fs.rm(claimed, { force: true });
      }
    },
```

In `redisStore`, add after `del`:

```ts
    async setIfAbsent(key, value, ttlSec) {
      const args: (string | number)[] = ["SET", key, JSON.stringify(value), "NX"];
      if (ttlSec) args.push("EX", ttlSec);
      return (await command<string | null>(config, args)) === "OK";
    },

    async take<T>(key: string): Promise<T | null> {
      const raw = await command<string | null>(config, ["GETDEL", key]);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    },
```

- [ ] **Step 5: Create the in-memory store** at `tests/helpers/memory-store.ts`:

```ts
import type { Store } from "../../lib/kv";

/** A Store in a Map, for tests of code that takes a store as an argument. */
export function memoryStore(): Store {
  const kv = new Map<string, string>();
  const sets = new Map<string, Set<string>>();
  const lists = new Map<string, string[]>();
  return {
    kind: "fs",
    async getJson<T>(key: string) {
      const raw = kv.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    },
    async setJson(key, value) {
      kv.set(key, JSON.stringify(value));
    },
    async del(key) {
      kv.delete(key);
    },
    async setIfAbsent(key, value) {
      if (kv.has(key)) return false;
      kv.set(key, JSON.stringify(value));
      return true;
    },
    async take<T>(key: string) {
      const raw = kv.get(key);
      kv.delete(key);
      return raw ? (JSON.parse(raw) as T) : null;
    },
    async members(setKey) {
      return [...(sets.get(setKey) ?? [])];
    },
    async addMember(setKey, member) {
      const set = sets.get(setKey) ?? new Set<string>();
      set.add(member);
      sets.set(setKey, set);
    },
    async removeMember(setKey, member) {
      sets.get(setKey)?.delete(member);
    },
    async push(listKey, value) {
      lists.set(listKey, [...(lists.get(listKey) ?? []), value]);
    },
    async range(listKey) {
      return [...(lists.get(listKey) ?? [])];
    },
    async dropList(listKey) {
      lists.delete(listKey);
    },
  };
}
```

- [ ] **Step 6: Run and see green, then typecheck**

Run: `npx vitest run tests/kv.test.ts && npx tsc --noEmit`
Expected: PASS for both drivers; no type errors.

- [ ] **Step 7: Commit**

```bash
git add lib/kv.ts tests/kv.test.ts tests/helpers/memory-store.ts
git commit -m "Give the store a claim-once write and a read-once take

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Customer code rules

**Files:**
- Create: `lib/customer-code.ts`
- Test: `tests/customer-code.test.ts`

**Interfaces:**
- Consumes: `categoryMentions(category, keyword)` from `lib/use-cases.ts`.
- Produces: `CODE_ALPHABET: string`, `slugify(name: string): string`, `baseSlug(input: { businessName: string; websiteUrl?: string; category?: string }): string`, `makeCode(base: string, rand: () => number, length?: number): string`, `isCodeShape(value: string): boolean`.

- [ ] **Step 1: Write the failing tests** at `tests/customer-code.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  CODE_ALPHABET,
  baseSlug,
  isCodeShape,
  makeCode,
  slugify,
} from "../lib/customer-code";

describe("slugify", () => {
  it("keeps the name readable", () => {
    expect(slugify("Joe's Pizza")).toBe("joes-pizza");
    expect(slugify("Kim & Lee LLP")).toBe("kim-lee");
    expect(slugify("The Bright Smile Dental Co.")).toBe("bright-smile-dental");
    expect(slugify("Café Olé")).toBe("cafe-ole");
  });

  it("cuts at a word boundary under 24 characters", () => {
    expect(slugify("Rapid Rooter Plumbing and Drain Services")).toBe("rapid-rooter-plumbing");
    expect(slugify("Supercalifragilisticexpialidocious Bakery")).toBe(
      "supercalifragilisticexpi",
    );
  });

  it("gives nothing for a name with no latin letters", () => {
    expect(slugify("김앤리 법률사무소")).toBe("");
    expect(slugify("🍕🍕")).toBe("");
  });
});

describe("baseSlug", () => {
  it("falls back to the website, then the kind of business, then biz", () => {
    expect(baseSlug({ businessName: "김앤리 법률사무소", websiteUrl: "https://www.kimlee.co.kr/about" })).toBe("kimlee");
    expect(baseSlug({ businessName: "김앤리", websiteUrl: "kimlee.com" })).toBe("kimlee");
    expect(baseSlug({ businessName: "김앤리", category: "Law firm" })).toBe("law");
    expect(baseSlug({ businessName: "스마일 치과", category: "Dental clinic" })).toBe("dental");
    expect(baseSlug({ businessName: "🍕" })).toBe("biz");
  });

  it("prefers the name when it has one", () => {
    expect(baseSlug({ businessName: "Joe's Pizza", websiteUrl: "https://joes.nyc" })).toBe("joes-pizza");
  });
});

describe("makeCode", () => {
  it("adds a suffix from the unambiguous alphabet", () => {
    let i = 0;
    const rand = () => [0, 0.5, 0.99][i++ % 3];
    const code = makeCode("joes-pizza", rand);
    expect(code).toMatch(/^joes-pizza-[0-9a-z]{3}$/);
    expect(code.slice(-3)).toBe(`${CODE_ALPHABET[0]}${CODE_ALPHABET[16]}${CODE_ALPHABET[31]}`);
    expect(CODE_ALPHABET).not.toMatch(/[ilou]/);
    expect(CODE_ALPHABET).toHaveLength(32);
  });

  it("can make a longer suffix", () => {
    expect(makeCode("biz", () => 0, 4)).toBe("biz-0000");
  });
});

describe("isCodeShape", () => {
  it("accepts codes and rejects anything else", () => {
    expect(isCodeShape("joes-pizza-k7q")).toBe(true);
    expect(isCodeShape("JOES")).toBe(false);
    expect(isCodeShape("ab")).toBe(false);
    expect(isCodeShape("joes pizza")).toBe(false);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run tests/customer-code.test.ts`
Expected: FAIL, cannot find module `../lib/customer-code`.

- [ ] **Step 3: Implement** `lib/customer-code.ts`:

```ts
import { categoryMentions } from "./use-cases";

/**
 * A customer's code is what the operator says out loud, searches for and puts
 * in an email: "joes-pizza-k7q". It is made once, when the customer is
 * created, and never changes — a code that follows a renamed business breaks
 * every note, email and call log that already quotes it.
 *
 * It is not a credential. The public demo link stays the unguessable nanoid;
 * a code built from a name is easy to guess, which is fine for a label and
 * wrong for a key.
 */

/** Crockford base32, lower case: no i, l, o or u to misread over the phone. */
export const CODE_ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";

const MAX_SLUG = 24;
const STOPWORDS = new Set(["llc", "inc", "the", "co", "ltd", "corp", "company", "pllc", "pc", "llp"]);

export function slugify(name: string): string {
  const words = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((word) => word && !STOPWORDS.has(word));

  let slug = "";
  for (const word of words) {
    const next = slug ? `${slug}-${word}` : word;
    if (next.length > MAX_SLUG) {
      if (!slug) slug = word.slice(0, MAX_SLUG);
      break;
    }
    slug = next;
  }
  return slug;
}

function domainLabel(url?: string): string {
  if (!url?.trim()) return "";
  try {
    const withScheme = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    const host = new URL(withScheme).hostname.replace(/^www\./, "");
    return slugify(host.split(".")[0] ?? "");
  } catch {
    return "";
  }
}

/** Kind-of-business words for a name that has no latin letters of its own. */
const CATEGORY_NOUNS: [keyword: string, noun: string][] = [
  ["dent*", "dental"],
  ["law*", "law"],
  ["attorney*", "law"],
  ["legal", "law"],
  ["pizz*", "pizza"],
  ["restaurant", "restaurant"],
  ["cafe", "cafe"],
  ["barber*", "barber"],
  ["salon", "salon"],
  ["plumb*", "plumber"],
  ["clinic", "clinic"],
];

function categoryNoun(category?: string): string {
  if (!category) return "";
  return CATEGORY_NOUNS.find(([keyword]) => categoryMentions(category, keyword))?.[1] ?? "";
}

export function baseSlug(input: {
  businessName: string;
  websiteUrl?: string;
  category?: string;
}): string {
  return (
    slugify(input.businessName) ||
    domainLabel(input.websiteUrl) ||
    categoryNoun(input.category) ||
    "biz"
  );
}

export function makeCode(base: string, rand: () => number, length = 3): string {
  let suffix = "";
  for (let i = 0; i < length; i++) {
    suffix += CODE_ALPHABET[Math.min(CODE_ALPHABET.length - 1, Math.floor(rand() * CODE_ALPHABET.length))];
  }
  return `${base}-${suffix}`;
}

export function isCodeShape(value: string): boolean {
  return /^[a-z0-9-]{3,32}$/.test(value);
}
```

- [ ] **Step 4: Run and see green**

Run: `npx vitest run tests/customer-code.test.ts`
Expected: PASS. If `"Law firm"` does not match `law*`, check `categoryMentions` semantics in `lib/use-cases.ts:61` (a trailing `*` is a stem) and adjust the keyword, not the test.

- [ ] **Step 5: Commit**

```bash
git add lib/customer-code.ts tests/customer-code.test.ts
git commit -m "Make readable customer codes from the business name

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Phase on the customer record

**Files:**
- Modify: `lib/types.ts` (after `CustomerStage`, and the `Customer` type)
- Modify: `lib/store.ts` (`normalize`)
- Test: `tests/store-migration.test.ts`

**Interfaces:**
- Produces: `CUSTOMER_PHASES`, `CustomerPhase`, `LifecycleActor`, `LifecycleEvent`, `CustomerSettings`; `Customer.code?`, `.phase?`, `.phaseChangedAt?`, `.onboardingMinutes?`, `.checklist?`, `.portalEpoch?`, `.settings?`. After `normalize`, `phase` is always set.

- [ ] **Step 1: Write the failing tests** — append to `tests/store-migration.test.ts`:

```ts
describe("records written before the funnel had phases", () => {
  it("reads a lost deal as churned", () => {
    expect(normalize(record({ stage: "lost" })).phase).toBe("churned");
  });

  it("keeps everyone else in the demo, a won deal included", () => {
    expect(normalize(record({ stage: "won" })).phase).toBe("demo");
    expect(normalize(record({ stage: undefined })).phase).toBe("demo");
  });

  it("leaves a phase that was set alone", () => {
    expect(normalize(record({ stage: "won", phase: "onboarding" })).phase).toBe("onboarding");
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run tests/store-migration.test.ts`
Expected: FAIL (type error on `phase` or `undefined !== "churned"`).

- [ ] **Step 3: Add the types** in `lib/types.ts`, directly after `export type CustomerStage = ...`:

```ts
/**
 * Where the customer is in the product, as opposed to where the deal stands.
 * A demo is the pitch; onboarding is the business correcting its own copy;
 * production is the agent answering their line. Churned is out, from any of
 * them.
 *
 * Phase is the source of truth and `stage` is the sales detail inside the
 * demo: once a customer is onboarding their stage is Won and stays Won, and
 * `lost` means only "left during the demo".
 */
export const CUSTOMER_PHASES = ["demo", "onboarding", "production", "churned"] as const;

export type CustomerPhase = (typeof CUSTOMER_PHASES)[number];

export type LifecycleActor = "operator" | "customer" | "system";

/** One move of phase or stage. Append-only, kept in `lifecycle:{customerId}`. */
export type LifecycleEvent = {
  id: string;
  at: string;
  kind: "stage" | "phase";
  from: string;
  to: string;
  actor: LifecycleActor;
  reason?: string;
};

/** Onboarding settings the customer will manage; empty until those screens exist. */
export type CustomerSettings = Record<string, never>;
```

and in `Customer`, after `stage?: CustomerStage;`:

```ts
  /** Readable, immutable, e.g. "joes-pizza-k7q". Assigned at create or by the backfill. */
  code?: string;
  phase?: CustomerPhase;
  phaseChangedAt?: string;
  /** Test-call minutes while onboarding; absent means the deployment default (M3). */
  onboardingMinutes?: number;
  /** Manual items on the road to production. */
  checklist?: { phoneConnected?: boolean };
  /** Bumped to sign the customer out everywhere (M2). */
  portalEpoch?: number;
  settings?: CustomerSettings;
```

- [ ] **Step 4: Backfill on read** in `lib/store.ts` `normalize`, right after the `if (!customer.stage) {...}` block:

```ts
  // Records from before the funnel: a deal lost in the demo is churned, and
  // everyone else is still in the demo. Won is not promoted here — starting
  // onboarding is the operator's call.
  if (!customer.phase) {
    customer = { ...customer, phase: customer.stage === "lost" ? "churned" : "demo" };
  }
```

- [ ] **Step 5: Run and see green**

Run: `npx vitest run tests/store-migration.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/store.ts tests/store-migration.test.ts
git commit -m "Put a lifecycle phase on every customer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The lifecycle state machine

**Files:**
- Create: `lib/lifecycle.ts`
- Test: `tests/lifecycle.test.ts`

**Interfaces:**
- Consumes: types from Task 3.
- Produces:
  - `STAGE_LABEL: Record<CustomerStage, string>`, `PHASE_LABEL: Record<CustomerPhase, string>`
  - `PHASE_TRANSITIONS: Record<CustomerPhase, readonly CustomerPhase[]>`
  - `type LifecycleContext = { now: string; newId: () => string; preflightOk?: boolean }`
  - `type ChecklistItem = { id: "contactEmail" | "knowledge" | "preflight" | "phoneConnected"; ok: boolean; label: string; manual?: boolean }`
  - `checklist(customer: Customer, ctx: Pick<LifecycleContext, "preflightOk">): ChecklistItem[]`
  - `canTransition(customer: Customer, to: CustomerPhase, ctx: Pick<LifecycleContext, "preflightOk">): { ok: true } | { ok: false; reasons: string[] }`
  - `applyTransition(customer, to, ctx: LifecycleContext, actor: LifecycleActor, reason?: string): { ok: true; customer: Customer; events: LifecycleEvent[] } | { ok: false; reasons: string[] }`
  - `applyStage(customer, stage: CustomerStage, ctx: LifecycleContext, actor: LifecycleActor): same result type`

- [ ] **Step 1: Write the failing tests** at `tests/lifecycle.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  PHASE_TRANSITIONS,
  applyStage,
  applyTransition,
  canTransition,
  checklist,
} from "../lib/lifecycle";
import { buildPrompts } from "../lib/prompt";
import { CUSTOMER_PHASES, DEFAULT_VOICE } from "../lib/types";
import type { BusinessProfile, Customer, CustomerPhase } from "../lib/types";

const profile: BusinessProfile = {
  name: "Joe's Pizza",
  category: "pizzeria",
  address: "7 Carmine St, New York, NY 10014",
  phone: "+1 212 555 0100",
  hours: [{ day: "Monday", open: "10:00", close: "22:00", closed: false }],
  services: [],
  highlights: [],
  policies: {},
  faqs: [],
};

function customer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: "abcdefghijkl",
    active: true,
    businessName: "Joe's Pizza",
    contactEmail: "joe@joes.nyc",
    profile,
    dossier: "",
    sources: [],
    prompts: buildPrompts(profile, "Alex"),
    voice: DEFAULT_VOICE,
    agentName: "Alex",
    status: "ready",
    stage: "won",
    phase: "demo",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

let n = 0;
const ctx = { now: "2026-09-25T12:00:00.000Z", newId: () => `ev${++n}` };

describe("which phase moves exist", () => {
  const allowed: [CustomerPhase, CustomerPhase][] = [
    ["demo", "onboarding"],
    ["demo", "churned"],
    ["onboarding", "production"],
    ["onboarding", "demo"],
    ["onboarding", "churned"],
    ["production", "onboarding"],
    ["production", "churned"],
    ["churned", "demo"],
  ];

  it("lists exactly the allowed moves", () => {
    const listed = CUSTOMER_PHASES.flatMap((from) =>
      PHASE_TRANSITIONS[from].map((to) => [from, to] as [CustomerPhase, CustomerPhase]),
    );
    expect(listed.sort()).toEqual([...allowed].sort());
  });

  it("refuses a move that is not on the list", () => {
    const result = canTransition(customer({ phase: "demo" }), "production", {});
    expect(result).toEqual({ ok: false, reasons: ["A demo cannot go straight to production."] });
  });

  it("refuses staying where it is", () => {
    const result = canTransition(customer({ phase: "demo" }), "demo", {});
    expect(result.ok).toBe(false);
  });
});

describe("starting onboarding", () => {
  it("needs a won deal, finished research and an email to sign in with", () => {
    const result = canTransition(
      customer({ stage: "interested", status: "researching", contactEmail: undefined }),
      "onboarding",
      {},
    );
    expect(result).toEqual({
      ok: false,
      reasons: [
        "Mark the deal Won first.",
        "Research has not finished.",
        "Add a contact email; it is how they sign in.",
      ],
    });
  });

  it("moves the phase and records one event", () => {
    const result = applyTransition(customer(), "onboarding", ctx, "operator");
    if (!result.ok) throw new Error(result.reasons.join());
    expect(result.customer.phase).toBe("onboarding");
    expect(result.customer.stage).toBe("won");
    expect(result.customer.phaseChangedAt).toBe(ctx.now);
    expect(result.events).toEqual([
      expect.objectContaining({ kind: "phase", from: "demo", to: "onboarding", actor: "operator", at: ctx.now }),
    ]);
  });
});

describe("going to production", () => {
  it("is blocked until every checklist item is done", () => {
    const result = canTransition(customer({ phase: "onboarding" }), "production", {});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons).toEqual([
      "Preflight passed for the current setup",
      "Phone number connected (marked by hand until Twilio is wired)",
    ]);
  });

  it("goes when everything is ticked", () => {
    const ready = customer({ phase: "onboarding", checklist: { phoneConnected: true } });
    expect(canTransition(ready, "production", { preflightOk: true })).toEqual({ ok: true });
  });

  it("counts knowledge as missing without an address, phone or hours", () => {
    const items = checklist(customer({ profile: { ...profile, phone: undefined } }), {});
    expect(items.find((item) => item.id === "knowledge")?.ok).toBe(false);
  });
});

describe("churn and reopen", () => {
  it("marks a demo that leaves as lost", () => {
    const result = applyTransition(customer({ stage: "contacted" }), "churned", ctx, "operator", "went with a competitor");
    if (!result.ok) throw new Error();
    expect(result.customer.stage).toBe("lost");
    expect(result.events.map((event) => event.kind)).toEqual(["phase", "stage"]);
    expect(result.events[0].reason).toBe("went with a competitor");
  });

  it("keeps Won on a customer who leaves after onboarding", () => {
    const result = applyTransition(customer({ phase: "production" }), "churned", ctx, "operator");
    if (!result.ok) throw new Error();
    expect(result.customer.stage).toBe("won");
    expect(result.events).toHaveLength(1);
  });

  it("reopens as a contacted demo", () => {
    const result = applyTransition(customer({ phase: "churned", stage: "lost" }), "demo", ctx, "operator");
    if (!result.ok) throw new Error();
    expect(result.customer.phase).toBe("demo");
    expect(result.customer.stage).toBe("contacted");
  });
});

describe("moving the stage", () => {
  it("moves it inside the demo and records it", () => {
    const result = applyStage(customer({ stage: "new" }), "contacted", ctx, "operator");
    if (!result.ok) throw new Error();
    expect(result.customer.stage).toBe("contacted");
    expect(result.events).toEqual([
      expect.objectContaining({ kind: "stage", from: "new", to: "contacted" }),
    ]);
  });

  it("does nothing, and records nothing, for the same stage", () => {
    const result = applyStage(customer({ stage: "won" }), "won", ctx, "operator");
    expect(result).toEqual({ ok: true, customer: expect.objectContaining({ stage: "won" }), events: [] });
  });

  it("turns Lost into leaving the demo", () => {
    const result = applyStage(customer({ stage: "interested" }), "lost", ctx, "operator");
    if (!result.ok) throw new Error();
    expect(result.customer.phase).toBe("churned");
    expect(result.customer.stage).toBe("lost");
  });

  it("refuses once onboarding has started", () => {
    const result = applyStage(customer({ phase: "onboarding" }), "interested", ctx, "operator");
    expect(result).toEqual({
      ok: false,
      reasons: ["The stage stays Won once onboarding starts. Move the phase instead."],
    });
  });

  it("reopens a churned customer at the stage asked for", () => {
    const result = applyStage(customer({ phase: "churned", stage: "lost" }), "interested", ctx, "operator");
    if (!result.ok) throw new Error();
    expect(result.customer.phase).toBe("demo");
    expect(result.customer.stage).toBe("interested");
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run tests/lifecycle.test.ts`
Expected: FAIL, cannot find module `../lib/lifecycle`.

- [ ] **Step 3: Implement** `lib/lifecycle.ts`:

```ts
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
    if (stage === "lost") return { ok: true, customer, events: [] };
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
```

- [ ] **Step 4: Run and see green**

Run: `npx vitest run tests/lifecycle.test.ts`
Expected: PASS. Note the reason for `demo → production` reads "A demo cannot go straight to production." — the test pins that exact string.

- [ ] **Step 5: Commit**

```bash
git add lib/lifecycle.ts tests/lifecycle.test.ts
git commit -m "Move customers through the funnel only by the rules

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Code index and lifecycle history in the store

**Files:**
- Create: `lib/lifecycle-store.ts`
- Modify: `lib/store.ts` (`assignCode`, `findByCode`, `deleteCustomer`)
- Test: `tests/customer-store.test.ts`

**Interfaces:**
- Consumes: `Store.setIfAbsent` (Task 1), `baseSlug`, `makeCode`, `isCodeShape` (Task 2), `LifecycleEvent` (Task 3).
- Produces:
  - `assignCode(customer: Customer, store?: Store, rand?: () => number): Promise<string>` in `lib/store.ts`
  - `findByCode(input: string): Promise<Customer | null>` in `lib/store.ts`
  - `recordLifecycle(customerId: string, events: LifecycleEvent[], store?: Store): Promise<void>`, `listLifecycle(customerId: string, store?: Store): Promise<LifecycleEvent[]>`, `listAllLifecycle(customerIds: string[]): Promise<(LifecycleEvent & { customerId: string })[]>`, `dropLifecycle(customerId: string): Promise<void>` in `lib/lifecycle-store.ts`

- [ ] **Step 1: Write the failing tests** at `tests/customer-store.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { assignCode } from "../lib/store";
import { listLifecycle, recordLifecycle } from "../lib/lifecycle-store";
import { memoryStore } from "./helpers/memory-store";
import type { Customer } from "../lib/types";

const joe = { id: "abcdefghijkl", businessName: "Joe's Pizza", profile: { category: "pizzeria" } } as Customer;

describe("assignCode", () => {
  it("claims a code in the index", async () => {
    const store = memoryStore();
    const code = await assignCode(joe, store, () => 0);
    expect(code).toBe("joes-pizza-000");
    expect(await store.getJson("code:joes-pizza-000")).toBe("abcdefghijkl");
  });

  it("returns the code a customer already has without touching the index", async () => {
    const store = memoryStore();
    expect(await assignCode({ ...joe, code: "joes-pizza-k7q" }, store)).toBe("joes-pizza-k7q");
    expect(await store.getJson("code:joes-pizza-k7q")).toBeNull();
  });

  it("tries again when another Joe's Pizza took the code, then goes longer", async () => {
    const store = memoryStore();
    for (let i = 0; i < 5; i++) await store.setIfAbsent(`code:joes-pizza-000`, "someone-else");
    const code = await assignCode({ ...joe, id: "mnopqrstuvwx" }, store, () => 0);
    expect(code).toBe("joes-pizza-0000");
  });

  it("gives two customers two different codes", async () => {
    const store = memoryStore();
    const values = [0, 0, 0, 0, 0, 0, 0.5, 0.5, 0.5];
    let i = 0;
    const rand = () => values[i++] ?? 0.9;
    const first = await assignCode(joe, store, rand);
    const second = await assignCode({ ...joe, id: "mnopqrstuvwx" }, store, rand);
    expect(first).not.toBe(second);
  });
});

describe("lifecycle history", () => {
  it("keeps events newest first", async () => {
    const store = memoryStore();
    await recordLifecycle("abc", [
      { id: "1", at: "2026-09-01T00:00:00Z", kind: "stage", from: "new", to: "contacted", actor: "operator" },
    ], store);
    await recordLifecycle("abc", [
      { id: "2", at: "2026-09-02T00:00:00Z", kind: "phase", from: "demo", to: "onboarding", actor: "operator" },
    ], store);
    expect((await listLifecycle("abc", store)).map((event) => event.id)).toEqual(["2", "1"]);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run tests/customer-store.test.ts`
Expected: FAIL, `assignCode` is not exported / module `../lib/lifecycle-store` not found.

- [ ] **Step 3: Implement** `lib/lifecycle-store.ts`:

```ts
import { getStore, type Store } from "./kv";
import type { LifecycleEvent } from "./types";

/**
 * Every phase and stage move, one append-only list per customer — the same
 * shape as the CRM notes, for the same reason: a history is worth more than
 * a field that keeps being overwritten, and writing one line should not
 * rewrite the customer.
 */
const lifecycleKey = (customerId: string) => `lifecycle:${customerId}`;

export async function recordLifecycle(
  customerId: string,
  events: LifecycleEvent[],
  store: Store = getStore(),
): Promise<void> {
  for (const entry of events) {
    await store.push(lifecycleKey(customerId), JSON.stringify(entry));
  }
}

export async function listLifecycle(
  customerId: string,
  store: Store = getStore(),
): Promise<LifecycleEvent[]> {
  const events: LifecycleEvent[] = [];
  for (const line of await store.range(lifecycleKey(customerId))) {
    try {
      events.push(JSON.parse(line) as LifecycleEvent);
    } catch {
      // A truncated line costs that line, not the history.
    }
  }
  return events.sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));
}

export async function listAllLifecycle(
  customerIds: string[],
): Promise<(LifecycleEvent & { customerId: string })[]> {
  const perCustomer = await Promise.all(
    customerIds.map(async (customerId) =>
      (await listLifecycle(customerId)).map((entry) => ({ ...entry, customerId })),
    ),
  );
  return perCustomer.flat();
}

export async function dropLifecycle(customerId: string): Promise<void> {
  await getStore().dropList(lifecycleKey(customerId));
}
```

In `lib/store.ts` change the first import to `import { getStore, type Store } from "./kv";`, add imports:

```ts
import { dropLifecycle } from "./lifecycle-store";
import { baseSlug, isCodeShape, makeCode } from "./customer-code";
```

and add below `saveCustomer`:

```ts
const codeKey = (code: string) => `code:${code}`;

/**
 * Claim a code for a customer who has none; return the one they have
 * otherwise. Called by the create route and the backfill only — never from
 * `saveCustomer`, so an ordinary save stays an ordinary save.
 *
 * The index write is the claim: of two customers reaching for the same code,
 * `setIfAbsent` lets one through and the other rolls again. Five short tries,
 * then a longer suffix.
 */
export async function assignCode(
  customer: Customer,
  store: Store = getStore(),
  rand: () => number = Math.random,
): Promise<string> {
  if (customer.code) return customer.code;
  const base = baseSlug({
    businessName: customer.businessName,
    websiteUrl: customer.websiteUrl,
    category: customer.profile?.category,
  });
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = makeCode(base, rand, attempt < 5 ? 3 : 4);
    if (await store.setIfAbsent(codeKey(code), customer.id)) return code;
  }
  throw new Error("Could not find a free customer code. Try again.");
}

/** A customer by code, however it was typed. */
export async function findByCode(input: string): Promise<Customer | null> {
  const code = input.trim().toLowerCase();
  if (!isCodeShape(code)) return null;
  const id = await getStore().getJson<string>(codeKey(code));
  return id ? getCustomer(id) : null;
}
```

In `deleteCustomer`, before `await store.del(key(id));` add:

```ts
  if (customer.code) await store.del(codeKey(customer.code));
  await dropLifecycle(id);
```

- [ ] **Step 4: Run and see green**

Run: `npx vitest run tests/customer-store.test.ts && npx vitest run && npx tsc --noEmit`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/lifecycle-store.ts lib/store.ts tests/customer-store.test.ts
git commit -m "Index customers by code and keep their phase history

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Lifecycle moves in the timeline and feed

**Files:**
- Modify: `lib/analytics.ts` (`TimelineEntry`, `timeline`, `activityFeed`, new `phaseCounts`)
- Test: `tests/crm-feed.test.ts`

**Interfaces:**
- Consumes: `LifecycleEvent` (Task 3), `STAGE_LABEL`, `PHASE_LABEL` (Task 4).
- Produces: `TimelineEntry.kind` gains `"stage" | "phase"`; `timeline(notes, events, calls, lifecycle = [])`; `activityFeed` input gains optional `lifecycle?: (LifecycleEvent & { customerId: string })[]`; `phaseCounts<T extends { phase?: CustomerPhase }>(customers: T[]): Record<CustomerPhase, number>`.

- [ ] **Step 1: Write the failing tests** — append to `tests/crm-feed.test.ts` (add `timeline`, `phaseCounts` to its analytics import if missing):

```ts
describe("phase and stage moves", () => {
  const moves = [
    { id: "1", at: "2026-09-02T00:00:00.000Z", kind: "phase" as const, from: "demo", to: "onboarding", actor: "operator" as const, reason: "signed" },
    { id: "2", at: "2026-09-01T00:00:00.000Z", kind: "stage" as const, from: "interested", to: "won", actor: "operator" as const },
  ];

  it("shows up in one prospect's timeline, in words", () => {
    const entries = timeline([], [], [], moves);
    expect(entries.map((entry) => [entry.kind, entry.text])).toEqual([
      ["phase", "Moved to Onboarding · signed"],
      ["stage", "Stage: Interested → Won"],
    ]);
  });

  it("shows up in the feed under whose it is", () => {
    const feed = activityFeed({
      customers: [{ id: "c1", name: "Joe's Pizza" }],
      notes: [],
      events: [],
      calls: [],
      lifecycle: moves.map((move) => ({ ...move, customerId: "c1" })),
    });
    expect(feed[0]).toEqual(expect.objectContaining({ kind: "phase", customerName: "Joe's Pizza" }));
  });

  it("counts prospects per phase, a missing phase as demo", () => {
    expect(phaseCounts([{ phase: "onboarding" }, {}, { phase: "churned" }])).toEqual({
      demo: 1,
      onboarding: 1,
      production: 0,
      churned: 1,
    });
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run tests/crm-feed.test.ts`
Expected: FAIL (`phaseCounts` not exported, lifecycle ignored).

- [ ] **Step 3: Implement** in `lib/analytics.ts`. Add to the imports: `LifecycleEvent`, `CustomerPhase` from `./types`, `CUSTOMER_PHASES` from `./types`, and `import { PHASE_LABEL, STAGE_LABEL } from "./lifecycle";`. Then:

```ts
export type TimelineEntry = {
  at: string;
  kind: "note" | "view" | "call" | "stage" | "phase";
  text: string;
  /** Set on a call entry, so the row can open that call's transcript. */
  callId?: string;
};
```

Change the `timeline` signature to take `lifecycle: LifecycleEvent[] = []` as the fourth argument and add before the sort:

```ts
  for (const move of lifecycle) {
    const text =
      move.kind === "phase"
        ? `Moved to ${PHASE_LABEL[move.to as CustomerPhase] ?? move.to}`
        : `Stage: ${STAGE_LABEL[move.from as CustomerStage] ?? move.from} → ${STAGE_LABEL[move.to as CustomerStage] ?? move.to}`;
    entries.push({ at: move.at, kind: move.kind, text: move.reason ? `${text} · ${move.reason}` : text });
  }
```

In `activityFeed`, add `lifecycle?: (LifecycleEvent & { customerId: string })[];` to the input type, group it like the notes:

```ts
  const lifecycleFor = new Map<string, LifecycleEvent[]>();
  for (const move of input.lifecycle ?? []) {
    const list = lifecycleFor.get(move.customerId) ?? [];
    list.push(move);
    lifecycleFor.set(move.customerId, list);
  }
```

and pass `lifecycleFor.get(customerId) ?? []` as the fourth argument of the inner `timeline(...)` call. After `stageCounts`, add:

```ts
/** How many customers sit in each phase, for the board's phase columns. */
export function phaseCounts<T extends { phase?: CustomerPhase }>(
  customers: T[],
): Record<CustomerPhase, number> {
  const counts = Object.fromEntries(
    CUSTOMER_PHASES.map((phase) => [phase, 0]),
  ) as Record<CustomerPhase, number>;
  for (const customer of customers) counts[customer.phase ?? "demo"] += 1;
  return counts;
}
```

`lib/analytics.ts` is imported by client components; `lib/lifecycle.ts` imports only types, so the browser rule holds.

- [ ] **Step 4: Run and see green**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all PASS. `tsc` will flag `ENTRY_ICON[entry.kind]` in `components/admin/ActivityFeed.tsx` and `CrmTab.tsx` because the map lacks `stage`/`phase` — fix it now in `components/admin/crm-shared.tsx`:

```ts
import { ArrowRightLeft, CalendarClock, Eye, Flag, NotebookPen, PhoneCall } from "lucide-react";
```

```ts
export const ENTRY_ICON = {
  note: NotebookPen,
  view: Eye,
  call: PhoneCall,
  stage: ArrowRightLeft,
  phase: Flag,
} as const;
```

and replace the local `STAGE_LABEL` object in the same file with a re-export so there is one copy:

```ts
export { PHASE_LABEL, STAGE_LABEL } from "@/lib/lifecycle";
```

(keep the `STAGE_KIND` map; add `PHASE_KIND: Record<CustomerPhase, keyof typeof STATUS_STYLES> = { demo: "neutral", onboarding: "caution", production: "positive", churned: "negative" }` next to it, importing `CustomerPhase`). Re-run `npx tsc --noEmit && npm run lint`.

- [ ] **Step 5: Commit**

```bash
git add lib/analytics.ts tests/crm-feed.test.ts components/admin/crm-shared.tsx
git commit -m "Show phase and stage moves in the timeline and feed

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: API routes

**Files:**
- Modify: `app/api/admin/customers/route.ts` (create)
- Modify: `app/api/admin/customers/[id]/route.ts` (GET, PATCH)
- Create: `app/api/admin/customers/[id]/phase/route.ts`
- Create: `app/api/admin/maintenance/codes/route.ts`
- Modify: `app/api/admin/crm/route.ts`

**Interfaces:**
- Consumes: `assignCode` (Task 5), `applyStage`, `applyTransition` (Task 4), `recordLifecycle`, `listLifecycle`, `listAllLifecycle` (Task 5), `CUSTOMER_PHASES`.
- Produces (HTTP):
  - `GET /api/admin/customers/[id]` → adds `lifecycle: LifecycleEvent[]`
  - `PATCH /api/admin/customers/[id]` with `stage` → 409 `{ error, reasons }` when refused
  - `POST /api/admin/customers/[id]/phase` body `{ to: CustomerPhase; reason?: string }` → `{ customer, events }` or 409 `{ error, reasons }`
  - `POST /api/admin/maintenance/codes` → `{ assigned: number, repaired: number }`
  - `GET /api/admin/crm` feed includes phase/stage entries

Route handlers have no unit tests in this repo (tests stay pure); the logic they call is covered by Tasks 4–5. Verify each by typecheck and a manual request in Step 7.

- [ ] **Step 1: Assign a code on create.** In `app/api/admin/customers/route.ts`, add `assignCode` to the `@/lib/store` import, add `phase: "demo",` to the `customer` literal after `status: "researching",`, and change the save block to:

```ts
  try {
    customer.code = await assignCode(customer);
    await saveCustomer(customer);
  } catch (error) {
    return jsonError(error);
  }
```

- [ ] **Step 2: Route stage changes through the machine.** In `app/api/admin/customers/[id]/route.ts`:
  - add imports: `import { nanoid } from "nanoid";`, `import { applyStage } from "@/lib/lifecycle";`, `import { listLifecycle, recordLifecycle } from "@/lib/lifecycle-store";`, and `LifecycleEvent` to the type import.
  - in `GET`, load it with the others and return it:

```ts
    [calls, events, notes, lifecycle] = await Promise.all([
      listCalls(id),
      readEvents(id),
      listNotes(id),
      listLifecycle(id),
    ]);
```

  (declare `let customer, calls, events, notes, lifecycle;`) and `return NextResponse.json({ customer, stats, calls, events, notes, lifecycle });`
  - in `PATCH`, change `let customer;` to `let customer: Customer | null;` if needed, replace the `stage: body.stage ?? customer.stage,` line in the `next` literal with `stage: customer.stage,` (and use `let next: Customer = {...}`), and insert after `next.prompts = resolvePrompts(...)`:

```ts
  // A stage is never written straight onto the record: Lost is leaving the
  // demo, and nothing but Won makes sense once onboarding has started. The
  // machine decides and says why when it will not.
  let moves: LifecycleEvent[] = [];
  if (body.stage && body.stage !== customer.stage) {
    const moved = applyStage(
      next,
      body.stage,
      { now: next.updatedAt, newId: () => nanoid(10) },
      "operator",
    );
    if (!moved.ok) {
      return NextResponse.json(
        { error: moved.reasons.join(" "), reasons: moved.reasons },
        { status: 409 },
      );
    }
    next = moved.customer;
    moves = moved.events;
  }
```

  and in the save `try` add `await recordLifecycle(id, moves);` after `await saveCustomer(next);`.

- [ ] **Step 3: Create the phase route** at `app/api/admin/customers/[id]/phase/route.ts`:

```ts
import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { jsonError } from "@/lib/api";
import { assertWritableStore } from "@/lib/kv";
import { applyTransition } from "@/lib/lifecycle";
import { recordLifecycle } from "@/lib/lifecycle-store";
import { getCustomer, saveCustomer } from "@/lib/store";
import { CUSTOMER_PHASES, type CustomerPhase } from "@/lib/types";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * The only way a customer changes phase. The rules live in lib/lifecycle.ts;
 * this route loads, asks, saves and records. Preflight does not exist until
 * M5, so production stays out of reach until then.
 */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  let body: { to?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!body.to || !CUSTOMER_PHASES.includes(body.to as CustomerPhase)) {
    return NextResponse.json({ error: "Unknown phase." }, { status: 400 });
  }

  try {
    const customer = await getCustomer(id);
    if (!customer) {
      return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    }
    const moved = applyTransition(
      customer,
      body.to as CustomerPhase,
      { now: new Date().toISOString(), newId: () => nanoid(10), preflightOk: false },
      "operator",
      body.reason?.trim().slice(0, 500) || undefined,
    );
    if (!moved.ok) {
      return NextResponse.json(
        { error: moved.reasons.join(" "), reasons: moved.reasons },
        { status: 409 },
      );
    }
    assertWritableStore();
    await saveCustomer(moved.customer);
    await recordLifecycle(id, moved.events);
    return NextResponse.json({ customer: moved.customer, events: moved.events });
  } catch (error) {
    return jsonError(error);
  }
}
```

- [ ] **Step 4: Create the backfill route** at `app/api/admin/maintenance/codes/route.ts`:

```ts
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { assertWritableStore, getStore } from "@/lib/kv";
import { assignCode, listCustomers, saveCustomer } from "@/lib/store";

export const runtime = "nodejs";

/**
 * Give every customer created before codes existed a code, and put back any
 * index entry that has gone missing. Safe to run twice: a customer with a
 * code keeps it, and an index entry that is there is left alone.
 */
export async function POST() {
  try {
    assertWritableStore();
    const store = getStore();
    let assigned = 0;
    let repaired = 0;
    for (const customer of await listCustomers()) {
      if (!customer.code) {
        await saveCustomer({ ...customer, code: await assignCode(customer) });
        assigned += 1;
      } else if (await store.setIfAbsent(`code:${customer.code}`, customer.id)) {
        repaired += 1;
      }
    }
    return NextResponse.json({ assigned, repaired });
  } catch (error) {
    return jsonError(error);
  }
}
```

  Note: `listCustomers` returns normalized records, so `saveCustomer` also persists the in-memory `phase`/`stage` backfill — intended.

- [ ] **Step 5: Feed lifecycle into the CRM.** In `app/api/admin/crm/route.ts`, import `listAllLifecycle` from `@/lib/lifecycle-store`, load it next to the notes:

```ts
    const ids = customers.map((customer) => customer.id);
    const [notes, lifecycle] = await Promise.all([listAllNotes(ids), listAllLifecycle(ids)]);
```

  (replacing the existing `const notes = ...` line) and add `lifecycle,` to the `activityFeed({...})` input.

- [ ] **Step 6: Typecheck, lint, test**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
Expected: all clean.

- [ ] **Step 7: Manual check.** Run `npm run dev`, sign in to `/admin`, create a customer, then in another terminal (with the admin cookie copied from the browser as `$C`):

```bash
curl -s -X POST localhost:3000/api/admin/maintenance/codes -H "Cookie: $C"
curl -s -X POST localhost:3000/api/admin/maintenance/codes -H "Cookie: $C"   # second run: {"assigned":0,...}
curl -s -X POST localhost:3000/api/admin/customers/<id>/phase -H "Cookie: $C" -H "Content-Type: application/json" -d '{"to":"onboarding"}'
```

Expected: first backfill assigns codes, the second assigns 0; the phase call on a non-Won customer returns 409 with `"Mark the deal Won first."`.

- [ ] **Step 8: Commit**

```bash
git add app/api/admin/customers/route.ts "app/api/admin/customers/[id]/route.ts" "app/api/admin/customers/[id]/phase/route.ts" app/api/admin/maintenance/codes/route.ts app/api/admin/crm/route.ts
git commit -m "Change phase and stage only through the lifecycle routes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Admin UI

**Files:**
- Modify: `components/admin/PipelineBoard.tsx`
- Modify: `app/admin/(dashboard)/crm/page.tsx`
- Modify: `components/admin/CrmTab.tsx`, `components/admin/CrmDrawer.tsx`
- Modify: `components/admin/CustomerTable.tsx`

**Interfaces:**
- Consumes: `PHASE_LABEL`, `PHASE_KIND`, `STAGE_LABEL`, `ENTRY_ICON` (Task 6), `PHASE_TRANSITIONS`, `checklist` (Task 4), `phaseCounts` (Task 6), the routes from Task 7.
- Produces: `PipelineBoard` prop `onPhase: (customer: CustomerWithStats, to: CustomerPhase) => void`; `CrmTab` props `lifecycle: LifecycleEvent[]` and `onPhase: (to: CustomerPhase) => void`.

UI has no unit tests in this repo; verify with `tsc`, `lint`, and the browser in Step 6.

- [ ] **Step 1: Board columns by phase.** In `components/admin/PipelineBoard.tsx`:
  - import `PHASE_LABEL` from `@/components/admin/crm-shared`, `CustomerPhase` from `@/lib/types`.
  - define the columns above `Card`:

```ts
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
```

  - Replace the two arrow buttons in `Card` so a card moves one column either way, turning into a phase move at the Won/Onboarding boundary. Give `Card` an `onPhase: (to: CustomerPhase) => void` prop and compute:

```ts
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
```

  and render each arrow as `disabled={!back}` / `onClick={back?.go}` / `aria-label={back?.label ?? "Nothing before this"}` (same for `forward`, `"Nothing after this"`). Also show the code under the name: `<span className="ta-caption-2 text-muted-foreground block font-mono">{customer.code ?? "—"}</span>`.
  - In `PipelineBoard`, add the `onPhase` prop, change `grid-cols-5` / `min-w-[52rem]` to `grid-cols-7` / `min-w-[72rem]`, and map `COLUMNS` instead of `CUSTOMER_STAGES`, filtering with `inColumn(customer, column)` and keying by `column.key`. Remove the now-unused `CUSTOMER_STAGES` import.

- [ ] **Step 2: Page wiring.** In `app/admin/(dashboard)/crm/page.tsx`:
  - add a phase mover (waits for the server, because it is gated):

```ts
  async function movePhase(customer: CustomerWithStats, to: CustomerPhase) {
    try {
      const response = await fetch(`/api/admin/customers/${customer.id}/phase`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to }),
      });
      await readJson<{ customer: unknown }>(response);
      toast.success(`Moved to ${PHASE_LABEL[to]}.`);
      void load();
    } catch (caught) {
      // The route says why in words; show them as they are.
      toast.error(caught instanceof Error ? caught.message : "Could not move it.");
    }
  }

  async function assignCodes() {
    try {
      const response = await fetch("/api/admin/maintenance/codes", { method: "POST" });
      const result = await readJson<{ assigned: number; repaired: number }>(response);
      toast.success(`Gave ${result.assigned} customer${result.assigned === 1 ? "" : "s"} a code.`);
      void load();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not assign codes.");
    }
  }
```

  - pass `onPhase={(customer, to) => void movePhase(customer, to)}` to `PipelineBoard`.
  - replace the `open` computation with `const open = customers.filter((customer) => (customer.phase ?? "demo") === "demo");` and its caption with `"Still a demo"`; add `const phases = phaseCounts(customers);` and change the "Interested" stat card to `title="Onboarding" value={String(phases.onboarding)} caption="Setting up their own copy"`.
  - above the follow-ups card, when `const uncoded = customers.filter((customer) => !customer.code).length;` is non-zero, render:

```tsx
      {uncoded ? (
        <Card className="rounded-xl border shadow-none">
          <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4">
            <span className="ta-caption-1">
              {uncoded} customer{uncoded === 1 ? " has" : "s have"} no code yet.
            </span>
            <Button size="sm" variant="outline" onClick={() => void assignCodes()}>
              Assign codes
            </Button>
          </CardContent>
        </Card>
      ) : null}
```

  (import `Button` from `@/components/ui/button`, `phaseCounts` from `@/lib/analytics`, `PHASE_LABEL` from `@/components/admin/crm-shared`, `CustomerPhase` from `@/lib/types`). Update the board card caption to: "Yours to set: nothing moves a prospect on its own. Won moves on to onboarding; production needs its checklist."

- [ ] **Step 3: Drawer shows code, phase and checklist.** In `components/admin/CrmTab.tsx`:
  - add props `lifecycle: LifecycleEvent[]` and `onPhase: (to: CustomerPhase) => void`; change `timeline(notes, events, calls)` to `timeline(notes, events, calls, lifecycle)`.
  - under the stage `Select`, set `disabled={(customer.phase ?? "demo") !== "demo" && (customer.phase ?? "demo") !== "churned"}` and, when disabled, replace the caption with "Stays Won once onboarding starts."
  - above the three-column grid, add a phase block:

```tsx
      <div className="space-y-2 rounded-xl border p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="ta-caption-1 text-muted-foreground font-mono">{customer.code ?? "no code yet"}</span>
          <StatusBadge kind={PHASE_KIND[customer.phase ?? "demo"]}>
            {PHASE_LABEL[customer.phase ?? "demo"]}
          </StatusBadge>
          {PHASE_TRANSITIONS[customer.phase ?? "demo"].map((to) => (
            <Button key={to} size="sm" variant="outline" onClick={() => onPhase(to)}>
              {PHASE_LABEL[to]}
            </Button>
          ))}
        </div>
        {(customer.phase ?? "demo") === "onboarding" ? (
          <ul className="space-y-1">
            {checklist(customer, {}).map((item) => (
              <li key={item.id} className="ta-caption-1 flex items-center gap-2">
                <span aria-hidden>{item.ok ? "✓" : "○"}</span>
                <span className={item.ok ? "text-muted-foreground" : undefined}>{item.label}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
```

  (imports: `PHASE_KIND`, `PHASE_LABEL` from `@/components/admin/crm-shared`; `PHASE_TRANSITIONS`, `checklist` from `@/lib/lifecycle`; `Button`; types `CustomerPhase`, `LifecycleEvent`.)
  - In `components/admin/CrmDrawer.tsx`, add `lifecycle: LifecycleEvent[]` to `Payload`, pass `lifecycle={data.lifecycle ?? []}` to `CrmTab`, and add:

```ts
  async function movePhase(to: CustomerPhase) {
    if (!data) return;
    try {
      const response = await fetch(`/api/admin/customers/${data.customer.id}/phase`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to }),
      });
      await readJson<{ customer: Customer }>(response);
      toast.success(`Moved to ${PHASE_LABEL[to]}.`);
      void load();
      onSaved();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not move it.");
    }
  }
```

  passing `onPhase={(to) => void movePhase(to)}`. The existing `save()` already reverts and toasts on a 409 from a refused stage change.

- [ ] **Step 4: Code in the customer list.** In `components/admin/CustomerTable.tsx`, add `customer.code` to the array searched in the `rows` memo (next to `customer.label`), and in the name cell (search the file for the element rendering `customer.profile.name` inside the table body) add below the name: `<span className="ta-caption-2 text-muted-foreground block font-mono">{customer.code ?? "—"}</span>`.

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
Expected: all clean.

- [ ] **Step 6: Browser check.** `npm run dev`, open `/admin/crm`:
  1. Seven columns: New, Contacted, Interested, Won, Onboarding, Production, Churned.
  2. "Assign codes" card appears if any customer lacks a code; clicking it gives each a code and the card disappears.
  3. On a Won card, the right arrow "Start onboarding" without a contact email → toast "Add a contact email; it is how they sign in."; with one → card moves to Onboarding and the Activity feed shows "Moved to Onboarding".
  4. Open that customer's drawer: code and Onboarding badge shown, stage select disabled, checklist lists Preflight and Phone as not done; "Production" button → toast with the checklist reasons.
  5. Customers page: search by code finds the customer.

- [ ] **Step 7: Commit**

```bash
git add components/admin/PipelineBoard.tsx "app/admin/(dashboard)/crm/page.tsx" components/admin/CrmTab.tsx components/admin/CrmDrawer.tsx components/admin/CustomerTable.tsx
git commit -m "Show the funnel on the CRM board and in the drawer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Docs

**Files:**
- Modify: `CLAUDE.md` (the CRM paragraphs under "Storage")

- [ ] **Step 1: Update CLAUDE.md.** After the paragraph that starts "`Customer.stage` is the operator's own pipeline", add:

```markdown
Above the stage sits `Customer.phase` — `demo`, `onboarding`, `production`,
`churned` — and phase is the source of truth: the stage is the sales detail
inside the demo, stays Won from onboarding on, and `lost` means only "left
during the demo". Both move only through `lib/lifecycle.ts`, which decides and
returns the `LifecycleEvent`s to record in `lifecycle:{customerId}`; the PATCH
route refuses a stage change the machine refuses, and phases change only at
`POST /api/admin/customers/[id]/phase`. Production is unreachable until the
preflight (M5) exists.

Every customer also has a readable code (`joes-pizza-k7q`, `lib/customer-code.ts`)
indexed at `code:{code}`. It is assigned at create and by
`POST /api/admin/maintenance/codes`, never by `saveCustomer`, and never
changes. It is a label, not a credential: the demo link stays the nanoid.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "Document the customer phase and code

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Self-review notes

- Spec M1 coverage: Store primitives (T1), code rules (T2), phase type + backfill (T3), state machine + invariants + checklist seam (T4), code index + history + delete cleanup (T5), timeline/feed/phaseCounts (T6), create/PATCH/phase/backfill/crm routes (T7), board/drawer/table (T8). The `expectedUpdatedAt` 409 from the spec's shared groundwork lands in M2 with `applyProfileEdit`, where both PATCH paths exist.
- Checklist `knowledge` uses a minimal rule (address, phone, hours) until M5 replaces it with `staticChecks`.
- Next plans: M4a (npm scripts and eval baseline, independent) and M2 (portal).
