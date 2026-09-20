import { knownHours } from "./hours";
import type { BusinessProfile, CustomerPrompts } from "./types";

function hoursLine(profile: BusinessProfile): string {
  const known = knownHours(profile.hours);
  if (!known.length) {
    // Saying "unknown" is what stops the receptionist inventing an answer.
    return "Hours: unknown. If a caller asks, say you do not have the hours in front of you and offer to take a message.";
  }
  const parts = known.map((hour) => `${hour.day}: ${hour.text}`);
  return `Hours: ${parts.join("; ")}.`;
}

function servicesLine(profile: BusinessProfile, limit: number): string {
  if (!profile.services?.length) return "";
  const parts = profile.services
    .slice(0, limit)
    .map((service) => (service.price ? `${service.name} (${service.price})` : service.name));
  return `Popular items and services: ${parts.join("; ")}.`;
}

function policiesLine(profile: BusinessProfile): string {
  const policies = profile.policies ?? {};
  const parts: string[] = [];
  if (policies.reservations) parts.push(`Reservations: ${policies.reservations}`);
  if (policies.walkIns) parts.push(`Walk-ins: ${policies.walkIns}`);
  if (policies.parking) parts.push(`Parking: ${policies.parking}`);
  if (policies.payment) parts.push(`Payment: ${policies.payment}`);
  if (policies.cancellation) parts.push(`Cancellation: ${policies.cancellation}`);
  for (const other of policies.other ?? []) parts.push(other);
  return parts.length ? `Policies: ${parts.join(". ")}.` : "";
}

function city(profile: BusinessProfile): string {
  const segments = (profile.address || "").split(",").map((part) => part.trim());
  return segments.length >= 2 ? segments[segments.length - 2] : profile.address || "";
}

export function buildLivePrompt(profile: BusinessProfile, agentName: string): string {
  // `false` drops a line; an empty string is a deliberate blank line.
  const lines: (string | false)[] = [
    `You are ${agentName}, the phone receptionist at ${profile.name}${
      profile.category ? `, a ${profile.category}` : ""
    }${city(profile) ? ` in ${city(profile)}` : ""}.`,
    "",
    "How to speak:",
    "- Speak American English in a standard US accent. Never drift into a British, Australian, or Irish accent.",
    "- Bright and upbeat, with a smile in your voice. You are glad the phone rang.",
    "- Brisk, natural pace. Sound like a real person at a busy front desk, not a script being read.",
    "- Use contractions and everyday phrasing: \"we're\", \"sure thing\", \"you got it\", \"let me check on that\".",
    "- Drop in short backchannels while the caller talks: \"mm-hm\", \"right\", \"got it\".",
    "- Keep each turn to one or two short sentences, then stop and listen.",
    "- Repeat names, times, and phone numbers back to confirm them.",
    "- If the caller interrupts, stop talking immediately and follow their lead.",
    "- Never invent prices, hours, or availability. If you are not sure, say you will check and delegate the question.",
    "- For anything that needs a lookup, a booking, or a message, delegate and tell the caller you are checking.",
    "",
    "What you know without checking:",
    `- Address: ${profile.address || "unknown"}.`,
    profile.phone ? `- Phone: ${profile.phone}.` : false,
    `- ${hoursLine(profile)}`,
    servicesLine(profile, 8) ? `- ${servicesLine(profile, 8)}` : false,
    policiesLine(profile) ? `- ${policiesLine(profile)}` : false,
    profile.highlights?.length
      ? `- Known for: ${profile.highlights.slice(0, 5).join("; ")}.`
      : false,
    "",
    `End the call politely, for example "Thanks for calling ${profile.name}, have a great day."`,
  ];
  return lines.filter((line) => line !== false).join("\n");
}

export function buildBackendPrompt(profile: BusinessProfile, agentName: string): string {
  return [
    `You support ${agentName}, the phone receptionist at ${profile.name}.`,
    "Answer the receptionist's questions using only the business profile below.",
    "",
    "Rules:",
    "- Answer strictly from the profile. If the profile does not cover it, say so plainly and suggest the caller be offered a callback.",
    "- Keep answers short and speakable: no lists, no markdown, no more than two sentences.",
    "- For a booking, a reservation, or a message, collect the caller's name, phone number, and preferred time, then confirm the details back.",
    "- Never invent prices, hours, or availability.",
    "",
    "Business profile (JSON):",
    JSON.stringify(profile, null, 2),
  ].join("\n");
}

export function buildGreetingPrompt(profile: BusinessProfile, agentName: string): string {
  return `Greet the caller now, brightly and in a standard American accent. Say: "Thanks for calling ${profile.name}, this is ${agentName}! How can I help you today?" Then pause and listen.`;
}

export function buildPrompts(
  profile: BusinessProfile,
  agentName: string,
): CustomerPrompts {
  return {
    live: buildLivePrompt(profile, agentName),
    backend: buildBackendPrompt(profile, agentName),
    greeting: buildGreetingPrompt(profile, agentName),
    edited: false,
  };
}

/**
 * Which prompts a save should keep.
 *
 * The editor posts the whole record every time, prompts included, so prompts
 * arriving unchanged means nothing was typed into them. Only text that differs
 * counts as a hand edit; otherwise saving the address or the Active switch
 * would mark the prompts hand-written and freeze them for good.
 *
 * Prompts nobody has touched follow the data they were written from, so a new
 * receptionist name or a corrected address reaches the call.
 */
export function resolvePrompts(input: {
  current: CustomerPrompts;
  submitted?: Partial<CustomerPrompts> | null;
  profile: BusinessProfile;
  agentName: string;
  regenerate?: boolean;
}): CustomerPrompts {
  const { current, submitted, profile, agentName, regenerate } = input;

  if (regenerate) return buildPrompts(profile, agentName);

  if (submitted) {
    const typed = {
      live: submitted.live ?? current.live,
      backend: submitted.backend ?? current.backend,
      greeting: submitted.greeting ?? current.greeting,
    };
    if (
      typed.live !== current.live ||
      typed.backend !== current.backend ||
      typed.greeting !== current.greeting
    ) {
      return { ...typed, edited: true };
    }
  }

  return current.edited ? current : buildPrompts(profile, agentName);
}
