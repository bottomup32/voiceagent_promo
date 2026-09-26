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
