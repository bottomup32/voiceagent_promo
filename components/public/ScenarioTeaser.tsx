import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * One line on the demo page about the rest of the work, and a way through to
 * it. The detail lives at /c/[id]/scenarios so the demo page stays about the
 * call — only the reader who asks for the menu gets the menu.
 */
export function ScenarioTeaser({
  customerId,
  count,
}: {
  customerId: string;
  count: number;
}) {
  return (
    <Card className="rounded-xl border shadow-none">
      <CardContent className="space-y-3 p-4 md:p-6">
        <p className="ta-headline-2">It is not only a receptionist.</p>
        <p className="ta-body-2-reading text-muted-foreground">
          The same voice agent takes bookings, rings people back to confirm
          them, writes up the voicemail it takes, and hands you the calls that
          need a person. None of that is switched on for this demo.
        </p>
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href={`/c/${customerId}/scenarios`} />}
        >
          See all {count} scenarios
          <ArrowRight className="size-4" />
        </Button>
      </CardContent>
    </Card>
  );
}
