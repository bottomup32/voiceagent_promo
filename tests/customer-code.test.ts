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
