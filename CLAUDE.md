# Working on erduo.ai

Read this before changing anything. Most of it is things that cost hours to
discover, and every one of them is invisible from the code alone.

## What this is

A static landing page collecting waitlist signups over `mailto:`, plus a Google
Apps Script that answers each signup and records it. No server, no build step,
no dependencies to install.

```
index.html               the whole page
assets/erduo.png         logo: favicon, apple-touch-icon, page masthead
assets/erduo-email.png   240px logo for the reply email
assets/erduo-card.jpg    1200x630 link preview card
CNAME .nojekyll          GitHub Pages config
waitlist/autoreply.gs    the Apps Script, a copy for the record
```

## How it fits together

```
visitor ──► erduo.ai ──► Cloudflare (proxied) ──► GitHub Pages
                │
                ├── taps button ──► sendBeacon ──► Apps Script ──► Sheet "Starts"
                │
                └── sends email ──► hi@erduo.ai ──► Apps Script ──► reply
                                                                └► Sheet "Waitlist"
```

The Apps Script runs on a 5 minute trigger for replies, and serves a web app
endpoint for the counter. `waitlist/autoreply.gs` here is **a copy, not the
running code**. The live code lives in the Apps Script editor and has to be
pasted there.

## The traps

**Cloudflare proxies the zone.** The A records are orange-clouded, so Cloudflare
terminates TLS with its own certificate and GitHub never validates one. GitHub's
**Enforce HTTPS will never become available** and there is no point chasing it.
Cloudflare's *Always Use HTTPS* does that job instead, and is on.

**SSL/TLS mode must stay `Full`.** Not `Full (Strict)`: that requires the origin
to present a certificate valid for `erduo.ai`, which GitHub does not have,
precisely because Cloudflare intercepts the validation. Strict would 526 the
whole site.

**Every deploy sits behind the Cloudflare cache.** A pushed change is not what
visitors get until the cache expires. Purge before concluding a change did not
work, and before testing anything on the live site.

**Apps Script serves the code from its last deployment.** Pasting and saving is
not enough for the web app endpoint. Deploy > Manage deployments > edit >
*New version*, which keeps the same URL. "New deployment" would issue a
different one and break `COUNT_URL`.

**The `/exec` URL redirects** to `script.googleusercontent.com`. Opening it while
signed into multiple Google accounts gives "Sorry, unable to open the file at
this time", which is an account-context error and not a broken endpoint. Test it
in a private window, which is also how a real visitor arrives.

**The mobile Sheets app lags behind writes.** An empty tab seconds after an
action does not mean nothing was written. Wait, or read the sheet another way,
before concluding anything. This was misdiagnosed once as a bug in the endpoint
and produced a fix for a problem that did not exist.

**The apex must use A and AAAA records, never a CNAME.** A CNAME at the apex
takes over the whole name and would break the `MX` records delivering mail to
`hi@erduo.ai`, taking the waitlist down with the website.

## Email constraints

The reply is built to what mail clients actually do, not to what CSS allows.

**Gmail strips `@font-face`.** Web fonts cannot reach it, which is why the email
carries no wordmark: the brand script can never be live text there, and an image
of it would not invert. The logo is the mark instead.

**Gmail's dark mode inverts solid background colours and text together, but
cannot invert a `background-image`.** So text on a gradient flips light while the
gradient stays light, and disappears. **No text may sit on the gradient.**
Everything lives inside the white card, which carries a solid `bgcolor` and
inverts as a unit. The gradient is a frame holding only the logo, an image and
therefore never recoloured.

**`<style>` blocks are dropped**, so everything is inline. **Outlook renders with
Word**, so the layout is tables. A hidden preheader controls the inbox preview
line, or the client reaches for the first text in the body and leads with the
masthead.

**Gmail templates have no variables.** That is why a filter with *Send template*
was rejected in favour of the script: a filter sends everyone identical text,
while the script greets each person by the name they typed.

## Safety rules in the code

**`CONFIG.SHEET_ID` stays empty in this repo.** The repo is public and
`.nojekyll` means `erduo.ai/waitlist/autoreply.gs` is publicly fetchable. The
real ID belongs only in the Apps Script editor.

**The parsed name is untrusted.** It arrives in an email body written by a
stranger. It is escaped before reaching the reply markup, and prefixed with an
apostrophe before reaching a spreadsheet cell when it starts with `=`, `+`, `-`
or `@`, which Sheets would otherwise treat as a formula.

**Counting must never cost a signup.** The beacon is fire and forget: no
endpoint, no `sendBeacon` support, or a throw, and the mailto opens regardless.
`sendBeacon` rather than `fetch` because the next statement hands the page to the
mail client and would cancel a request in flight.

**Replies go out exactly once.** An answered thread gets `DONE_LABEL` and the
search that finds work excludes it. That label is applied only after a send
succeeds, so a failed send is retried rather than lost.

## Decisions, and why

**`mailto:` over a form.** Considered repeatedly and kept, for three reasons that
compound: every signup is verified by construction, since it arrives from a
mailbox the sender controls; the reply is a reply in an existing thread, which is
the strongest deliverability signal there is, and matters for a domain with no
sending reputation; and the list cannot be padded, botted, or inflated by its own
author, which is worth more than a higher number.

The cost is conversion and sight. A visitor who taps and never presses send is
lost, and was invisible until the counter existed. **Watch `Starts` against
`Waitlist`.** If starts climb and sends do not, the handoff is leaking and a form
becomes the right answer.

**The started count is soft, the sent count is hard.** The endpoint URL sits in
the page source, so anyone could inflate starts. Every send answers a real
message from a real mailbox. Read starts as a rough denominator, sends as truth.

**Apps Script is a stopgap.** It is adequate for tens to low hundreds of signups
and free. It has no real version control, hard quotas, and no bounce or
unsubscribe handling. When the product has a backend, all of this moves there.
Do not invest in tooling around it.

## Making changes

**The page:** edit, open a PR, merge. Pages redeploys in about 30 seconds. Then
purge the Cloudflare cache before testing.

**The script:** edit `waitlist/autoreply.gs` for the record, then paste into the
Apps Script editor and, if the endpoint changed, deploy a new version. **Batch
changes into one paste.** Four separate pastes in one session is a self-inflicted
cost.

**The share card:** rendered from a standalone HTML page in headless Chromium
with the real fonts, then cropped to exactly 1200x630 and saved as JPEG. It is
54KB rather than 794KB as a PNG, because several chat apps skip previews on large
images and a preview nobody fetches is worth nothing.

## Tooling notes

**Headless Chrome subtracts browser chrome from `--window-size`.** Asking for
1200x630 gives a 1200x543 viewport, and everything below that goes unpainted in
the screenshot. Measure `window.innerHeight` first and pad the window, then crop
via canvas.

**Google Fonts is unreachable from the browser in the sandbox** but `curl`
reaches `fonts.googleapis.com`. Download the `woff2` files, rewrite the CSS to
local paths, and render against those.

**The Drive connector returns only the first sheet** of a spreadsheet until the
others have content.

**Never paste credentials into chat.** They persist in the transcript. Use
environment secrets.

## Current state

Live on HTTPS, card unfurling, replies going out by name from `hi@erduo.ai`
within five minutes, SPF/DKIM/DMARC all passing, both sheet tabs logging,
Cloudflare Web Analytics running with bots excluded.
