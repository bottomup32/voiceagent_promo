import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Phone } from "lucide-react";
import { ContactButtons } from "@/components/public/ContactButtons";
import { ScenarioList } from "@/components/public/ScenarioList";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { VersionBadge } from "@/components/VersionBadge";
import { getCustomer } from "@/lib/store";
import { mailtoFor } from "@/lib/links";
import { customerLink } from "@/lib/share";
import { SCENARIO_COUNT } from "@/lib/use-cases";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

/**
 * Reached from the demo page, and shareable on its own — the link a prospect
 * forwards to whoever else has to be convinced. Same rule as the demo page: if
 * the store is unreachable they meet the quiet "not available" page.
 */
async function loadCustomer(id: string) {
  try {
    return await getCustomer(id);
  } catch (error) {
    console.error(`Could not load the scenarios for ${id}:`, error);
    return null;
  }
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const customer = await loadCustomer(id);
  return {
    title: customer?.profile.name
      ? `What a voice agent can do for ${customer.profile.name}`
      : "What a voice agent can do",
    description:
      "Bookings, confirmation calls, voicemail written up, and the transfer to " +
      "a person — the work behind the receptionist demo.",
  };
}

export default async function ScenariosPage({ params }: Props) {
  const { id } = await params;
  const customer = await loadCustomer(id);

  if (!customer || !customer.active || customer.status !== "ready") {
    notFound();
  }

  // Only what the business itself should see, as on the demo page. This page
  // needs no call state and no research, so it asks for less.
  const name = customer.profile.name;
  const category = customer.profile.category;
  const agentName = customer.agentName;
  const mailto = mailtoFor(name, customerLink(customer.id));

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col gap-8 px-4 py-8">
      <header className="space-y-4">
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link href={`/c/${customer.id}`} />}
        >
          <ArrowLeft className="size-4" />
          Back to the demo
        </Button>
        <div className="space-y-2">
          <h1 className="ta-title-2">What a voice agent can do for {name}</h1>
          <p className="ta-body-2-reading text-muted-foreground">
            The demo answers the phone as {agentName}. That is one job out of{" "}
            {SCENARIO_COUNT}. Everything here runs on the same voice agent and the same
            knowledge about {name} — what changes is how much of the work it is
            allowed to finish.
          </p>
        </div>
      </header>

      <ScenarioList
        agentName={agentName}
        businessName={name}
        category={category}
      />

      <Card className="border-primary/30 bg-primary/5 rounded-xl border shadow-none">
        <CardContent className="space-y-3 p-4 text-center md:p-6">
          <p className="ta-headline-2">Which of these would you want first?</p>
          <p className="ta-body-2-reading text-muted-foreground">
            Tell us and we will set it up on your real number, with your hours
            and your booking rules. Or go back and hear the receptionist again.
          </p>
          <div className="flex flex-col items-center gap-3">
            <ContactButtons
              mailto={mailto}
              customerId={customer.id}
              className="justify-center"
            />
            <Button
              variant="ghost"
              nativeButton={false}
              render={<Link href={`/c/${customer.id}`} />}
            >
              <Phone className="size-4" />
              Back to the demo
            </Button>
          </div>
        </CardContent>
      </Card>

      <footer className="flex flex-col items-center gap-1 pb-4">
        <p className="ta-caption-1 text-muted-foreground text-center">
          A TecAce demo. The business shown here has not endorsed it.
        </p>
        <VersionBadge />
      </footer>
    </main>
  );
}
