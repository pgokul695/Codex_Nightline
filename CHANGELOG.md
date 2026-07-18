# Changelog

All notable changes to this project are documented here. The format follows the spirit of [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Unreleased

### Added

- Documentation for the self-hosted frontend and Gemini-backed extraction service.

### Changed

- Renamed the project from Schedge to codex-nightline by mistake, then to its final name, Schedger.
- Replaced browser-local inference with a self-hosted FastAPI proxy using Gemini Flash-Lite structured output.

### Fixed

- Normalized Gemini event responses before they reach the review UI and made skipped events visible in the console.
- Allowed the public Vite host used by the reverse-proxy deployment.

### Removed

- Local model vendoring, ONNX Runtime WASM assets, and the browser model-loading path.

## Hackathon build

### Added

- Initial five-phase build: PDF ingestion, extraction, animated review UI, platform-aware export, and release automation.
- Tauri desktop export, Capacitor native calendar prompts, and web `.ics` download fallback.

### Changed

- Reworked local extraction from an extractive QA model to a local generative model before the backend migration.

### Fixed

- Broadened date recognition for numeric, ordinal, abbreviated-month, and labelled dates.
- Prevented fallback events from receiving the extraction-time date.
- Improved title context and date-range grouping after real-document tests exposed missed titles and duplicate events.
- Investigated local model packaging failures, including missing assets and an ONNX Runtime WASM CDN dependency.
