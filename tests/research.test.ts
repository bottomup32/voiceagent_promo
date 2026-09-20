import { describe, expect, it } from "vitest";
import { buildArgs, extractJson } from "../lib/claude-cli";
import {
  buildDossierPrompt,
  cleanSourceUrl,
  buildProfilePrompt,
  dedupeSources,
  urlsInText,
} from "../lib/research";

describe("buildArgs", () => {
  it("runs headless with JSON output and the chosen model", () => {
    const args = buildArgs("hello", { model: "sonnet" });
    expect(args.slice(0, 2)).toEqual(["-p", "hello"]);
    expect(args).toContain("--output-format");
    expect(args).toContain("json");
    expect(args).toContain("--model");
    expect(args[args.indexOf("--model") + 1]).toBe("sonnet");
  });

  it("keeps the project's own skills and settings out of the run", () => {
    const args = buildArgs("hello");
    expect(args).toContain("--disable-slash-commands");
    expect(args[args.indexOf("--setting-sources") + 1]).toBe("user");
  });

  it("grants only the tools asked for, and none by default", () => {
    const withTools = buildArgs("hello", { tools: ["WebSearch", "WebFetch"] });
    const index = withTools.indexOf("--allowed-tools");
    expect(withTools.slice(index + 1, index + 3)).toEqual(["WebSearch", "WebFetch"]);

    const withoutTools = buildArgs("hello");
    expect(withoutTools[withoutTools.indexOf("--allowed-tools") + 1]).toBe("none");
  });
});

describe("extractJson", () => {
  it("reads plain JSON", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("reads JSON inside a markdown fence", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("reads JSON surrounded by prose", () => {
    expect(extractJson('Here you go: {"a":1} — hope that helps.')).toEqual({ a: 1 });
  });

  it("throws when there is no JSON at all", () => {
    expect(() => extractJson("no json here")).toThrow(/not valid JSON/);
  });
});

describe("buildDossierPrompt", () => {
  it("makes the business name the subject of the research", () => {
    const prompt = buildDossierPrompt({ businessName: "Joe's Pizza" });
    expect(prompt).toContain('Research the business "Joe\'s Pizza"');
    expect(prompt).toContain("No links were supplied");
  });

  it("frames a Maps link as one reference, not the subject", () => {
    const prompt = buildDossierPrompt(
      { businessName: "Joe's Pizza", mapsUrl: "https://maps.app.goo.gl/x" },
      "https://www.google.com/maps/place/Joes",
    );
    expect(prompt).toContain("one reference, not the whole story");
    expect(prompt).toContain("https://www.google.com/maps/place/Joes");
  });

  it("passes the website and the operator's notes through", () => {
    const prompt = buildDossierPrompt({
      businessName: "Tartine",
      websiteUrl: "https://tartinebakery.com",
      notes: "The Guerrero Street location only.",
    });
    expect(prompt).toContain("https://tartinebakery.com");
    expect(prompt).toContain("Guerrero Street");
  });

  it("forbids inventing facts", () => {
    const prompt = buildDossierPrompt({ businessName: "Joe's Pizza" });
    expect(prompt).toContain("Never invent hours, prices, or phone numbers");
  });
});

describe("buildProfilePrompt", () => {
  it("asks for bare JSON and carries the briefing", () => {
    const prompt = buildProfilePrompt("Joe's Pizza", "## Identity\nA pizzeria.");
    expect(prompt).toContain("ONLY a JSON object");
    expect(prompt).toContain("A pizzeria.");
    expect(prompt).toContain('"faqs"');
  });
});

describe("urlsInText", () => {
  it("pulls URLs out and titles them by host", () => {
    const sources = urlsInText("See https://www.joespizzanyc.com/menu and https://yelp.com/biz/x.");
    expect(sources).toEqual([
      { url: "https://www.joespizzanyc.com/menu", title: "joespizzanyc.com" },
      { url: "https://yelp.com/biz/x", title: "yelp.com" },
    ]);
  });
});

describe("dedupeSources", () => {
  it("keeps the first of each URL and caps the list", () => {
    const deduped = dedupeSources([
      { url: "https://a.com", title: "A" },
      { url: "https://a.com", title: "A again" },
      { url: "https://b.com", title: "" },
    ]);
    expect(deduped).toEqual([
      { url: "https://a.com", title: "A" },
      { url: "https://b.com", title: "https://b.com" },
    ]);
  });
});

describe("cleanSourceUrl", () => {
  it("strips the tracking a search tool bolted on", () => {
    expect(
      cleanSourceUrl("https://tartinebakery.com/menu?utm_source=openai&utm_medium=x"),
    ).toBe("https://tartinebakery.com/menu");
  });

  it("keeps the parameters a page actually needs", () => {
    expect(cleanSourceUrl("https://example.com/menu?id=7&utm_source=openai")).toBe(
      "https://example.com/menu?id=7",
    );
  });

  it("drops a search results page, which is a route and not a source", () => {
    expect(cleanSourceUrl("https://www.google.com/maps/search/Tartine")).toBeNull();
    expect(cleanSourceUrl("https://www.bing.com/search?q=tartine")).toBeNull();
  });

  it("keeps a Maps listing, which is one", () => {
    expect(cleanSourceUrl("https://www.google.com/maps/place/Tartine+Bakery")).toBe(
      "https://www.google.com/maps/place/Tartine+Bakery",
    );
  });

  it("refuses anything that is not a web address", () => {
    expect(cleanSourceUrl("javascript:alert(1)")).toBeNull();
    expect(cleanSourceUrl("not a url")).toBeNull();
  });

  it("cleans the urls it finds in a briefing", () => {
    const found = urlsInText(
      "See https://tartinebakery.com?utm_source=openai and https://www.google.com/search?q=x.",
    );
    expect(found.map((source) => source.url)).toEqual(["https://tartinebakery.com"]);
    expect(found[0].title).toBe("tartinebakery.com");
  });

  it("does not list the same page twice because of its tracking", () => {
    const deduped = dedupeSources([
      { url: "https://tartinebakery.com/menu?utm_source=openai", title: "Menu" },
      { url: "https://tartinebakery.com/menu", title: "Menu again" },
    ]);
    expect(deduped).toHaveLength(1);
  });
});
