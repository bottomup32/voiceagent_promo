# Voice agent promo

A promo app for the call voice agent. A target business gets a private link, opens it, presses call, and talks to an AI receptionist built for that business. You manage the businesses, the collected data, the prompts, and the usage numbers from the admin area.

Two views:

- **Admin** at `/admin`, password protected. Add a customer by name, watch the research run, edit the collected data and the prompts, run a test call, copy the customer link or the outreach email, and see who opened their link and how long they talked.
- **Customer** at `/c/<id>`, public and unlisted. The business name, a call button, an end button, and a live transcript. Nothing else.

## Stack

Next.js App Router, Tailwind CSS v4, shadcn/ui with the TecAce theme, Chart.js.

Two different providers do two different jobs:

- **Voice** runs on OpenAI **GPT-Live-1** over WebRTC, with reasoning delegated to a backend model through Responses delegation. Needs `OPENAI_API_KEY`.
- **Research** runs through the locally installed **Claude Code CLI** in headless mode, so it bills against your Claude subscription rather than an API key. Sign in once with `claude` in a terminal and the app spawns it per research run.

Customers, call logs, and page views are JSON files under `data/`.

## Setup

```bash
npm install
cp .env.example .env.local   # then fill in the values below
npm run dev
```

`.env.local`:

| Variable | What it does |
| --- | --- |
| `OPENAI_API_KEY` | Voice only. GPT-Live-1 needs a paid tier; the free tier cannot open a session. |
| `ADMIN_PASSWORD` | The password for `/admin`. |
| `ADMIN_SESSION_SECRET` | Random string that signs the admin cookie. |
| `LIVE_MODEL` | Voice model, `gpt-live-1`. |
| `BACKEND_MODEL` | Model the voice layer delegates to, `gpt-5.6-terra`. |
| `RESEARCH_MODEL` | Model passed to the Claude CLI, `sonnet`. |
| `CLAUDE_CLI_PATH` | Optional. Full path to `claude.exe` if it is not on `PATH`. |
| `LIVE_VOICE` | Default voice for new customers, `quartz`. |
| `NEXT_PUBLIC_BASE_URL` | Origin used to build customer links. No trailing slash. |

Microphone access needs `https` or `localhost`. Research needs Claude Code installed and signed in; run `claude` once in a terminal if you have not.

## How a customer gets a demo

1. In **Customers**, press **New customer** and type the business name. A website, a Google Maps link, and notes are optional; they only help pick the right business when the name is ambiguous.
2. Research runs in the background and takes two to three minutes. The row shows **Researching**, then **Ready**. On failure it shows **Error** with the reason.
3. Open the customer. **Knowledge** holds the structured profile, **Sources** holds the research inputs, the cited links and the raw briefing, **Prompt** holds the three prompts that run the call.
4. Edit anything that is wrong and press **Save**. Edited prompts survive a re-research; **Rebuild from data** regenerates them from the current profile.
5. Use **Test call** on the right to hear it.
6. In **Share**, copy the link or the email and send it.

Turning **Live** off makes the link show an unavailable message and refuses new calls, without deleting anything.

## What gets measured

Every link open is a page view. Every call is logged with its duration, its end reason, and its transcript. Your own test calls are tagged and left out of the customer-facing numbers. **Overview** shows calls per day, top customers by minutes, and recent calls; a customer's **Activity** tab lists their calls and opens the transcript for any one of them.

## The call, end to end

The browser opens a peer connection, adds the microphone, and creates the `oai-events` data channel. The server exchanges the offer for an answer at `POST /v1/live/sessions`, with the voice prompt, the voice, and Responses delegation to the backend model. Once `session.started` arrives, the browser sends the greeting instruction so the receptionist speaks first. Transcript fragments arrive as `session.input_transcript.delta` and `session.output_transcript.delta`; because speakers can overlap, fragments are grouped into bubbles by speaker and timing. Hanging up sends `session.close` and waits for `session.closed`, whose usage seconds are the billed duration. Leaving the page reports the call as abandoned through a beacon.

## Tests

```bash
npx vitest run    # Maps parsing, transcript grouping, prompt building, analytics, research prompts
npm run lint
npm run build
```

## Notes and limits

- Data lives in files under `data/`, so a serverless host with a read-only filesystem will not work as is. Run it on a host with a disk, or swap `lib/store.ts` and `lib/calls.ts` for a database.
- Voice minutes are billed per second by OpenAI, and the delegated model is billed separately.
- Research spawns the Claude CLI as a child process, so the app has to run somewhere that CLI is installed and signed in. It uses your Claude subscription, not an API key.
- A research run takes two to three minutes and can be rerun at any time from the **Sources** tab.
