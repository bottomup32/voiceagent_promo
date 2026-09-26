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
