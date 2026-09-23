import type { BusinessProfile } from "../lib/types";

/**
 * Five businesses that pull the prompt in different directions: a restaurant,
 * a clinic, a salon-type appointment business, a professional office opening
 * in Korean with no hours, and a trade with no hours or services at all. A
 * prompt change is judged on all of them, never on the one it was written for.
 *
 * Shared by `tests/prompt-budget.test.ts` (no network) and the evals (network).
 */
export type Fixture = {
  id: string;
  profile: BusinessProfile;
  agentName: string;
  language: string;
};

export const FIXTURES: Fixture[] = [
  {
    id: "pizzeria",
    agentName: "Alex",
    language: "en",
    profile: {
      name: "Joe's Pizza",
      category: "pizzeria",
      address: "7 Carmine St, New York, NY 10014",
      phone: "(212) 366-1182",
      hours: [
        { day: "Monday", open: "10:00", close: "23:00" },
        { day: "Tuesday", open: "10:00", close: "23:00" },
        { day: "Wednesday", open: "10:00", close: "23:00" },
        { day: "Thursday", open: "10:00", close: "23:00" },
        { day: "Friday", open: "10:00", close: "02:00" },
        { day: "Saturday", open: "10:00", close: "02:00" },
        { day: "Sunday", open: "", close: "", closed: true },
      ],
      services: [
        { name: "Cheese slice", price: "$3.75" },
        { name: "Fresh mozzarella pie", price: "$32" },
      ],
      highlights: ["Classic New York slice since 1975"],
      policies: { reservations: "No reservations, counter service only", payment: "Cash and cards" },
      faqs: [
        { q: "Do you deliver?", a: "Through the delivery apps, not directly." },
        { q: "Do you have gluten-free crust?", a: "No, every crust contains wheat." },
      ],
      rating: 4.5,
      reviewSummary: "Lines get long on weekend nights.",
    },
  },
  {
    id: "dental",
    agentName: "Alex",
    language: "en",
    profile: {
      name: "Bright Smile Dental",
      category: "dental clinic",
      address: "500 Pine St, Suite 200, Seattle, WA 98101, USA",
      phone: "(206) 555-0100",
      hours: [
        { day: "Monday", open: "08:00", close: "17:00" },
        { day: "Tuesday", open: "08:00", close: "17:00" },
        { day: "Wednesday", open: "08:00", close: "17:00" },
        { day: "Thursday", open: "08:00", close: "17:00" },
        { day: "Friday", open: "08:00", close: "14:00" },
        { day: "Saturday", open: "", close: "", closed: true },
        { day: "Sunday", open: "", close: "", closed: true },
      ],
      services: [{ name: "Cleaning and exam", price: "$120" }, { name: "Emergency visit" }],
      highlights: ["Accepts most PPO insurance"],
      policies: { cancellation: "24 hours' notice or a $50 fee", other: ["New patients welcome"] },
      faqs: [{ q: "Do you take Delta Dental?", a: "Yes, Delta Dental PPO is accepted." }],
      rating: 3.1,
      reviewSummary: "Reviews mention long waits and billing surprises.",
    },
  },
  {
    id: "barber",
    agentName: "Sam",
    language: "en",
    profile: {
      name: "Fade Street Barbers",
      category: "Barber shop",
      address: "88 Fillmore St, San Francisco, CA 94117",
      hours: [
        { day: "Tuesday", open: "10:00", close: "19:00" },
        { day: "Saturday", open: "09:00", close: "16:00" },
        { day: "Monday", open: "", close: "", closed: true },
      ],
      services: [{ name: "Skin fade", price: "$45" }, { name: "Beard trim", price: "$20" }],
      highlights: [],
      policies: { walkIns: "Walk-ins welcome when a chair is free" },
      faqs: [],
    },
  },
  {
    id: "law-ko",
    agentName: "Mina",
    language: "ko",
    profile: {
      name: "Kim & Lee LLP",
      category: "immigration law firm",
      address: "서울특별시 강남구 테헤란로 123",
      hours: [],
      services: [{ name: "Visa consultation" }],
      highlights: [],
      policies: {},
      faqs: [
        {
          q: "Do you offer free consultations?",
          a: "The first 20-minute consultation is free; after that the firm quotes a fee.",
        },
      ],
    },
  },
  {
    id: "plumber",
    agentName: "Alex",
    language: "en",
    profile: {
      name: "Rapid Rooter Plumbing",
      category: "Plumber",
      address: "",
      hours: [],
      services: [],
      highlights: [],
      policies: {},
      faqs: [],
    },
  },
];
