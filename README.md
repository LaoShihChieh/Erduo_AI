# erduo.ai

耳朵 — *ears*. A listening ear that remembers the days worth remembering.

Erduo listens ambiently, notices the conversations that matter, pairs them with the
photos you took at the time, and turns that into a recap you can post, a follow-up
email you can send, or a calendar invite you can accept.

## This repo

A single static landing page that collects waitlist signups over `mailto:`.

```
index.html          the whole page (no build step, no dependencies to install)
assets/erduo.png    logo — also used as favicon and apple-touch-icon
```

### How the waitlist works

The visitor types their name and presses enter. The page opens their mail client with
everything pre-filled, so the only thing left to do is press send:

- **To:** `hi@erduo.ai`
- **Subject:** `Erduo waitlist`
- **Body:** `Hi, this is <name>. I'd love to be on the waitlist!`

If no mail client picks up the `mailto:` link, the page reveals a fallback panel with a
direct link and a "copy the message" button.

### Design

Ambient and calm — white cloud over blue sky and ocean, matching the logo's
teal-to-blue brushstroke. Slowly drifting cloud layers, a light theme by default and a
night-ocean variant under `prefers-color-scheme: dark`. Motion is disabled under
`prefers-reduced-motion`. Fonts are Instrument Serif and Inter, with system fallbacks
so the page still reads correctly if Google Fonts is unreachable.

### Running it

Nothing to build:

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

### Deploying

Any static host works — point it at the repo root and serve `index.html`.
Vercel, Netlify, Cloudflare Pages and GitHub Pages all need zero configuration.
For GitHub Pages on a custom domain, add a `CNAME` file containing `erduo.ai`.
