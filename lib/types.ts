export type BusinessHour = {
  day: string;
  open: string;
  close: string;
  closed?: boolean;
};

export type BusinessService = {
  name: string;
  price?: string;
  description?: string;
};

export type BusinessPolicies = {
  reservations?: string;
  walkIns?: string;
  parking?: string;
  payment?: string;
  cancellation?: string;
  other?: string[];
};

export type BusinessFaq = { q: string; a: string };

export type BusinessProfile = {
  name: string;
  category: string;
  address: string;
  phone?: string;
  website?: string;
  lat?: number;
  lng?: number;
  hours: BusinessHour[];
  services: BusinessService[];
  highlights: string[];
  policies: BusinessPolicies;
  faqs: BusinessFaq[];
  rating?: number;
  reviewSummary?: string;
};

export type ResearchSource = { url: string; title: string };

export type CustomerPrompts = {
  live: string;
  backend: string;
  greeting: string;
  edited: boolean;
};

export type CustomerStatus = "researching" | "ready" | "error";

export type Customer = {
  id: string;
  label?: string;
  contactName?: string;
  contactEmail?: string;
  notes?: string;
  active: boolean;
  mapsUrl: string;
  resolvedUrl: string;
  profile: BusinessProfile;
  dossier: string;
  sources: ResearchSource[];
  prompts: CustomerPrompts;
  voice: string;
  agentName: string;
  status: CustomerStatus;
  error?: string;
  createdAt: string;
  updatedAt: string;
  researchedAt?: string;
};

export type TranscriptSpeaker = "caller" | "receptionist";

export type TranscriptEntry = {
  id: string;
  speaker: TranscriptSpeaker;
  text: string;
  startMs: number;
  endMs: number;
};

export type CallStatus = "started" | "completed" | "failed" | "abandoned";

export type CallLog = {
  id: string;
  customerId: string;
  liveSessionId: string;
  startedAt: string;
  endedAt?: string;
  durationSec?: number;
  status: CallStatus;
  endReason?: string;
  turns?: number;
  transcript: TranscriptEntry[];
  userAgent?: string;
  ipHash?: string;
  isTest: boolean;
};

export type CallState =
  | "idle"
  | "connecting"
  | "ringing"
  | "connected"
  | "ending"
  | "ended"
  | "error";

export type CustomerStats = {
  views: number;
  calls: number;
  totalSec: number;
  lastCallAt?: string;
  lastViewAt?: string;
};

export type CustomerWithStats = Customer & { stats: CustomerStats };

export type TrackEvent = {
  type: "page_view";
  customerId: string;
  at: string;
  ipHash?: string;
};

export const LIVE_VOICES = [
  "quartz",
  "ripple",
  "vesper",
  "willow",
  "stone",
  "gleam",
  "meridian",
  "bossa",
  "tempo",
  "beacon",
  "delta",
  "cinder",
  "marin",
] as const;
