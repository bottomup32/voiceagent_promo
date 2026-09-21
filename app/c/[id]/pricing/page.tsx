import { notFound } from "next/navigation";
import { Pricing } from "@/components/public/Pricing";
import { mailtoFor } from "@/lib/links";
import { customerLink } from "@/lib/share";
import { getCustomer } from "@/lib/store";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

/**
 * The price list as a prospect reaches it from their demo: same prices, plus
 * the way back and an email that says whose demo it was. Same rule as the
 * other public pages — an unreachable store is the quiet "not available" page.
 */
async function loadCustomer(id: string) {
  try {
    return await getCustomer(id);
  } catch (error) {
    console.error(`Could not load the pricing page for ${id}:`, error);
    return null;
  }
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const customer = await loadCustomer(id);
  return {
    title: customer?.profile.name
      ? `Pricing — a voice agent for ${customer.profile.name}`
      : "Pricing — TecAce voice agent",
    description:
      "Three monthly plans with minutes included, a per-minute rate past them, " +
      "and two weeks free to start.",
  };
}

export default async function CustomerPricingPage({ params }: Props) {
  const { id } = await params;
  const customer = await loadCustomer(id);

  if (!customer || !customer.active || customer.status !== "ready") {
    notFound();
  }

  // Only what the business itself should see, as on the demo page.
  const name = customer.profile.name;

  return (
    <Pricing
      mailto={mailtoFor(name, customerLink(customer.id))}
      demo={{ id: customer.id, businessName: name, agentName: customer.agentName }}
    />
  );
}
