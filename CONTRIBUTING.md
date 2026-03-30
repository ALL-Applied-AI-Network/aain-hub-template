# Contributing to ALL Applied AI Network Hub

Thank you for helping improve the hub template that powers university AI chapters across the network. Whether you're fixing a bug, adding a feature, or improving docs — it helps every hub in the network.

## Before You Start

- Read the project [README](README.md) to understand the architecture
- Check [open issues](https://github.com/all-aain/hub/issues) for things that need work
- For large changes, open an issue first to discuss the approach

## Development Setup

```bash
git clone https://github.com/all-aain/hub.git
cd hub
npm install
npm run dev
```

The dev server starts at `http://localhost:5173`. It uses mock data by default — no API key needed for development.

## Project Structure at a Glance

```
src/pages/          → Route-level components (add new pages here)
src/components/     → Reusable UI components
src/lib/            → Core logic (API client, content fetcher, tree merger)
packages/hub/       → @all-aain/hub npm package (SDK)
packages/create-*/  → CLI scaffolder
tests/              → Unit, integration, E2E tests
hub-content/        → Hub-specific content (for template users)
```

## Making Changes

### 1. Branch from main

```bash
git checkout -b fix/my-fix        # bug fixes
git checkout -b feat/my-feature   # new features
git checkout -b docs/my-update    # documentation
```

### 2. Write code + tests

We enforce **80% test coverage** on core modules. If you're touching `src/lib/` or `src/components/`, add tests.

```bash
npm test                   # Run unit + integration tests
npm run test:e2e           # Run Playwright E2E tests
npm run typecheck          # TypeScript check
npm run lint               # ESLint
```

### 3. Open a pull request

CI runs automatically: lint → typecheck → test → build. All checks must pass.

## Conventions

- **TypeScript everywhere.** No `any` types unless absolutely necessary (and explain why in a comment).
- **Zod for runtime validation.** API responses and config are validated at runtime, not just compile time.
- **Components are tested.** Use Vitest + Testing Library for component tests, MSW for API mocking.
- **Commits are descriptive.** Use conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`.

## AI-Native Development

We actively encourage using AI coding tools (Cursor, Claude Code, etc.) to contribute. The repo includes:

- **`.claude/CLAUDE.md`** — project context for Claude Code
- **`.skills/`** — SerpentStack skill files for architecture, testing, styling

These files help AI agents understand the codebase and generate correct code. If you add a major new feature, consider updating the relevant skill file.

## Questions?

- Open a [discussion](https://github.com/all-aain/hub/discussions)
- Join our [Discord](https://discord.gg/all-aain)
- Email: contribute@all-aain.org

---

<sub>&copy; 2026 ALL Applied AI Network LLC. By contributing, you agree that your contributions will be licensed under MIT.</sub>
