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
- ✅ For production, set these in your hosting platform (Vercel, etc.)

## Still Having Issues?

1. Check `SETUP_CHECKLIST.md` for complete setup guide
2. Verify Supabase project is active
3. Make sure you ran the database schema (`supabase/schema.sql`)
4. Check terminal for any other error messages
