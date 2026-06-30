# FlockForge

A flock management app for modern chicken keepers — flock roster, incubator tracking, breeding pairs, egg logging, economics, health records, lineage, reminders, and mortality tracking.

## What's new: real accounts

FlockForge now has actual login (email + password), backed by [Supabase](https://supabase.com) — a free hosted database. Your data is tied to your account, not to one device's browser. Log in from your phone, your laptop, whatever — it's all the same flock.

If you used the localStorage version of this app before on this device, the first time you log in with a fresh account, you'll be offered a one-time "import your existing flock" option that brings that data into your new account.

## Setup checklist (do this once)

**1. Create a free Supabase account and project**
- Go to [supabase.com](https://supabase.com) → sign up (free) → **New Project**
- Pick any name/password/region — the database password it asks for here is separate from your FlockForge login, you won't need it again unless you're doing advanced database stuff

**2. Create the database table**
- In your new project's left sidebar, click **SQL Editor** → **New query**
- Open `supabase-schema.sql` from this folder, copy its entire contents, paste into the editor
- Click **Run**

**3. Get your project's API keys**
- Left sidebar → **Settings** → **API**
- You need two values: **Project URL** and the **anon public** key

**4. Add those keys to the project**
- In this folder, copy `.env.example` to a new file named `.env`
- Paste your Project URL and anon key into it

**5. (For the live site) Add the same two values to Vercel**
- Vercel project → **Settings** → **Environment Variables**
- Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` with the same values as your `.env`
- Redeploy after adding these (Deployments tab → ⋯ → Redeploy)

That's it — once those five steps are done, anyone who opens the site can create an account and log in, and their data follows them anywhere they log in.

## What changed from the localStorage version

- **Storage**: replaced `localStorage` with a real Supabase database, scoped per logged-in account.
- **Login required**: you'll see a login/signup screen before reaching the app now.
- **Migration**: first login on a device with old local data offers a one-time import.
- Everything else — every feature, every screen — is identical.

⚠️ Still worth using **Export Backup** on the Dashboard occasionally. It's no longer your main safety net against losing data to a single device, but it's good insurance against any kind of mistake (like accidentally deleting something).

## Getting this onto GitHub (no terminal needed)

1. Go to [github.com/new](https://github.com/new) and create a new repository (e.g. `flockforge`). Don't initialize it with a README — you already have one.
2. On the new repo's page, click **"uploading an existing file"**.
3. Drag the entire contents of this folder (not the folder itself — the files and subfolders inside it) into the upload area. Modern browsers support dragging a whole folder structure in at once.
4. Scroll down and click **Commit changes**.

Note: your `.env` file (with your real keys) should **not** be uploaded to GitHub — it's already excluded via `.gitignore`. Only `.env.example` (the blank template) goes up.

## Running it locally

You'll need [Node.js](https://nodejs.org) installed (the LTS version is fine), and you'll need to have done the Setup checklist above first (specifically steps 1-4).

```bash
npm install
npm run dev
```

This starts a local dev server (Vite will print a `localhost` URL).

## Deploying it so it has a real URL

### Option A: Vercel (easiest)
1. Push this repo to GitHub (above).
2. Go to [vercel.com/new](https://vercel.com/new), sign in with GitHub, and import the repo.
3. Vercel auto-detects Vite — click **Deploy**.
4. Add the two environment variables (Setup checklist, step 5) and redeploy.

### Option B: Netlify
Same idea as Vercel: [app.netlify.com/start](https://app.netlify.com/start), import the GitHub repo, add the same two environment variables under Site settings → Environment variables.

## Project structure

```
├── index.html              # HTML entry point + font loading
├── supabase-schema.sql      # run this once in Supabase's SQL Editor
├── .env.example             # template for your Supabase keys
├── src/
│   ├── main.jsx              # mounts the App
│   ├── App.jsx                # the entire app — login, data, every tab
│   ├── supabaseClient.js      # connects to your Supabase project
│   └── index.css              # Tailwind setup
├── package.json
├── vite.config.js
├── tailwind.config.js
└── postcss.config.js
```

