# erduo.ai

耳朵, meaning *ears*. A listening ear that remembers the days worth remembering.

Erduo listens ambiently, notices the conversations that matter, pairs them with the
photos you took at the time, and turns that into a recap you can post, a follow-up
email you can send, or a calendar invite you can accept.

## This repo

A single static landing page that collects waitlist signups over `mailto:`.

```
index.html          the whole page (no build step, no dependencies to install)
assets/erduo.png    logo, also used as favicon and apple-touch-icon
assets/erduo-email.png  240px logo for the reply email, 76KB rather than 460KB
assets/erduo-card.jpg   1200x630 link preview card, JPEG so chat apps fetch it
CNAME               binds the GitHub Pages site to erduo.ai
.nojekyll           publish the files as they are, skipping Jekyll
waitlist/           Gmail automation, not part of the published site
```

## Replying to signups

Signups all arrive with the subject `Erduo waitlist`, which makes them easy to
target.

On Google Workspace, no code is needed. Enable **Templates** under
**Settings > Advanced**, save the reply as a template, then create a filter on that
subject with the **Send template** action.

That action does not exist on a free Gmail account, and the vacation responder cannot
be scoped to a filter. `waitlist/autoreply.gs` covers both cases, and is worth choosing
even on Workspace: Gmail templates have no variables, so a filter sends everyone the
same text, while the script greets each person by the name they typed.

Paste it into [script.google.com](https://script.google.com), edit `CONFIG` at the top,
run `previewWaitlist` to confirm it matches real signups without sending anything, then
run `installTrigger` to check every five minutes.

The reply is branded to match the page: sky gradient behind a white card, serif
wordmark, ocean-blue accents. It is built to email constraints rather than web ones,
so styles are inline, the layout is tables, the gradient sits over a solid `bgcolor`
that Outlook can render, and Georgia is named first because Gmail cannot load
Instrument Serif. `CONFIG.LOGO_URL` needs a public URL and so renders once the site is
live; the email is designed to read correctly without it, since most clients block
remote images until the reader allows them.

It also publishes a web app endpoint. The page beacons it when someone taps the
button, so the spreadsheet records how many signups were *started* as well as how many
arrived. Without that, a signup begun and abandoned is invisible and there is no way to
tell a page nobody visits from a flow that leaks. Deploy it under Deploy > New
deployment > Web app, execute as yourself, access for anyone, and paste the `/exec` URL
into `COUNT_URL` in `index.html`. It stores a timestamp and nothing else. That URL sits
in the page source, so the started count is soft and could be inflated; the number of
replies sent stays hard, because each one answers a real message from a real mailbox.

It applies `CONFIG.SIGNUP_LABEL` to every signup it sees, so no Gmail filter is needed
alongside it for organisation. Setting `CONFIG.SHEET_ID` also appends each signup to a
spreadsheet, which gives the waitlist somewhere to live besides an inbox without adding
a backend.

The script replies exactly once per person: answered threads get a label, and the
search that finds work excludes it. That label is applied only after a send succeeds,
so a failed send is retried on the next run rather than being lost. It skips unattended addresses such as `no-reply@`
so it cannot start a mail loop, leaves threads alone once someone has answered by
hand, and escapes the parsed name before putting it in HTML, since that name arrives
from outside. Each run is capped so a backlog cannot exhaust the daily send quota,
which is roughly 100 messages a day on free Gmail and 1,500 on Workspace.

### How the waitlist works

The visitor types their name and presses enter. The page opens their mail client with
everything pre-filled, so the only thing left to do is press send:

- **To:** `hi@erduo.ai`
- **Subject:** `Erduo waitlist`
- **Body:** `Hi Erduo, this is <name>. I'd love to be on the waitlist!`

If no mail client picks up the `mailto:` link, the page reveals a fallback panel with a
direct link and a "copy the message" button.

### Design

Ambient and calm. White cloud over blue sky and ocean, matching the logo's
teal-to-blue brushstroke. The wordmark's capital is Petit Formal Script, which
echoes the brushstroke in the mark. That face ships one weight only, so the
stroke supplies what a bold would, thickening the outline while keeping the
thick-to-thin contrast a script depends on, and it draws in `currentColor` so it
follows the theme. Slowly drifting cloud layers, a light theme by default and a
night-ocean variant under `prefers-color-scheme: dark`. Motion is disabled under
`prefers-reduced-motion`. Fonts are Instrument Serif and Inter, with system fallbacks
so the page still reads correctly if Google Fonts is unreachable.

### Running it

Nothing to build:

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

### Deploying

Any static host works. Point it at the repo root and serve `index.html`.
There is no backend: the waitlist runs entirely in the visitor's mail client, so
nothing needs a server, a database, or an API key.

`CNAME` and `.nojekyll` in the repo root configure GitHub Pages. `CNAME` binds the
site to `erduo.ai`; `.nojekyll` tells Pages to publish the files as they are instead
of running them through Jekyll.

**GitHub Pages requires a public repo on the Free plan.** Pages from a private repo
needs GitHub Pro. Note that a Pages site is publicly reachable either way, so keeping
the repo private hides the source, not the page.

#### DNS for erduo.ai

Point the apex at GitHub with four A records and four AAAA records:

```
A     erduo.ai    185.199.108.153
A     erduo.ai    185.199.109.153
A     erduo.ai    185.199.110.153
A     erduo.ai    185.199.111.153

AAAA  erduo.ai    2606:50c0:8000::153
AAAA  erduo.ai    2606:50c0:8001::153
AAAA  erduo.ai    2606:50c0:8002::153
AAAA  erduo.ai    2606:50c0:8003::153

CNAME www         laoshihchieh.github.io.
```

Use A and AAAA records at the apex, never a CNAME. A CNAME at the apex takes over the
whole name and would break the `MX` records that deliver mail to `hi@erduo.ai`. A and
AAAA records sit alongside `MX` without conflict, so web hosting and email coexist on
the same domain.

Remove any placeholder or parking record the registrar added at the apex first, and
avoid wildcard records such as `*.erduo.ai`, which expose the domain to takeover.

Then in **Settings > Pages**, set the source to `main` / `(root)`, confirm the custom
domain reads `erduo.ai`, wait for the certificate to be issued, and switch on
**Enforce HTTPS**.
