# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in this repository, please report it responsibly.

**Do not open a public issue.**

Email **security@all-ai-network.org** with:
- A description of the vulnerability
- Steps to reproduce
- Potential impact

We will acknowledge receipt within 48 hours and provide an estimated timeline for a fix.

## Scope

Security-relevant areas of this repository include:
- **Content rendering** — dynamic HTML generation from fetched content in `src/main.ts`
- **External data fetching** — content fetched from GitHub Pages at runtime
- **CI/CD pipeline** — GitHub Actions workflow that deploys to GitHub Pages
- **Configuration handling** — `hub.config.json` injected at build time via Vite

For vulnerabilities related to the content library, report to [ALL-Applied-AI-Network/aain-content](https://github.com/ALL-Applied-AI-Network/aain-content/security).

## Supported Versions

| Version | Supported |
|---|---|
| Latest release | Yes |
| Older | No |
