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

export type ResearchInputs = {
  businessName: string;
  websiteUrl?: string;
  mapsUrl?: string;
  /** Anything the operator knows that the web will not say. */
  notes?: string;
};

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
  /** What the research starts from. The name is required; the links are extra
   *  context, not the subject. */
  businessName: string;
  websiteUrl?: string;
  mapsUrl?: string;
  resolvedMapsUrl?: string;
  researchNotes?: string;
  profile: BusinessProfile;
  dossier: string;
  sources: ResearchSource[];
  prompts: CustomerPrompts;
  voice: string;
  callSound?: CallSound;
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

export type VoiceOption = {
  id: string;
  label: string;
  accent: string;
  presentation: "feminine" | "masculine";
};

/** The voices gpt-live-1 ships, with the accent each one speaks in. */
export const LIVE_VOICE_OPTIONS: VoiceOption[] = [
  { id: "gleam", label: "Gleam", accent: "North American", presentation: "feminine" },
  { id: "meridian", label: "Meridian", accent: "North American", presentation: "masculine" },
  { id: "delta", label: "Delta", accent: "Southern US", presentation: "feminine" },
  { id: "cinder", label: "Cinder", accent: "Southern US", presentation: "masculine" },
  { id: "quartz", label: "Quartz", accent: "Australian", presentation: "feminine" },
  { id: "ripple", label: "Ripple", accent: "Australian", presentation: "masculine" },
  { id: "vesper", label: "Vesper", accent: "British", presentation: "masculine" },
  { id: "willow", label: "Willow", accent: "Irish", presentation: "feminine" },
  { id: "stone", label: "Stone", accent: "Irish", presentation: "masculine" },
  { id: "beacon", label: "Beacon", accent: "Filipino", presentation: "masculine" },
  { id: "bossa", label: "Bossa", accent: "Brazilian Portuguese", presentation: "feminine" },
  { id: "tempo", label: "Tempo", accent: "Brazilian Portuguese", presentation: "masculine" },
];

export const LIVE_VOICES = LIVE_VOICE_OPTIONS.map((voice) => voice.id);

export const DEFAULT_VOICE = "gleam";

/** How the call itself should sound, on top of what the model says. */
export type CallSound = {
  /** Narrow the agent audio to the telephone band. */
  phoneLine: boolean;
  /** Mix a quiet room tone under the call. */
  roomTone: boolean;
};

export const DEFAULT_CALL_SOUND: CallSound = { phoneLine: true, roomTone: true };
