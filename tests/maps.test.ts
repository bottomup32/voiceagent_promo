import { describe, expect, it } from "vitest";
import { fallbackName, isMapsUrl, parseMapsUrl } from "../lib/maps";

describe("isMapsUrl", () => {
  it("accepts full and short Google Maps links", () => {
    expect(isMapsUrl("https://www.google.com/maps/place/Joe's+Pizza/@40.7,-74.0,17z")).toBe(true);
    expect(isMapsUrl("https://maps.app.goo.gl/abc123")).toBe(true);
    expect(isMapsUrl("https://maps.google.com/?cid=123")).toBe(true);
  });

  it("rejects other links", () => {
    expect(isMapsUrl("https://example.com/place")).toBe(false);
    expect(isMapsUrl("not a url")).toBe(false);
  });
});

describe("parseMapsUrl", () => {
  it("extracts the place name and coordinates", () => {
    const parsed = parseMapsUrl(
      "https://www.google.com/maps/place/Joe's+Pizza/@40.7306,-73.9866,17z/data=!3m1!4b1",
    );
    expect(parsed.nameHint).toBe("Joe's Pizza");
    expect(parsed.lat).toBeCloseTo(40.7306);
    expect(parsed.lng).toBeCloseTo(-73.9866);
  });

  it("decodes percent-encoded names", () => {
    const parsed = parseMapsUrl(
      "https://www.google.com/maps/place/Tartine+Bakery+%26+Cafe/@37.7614,-122.4241,17z",
    );
    expect(parsed.nameHint).toBe("Tartine Bakery & Cafe");
  });

  it("reads the q parameter as a name hint", () => {
    const parsed = parseMapsUrl("https://www.google.com/maps?q=Blue+Bottle+Coffee+Oakland");
    expect(parsed.query).toBe("Blue Bottle Coffee Oakland");
    expect(parsed.nameHint).toBe("Blue Bottle Coffee Oakland");
  });

  it("reads coordinates given through q", () => {
    const parsed = parseMapsUrl("https://www.google.com/maps?q=37.7749,-122.4194");
    expect(parsed.lat).toBeCloseTo(37.7749);
    expect(parsed.lng).toBeCloseTo(-122.4194);
    expect(parsed.query).toBeUndefined();
  });

  it("extracts cid and place_id", () => {
    expect(parseMapsUrl("https://maps.google.com/?cid=12345678").cid).toBe("12345678");
    expect(
      parseMapsUrl("https://www.google.com/maps/search/?api=1&query=x&query_place_id=ChIJabc")
        .placeId,
    ).toBe("ChIJabc");
  });

  it("returns an empty result for junk input", () => {
    expect(parseMapsUrl("nonsense")).toEqual({});
  });
});

describe("fallbackName", () => {
  it("prefers the parsed name, then the query, then the host", () => {
    expect(fallbackName({ nameHint: "Joe's Pizza" }, "https://x.com")).toBe("Joe's Pizza");
    expect(fallbackName({ query: "Blue Bottle" }, "https://x.com")).toBe("Blue Bottle");
    expect(fallbackName({}, "https://maps.app.goo.gl/abc")).toBe("maps.app.goo.gl");
    expect(fallbackName({}, "junk")).toBe("Unknown business");
  });
});
