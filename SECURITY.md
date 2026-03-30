# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in this repository, please report it responsibly.

**Do not open a public issue.**

Email **security@all-aain.org** with:
- A description of the vulnerability
- Steps to reproduce
- Potential impact

We will acknowledge receipt within 48 hours and provide an estimated timeline for a fix.

## Scope

Security-relevant areas of this repository include:
- **Authentication and API key handling** — `src/lib/auth.ts`, `src/lib/api-client.ts`
- **Platform API client** — generated client and Zod schemas in `api/`
- **Content rendering** — markdown-to-React pipeline in `src/components/content/`
- **QR attendance system** — generation and validation in `src/components/attendance/`
- **CI/CD pipeline** — GitHub Actions workflows
- **CLI scaffolder** — `packages/create-all-aain-hub/`
- **Environment variables** — `.env` handling and secret management

For vulnerabilities related to the content CDN, report to [all-aain/content](https://github.com/all-aain/content/security).
For vulnerabilities in the platform API, email security@all-aain.org directly.

## Supported Versions

| Version | Supported |
|---|---|
| Latest release | Yes |
| Previous minor | Security fixes only |
| Older | No |
