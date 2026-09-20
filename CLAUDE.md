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
under a second.

## What this is

A promo app. A target business gets an unlisted link, opens it, presses call, and
talks to an AI receptionist built for that business from public web research. The
operator manages businesses, data, prompts, and usage numbers behind a password.

Two views, one codebase:

- `/admin/*` — password-gated. Route group `app/admin/(dashboard)/` carries the
  sidebar layout; `app/admin/login` sits outside it so the login page renders bare.
- `/c/[id]` — public, unlisted. Call button, transcript, and a **read-only** panel
  showing the knowledge, prompts, and sources. It renders no inputs, and
  `app/c/[id]/page.tsx` hand-picks the props it passes, so operator-only fields
  (contact, label, notes, research notes, call history) never reach the page.
  `tests/public-view.test.ts` pins that prop list; it fails if a field is added.

## Two providers, two jobs

Do not mix these up. They are separate systems with separate credentials.

- **Voice** is OpenAI **GPT-Live-1** (`gpt-live-1`), a different API from the
  Realtime API: sessions are created at `POST /v1/live/sessions` with the SDP
  offer in the body, not with an ephemeral client secret. Needs `OPENAI_API_KEY`.
- **Research** has two providers behind `lib/research-runner.ts`. Locally it
  shells out to the **Claude Code CLI** in headless mode (`lib/claude-cli.ts`),
  which runs on the operator's Claude subscription and costs nothing per run.
  On a host with no CLI to spawn it calls the **Anthropic API** and needs
  `ANTHROPIC_API_KEY`. `resolveProvider()` picks the API when `VERCEL` is set;
  `RESEARCH_PROVIDER` overrides either way.

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

## Research

`lib/research.ts` runs two CLI passes: one with `WebSearch`/`WebFetch` that writes
a markdown briefing, then one with no tools that turns the briefing into the
structured profile. Keeping them apart is deliberate: the second pass copies, it
does not research.

The **business name is the subject**. A website URL, a Google Maps link, and
operator notes are references that disambiguate; a Maps link on its own still
works because the listing's place name becomes the name. Research takes two to
three minutes, so `POST /api/admin/customers` returns immediately with status
`researching` and the list page polls; the re-research route runs inline with
`maxDuration = 600`.

`lib/prompt.ts` turns a profile into the three prompts the call runs on (voice,
backend, greeting). `resolvePrompts()` decides what a save keeps: the editor
posts the whole record every time, so prompts coming back byte-identical are not
a hand edit. Only different text sets `prompts.edited`, which then survives a
re-research until someone asks to rebuild. Prompts nobody has touched are
rebuilt from the data on every save, so a new receptionist name or a corrected
address reaches the call.

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
`lib/calls.ts` in would break the browser bundle.

`/api/admin/health` reports what the deployment can actually do — it pings the
store rather than trusting that the variables look right — and is the first
thing to read when a deploy misbehaves.

Admin test calls are tagged `isTest` and excluded from customer-facing numbers.

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
