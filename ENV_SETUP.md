# Environment Variables Setup

## Quick Fix for "Invalid supabaseUrl" Error

This error means your `.env.local` file is missing or incomplete.

## Step-by-Step Fix

### 1. Create `.env.local` file

In the **root directory** of your project (same level as `package.json`), create a new file named `.env.local`

### 2. Add your Supabase credentials

Open `.env.local` and paste this template:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

### 3. Get your Supabase credentials

1. Go to [supabase.com](https://supabase.com) and sign in
2. Select your project (or create one if you don't have it)
3. Go to **Settings** → **API**
4. Copy these values:

   - **Project URL**: Found under "Project URL" section
     - Example: `https://abcdefghijklmnop.supabase.co`
     - Paste into `NEXT_PUBLIC_SUPABASE_URL`

   - **anon public key**: Found under "Project API keys" → "anon public"
     - Long string starting with `eyJ...`
     - Paste into `NEXT_PUBLIC_SUPABASE_ANON_KEY`

   - **service_role key**: Found under "Project API keys" → "service_role"
     - ⚠️ **KEEP THIS SECRET!** Never commit to git or expose to client
     - Paste into `SUPABASE_SERVICE_ROLE_KEY`

### 4. Example `.env.local` file

```env
NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijklmnop.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZmdoaWprbG1ub3AiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTYxNjIzOTAyMiwiZXhwIjoxOTMxODE1MDIyfQ.example
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZmdoaWprbG1ub3AiLCJyb2xlIjoic2VydmljZV9yb2xlIiwiaWF0IjoxNjE2MjM5MDIyLCJleHAiOjE5MzE4MTUwMjJ9.example
```

### 5. Restart your dev server

After creating/updating `.env.local`:

1. **Stop** the current dev server (Ctrl+C)
2. **Start** it again:
   ```bash
   pnpm dev
   ```

⚠️ **Important**: Next.js only reads `.env.local` when the server starts. You must restart after changing environment variables.

## Cloudflare R2 (all media: video, thumbnails, step photos)

**Supabase** is used for **authentication and Postgres only** — there is **no** Supabase Storage bucket for this app. Video, thumbnails, and step images are stored as objects in **R2**; `video_path`, `thumbnail_path`, and `image_path` in the database are **R2 object keys**.

Use `R2_*` variables **only on the server** (API routes, Vercel env). Never put them in `NEXT_PUBLIC_*` or client code.

| Variable | Where to get it |
|----------|-----------------|
| **`R2_ACCOUNT_ID`** | Cloudflare dashboard: **R2** → URL or account area — 32-character hex **Account ID** (same id embedded in the S3 endpoint hostname). |
| **`R2_ACCESS_KEY_ID`** | **R2** → **Manage R2 API tokens** → create **Account API token** with **Object Read & Write** → copy **Access Key ID** when the token is created. |
| **`R2_SECRET_ACCESS_KEY`** | Same token creation screen — copy **Secret Access Key** immediately (often shown once). |
| **`R2_BUCKET_NAME`** | The bucket name you chose (e.g. `instant-sop-videos`). **R2** → your bucket → **Settings** → **Name**. |
| **`R2_ENDPOINT`** | **R2** → your bucket → **Settings** → **S3 API** — copy the full URL `https://<account-id>.r2.cloudflarestorage.com` (use **Copy**). |
| **`R2_REGION`** | Set to **`auto`** for the AWS S3-compatible SDK with R2 (signing). |

Example block for `.env.local` (replace with your values):

```env
R2_ACCOUNT_ID=your-32-char-account-id
R2_ACCESS_KEY_ID=paste-from-token-creation
R2_SECRET_ACCESS_KEY=paste-from-token-creation
R2_BUCKET_NAME=instant-sop-videos
R2_ENDPOINT=https://your-32-char-account-id.r2.cloudflarestorage.com
R2_REGION=auto
```

`R2_ACCOUNT_ID` matches the subdomain in **`R2_ENDPOINT`** (the hex string before `.r2.cloudflarestorage.com`).

**CORS (required for all media uploads):** Videos, thumbnails, and step photos are uploaded with **browser PUT** to **presigned R2 URLs**. Your bucket must allow your app origins. In R2 → bucket → **Settings** → **CORS**, use something like:

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:3000",
      "https://your-production-domain.com",
      "https://your-project.vercel.app"
    ],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag", "Content-Length"],
    "MaxAgeSeconds": 3600
  }
]
```

Replace `your-project.vercel.app` with your real Vercel hostname (e.g. `instant-sop.vercel.app`). **Every origin** that performs browser uploads must appear here: if you use a **custom domain**, add that URL too. **Preview deployments** use different hostnames (`*.vercel.app`); add each hostname you use, or add a second CORS rule that lists preview URLs you care about.

If uploads show **Failed to fetch** or **blocked by CORS policy** / **No 'Access-Control-Allow-Origin'** on the R2 URL, fix **R2 CORS** first, then verify **Content-Type** matches what was sent when requesting the signed URL (`videoContentType`, `imageContentType`, or `image/jpeg` for thumbnails).

**Vercel / production:** Uploads go **directly to R2** (not through the Next.js body limit). Check [Vercel limits](https://vercel.com/docs/functions/runtimes#request-body-size) only for other API routes (e.g. sync JSON).

**Video cut (async):** If you use `NEXT_PUBLIC_VIDEO_CUT_ASYNC=true`, run the migration that creates `video_processing_jobs` (`supabase/migrations/20260322100000_video_processing_jobs.sql` or the block in `schema.sql`). On **Vercel**, cut work runs in the background via `waitUntil` (see `maxDuration` on `/api/videos/cut`). Locally, the job still completes in the same HTTP request.

**Video cut on Vercel:** Serverless bundles must include the `ffmpeg-static` binary. This project sets `outputFileTracingIncludes` and `outputFileTracingRoot` in `next.config.js` so the cut route ships the binary. If you still see “ffmpeg binary not found”, redeploy after pulling latest; if ffmpeg runs but fails, check **Vercel logs** for **memory** or **timeout** on large files.

## Verify Setup

After restarting, check:

1. ✅ No error in terminal
2. ✅ App loads at http://localhost:3000
3. ✅ Can see login page (not error page)

## Common Issues

### Issue: Still getting error after creating `.env.local`
**Solution**: 
- Make sure file is named exactly `.env.local` (not `.env.local.txt`)
- Make sure it's in the **root** directory (same folder as `package.json`)
- Restart the dev server
- Check for typos in variable names (must match exactly)

### Issue: "Cannot find module" errors
**Solution**: Run `pnpm install` first

### Issue: Supabase URL format
**Solution**: 
- Must start with `https://` or `http://`
- Format: `https://[project-id].supabase.co`
- No trailing slash

