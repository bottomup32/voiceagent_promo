import { createServer, type Server } from "node:http";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fsStore, redisStore, type Store } from "../lib/kv";

/** A stand-in for the Upstash REST endpoint, enough to drive the client. */
function startFakeRedis(token: string): Promise<{ server: Server; url: string }> {
  const kv = new Map<string, string>();
  const sets = new Map<string, Set<string>>();
  const lists = new Map<string, string[]>();

  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      if (req.headers.authorization !== `Bearer ${token}`) {
        res.writeHead(401).end(JSON.stringify({ error: "bad token" }));
        return;
      }
      const [command, ...args] = JSON.parse(body) as string[];
      let result: unknown = null;
      switch (command) {
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
        case "GET":
          result = kv.get(args[0]) ?? null;
          break;
        case "GETDEL":
          result = kv.get(args[0]) ?? null;
          kv.delete(args[0]);
          break;
        case "DEL":
          kv.delete(args[0]);
          lists.delete(args[0]);
          result = 1;
          break;
        case "SADD": {
          const set = sets.get(args[0]) ?? new Set<string>();
          set.add(args[1]);
          sets.set(args[0], set);
          result = 1;
          break;
        }
        case "SREM":
          sets.get(args[0])?.delete(args[1]);
          result = 1;
          break;
        case "SMEMBERS":
          result = [...(sets.get(args[0]) ?? [])];
          break;
        case "RPUSH": {
          const list = lists.get(args[0]) ?? [];
          list.push(args[1]);
          lists.set(args[0], list);
          result = list.length;
          break;
        }
        case "LRANGE":
          result = lists.get(args[0]) ?? [];
          break;
        default:
          res.writeHead(400).end(JSON.stringify({ error: `unknown ${command}` }));
          return;
      }
      res
        .writeHead(200, { "content-type": "application/json" })
        .end(JSON.stringify({ result }));
    });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

/** The behaviour every backend has to provide, run against each of them. */
function behavesLikeAStore(name: string, make: () => Promise<Store>) {
  describe(name, () => {
    it("round-trips a document", async () => {
      const store = await make();
      expect(await store.getJson("customers:missing")).toBeNull();
      await store.setJson("customers:abc", { id: "abc", name: "Joe's" });
      expect(await store.getJson("customers:abc")).toEqual({
        id: "abc",
        name: "Joe's",
      });
    });

    it("lists and forgets index members", async () => {
      const store = await make();
      await store.setJson("customers:a", { id: "a" });
      await store.addMember("customers", "a");
      await store.setJson("customers:b", { id: "b" });
      await store.addMember("customers", "b");
      expect((await store.members("customers")).sort()).toEqual(["a", "b"]);

      await store.del("customers:a");
      await store.removeMember("customers", "a");
      expect(await store.members("customers")).toEqual(["b"]);
      expect(await store.getJson("customers:a")).toBeNull();
    });

    it("keeps a nested index per customer", async () => {
      const store = await make();
      await store.setJson("calls:cust1:call1", { id: "call1" });
      await store.addMember("calls:cust1", "call1");
      expect(await store.members("calls:cust1")).toEqual(["call1"]);
      expect(await store.members("calls:other")).toEqual([]);
    });

    it("appends to a log and reads it back in order", async () => {
      const store = await make();
      expect(await store.range("events")).toEqual([]);
      await store.push("events", JSON.stringify({ at: 1 }));
      await store.push("events", JSON.stringify({ at: 2 }));
      expect(await store.range("events")).toEqual(['{"at":1}', '{"at":2}']);

      await store.dropList("events");
      expect(await store.range("events")).toEqual([]);
    });

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
  });
}

let fake: { server: Server; url: string };

beforeAll(async () => {
  fake = await startFakeRedis("testtoken");
});

afterAll(() => {
  fake.server.close();
});

behavesLikeAStore("fsStore", async () =>
  fsStore(await fs.mkdtemp(path.join(tmpdir(), "voiceagent-store-"))),
);

// Each run gets its own key prefix so the shared fake server stays honest.
behavesLikeAStore("redisStore", async () =>
  redisStore({ url: fake.url, token: "testtoken" }),
);

describe("redisStore errors", () => {
  it("names the token when the store rejects the credentials", async () => {
    const store = redisStore({ url: fake.url, token: "wrong" });
    await expect(store.getJson("customers:abc")).rejects.toThrow(
      /KV_REST_API_TOKEN/,
    );
  });

  it("names the url when the store cannot be reached at all", async () => {
    // Port 1 is reserved and nothing listens there.
    const store = redisStore({ url: "http://127.0.0.1:1", token: "t" });
    await expect(store.getJson("customers:abc")).rejects.toThrow(
      /did not answer/,
    );
  });
});
