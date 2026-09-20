import { getStore } from "./kv";
import { dropEvents } from "./calls";
import { fallbackName, parseMapsUrl } from "./maps";
import { PROMPT_VERSION, buildPrompts } from "./prompt";
import type { Customer } from "./types";
import { DEFAULT_CALL_SOUND, DEFAULT_VOICE } from "./types";

const INDEX = "customers";
const key = (id: string) => `customers:${id}`;

/**
 * Records written before the research moved to a name-first flow only carry a
 * Maps link, and older ones carry the retired default voice. Fix both on read
 * so every caller can rely on the current shape.
 */
export function normalize(customer: Customer): Customer {
  // Prompts nobody has touched follow the current wording, so a record saved
  // before the receptionist learned to open the call, or to answer in the
  // caller's language, picks both up without anyone reopening it. A prompt
  // written by hand is left exactly as it was.
  if (!customer.prompts?.edited && customer.prompts?.version !== PROMPT_VERSION) {
    customer = {
      ...customer,
      prompts: buildPrompts(customer.profile, customer.agentName),
    };
  }

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
  const store = getStore();
  const ids = await store.members(INDEX);
  const customers: Customer[] = [];
  for (const id of ids) {
    const customer = await store.getJson<Customer>(key(id));
    if (customer) customers.push(normalize(customer));
  }
  customers.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return customers;
}

export async function getCustomer(id: string): Promise<Customer | null> {
  if (!/^[A-Za-z0-9_-]{6,32}$/.test(id)) return null;
  const customer = await getStore().getJson<Customer>(key(id));
  return customer ? normalize(customer) : null;
}

export async function saveCustomer(customer: Customer): Promise<Customer> {
  const store = getStore();
  await store.setJson(key(customer.id), customer);
  await store.addMember(INDEX, customer.id);
  return customer;
}

export async function deleteCustomer(id: string): Promise<boolean> {
  const store = getStore();
  const customer = await getCustomer(id);
  if (!customer) return false;

  for (const callId of await store.members(`calls:${id}`)) {
    await store.del(`calls:${id}:${callId}`);
    await store.removeMember(`calls:${id}`, callId);
  }
  await dropEvents(id);
  await store.del(key(id));
  await store.removeMember(INDEX, id);
  return true;
}
