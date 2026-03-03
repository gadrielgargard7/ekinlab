# EKinLab Instructions

This guide explains how to navigate, run, build, and deploy EKinLab.

## 1) Prerequisites

- Node.js 18+ (recommended)
- npm (ships with Node.js)

Check versions:

```bash
node -v
npm -v
```

## 2) Install dependencies

From the project root:

```bash
npm install
```

## 3) Environment setup

This project includes an `.env.example` file. For local development, copy it to `.env.local` (or `.env`) and set values if needed.

```bash
cp .env.example .env.local
```

Update values as required by your environment.

## 4) Run locally (development)

Start the Vite development server:

```bash
npm run dev
```

The app is configured to run on host `0.0.0.0` and port `3000`.

Open in browser:

- `http://localhost:3000`

## 5) Build for production

Create a production build:

```bash
npm run build
```

Output is generated in:

- `dist/`

## 6) Preview production build locally

```bash
npm run preview
```

## 7) Type-check / lint

Run TypeScript checks:

```bash
npm run lint
```

## 8) Project structure and navigation

Top-level files/folders:

- `src/main.tsx` — React entry point.
- `src/App.tsx` — root app wrapper.
- `src/components/EKinLab.tsx` — primary simulation UI and logic.
- `src/index.css` — global styles and Tailwind-based custom utility classes.
- `vite.config.ts` — Vite configuration (`base: "./"` for static hosting compatibility).
- `index.html` — HTML shell.
- `.env.example` — example environment variables.
- `metadata.json` — app metadata.

### Main simulator logic

Most of the behavior is in `src/components/EKinLab.tsx`, including:

- kinetics helper functions (Michaelis–Menten + modifiers),
- inhibitor handling,
- pathway mode simulation,
- chart data generation,
- UI controls and responsive panels.

## 9) How to use the lab interface

1. Open the app in your browser.
2. Use the control panel to adjust enzyme concentration, Km, inhibitor type/concentration, and Ki.
3. Explore environmental factors (temperature and pH).
4. Toggle between single reaction and pathway mode.
5. Observe chart updates in real time.
6. Use reset controls to return to baseline conditions.

## 10) Deployment guidance

This is a static front-end app built with Vite.

General deployment workflow:

1. `npm install`
2. `npm run build`
3. Upload `dist/` contents to your static hosting provider.

Because `vite.config.ts` uses `base: "./"`, the app is suitable for directory-based/static shared-host deployments.

## 11) Troubleshooting

### Port already in use

If port 3000 is occupied, stop the other process or temporarily run Vite on another port:

```bash
npx vite --port 4173 --host 0.0.0.0
```

### Dependencies fail to install

- Delete `node_modules` and `package-lock.json`.
- Run `npm install` again.

### Blank page after deployment

- Confirm all files from `dist/` were uploaded.
- Ensure your host serves `index.html` at the target route.
- Verify paths are preserved.

## 12) Support the creator

If this lab is useful to you or your students, consider supporting continued open-source educational development:

- https://buymeacoffee.com/gadrielgargard7