### Issue: Don't have Supabase project yet
**Solution**: 
1. Go to [supabase.com](https://supabase.com)
2. Sign up (free)
3. Create new project
4. Wait ~2 minutes for setup
5. Get keys from Settings → API
6. Run the database schema from `supabase/schema.sql`

### Issue: IndexedDB errors on phone / “upgradeneeded” / installed PWA
Drafts and captured video/image blobs use **IndexedDB** (`lib/idb.ts`). **Chrome + “Add to Home Screen”** can run the app as an **installed PWA** with its own profile; you may have **separate storage** from the same site opened only in a tab. If migrations fail once, clear **site data** for that origin (or uninstall the PWA and reinstall after deploy). The app resets the DB open promise on failure so the next open can retry.

## File Location

Your project structure should look like this:

```
Instant_SOP/
├── .env.local          ← CREATE THIS FILE HERE
├── package.json
├── app/
├── lib/
└── ...
```

## Security Notes

- ✅ `.env.local` is already in `.gitignore` (won't be committed)
- ✅ Never share your `SUPABASE_SERVICE_ROLE_KEY`
- ✅ The service role key bypasses security - keep it secret!
- ✅ Never expose `R2_SECRET_ACCESS_KEY` or `R2_ACCESS_KEY_ID` to the browser — treat like the service role key.
- ✅ For production, set these in your hosting platform (Vercel, etc.)

## Still Having Issues?

1. Check `SETUP_CHECKLIST.md` for complete setup guide
2. Verify Supabase project is active
3. Make sure you ran the database schema (`supabase/schema.sql`)
4. Check terminal for any other error messages
