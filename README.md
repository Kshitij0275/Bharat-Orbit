# Bharat Orbit

**Edge-AI Astronaut Activity Recognition & Experiment Sequence Validation**

Bharat Orbit is a web-based prototype for real-time astronaut activity recognition and experiment-sequence validation.

## Local development

Requirements:
- Node.js 20+ (Node.js 22+ recommended)
- pnpm 9+

Install dependencies:

```bash
pnpm install
```

Start the mission-control application:

```bash
$env:PORT="5173"; $env:BASE_PATH="/"; pnpm --filter @workspace/bas-mission-control dev
```

Open:

```text
http://localhost:5173/
```

For the live mission page:

```text
http://localhost:5173/live
```

Use Chrome or Edge when testing browser camera access.

## Build

```bash
$env:PORT="5173"; $env:BASE_PATH="/"; pnpm --filter @workspace/bas-mission-control build
```

## Notes

- Camera processing runs in the browser.
- MediaPipe Tasks Vision is used for pose/hand landmark processing.
- Any simulated telemetry should be treated as simulated.
- Workflow data can be added through the project's workflow/data layer.
