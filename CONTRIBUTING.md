# Contributing to Schedger

Contributions are welcome for bug fixes, extraction-quality improvements, platform export support, and documentation.

## Development setup

Follow the [README quickstart](README.md#quickstart). It is the source of truth for local setup and required environment variables.

## Workflow

1. Fork the repository and create a branch such as `fix/date-normalization` or `docs/security-notes`.
2. Keep each commit focused and use a short conventional-style subject, for example `fix: preserve numeric PDF dates`.
3. Open a pull request describing the problem, the approach, manual verification, and any behavior change.

Reviewers will check that extraction changes preserve the review-before-export flow, that secrets are not committed, and that platform-specific behavior remains isolated from UI components.

## Code style and testing

The frontend uses ESLint through `npm run lint`; the current flat config covers TypeScript and TSX files. There is no Prettier, Python formatter, or formal automated test suite configured yet. Run `npm run lint` and `npm run build` before opening a PR, and manually test the affected browser, desktop, or mobile path. Adding a repeatable extraction test suite is a valuable contribution.

## Reporting bugs

Include the PDF type (for example, offer letter or exam notice), the expected events, actual events, and relevant browser console or Network details. For extraction issues, include whether the request reached `/api/extract`, the returned event shape with sensitive content removed, and any skipped-event warning. This makes date and title regressions diagnosable.

## Extraction architecture changes

The extraction backend is a meaningful product choice. A pull request that reintroduces local inference or changes the API/model path must explain the privacy, reliability, cost, and deployment tradeoffs in its description; do not silently swap extraction architectures.

## Conduct

Be respectful, constructive, and mindful that uploaded documents can contain sensitive information.
