import { promises as fs } from "node:fs";
import path from "node:path";
import { fallbackName, parseMapsUrl } from "./maps";
import type { Customer } from "./types";
import { DEFAULT_CALL_SOUND, DEFAULT_VOICE } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const CUSTOMERS_DIR = path.join(DATA_DIR, "customers");

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

/**
 * Records written before the research moved to a name-first flow only carry a
 * Maps link. Give them a business name so every reader can rely on one.
 */
function normalize(customer: Customer): Customer {
  // "quartz" was the old default and speaks with an Australian accent. Records
  // still carrying it never had a voice chosen for them, so move them to the
  // North American default; a voice picked by hand is left alone.
  const voice = customer.voice === "quartz" ? DEFAULT_VOICE : customer.voice;
  const callSound = customer.callSound ?? DEFAULT_CALL_SOUND;

  if (customer.businessName?.trim()) {
    return voice === customer.voice && customer.callSound
      ? customer
      : { ...customer, voice, callSound };
  }
  const fromProfile = customer.profile?.name?.trim();
  const fromLink = customer.mapsUrl
    ? fallbackName(parseMapsUrl(customer.mapsUrl), customer.mapsUrl)
    : "";
  return {
    ...customer,
    voice,
    callSound,
    businessName: fromProfile || fromLink || "Unnamed business",
  };
}

export async function listCustomers(): Promise<Customer[]> {
  await ensureDir(CUSTOMERS_DIR);
  const files = await fs.readdir(CUSTOMERS_DIR);
  const customers: Customer[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(CUSTOMERS_DIR, file), "utf8");
      customers.push(normalize(JSON.parse(raw) as Customer));
    } catch {
      // Skip unreadable or half-written files rather than failing the list.
    }
  }
  customers.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return customers;
}

export async function getCustomer(id: string): Promise<Customer | null> {
  if (!/^[A-Za-z0-9_-]{6,32}$/.test(id)) return null;
  try {
    const raw = await fs.readFile(path.join(CUSTOMERS_DIR, `${id}.json`), "utf8");
    return normalize(JSON.parse(raw) as Customer);
  } catch {
    return null;
  }
}

export async function saveCustomer(customer: Customer): Promise<Customer> {
  await ensureDir(CUSTOMERS_DIR);
  const target = path.join(CUSTOMERS_DIR, `${customer.id}.json`);
  const tmp = `${target}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(customer, null, 2), "utf8");
  await fs.rename(tmp, target);
  return customer;
}

export async function deleteCustomer(id: string): Promise<boolean> {
  const customer = await getCustomer(id);
  if (!customer) return false;
  await fs.rm(path.join(CUSTOMERS_DIR, `${id}.json`), { force: true });
  await fs.rm(path.join(DATA_DIR, "calls", id), { recursive: true, force: true });
  return true;
}

export { DATA_DIR };
