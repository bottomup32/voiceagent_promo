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
