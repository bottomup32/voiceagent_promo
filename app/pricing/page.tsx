import { Pricing } from "@/components/public/Pricing";
import { pricingMailto } from "@/lib/links";

export const metadata = {
  title: "Pricing — TecAce voice agent",
  description:
    "An AI receptionist on your real line: three monthly plans with minutes " +
    "included, a per-minute rate past them, and two weeks free to start.",
};

/** The price list on its own, for a link that did not come from a demo. */
export default function PricingPage() {
  return <Pricing mailto={pricingMailto()} />;
}
