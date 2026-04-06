# ALL Applied AI Network — Hub Template

<p align="center">
  <strong>Fork this repo. Edit one file. Your chapter website is live.</strong>
</p>

<p align="center">
  <a href="https://github.com/ALL-Applied-AI-Network/aain-hub-template/actions/workflows/pages.yml"><img src="https://img.shields.io/github/actions/workflow/status/ALL-Applied-AI-Network/aain-hub-template/pages.yml?label=pages%20deploy&style=flat-square" alt="Deploy" /></a>
  <a href="LICENSE.md"><img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License" /></a>
</p>

---

This is the website template for chapters in the **ALL Applied AI Network**. It gives every university AI club a professional website that automatically pulls curriculum, workshops, and playbooks from the [shared content library](https://github.com/ALL-Applied-AI-Network/aain-content).

## Quick Start

### Option 1: Start a new chapter website

1. Click **[Use this template](https://github.com/ALL-Applied-AI-Network/aain-hub-template/generate)** (green button, top right)
2. Name your repo (e.g., `msoe-ai-club`)
3. Edit **`hub.config.json`** with your chapter details:

```json
{
  "hub_name": "MSOE AI Club",
  "hub_acronym": "MAIC",
  "hub_id": "msoe-ai-club",
  "university": "Milwaukee School of Engineering",
  "description": "Building the next generation of applied AI engineers.",
  "theme": {
    "primary_color": "#B1003E",
    "accent_color": "#06b6d4"
  },
  "links": {
    "discord": "https://discord.gg/your-server",
    "github": "https://github.com/your-org",
    "instagram": "",
    "linkedin": "",
    "email": "ai-club@msoe.edu"
  },
  "features": {
    "learning_tree": true,
    "playbooks": true,
    "workshops": true
  },
  "content_url": "https://ALL-Applied-AI-Network.github.io/aain-content"
}
```

4. Enable GitHub Pages in your repo settings (Settings > Pages > Source: GitHub Actions)
5. Push — your site deploys automatically

Your site is now live at `https://{your-username}.github.io/{repo-name}/`.

### Option 2: Custom subdomain (e.g., `msoe.all-ai-network.org`)

Want your site at a subdomain on the ALL network domain? After completing the steps above:

1. Contact the ALL network team to request a subdomain
2. We add a DNS record pointing `{your-hub}.all-ai-network.org` to your GitHub Pages site
3. Add your subdomain to your repo's Pages settings (Settings > Pages > Custom domain)

That's it — GitHub handles HTTPS automatically.

### Option 3: Hook into an existing website

If your chapter already has a website and you just want the content, fetch directly from the content library:

```typescript
const CONTENT = 'https://ALL-Applied-AI-Network.github.io/aain-content';

// Get the full learning tree (nodes, edges, prerequisites)
const tree = await fetch(`${CONTENT}/tree.json`).then(r => r.json());

// Get a content manifest (all playbooks, workshops, learning nodes)
const manifest = await fetch(`${CONTENT}/manifest.json`).then(r => r.json());

// Fetch a specific article as markdown
const article = await fetch(`${CONTENT}/learning/foundations/what-is-ai/what-is-ai.md`).then(r => r.text());
```

The content library is a static JSON + Markdown API — no authentication, no SDK, no dependencies. Fetch and render however you want.

## What you get

- **Learning tree** — Interactive skill tree fetched from the network's shared curriculum. Starts at absolute zero, builds to shipping AI products.
- **Workshops** — Hands-on session content with facilitator guides. Ready to run at your next meeting.
- **Playbooks** — Operational guides for running a hub: getting started, sponsors, hackathons, speaker series, research groups.
- **Auto-deploy** — Push to `main` and GitHub Pages deploys. No CI config needed.
- **Theming** — Set two colors in the config and the entire site adapts.

Content updates happen upstream in [`aain-content`](https://github.com/ALL-Applied-AI-Network/aain-content). Your hub fetches it at runtime — when the network adds a new learning node or workshop, every hub gets it automatically.

## Customization

### Branding

Set `hub_acronym` to your club's short name — it appears in the nav bar as a gradient wordmark. Set `hub_name` for the full name used in the hero and page title.

```json
"hub_name": "MSOE AI Club",
"hub_acronym": "MAIC"
```

### Theming

Set `primary_color` and `accent_color` in `hub.config.json`. These drive the hero gradient, nav wordmark, buttons, card hover effects, and accents across the entire site. Choose your university's brand colors.

### Features

Toggle sections on or off:

```json
"features": {
  "learning_tree": true,
  "playbooks": true,
  "workshops": false
}
```

Disabled sections are hidden entirely — no empty states.

### Social links

Fill in what you have, leave the rest empty:

```json
"links": {
  "discord": "https://discord.gg/your-server",
  "github": "",
  "instagram": "https://instagram.com/your-club",
  "linkedin": "",
  "email": "your-club@university.edu"
}
```

Only links with URLs show up on the site.

## Development

```bash
npm install
npm run dev       # Local dev server with hot reload
npm run build     # Production build to dist/
npm run preview   # Preview production build
```

## Project Structure

```
hub.config.json          Your chapter identity, theme, and feature flags
index.html               Site entry point
src/
├── main.ts              Config application, content fetching, rendering
└── styles/
    └── hub.css          Full site styles (themed by config)
.github/
└── workflows/
    └── pages.yml        GitHub Pages auto-deploy on push to main
```

## Tech Stack

| Layer | Technology |
|---|---|
| Build | Vite |
| Language | TypeScript |
| Styling | Vanilla CSS (no framework dependencies) |
| Content | Fetched at runtime from [`aain-content`](https://github.com/ALL-Applied-AI-Network/aain-content) GitHub Pages |
| Deployment | GitHub Pages (via GitHub Actions) |

---

<p align="center">
  Part of the <a href="https://github.com/ALL-Applied-AI-Network">ALL Applied AI Network</a> — open-source curriculum, free forever.
</p>

<p align="center">
  <sub>&copy; 2026 ALL Applied AI Network LLC. All rights reserved.</sub><br />
  <sub>ALL Applied AI Network&trade; and the ALL logo are trademarks of ALL Applied AI Network LLC.</sub>
</p>
