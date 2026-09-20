"use client";

import type { BusinessProfile } from "@/lib/types";

type Props = { profile: BusinessProfile };

function Row({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
      <span className="ta-caption-1 text-muted-foreground sm:w-28 sm:shrink-0 sm:pt-0.5">
        {label}
      </span>
      <span className="ta-body-2">{value}</span>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="ta-headline-2">{title}</h3>
      {children}
    </section>
  );
}

export function BusinessKnowledge({ profile }: Props) {
  const openDays = profile.hours?.filter((hour) => !hour.closed) ?? [];
  const closedDays = profile.hours?.filter((hour) => hour.closed) ?? [];

  return (
    <div className="space-y-6">
      <p className="ta-caption-1 text-muted-foreground">
        This is everything the receptionist answers from. It was collected
        automatically, and any line of it can be corrected before you go live.
      </p>

      <Section title="The business">
        <div className="space-y-1.5">
          <Row label="Name" value={profile.name} />
          <Row label="Category" value={profile.category} />
          <Row label="Address" value={profile.address} />
          <Row label="Phone" value={profile.phone} />
          <Row label="Website" value={profile.website} />
          <Row
            label="Rating"
            value={profile.rating ? `${profile.rating} out of 5` : undefined}
          />
        </div>
      </Section>

      {profile.hours?.length ? (
        <Section title="Hours">
          <div className="space-y-1">
            {openDays.map((hour) => (
              <div key={hour.day} className="ta-body-2 flex justify-between gap-4">
                <span>{hour.day}</span>
                <span className="tabular-nums">
                  {hour.open} to {hour.close}
                </span>
              </div>
            ))}
            {closedDays.map((hour) => (
              <div
                key={hour.day}
                className="ta-body-2 text-muted-foreground flex justify-between gap-4"
              >
                <span>{hour.day}</span>
                <span>Closed</span>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {profile.services?.length ? (
        <Section title="Services">
          <ul className="space-y-1.5">
            {profile.services.map((service, index) => (
              <li key={index} className="ta-body-2 flex justify-between gap-4">
                <span>{service.name}</span>
                {service.price ? (
                  <span className="text-muted-foreground shrink-0">{service.price}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {profile.highlights?.length ? (
        <Section title="Known for">
          <ul className="ta-body-2 space-y-1">
            {profile.highlights.map((highlight, index) => (
              <li key={index} className="flex gap-2">
                <span className="text-muted-foreground" aria-hidden>
                  •
                </span>
                {highlight}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {Object.values(profile.policies ?? {}).some(Boolean) ? (
        <Section title="Policies">
          <div className="space-y-1.5">
            <Row label="Reservations" value={profile.policies?.reservations} />
            <Row label="Walk-ins" value={profile.policies?.walkIns} />
            <Row label="Parking" value={profile.policies?.parking} />
            <Row label="Payment" value={profile.policies?.payment} />
            <Row label="Cancellation" value={profile.policies?.cancellation} />
            {profile.policies?.other?.map((entry, index) => (
              <Row key={index} label="Also" value={entry} />
            ))}
          </div>
        </Section>
      ) : null}

      {profile.faqs?.length ? (
        <Section title="Questions callers ask">
          <dl className="space-y-3">
            {profile.faqs.map((faq, index) => (
              <div key={index} className="space-y-0.5">
                <dt className="ta-label-1">{faq.q}</dt>
                <dd className="ta-body-2 text-muted-foreground">{faq.a}</dd>
              </div>
            ))}
          </dl>
        </Section>
      ) : null}

      {profile.reviewSummary ? (
        <Section title="What reviews say">
          <p className="ta-body-2-reading text-muted-foreground">
            {profile.reviewSummary}
          </p>
        </Section>
      ) : null}
    </div>
  );
}
