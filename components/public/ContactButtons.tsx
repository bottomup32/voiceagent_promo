import { ArrowUpRight, Mail, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CONTACT_URL, PRICING_URL } from "@/lib/links";

/**
 * The standing offer, on every public page. The mailto is built by the caller
 * from the link the server knows — reading window.location would render empty
 * on the server and hydration would keep the empty href.
 */
export function ContactButtons({
  mailto,
  className,
}: {
  mailto: string;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap gap-2 ${className ?? ""}`}>
      <Button
        nativeButton={false}
        render={<a href={CONTACT_URL} target="_blank" rel="noreferrer" />}
      >
        Talk to us
        <ArrowUpRight className="size-4" />
      </Button>
      <Button
        variant="outline"
        nativeButton={false}
        render={<a href={PRICING_URL} target="_blank" rel="noreferrer" />}
      >
        <Tag className="size-4" />
        Pricing
      </Button>
      <Button variant="ghost" nativeButton={false} render={<a href={mailto} />}>
        <Mail className="size-4" />
        Email us
      </Button>
    </div>
  );
}
