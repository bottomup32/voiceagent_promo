# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev                      # dev server (localhost:3000)
npm run build && npm start       # production build, then serve it
npm run lint                     # eslint, zero-tolerance: the repo lints clean
npx tsc --noEmit                 # typecheck
npx vitest run                   # all tests
npx vitest run tests/maps.test.ts          # one file
npx vitest run -t "keeps the blank lines"  # one test by name
```

There is no test script in `package.json`; call `vitest` directly. Tests are plain
unit tests over `lib/` with no DOM and no network, so the whole suite runs in well
under a second. Keep it that way: logic a component needs tested goes into a pure
`lib/` module (`lib/scroll.ts` takes a structural element type and an injectable
`getStyle` for exactly this reason; `lib/voice-level.ts` is the orb's math without
the canvas).

`README.md` has fallen behind the code (it still says `quartz` is the default
voice, that Hobby caps a function at 60s, and that research needs the CLI or
Anthropic). Where the two disagree, this file and `.env.example` are right.

## What this is

A promo app. A target business gets an unlisted link, opens it, presses call, and
talks to an AI receptionist built for that business from public web research. The
operator manages businesses, data, prompts, and usage numbers behind a password.

Two views, one codebase:

- `/admin/*` — password-gated. Route group `app/admin/(dashboard)/` carries the
  sidebar layout; `app/admin/login` sits outside it so the login page renders bare.
- `/c/[id]` — public, unlisted, and a sales page as much as a demo. Call button,
  transcript, the knowledge, prompts and sources, and a standing offer to talk
  to us (`lib/links.ts` holds the URLs). It says plainly that it is a demo and
  not the business's phone line.

  The page opens on `components/public/Hero.tsx`: an outcome headline carrying
  the business name, chips that are that business's own short FAQ questions
  (`lib/proof.ts`, padded from a fallback list, dropped rather than truncated
  when long), and a phone-shaped frame that shows the scripted opening line
  until the call starts and the live transcript after. `quotedGreeting()`
  returns null when the greeting prompt quotes nothing, so an instruction is
  never shown as speech. `StickyCall` keeps the same live call one tap away once
  the button scrolls off. `VoiceOrb` draws on a canvas from two `AnalyserNode`s
  tapped into the call's existing Web Audio graph and reads them through a ref,
  so React never renders a frame. `Exchange` is the one chat bubble shared by
  the live transcript, the scenarios page and the admin call viewers.

  `/c/[id]/scenarios` is the rest of the menu (`lib/use-cases.ts`). Only the
  entries marked `live` are true of the demo; the others are the pitch, and the
  copy must never imply a prospect can dial in and have a booking taken.

  Three tabs: Knowledge, Schedule, Prompt. Sources is not one of them — the
  research is the working-out, so it sits at the foot of the Knowledge it
  produced as a reference (`SourcesPanel` in `compact` mode: the links, with the
  briefing folded away). The admin keeps Sources as its own tab, because there
  it is a console with the re-research inputs in it, not a citation list.

  Schedule is a mock-up and says so three times over. `lib/schedule.ts` draws
  the week from `profile.hours` — the Knowledge is the source of truth, so
  editing the hours there moves the grid, unsaved edits included — and
  `lib/integrations.ts` lists the calendars and booking tools a real booking
  would land in. The demo takes no bookings and nothing is connected; clicking
  anything raises a toast saying so. The week carries no dates and reads no
  clock: the page is server-rendered and then hydrated, and `Date.now()` on
  both sides renders two different weeks. Which slots are taken is fixed by
  position for the same reason a diary that reshuffles while you look at it is
  obviously fake. The brand glyphs are Simple Icons path data (CC0) copied in
  rather than imported, so the bundle carries ten paths and not three thousand;
  Microsoft withdrew theirs, so Outlook is drawn as the four squares.
  `integrationGroupsFor()` picks the groups by kind of business: a restaurant
  leads with reservation systems (OpenTable, Resy, Tock, SevenRooms…) and loses
  video visits; nobody else sees them. Most of those have no CC0 glyph, so they
  are an initial on the brand colour rather than a logo redrawn from memory.

  The knowledge panel renders as the form it is in the live product, because
  the pitch is that this is the business's own copy to correct — but every
  field is `readOnly` and touching one raises a toast asking us to make the
  change. Nothing a prospect types is kept. `app/c/[id]/page.tsx` hand-picks
  the props it passes, so operator-only fields (contact, label, notes, research
  notes, call history) never reach the page; `tests/public-view.test.ts` pins
  that prop list and fails if a field is added.

  Each prospect gets `demoMinutes` (default 10) of call time, counted by
  `demoAllowance()` over the seconds their calls actually billed. `/api/session`
  refuses past it and the page swaps the call button for the contact card;
  raising the number in the Share tab opens it back up. Admin test calls are
  `isTest` and never spend it.

## Two providers, two jobs

Do not mix these up. They are separate systems with separate credentials.

- **Voice** is OpenAI **GPT-Live-1** (`gpt-live-1`), a different API from the
  Realtime API: sessions are created at `POST /v1/live/sessions` with the SDP
  offer in the body, not with an ephemeral client secret. Needs `OPENAI_API_KEY`.
  The voice model does the talking and hands lookups to `BACKEND_MODEL` through
  `delegation: { type: "responses" }` in the session config, which is why there
  are two prompts: `prompts.live` for the voice, `prompts.backend` for the
  model it delegates to.
- **Research** has three providers behind `lib/research-runner.ts`. A
  subscription only ever works through a CLI signed in on a machine, so locally
  it shells out to the **Claude Code CLI** in headless mode
  (`lib/claude-cli.ts`), which runs on the operator's Claude subscription and
  costs nothing per run. A serverless host has no CLI to spawn, so it uses the
  **OpenAI Responses API** with its `web_search` tool — the same key the voice
  already needs — or the **Anthropic API** when only `ANTHROPIC_API_KEY` is
  there. `resolveProvider()` decides; `RESEARCH_PROVIDER` overrides.

  One run is two calls and takes over a minute. That fits inside the 300s
  ceiling every Vercel plan gives a function with fluid compute, Hobby included;
  a project with fluid compute turned off gets the old 60s and will cut research
  short, which is what `isResearchStalled()` makes visible.

## The call

`hooks/useLiveCall.ts` owns the whole call. Browser opens an `RTCPeerConnection`,
adds the microphone, creates the `oai-events` data channel, waits for ICE, then
posts the offer to `/api/session`, which forwards it to OpenAI and returns the
answer plus a `callId`.

Facts that shape the code:

- Nothing may be sent on the data channel before `session.started` arrives. The
  greeting is pushed then, as `session.instructions.append`, which is what makes
  the receptionist speak first.
- Transcripts arrive as `session.input_transcript.delta` and
  `session.output_transcript.delta` fragments with `start_ms`/`end_ms`. There is
  no turn-completed event and the two speakers overlap, so `lib/transcript.ts`
  groups fragments into bubbles: a fragment joins the previous one from the same
  speaker unless the other speaker started *after* that speaker stopped. Overlap
  is full duplex, not a turn change.
- The billed duration is `session.closed.usage.seconds`, not a local timer.
  Hang-up sends `session.close` and waits for `session.closed` with a timeout.
- Leaving the page reports the call as abandoned through `navigator.sendBeacon`.

`lib/call-audio.ts` runs playback through Web Audio so the demo sounds like a
phone call: the voice is narrowed to the telephone band and a quiet room tone
drifts underneath. Both are per-customer switches. The remote stream is also
attached to a muted `<audio>` element, because Chrome will not pull frames from a
WebRTC stream otherwise. Tuning constants live at the top of the file.

Accent comes from the voice, not the prompt. `LIVE_VOICE_OPTIONS` in
`lib/types.ts` carries each voice's accent; `gleam` and `meridian` are the North
American ones and `gleam` is the default.

Which language the call *opens* in is per customer (`Customer.language`,
`lib/languages.ts`), because English is right for almost every demo and wrong
for a consulate. It changes the opening only — following the caller into any
language is in the prompt either way, and for a non-English opening the prompt
says outright that English is one of the languages it switches into. The
prompts stay written in English, since a model follows an English instruction
to speak Korean perfectly well and an English prompt is one the operator can
still read. The greeting is the exception and is written out in each language,
because `spokenGreeting()` pulls the quoted line and says it aloud when the
model has not opened by itself; there is no chance to translate at that moment.
There is no voice for most of these languages, so a Korean opening is fluent
Korean in whatever accent the voice has — a property of the model, which is why
the prompt tells the receptionist never to apologise for it.

## Research

`lib/research.ts` runs two passes: one with web search that writes a markdown
briefing, then one with no tools that turns the briefing into the structured
profile. Keeping them apart is deliberate: the second pass copies, it does not
research. Sources come from what the provider says it cited, then the briefing's
own links; `cleanSourceUrl()` strips the tracking a search tool bolts on and
drops results pages, because the Sources panel is shown to the business.

The **business name is the subject**. A website URL, a Google Maps link, and
operator notes are references that disambiguate; a Maps link on its own still
works because the listing's place name becomes the name. Research takes a
minute or two, so `POST /api/admin/customers` returns immediately with status
`researching` and the list page polls; the re-research route runs inline with
`maxDuration = 300`.

`lib/prompt.ts` turns a profile into the three prompts the call runs on (voice,
backend, greeting). `resolvePrompts()` decides what a save keeps: the editor
posts the whole record every time, so prompts coming back byte-identical are not
a hand edit. Only different text sets `prompts.edited`, which then survives a
re-research until someone asks to rebuild. Prompts nobody has touched are
rebuilt from the data on every save, so a new receptionist name or a corrected
address reaches the call.

Changing the generated wording in a way saved records should pick up means
bumping `PROMPT_VERSION`: `lib/store.ts` rebuilds unedited prompts on read when
it sees an older version, and leaves edited ones alone. The prompts tell the
receptionist to follow the caller's language; like accent, that is not a
per-customer setting.

## Storage

Everything goes through the small `Store` interface in `lib/kv.ts`, which has
two drivers: JSON files under `data/` (gitignored, what you want locally) and a
Redis-compatible store over HTTP, for a host with a read-only filesystem. The
choice is `KV_REST_API_URL` + `KV_REST_API_TOKEN`, not a rewrite. On a
serverless host with neither set, `assertWritableStore()` fails the write up
front with a message naming both variables, because falling back to files there
looks like a crash at the first save.

Stored are customers, call logs per customer, and an events log for page views.
There is no ORM. `lib/store.ts` normalizes records on read, which is where
migrations for old records live (a missing business name, the retired `quartz`
default voice). Analytics is pure functions over those records in
`lib/analytics.ts` — keep it free of `node:fs` imports, since client components
import `formatDuration` and `isResearchStalled` from it and pulling
`lib/calls.ts` in would break the browser bundle. The same rule covers every
`lib/` module a client component imports: `proof`, `use-cases`, `schedule`,
`integrations`, `hours`, `voice-level`, `scroll`.

`/api/admin/health` reports what the deployment can actually do — it pings the
store rather than trusting that the variables look right — and is the first
thing to read when a deploy misbehaves. `next.config.ts` bakes
`NEXT_PUBLIC_APP_VERSION` (package version plus short commit) in at build time
and `VersionBadge` shows it in both views, so the second thing to check is
whether the deploy you are looking at is the one you think it is. The
`NEXT_PUBLIC_*` contact URLs are baked the same way; changing one needs a
rebuild.

The admin doubles as a small CRM. `Customer.stage` is the operator's own
pipeline (`new`/`contacted`/`interested`/`won`/`lost`) and nothing writes it on
their behalf; what the prospect *did* is reported separately as `Engagement`,
because a stage that sometimes moves itself is a stage nobody trusts. Notes live
in their own `notes:{customerId}` list (`lib/crm.ts`) rather than as a field, so
writing one does not rewrite the customer and the history is kept. `timeline()`
merges notes, page views and calls into one column.

Page views live in `events:{customerId}` lists, not one global log, so a busy
prospect cannot slow the dashboard down and `deleteCustomer` can take their
views with them. The old global `events` list is still read and merged.

`middleware.ts` hands a browser a random `va_vid` cookie on its first visit to a
demo link, which is what lets the admin say whether three people tried it or one
person tried it three times. It replaced the stored IP hash, which was a
truncated unsalted SHA-256 — reversible by brute force over the IPv4 space,
about the office rather than the person, and read by nothing. The IP is still
used for the per-IP rate limit on `/api/session`; it is simply never written
down.

Several people can be on one demo at once, and gpt-live-1 is rate limited by
**concurrent sessions per OpenAI organisation** (25 on tier 1, 50 on tier 2).
Extra API keys share that pool rather than adding to it — limits are set at the
organisation and project level, not per key — so the only ways up are a higher
tier or a separate organisation. Two ceilings guard it: `LIVE_SESSION_LIMIT`
for the deployment, counted from a `live` set index that carries each call's
start time in the member so a browser closed mid-call stops holding a seat
without anyone reading its record, and `CONCURRENT_PER_CUSTOMER` so one busy
demo cannot spend what the others need. `/api/session` writes the call record
*before* asking OpenAI for a session, then looks again and stands down if it is
not among the oldest `CONCURRENT_PER_CUSTOMER` reservations — checking first and
writing second left a gap in which every simultaneous caller read an empty demo.
A session that fails takes its reservation back. `demoAllowance` counts calls
that are still on the line at their elapsed time for the same reason: counting
only finished calls let a ten minute demo hand out an hour.

The per-IP limiter in that route is per-instance memory and only thins bursts;
the allowance is the real protection and it is stored.

Every finished call is read back by a model once, at the moment it is reported
(`lib/call-review.ts`), and the result is stored on the record as `review`:
what the caller was trying to do, what worked, where it fell short, and up to
three `gaps` short enough to group. `gapRollup()` counts those across a
prospect's calls, which is the whole point — one call where the receptionist
did not know the hours is an anecdote, four is the next thing to build. The
model is given the transcript and *not* the business profile, because a model
holding the answer forgives the gap. `reviewCall` never throws: a review is
worth having and never worth failing a call report for, so an unreachable model
means a call with no review, and the admin can ask again with `analyze` on
`PATCH /api/admin/customers/[id]/calls` — never twice for the same call, since
it costs money and the operator has already read the first wording.

The Activity tab is one card per call. It used to list every caller bubble as
its own row, which looked like five questions from one call and began each row
mid-word: a bubble ends whenever the other speaker starts, and on a phone call
the receptionist says "mm-hm" over the top of people. That is right on screen
and wrong in a list, so `callerSaid()` joins the caller's fragments back into
the sentence they said and the bubbles stay in the transcript sheet.

Admin test calls are tagged `isTest` and excluded from customer-facing numbers.
A call is a test because the admin test panel said so in the `/api/session`
body, not because the request carried an admin cookie — the cookie is
`path: "/"`, so inferring it marked every call the operator made through a
prospect's own link as a test and emptied the dashboard. The cookie is still
checked as the authorisation half, since test calls skip `demoAllowance`.
`PATCH /api/admin/customers/[id]/calls` reclassifies one, and the Overview says
how many it is leaving out rather than showing a bare zero.

## UI conventions

shadcn/ui on **Base UI**, not Radix: composition uses `render={<Link />}` rather
than `asChild`, `onValueChange` can hand back `null`, `SelectValue` needs explicit
children to show a label, and a `Button` rendering an `<a>` needs
`nativeButton={false}`.

`app/globals.css` is the TecAce design system theme and is copied wholesale from
the `tecace-dashboard-ui` skill; do not hand-edit its tokens. Use the `.ta-*` type
classes, keep cards `rounded-xl border shadow-none`, brand blue is `#116DFF` only,
and the `chart-1..7` palette is for data only, never controls. Charts are Chart.js
and must remount on theme change with `key={resolvedTheme}`.

## Auth

`ADMIN_PASSWORD` plus an HMAC-signed cookie (`lib/auth.ts`), checked in
`middleware.ts` for `/admin/*` and `/api/admin/*`. `/api/session` is deliberately
public — the nanoid in the customer link is the only credential, with a per-IP
rate limit. Anything that writes belongs under `/api/admin/`.

## Other agent configs

An OpenAI Codex config and a Gemini CLI config exist at the user level. Reply
`/import` to see what is importable (MCP servers, slash commands, subagents,
skills, instructions), then `/import --yes=<digest>` to apply the user-level
items.
