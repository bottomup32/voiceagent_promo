import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Two places this app can keep its data:
 *
 * - a folder of JSON files, which is what you want locally, and
 * - a Redis-compatible store over HTTP, which is what you need on a host with
 *   a read-only filesystem such as Vercel.
 *
 * Everything above this file works through the small interface below, so the
 * choice is one environment variable, not a rewrite.
 */

export type Store = {
  readonly kind: "fs" | "redis";
  getJson<T>(key: string): Promise<T | null>;
  setJson(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
  /** Members of a set, used as the index of customers and of a customer's calls. */
  members(setKey: string): Promise<string[]>;
  addMember(setKey: string, member: string): Promise<void>;
  removeMember(setKey: string, member: string): Promise<void>;
  /** Append-only log, used for page views. */
  push(listKey: string, value: string): Promise<void>;
  range(listKey: string): Promise<string[]>;
  dropList(listKey: string): Promise<void>;
};

const DATA_DIR = path.join(process.cwd(), "data");

// Keys look like "customers:abc" or "calls:abc:def"; keep that shape on disk.
function segments(key: string): string[] {
  return key.replace(/[^A-Za-z0-9:_-]/g, "_").split(":");
}

async function writeAtomic(target: string, body: string): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp`;
  await fs.writeFile(tmp, body, "utf8");
  await fs.rename(tmp, target);
}

export function fsStore(root: string = DATA_DIR): Store {
  const filePath = (key: string) => path.join(root, ...segments(key)) + ".json";
  const listPath = (key: string) => path.join(root, ...segments(key)) + ".jsonl";

  return {
    kind: "fs",

    async getJson<T>(key: string): Promise<T | null> {
      try {
        return JSON.parse(await fs.readFile(filePath(key), "utf8")) as T;
      } catch {
        return null;
      }
    },

    async setJson(key, value) {
      await writeAtomic(filePath(key), JSON.stringify(value, null, 2));
    },

    async del(key) {
      await fs.rm(filePath(key), { force: true });
    },

    // On disk the index is the directory listing, so nothing has to be kept in
    // step by hand.
    async members(setKey) {
      const dir = path.join(root, ...segments(setKey));
      try {
        const names = await fs.readdir(dir);
        return names
          .filter((name) => name.endsWith(".json"))
          .map((name) => name.slice(0, -".json".length));
      } catch {
        return [];
      }
    },

    async addMember() {
      // Implied by the file existing.
    },

    async removeMember() {
      // Implied by the file being gone.
    },

    async push(listKey, value) {
      const target = listPath(listKey);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.appendFile(target, `${value}\n`, "utf8");
    },

    async range(listKey) {
      try {
        const raw = await fs.readFile(listPath(listKey), "utf8");
        return raw.split("\n").filter((line) => line.trim().length > 0);
      } catch {
        return [];
      }
    },

    async dropList(listKey) {
      await fs.rm(listPath(listKey), { force: true });
    },
  };
}

type RedisConfig = { url: string; token: string };

function redisConfig(): RedisConfig | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token };
}

/** Upstash's REST protocol: POST a command as a JSON array, get {result}. */
async function command<T>(config: RedisConfig, args: (string | number)[]): Promise<T> {
  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(
      `Redis ${args[0]} failed with ${response.status}: ${await response.text()}`,
    );
  }
  const data = (await response.json()) as { result: T; error?: string };
  if (data.error) throw new Error(`Redis ${args[0]} failed: ${data.error}`);
  return data.result;
}

export function redisStore(config: RedisConfig): Store {
  return {
    kind: "redis",

    async getJson<T>(key: string): Promise<T | null> {
      const raw = await command<string | null>(config, ["GET", key]);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    },

    async setJson(key, value) {
      await command(config, ["SET", key, JSON.stringify(value)]);
    },

    async del(key) {
      await command(config, ["DEL", key]);
    },

    async members(setKey) {
      return (await command<string[] | null>(config, ["SMEMBERS", setKey])) ?? [];
    },

    async addMember(setKey, member) {
      await command(config, ["SADD", setKey, member]);
    },

    async removeMember(setKey, member) {
      await command(config, ["SREM", setKey, member]);
    },

    async push(listKey, value) {
      await command(config, ["RPUSH", listKey, value]);
    },

    async range(listKey) {
      return (await command<string[] | null>(config, ["LRANGE", listKey, 0, -1])) ?? [];
    },

    async dropList(listKey) {
      await command(config, ["DEL", listKey]);
    },
  };
}

let cached: Store | null = null;

export function getStore(): Store {
  if (cached) return cached;
  const config = redisConfig();
  cached = config ? redisStore(config) : fsStore();
  return cached;
}

/** Which backend is in play, for the admin health check. */
export function storeKind(): "fs" | "redis" {
  return redisConfig() ? "redis" : "fs";
}

export { DATA_DIR };
