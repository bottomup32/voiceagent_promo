# Voice agent promo

A promo app for the call voice agent. A target business gets a private link, opens it, presses call, and talks to an AI receptionist built for that business. You manage the businesses, the collected data, the prompts, and the usage numbers from the admin area.

Two views:

- **Admin** at `/admin`, password protected. Add a customer by pasting a Google Maps link, watch the research run, edit the collected data and the prompts, run a test call, copy the customer link or the outreach email, and see who opened their link and how long they talked.
- **Customer** at `/c/<id>`, public and unlisted. The business name, a call button, an end button, and a live transcript. Nothing else.

## Stack

Next.js App Router, Tailwind CSS v4, shadcn/ui with the TecAce theme, Chart.js. Voice runs on OpenAI **GPT-Live-1** over WebRTC, with reasoning delegated to a backend model through Responses delegation. Research runs through the Responses API with the web search tool. Customers, call logs, and page views are JSON files under `data/`.

## Setup

```bash
npm install
cp .env.example .env.local   # then fill in the values below
npm run dev
```

`.env.local`:

| Variable | What it does |
| --- | --- |
| `OPENAI_API_KEY` | Your key. GPT-Live-1 needs a paid tier; the free tier cannot open a session. |
| `ADMIN_PASSWORD` | The password for `/admin`. |
| `ADMIN_SESSION_SECRET` | Random string that signs the admin cookie. |
| `LIVE_MODEL` | Voice model, `gpt-live-1`. |
| `BACKEND_MODEL` | Model the voice layer delegates to, `gpt-5.6-terra`. |
| `RESEARCH_MODEL` | Model that researches the business, `gpt-5.6-terra`. |
| `LIVE_VOICE` | Default voice for new customers, `quartz`. |
| `NEXT_PUBLIC_BASE_URL` | Origin used to build customer links. No trailing slash. |

Microphone access needs `https` or `localhost`.

## How a customer gets a demo

1. In **Customers**, press **New customer** and paste the Google Maps link, plus the contact name and email.
2. Research runs in the background. The row shows **Researching**, then **Ready**. On failure it shows **Error** with the message from OpenAI.
3. Open the customer. **Knowledge** holds the structured profile, **Sources** holds the raw research and the cited links, **Prompt** holds the three prompts that run the call.
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
npx vitest run    # Maps link parsing, transcript grouping, prompt building, analytics
npm run lint
npm run build
```

## Notes and limits

- Data lives in files under `data/`, so a serverless host with a read-only filesystem will not work as is. Run it on a host with a disk, or swap `lib/store.ts` and `lib/calls.ts` for a database.
- Voice minutes are billed per second by OpenAI, and the delegated model is billed separately.
- Research costs a few cents per business and can be rerun at any time.
