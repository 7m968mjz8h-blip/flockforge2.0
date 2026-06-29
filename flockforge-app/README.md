# FlockForge

A flock management app for modern chicken keepers — flock roster, incubator tracking, breeding pairs, egg logging, economics, health records, lineage, reminders, and mortality tracking.

## What changed from the Claude version

This is the same app you've been using in Claude, adapted to run as a standalone web app:

- **Storage**: swapped Claude's built-in artifact storage for the browser's `localStorage`. Your data now lives in whichever browser you use the app in — it does **not** sync across devices or browsers on its own.
- **Fonts/icons**: same fonts (Playfair Display, Manrope, JetBrains Mono) and icons (lucide-react), just loaded the standard way instead of however Claude's artifact environment provided them.
- Everything else — every feature, every screen, every tweak — is identical.

⚠️ **Because data lives in localStorage now, use the Export Backup button on the Dashboard regularly.** Clearing your browser's site data, switching browsers, or switching devices will start you with an empty flock unless you've backed up and restored.

## Getting this onto GitHub (no terminal needed)

1. Go to [github.com/new](https://github.com/new) and create a new repository (e.g. `flockforge`). Don't initialize it with a README — you already have one.
2. On the new repo's page, click **"uploading an existing file"**.
3. Drag the entire contents of this folder (not the folder itself — the files and subfolders inside it) into the upload area. Modern browsers support dragging a whole folder structure in at once.
4. Scroll down and click **Commit changes**.

That's it — your code is on GitHub. It isn't a *running* app yet though; see below.

## Running it locally

You'll need [Node.js](https://nodejs.org) installed (the LTS version is fine).

```bash
npm install
npm run dev
```

This starts a local dev server (Vite will print a `localhost` URL) where the app runs exactly like it did in Claude, except your data now lives in that browser's localStorage.

## Deploying it so it has a real URL

### Option A: Vercel (easiest)
1. Push this repo to GitHub (above).
2. Go to [vercel.com/new](https://vercel.com/new), sign in with GitHub, and import the repo.
3. Vercel auto-detects Vite — just click **Deploy**. You'll get a live URL in about a minute.

### Option B: Netlify
Same idea as Vercel: [app.netlify.com/start](https://app.netlify.com/start), import the GitHub repo, it auto-detects the Vite build settings (`npm run build`, output folder `dist`).

### Option C: GitHub Pages
A bit more manual:
1. In `vite.config.js`, change `base: '/'` to `base: '/flockforge/'` (replace `flockforge` with your actual repo name).
2. Run `npm run build` — this creates a `dist` folder.
3. Push the contents of `dist` to a branch named `gh-pages` (or use the `gh-pages` npm package to automate this), then enable GitHub Pages on that branch in your repo's Settings.

Vercel or Netlify are genuinely easier for a Vite app like this one — GitHub Pages works, but it's more setup for the same result.

## Project structure

```
├── index.html          # HTML entry point + font loading
├── src/
│   ├── main.jsx         # mounts the App
│   ├── App.jsx          # the entire app — same code you've been using
│   └── index.css        # Tailwind setup
├── package.json
├── vite.config.js
├── tailwind.config.js
└── postcss.config.js
```
