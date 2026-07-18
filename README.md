# Schedger

Turn schedule PDFs into reviewed calendar events with a self-hosted AI extraction service.

Schedger is for people who receive syllabi, timetables, offer letters, or exam notices as PDFs. Upload a document, let AI identify candidate events, correct every field in the review list, then export only the events you approve to a desktop, mobile, or web calendar workflow.

## How extraction works

The browser extracts text from the PDF, then sends that text to the self-hosted extraction backend. The backend calls Gemini Flash-Lite with a structured JSON schema for titles, locations, dates, and confidence. Nothing is committed automatically: every result first appears in an editable review list.

<!-- Replace these placeholders with current product screenshots. -->

![Landing page placeholder — add docs/landing-page.png](docs/landing-page.png)
![Review UI placeholder — add docs/review-ui.png](docs/review-ui.png)
![Export flow placeholder — add docs/export-flow.png](docs/export-flow.png)

## Stack

| Layer | Technology |
| --- | --- |
| Frontend | Vite, React, TypeScript/JavaScript, `pdfjs-dist` |
| Review UI | Framer Motion, Lucide React, Chrono |
| Backend | FastAPI, `google-genai`, Uvicorn |
| Model | Gemini 3.1 Flash-Lite structured output |
| Calendar export | Tauri v2, Capacitor calendar plugin, or a web `.ics` download |
| Deployment | Self-hosted single machine behind a reverse proxy |

## Quickstart

Prerequisites: Node.js 20+, Python 3.10+, and a Gemini API key from Google AI Studio.

```bash
git clone git@github.com:pgokul695/Codex_Nightline.git
cd Codex_Nightline
cp server/.env.example server/.env
# Add GEMINI_API_KEY to server/.env
./run-schedger.sh
```

The launcher installs missing Node and Python dependencies, starts the backend on `:5014`, and starts Vite on `:5015`. Open `http://localhost:5015` for local development. In the hosted setup, the existing reverse proxy exposes the frontend at `https://schedge.gokulp.online` and the backend at `https://schedgeb.gokulp.online`. See [ARCHITECTURE.md](ARCHITECTURE.md) for deployment details.

### Android

Install Android Studio (or the Android SDK command-line tools) and Java 17. Build and sync the production web bundle, then open the generated native project:

```bash
npm run build
npx cap sync android
npx cap open android
```

Use Android Studio to run a debug build on an emulator or device. For a distributable APK/AAB, follow [android/RELEASE_SIGNING.md](android/RELEASE_SIGNING.md).

## Known limitations

- A broader product policy for one event versus several related events is still open. The current extractor groups clear start/end pairs and selects the earliest fee-tier deadline, but more document types need an explicit product decision.
- Gemini extraction has not yet been regression-tested against the complete original PDF set after the backend migration.
- The landing-page upload copy still says details are extracted locally. That is inaccurate for the current backend architecture and needs a separate product-copy pass.

## Contributing and license

See [CONTRIBUTING.md](CONTRIBUTING.md) for development and pull-request guidance.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE) — [MIT License](LICENSE).
