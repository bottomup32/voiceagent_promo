import { notFound } from "next/navigation";
import { getCustomer } from "@/lib/store";
import { resolveCallSound } from "@/lib/call-audio";
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

  return (
    <DemoCall
      customerId={customer.id}
      name={customer.profile.name}
      category={customer.profile.category}
      address={customer.profile.address}
      phone={customer.profile.phone}
      agentName={customer.agentName}
      callSound={resolveCallSound(customer.callSound)}
    />
  );
}
