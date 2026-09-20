import { notFound } from "next/navigation";
import { getCustomer } from "@/lib/store";
import { listCalls } from "@/lib/calls";
import { demoAllowance } from "@/lib/analytics";
import { resolveCallSound } from "@/lib/call-audio";
import { customerLink } from "@/lib/share";
import { DEFAULT_DEMO_MINUTES, LIVE_VOICE_OPTIONS } from "@/lib/types";
import { DemoCall } from "./demo-call";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

/**
 * This link goes out to a prospect by email. If the store is unreachable they
 * should meet the quiet "not available" page, not a server error; the operator
 * finds the real reason in the logs and in /api/admin/health.
 */
async function loadCustomer(id: string) {
  try {
    return await getCustomer(id);
  } catch (error) {
    console.error(`Could not load the demo for ${id}:`, error);
    return null;
  }
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const customer = await loadCustomer(id);
  return {
    title: customer?.profile.name
      ? `Call ${customer.profile.name}`
      : "TecAce voice agent",
    description: "Talk to an AI receptionist built for this business.",
  };
}

export default async function CustomerDemoPage({ params }: Props) {
  const { id } = await params;
  const customer = await loadCustomer(id);

  if (!customer || !customer.active || customer.status !== "ready") {
    notFound();
  }

  const voice = LIVE_VOICE_OPTIONS.find((option) => option.id === customer.voice);

  // How much demo time is left. A failure here must not take the page down, so
  // the prospect gets the full allowance rather than a locked-out call button.
  let demo;
  try {
    demo = demoAllowance(
      await listCalls(customer.id),
      customer.demoMinutes ?? DEFAULT_DEMO_MINUTES,
    );
  } catch (error) {
    console.error(`Could not read demo usage for ${customer.id}:`, error);
    demo = demoAllowance([], customer.demoMinutes ?? DEFAULT_DEMO_MINUTES);
  }

  // Only what the business itself should see. Contact details, labels, notes,
  // and call history stay in the admin area.
  return (
    <DemoCall
      customerId={customer.id}
      name={customer.profile.name}
      category={customer.profile.category}
      address={customer.profile.address}
      phone={customer.profile.phone}
      agentName={customer.agentName}
      callSound={resolveCallSound(customer.callSound)}
      voiceLabel={voice ? `${voice.label}, ${voice.accent}` : customer.voice}
      profile={customer.profile}
      prompts={{
        live: customer.prompts.live,
        backend: customer.prompts.backend,
        greeting: customer.prompts.greeting,
      }}
      dossier={customer.dossier}
      sources={customer.sources}
      researchedAt={customer.researchedAt}
      demo={demo}
      demoUrl={customerLink(customer.id)}
    />
  );
}
