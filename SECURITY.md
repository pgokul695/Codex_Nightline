# Security policy

## Reporting a vulnerability

No dedicated security email address is currently published. For a suspected vulnerability, contact the repository owner privately through GitHub before opening a public issue. Do not include API keys, document contents, or exploit details in a public report.

## Current security posture

- The extraction backend has no authentication.
- CORS allows all origins.
- `/api/extract` has no rate limiting.
- `GEMINI_API_KEY` is the primary secret. It belongs only in the server-side, gitignored `server/.env` file and must never be exposed to the browser, commits, logs, or issue reports.

This setup is appropriate only for a personally operated instance or a deliberately trusted network. Anyone making the service broadly accessible should add authentication, rate limiting, request-size controls, CORS restrictions, monitoring, and a private vulnerability contact before doing so.
