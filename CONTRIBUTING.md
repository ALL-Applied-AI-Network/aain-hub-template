# Contributing to ALL Applied AI Network Hub Template

Thank you for helping improve the hub template that powers university AI chapters across the network. Whether you're fixing a bug, adding a feature, or improving docs — it helps every hub in the network.

## Before You Start

- Read the project [README](README.md) to understand the architecture
- Check [open issues](https://github.com/ALL-Applied-AI-Network/aain-hub-template/issues) for things that need work
- For large changes, open an issue first to discuss the approach

## Development Setup

```bash
git clone https://github.com/ALL-Applied-AI-Network/aain-hub-template.git
cd aain-hub-template
npm install
npm run dev
```

The dev server starts at `http://localhost:5173`. It fetches content from the [content library](https://github.com/ALL-Applied-AI-Network/aain-content) GitHub Pages deployment.

## Project Structure

```
hub.config.json          Chapter identity, theme, and feature flags
index.html               Site entry point
src/
├── main.ts              Config application, content fetching, rendering
└── styles/
    └── hub.css          Full site styles (themed by config)
.github/
└── workflows/
    └── pages.yml        GitHub Pages auto-deploy on push to main
```

## Making Changes

### 1. Branch from main

```bash
git checkout -b fix/my-fix        # bug fixes
git checkout -b feat/my-feature   # new features
git checkout -b docs/my-update    # documentation
```

### 2. Write code and test locally

```bash
npm run dev            # Local dev server with hot reload
npm run build          # TypeScript check + production build
npm run preview        # Preview production build
```

### 3. Open a pull request

Push your branch and open a PR against `main`. CI builds the site automatically. All checks must pass.

## Conventions

- **TypeScript everywhere.** No `any` types unless absolutely necessary.
- **Vanilla CSS.** No framework dependencies — keep the template lightweight.
- **Config-driven.** New features should be toggleable via `hub.config.json`.
- **Commits are descriptive.** Use conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`.

## AI-Native Development

We actively encourage using AI coding tools (Cursor, Claude Code, etc.) to contribute. The repo is structured for AI agents to understand and generate correct code.

## Questions?

- Open a [discussion](https://github.com/ALL-Applied-AI-Network/aain-hub-template/discussions)
- Join our [Discord](https://discord.gg/all-applied-ai)
- Email: contribute@all-ai-network.org

---

<sub>&copy; 2026 ALL Applied AI Network LLC. By contributing, you agree that your contributions will be licensed under MIT.</sub>
