"use client";

import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  CalendarCheck,
  CalendarPlus,
  ChevronDown,
  ClipboardList,
  Languages,
  MoonStar,
  PackageSearch,
  PhoneCall,
  PhoneForwarded,
  Voicemail,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CONTACT_URL } from "@/lib/links";
import { businessNouns, buildUseCases, type UseCase } from "@/lib/use-cases";

/**
 * The menu beside the demo: everything this voice agent does, with the two
 * things this demo actually does marked as such. Opening an item is the whole
 * interaction — nothing here dials, and nothing here spends demo time.
 *
 * lib/use-cases.ts stays React-free, so the icon it names is resolved here.
 */
const ICONS: Record<string, LucideIcon> = {
  "phone-call": PhoneCall,
  languages: Languages,
  "calendar-plus": CalendarPlus,
  "calendar-check": CalendarCheck,
  voicemail: Voicemail,
  "phone-forwarded": PhoneForwarded,
  "moon-star": MoonStar,
  "package-search": PackageSearch,
  "clipboard-list": ClipboardList,
};

type Props = {
  agentName: string;
  businessName: string;
  category?: string;
  className?: string;
};

function Item({
  useCase,
  agentName,
  open,
  onToggle,
}: {
  useCase: UseCase;
  agentName: string;
  open: boolean;
  onToggle: () => void;
}) {
  const Icon = ICONS[useCase.icon] ?? PhoneCall;
  const panelId = `use-case-${useCase.id}`;

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className={`hover:bg-muted/60 focus-visible:ring-ring/50 flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-colors outline-none focus-visible:ring-[3px] ${
          open ? "bg-muted/60" : ""
        }`}
      >
        <Icon className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
        <span className="flex-1">
          <span className="ta-label-1 flex flex-wrap items-center gap-1.5">
            {useCase.title}
            {useCase.live ? (
              <Badge variant="secondary">in this demo</Badge>
            ) : null}
          </span>
          <span className="ta-caption-1 text-muted-foreground mt-0.5 block">
            {useCase.tagline}
          </span>
        </span>
        <ChevronDown
          className={`text-muted-foreground mt-0.5 size-4 shrink-0 transition-transform ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden
        />
      </button>

      {open ? (
        <div id={panelId} className="space-y-2 px-2 pt-1 pb-3">
          <p className="ta-caption-1 text-muted-foreground">{useCase.body}</p>
          <div className="bg-muted/50 flex flex-col gap-2 rounded-lg p-3">
            {useCase.example.map((turn, index) => (
              <div
                key={index}
                className={`flex flex-col gap-0.5 ${
                  turn.speaker === "caller" ? "items-end" : "items-start"
                }`}
              >
                <span className="ta-caption-2 text-muted-foreground px-1">
                  {turn.speaker === "caller" ? "Caller" : agentName}
                </span>
                <p
                  className={`ta-caption-1 max-w-[92%] rounded-lg px-2.5 py-1.5 ${
                    turn.speaker === "caller"
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground"
                  }`}
                >
                  {turn.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </li>
  );
}

function Group({
  label,
  items,
  agentName,
  open,
  onToggle,
}: {
  label: string;
  items: UseCase[];
  agentName: string;
  open: string | null;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="space-y-1">
      <p className="ta-caption-2 text-muted-foreground px-2 tracking-wide uppercase">
        {label}
      </p>
      <ul className="space-y-0.5">
        {items.map((useCase) => (
          <Item
            key={useCase.id}
            useCase={useCase}
            agentName={agentName}
            open={open === useCase.id}
            onToggle={() => onToggle(useCase.id)}
          />
        ))}
      </ul>
    </div>
  );
}

export function UseCaseRail({
  agentName,
  businessName,
  category,
  className,
}: Props) {
  const cases = useMemo(
    () =>
      buildUseCases({
        agentName,
        businessName,
        nouns: businessNouns(category),
      }),
    [agentName, businessName, category],
  );
  const [open, setOpen] = useState<string | null>(null);

  const toggle = (id: string) => setOpen((current) => (current === id ? null : id));
  const live = cases.filter((useCase) => useCase.live);
  const rest = cases.filter((useCase) => !useCase.live);

  return (
    <Card className={`rounded-xl border shadow-none ${className ?? ""}`}>
      <CardContent className="space-y-4 p-3 md:p-4">
        <div className="space-y-1 px-2">
          <p className="ta-headline-2">What a voice agent can do</p>
          <p className="ta-caption-1 text-muted-foreground">
            This demo is the receptionist. Everything below runs on the same
            system — ask us and we turn it on for {businessName}.
          </p>
        </div>

        <Group
          label="Live in this demo"
          items={live}
          agentName={agentName}
          open={open}
          onToggle={toggle}
        />
        <Group
          label="Ask us to turn it on"
          items={rest}
          agentName={agentName}
          open={open}
          onToggle={toggle}
        />

        <div className="px-2 pb-1">
          <Button
            className="w-full"
            nativeButton={false}
            render={<a href={CONTACT_URL} target="_blank" rel="noreferrer" />}
          >
            Talk to us
            <ArrowUpRight className="size-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
