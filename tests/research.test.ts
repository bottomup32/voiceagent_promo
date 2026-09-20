import { describe, expect, it } from "vitest";
import { buildArgs, extractJson } from "../lib/claude-cli";
import {
  buildDossierPrompt,
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
