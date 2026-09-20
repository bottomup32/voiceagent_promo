import { notFound } from "next/navigation";
import { getCustomer } from "@/lib/store";
import { resolveCallSound } from "@/lib/call-audio";
import { LIVE_VOICE_OPTIONS } from "@/lib/types";
import { DemoCall } from "./demo-call";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const customer = await getCustomer(id);
  return {
    title: customer?.profile.name
      ? `Call ${customer.profile.name}`
      : "TecAce voice agent",
    description: "Talk to an AI receptionist built for this business.",
  };
}

export default async function CustomerDemoPage({ params }: Props) {
  const { id } = await params;
  const customer = await getCustomer(id);

  if (!customer || !customer.active || customer.status !== "ready") {
    notFound();
  }

  const voice = LIVE_VOICE_OPTIONS.find((option) => option.id === customer.voice);

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
    />
  );
}
