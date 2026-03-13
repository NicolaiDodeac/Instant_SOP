# Deploy AR SOP Builder (HTTPS for phone / Vodafone)

Deploy to **Vercel** so you get an `https://` URL. Then you can open the app on your phone over mobile data and use the camera (secure context).

---

## Step 1: Push your code to GitHub

1. If you haven’t already, create a repo on [GitHub](https://github.com/new) (e.g. `Instant_SOP`).
2. On your computer, in the project folder, run:

   ```bash
   git add .
   git commit -m "Ready for deploy"
   git remote add origin https://github.com/YOUR_USERNAME/Instant_SOP.git
   git push -u origin main
   ```

   (Use your real GitHub username and repo name. If your branch is `master`, use `git push -u origin master`.)

---

## Step 2: Sign in to Vercel

1. Go to [vercel.com](https://vercel.com).
2. Click **Sign Up** or **Log In**.
3. Choose **Continue with GitHub** and allow Vercel to access your GitHub account.

---

## Step 3: Import the project

1. On Vercel’s dashboard, click **Add New…** → **Project**.
2. Find **Instant_SOP** (or your repo name) in the list and click **Import**.
3. Leave **Framework Preset** as **Next.js**.
4. **Do not** click Deploy yet — add env vars first.

---

## Step 4: Add environment variables

Your app needs the same variables as in `.env.local`. Vercel does **not** see your local file, so you add them in the dashboard.

1. On the import screen, open the **Environment Variables** section.
2. Add these **three** variables (copy the values from your `.env.local` on your computer):

   | Name | Value (from your .env.local) |
   |------|------------------------------|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxxx.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your anon key |
   | `SUPABASE_SERVICE_ROLE_KEY` | your service_role key |

3. For each variable:
   - Enter the **Name** exactly as in the table.
   - Paste the **Value** (no quotes, no spaces).
   - Leave environment as **Production** (and optionally add the same for Preview if you use branches).
4. Click **Deploy** (or **Add** then **Deploy**).

---

## Step 5: Wait for the build

1. Vercel will build and deploy (usually 1–2 minutes).
2. When it’s done, you’ll see a **Visit** link, e.g. `https://instant-sop-xxx.vercel.app`.

---

## Step 6: Use the app on your phone

1. On your phone (Wi‑Fi or Vodafone mobile data), open that **https** URL in the browser.
2. Log in and test **Record** — camera/mic work because the site is served over HTTPS.

---

## Optional: Supabase redirect URL (if login fails)

If after deploy you get a redirect or “Invalid redirect” from Supabase:

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project → **Authentication** → **URL Configuration**.
2. Under **Redirect URLs**, add your Vercel URL, e.g.:
   - `https://instant-sop-xxx.vercel.app/**`
   - `https://your-custom-domain.com/**` (if you add a domain later).
3. Save.

---

## Summary

| Step | What to do |
|------|------------|
| 1 | Push project to GitHub |
| 2 | Sign in to Vercel with GitHub |
| 3 | Import the repo as a new project |
| 4 | Add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| 5 | Deploy and wait for the build |
| 6 | Open the **https** link on your phone and test recording |

Your `.env.local` stays only on your computer (it’s in `.gitignore`). Production uses the variables you set in Vercel.
