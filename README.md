# ALL Applied AI Network — Hub

<p align="center">
  <img src="public/all-aain-banner.png" alt="ALL Applied AI Network" width="600" />
</p>

<p align="center">
  <strong>Launch your university AI hub in 5 minutes.</strong>
</p>

<p align="center">
  <a href="https://github.com/all-aain/hub/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/all-aain/hub/ci.yml?label=CI&style=flat-square" alt="CI" /></a>
  <a href="https://www.npmjs.com/package/@all-aain/hub"><img src="https://img.shields.io/npm/v/@all-aain/hub?style=flat-square&color=blue" alt="npm" /></a>
  <a href="https://www.npmjs.com/package/create-all-aain-hub"><img src="https://img.shields.io/npm/v/create-all-aain-hub?style=flat-square&color=blue&label=CLI" alt="CLI" /></a>
  <a href="LICENSE.md"><img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License" /></a>
  <a href="https://all-aain.org"><img src="https://img.shields.io/badge/network-all--aain.org-purple?style=flat-square" alt="Network" /></a>
</p>

<p align="center">
  <a href="https://all-aain.org">Website</a> ·
  <a href="https://all-aain.org/docs">Docs</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#sdk">SDK</a> ·
  <a href="#features">Features</a> ·
  <a href="#customization">Customization</a> ·
  <a href="https://discord.gg/all-aain">Discord</a>
</p>

---

### Sponsors

<p align="center">
  <em>Sponsors fund the network so students learn for free.</em>
</p>

<table align="center">
  <tr>
    <td align="center"><strong>NVIDIA</strong></td>
    <td align="center"><strong>Direct Supply</strong></td>
    <td align="center"><strong>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</strong></td>
    <td align="center"><strong>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</strong></td>
  </tr>
  <tr>
    <td align="center"><a href="https://nvidia.com"><img src="public/sponsors/nvidia.png" alt="NVIDIA" height="48" /></a></td>
    <td align="center"><a href="https://directsupply.com"><img src="public/sponsors/direct-supply.png" alt="Direct Supply" height="48" /></a></td>
    <td align="center"><a href="https://all-aain.org/sponsors"><em>Your logo here</em></a></td>
    <td align="center"><a href="https://all-aain.org/sponsors"><em>Your logo here</em></a></td>
  </tr>
</table>

<p align="center">
  <a href="https://all-aain.org/sponsors"><strong>Become a sponsor &rarr;</strong></a>
</p>

---

Everything you need to run a university AI chapter — a professional website, automated attendance, an interactive learning tree, and impact reporting that gets you institutional buy-in.

It works three ways depending on what you need:

| You are... | Use... | What you get |
|---|---|---|
| **Starting fresh** | `npx create-all-aain-hub` | A fully deployed site at `{you}.all-aain.org` in 5 minutes |
| **Technical and opinionated** | This repo as a GitHub template | Full control — clone, customize, deploy wherever you want |
| **Already have a site** | `npm install @all-aain/hub` | Drop-in components, hooks, and a typed API client |

All three connect to the same [content CDN](https://github.com/all-aain/content) and platform API. Your hub gets the full learning tree, attendance tracking, and sponsor network regardless of how you set up.

## Quick Start

### Option 1: The CLI (recommended)

```bash
npx create-all-aain-hub
```

You'll be prompted for your hub name, university, and brand color. That's it.

Without an API key, you get a local project with the full open-source curriculum. With a key (free — create one at [all-aain.org/create](https://all-aain.org/create)), you also get:

- Managed deployment at `{hub-id}.all-aain.org`
- Attendance tracking and event management
- Member progress tracking on the learning tree
- Auto-generated impact reports for your university

### Option 2: GitHub template

1. Click **[Use this template](https://github.com/all-aain/hub/generate)**
2. Edit `hub.config.ts`:

```typescript
import { defineHubConfig } from '@all-aain/hub';

export default defineHubConfig({
  hub: {
    id: 'msoe-maic',
    name: 'MSOE AI Club',
    university: 'Milwaukee School of Engineering',
    apiKey: process.env.ALL_AAIN_API_KEY,
  },
  theme: {
    primaryColor: '#B1003E',
    logo: '/assets/logo.png',
  },
  features: {
    learningTree: true,
    innovationLabs: true,
    attendance: true,
  },
});
```

3. `npm install && npm run dev` — you're running locally
4. Push to GitHub — CI builds and deploys automatically

### Option 3: SDK only {#sdk}

For hubs with an existing website that just want the network integration:

```bash
npm install @all-aain/hub
```

```typescript
import { ContentClient, PlatformClient, useTree, useAttendance } from '@all-aain/hub';

// Fetch the learning tree
const content = new ContentClient();
const tree = await content.getTree();

// Track attendance
const platform = new PlatformClient({ apiKey: process.env.ALL_AAIN_API_KEY });
await platform.attendance.checkIn({ eventId: 'weekly-meeting', memberId: 'student-123' });
```

Drop-in React components are also available:

```tsx
import { LearningTree, AttendanceWidget, EventCard } from '@all-aain/hub/components';

function MyExistingPage() {
  return (
    <>
      <LearningTree hubId="msoe-maic" />
      <AttendanceWidget eventId="weekly-meeting" />
    </>
  );
}
```

## Features

### Learning Tree
An interactive skill tree visualization powered by the [ALL content CDN](https://github.com/all-aain/content). Students see what they've completed, what's unlocked next, and recommended paths. Hubs can add local nodes for university-specific content (e.g., campus HPC tutorials, local research topics) that merge seamlessly with the central tree.

### Attendance & Events
QR-based check-in system. Leaders generate a QR code for each event, students scan to check in. Everything flows to the platform API — no spreadsheets, no sign-in sheets.

### Impact Reports
Auto-generated reports for your dean and faculty advisor: attendance trends, member growth, skill progression, event metrics. The feature that gets you institutional buy-in and keeps it.

### Innovation Labs
Run sponsor-backed competitions. Team formation, project tracking, judging workflows, and a direct hiring pipeline for sponsors.

### Member Dashboard
Students track their own progress: learning tree completion, attendance history, projects, and a portable skills portfolio.

### Admin Dashboard
Hub leaders manage events, view analytics, generate QR codes, and export reports — all from the browser.

## Customization

### Theming

Everything is driven by `hub.config.ts`. Set your primary color and the entire design system adapts — buttons, links, gradients, chart colors, dark mode variants. Override individual tokens in `src/styles/globals.css` if you need finer control.

### Pages

Add hub-specific pages in `hub-content/pages/`. The router picks them up automatically. Common additions: About, E-Board, Merch, Contact, Research Groups.

### Local Learning Content

Add university-specific learning nodes in `hub-content/learning/local/`. Each node has a `node.yaml` that can reference central tree nodes as prerequisites:

```yaml
# hub-content/learning/local/campus-hpc/node.yaml
id: "local/campus-hpc"
title: "Running ML Jobs on Campus HPC"
prerequisites:
  - "intermediate/production/deployment-fundamentals"
hub_only: true
content_file: "campus-hpc.md"
```

Local nodes appear in your hub's learning tree with a visual indicator showing they're hub-specific.

### Feature Flags

Turn features on or off in `hub.config.ts`:

```typescript
features: {
  learningTree: true,       // Interactive skill tree
  innovationLabs: true,     // Sponsor competitions
  researchGroups: false,    // Disable if your hub doesn't run research
  speakerSeries: true,      // Speaker event management
  memberDashboard: true,    // Student-facing dashboard
  attendance: true,         // QR check-in system
},
```

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 19 + TypeScript |
| Build | Vite |
| Styling | Tailwind CSS |
| Routing | React Router |
| API Client | Auto-generated from OpenAPI spec + Zod runtime validation |
| Testing | Vitest (unit/integration) · Playwright (E2E) · MSW (API mocking) |
| CI/CD | GitHub Actions |
| Content | Fetched at runtime from [`cdn.all-aain.org`](https://github.com/all-aain/content) |
| Deployment | Managed (S3 + CloudFront) · Vercel · Netlify · self-hosted |

## Project Structure

```
hub.config.ts              Hub identity, theme, feature flags

src/
├── pages/                 Route-level components
│   ├── Home.tsx
│   ├── LearnTree.tsx      Interactive skill tree
│   ├── LearnArticle.tsx   Article renderer (markdown → React)
│   ├── Events.tsx
│   ├── MemberDashboard.tsx
│   └── admin/             Admin-only pages
├── components/
│   ├── ui/                Design system (themed by config)
│   ├── learning-tree/     DAG visualization
│   ├── attendance/        QR generation + scan
│   ├── content/           Markdown renderer + custom components
│   └── layout/            Header, footer, navigation
└── lib/
    ├── content-client.ts  CDN fetcher
    ├── api-client.ts      Platform API wrapper
    ├── tree-merger.ts     Central tree + local nodes → merged tree
    └── config.ts          Reads hub.config.ts

hub-content/               Hub-specific content (optional)
├── learning/local/        Local learning tree nodes
├── pages/                 Custom pages
└── images/

packages/
├── hub/                   @all-aain/hub npm package (SDK)
└── create-all-aain-hub/   CLI scaffolder

tests/
├── unit/
├── integration/
├── e2e/
└── mocks/                 MSW handlers + fixtures
```

## Development

```bash
npm install              # Install dependencies
npm run dev              # Start dev server
npm test                 # Run tests
npm run typecheck        # Type-check
npm run lint             # Lint
npm run build            # Build for production
npm run preview          # Preview production build
```

## AI-Native Development

This project is built for students who use AI coding tools. It includes structured context for AI agents:

- **`.claude/CLAUDE.md`** — project context for [Claude Code](https://claude.ai/code)
- **`.skills/`** — [SerpentStack](https://github.com/Benja-Pauls/SerpentStack) skill files for architecture, testing, styling, and more

Combined with comprehensive test suites (80%+ coverage enforced in CI), Zod runtime validation, and typed API contracts, AI agents can build on this codebase confidently and correctly.

---

<p align="center">
  <sub>&copy; 2026 ALL Applied AI Network LLC. All rights reserved.</sub><br />
  <sub>ALL Applied AI Network&trade; and the ALL logo are trademarks of ALL Applied AI Network LLC.</sub>
</p>
