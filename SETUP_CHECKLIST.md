# Setup Checklist - AR SOP Builder

## ✅ What's Already Done (Automated)

### Project Structure
- ✅ Next.js 15 project with TypeScript and App Router
- ✅ Tailwind CSS configuration
- ✅ All dependencies in `package.json`
- ✅ TypeScript configuration
- ✅ Git ignore file

### Core Application Files
- ✅ **Authentication**: Login/signup page (`app/auth/login/page.tsx`)
- ✅ **Dashboard**: SOP listing and creation (`app/(app)/dashboard/page.tsx`)
- ✅ **Editor**: Full mobile editor with step management (`app/(app)/editor/[sopId]/page.tsx`)
- ✅ **Public Viewer**: Published SOP viewer (`app/sop/[share]/page.tsx`)

### Components
- ✅ **VideoCapture**: Camera recording and file upload (`components/VideoCapture.tsx`)
- ✅ **StepPlayer**: Video player with react-konva overlays and touch gestures (`components/StepPlayer.tsx`)
- ✅ **TimeBar**: Timeline with start/end controls (`components/TimeBar.tsx`)
- ✅ **AnnotToolbar**: Annotation tools UI (`components/AnnotToolbar.tsx`)

### Backend/API
- ✅ **QR Code API**: Generate QR codes (`app/api/qr/route.ts`)
- ✅ **Video Upload API**: Signed upload URLs (`app/api/videos/sign-upload/route.ts`)
- ✅ **Video Signed URL API**: Playback URLs (`app/api/videos/signed-url/route.ts`)

### Database & Storage
- ✅ **Database Schema**: Complete SQL schema with RLS policies (`supabase/schema.sql`)
- ✅ **Supabase Clients**: Server and client utilities (`lib/supabase/`)
- ✅ **IndexedDB Helpers**: Offline draft management (`lib/idb.ts`)
- ✅ **Type Definitions**: TypeScript types (`lib/types.ts`)
- ✅ **Zod Schemas**: Validation schemas (`lib/schemas.ts`)

### PWA & Offline
- ✅ **Service Worker**: Basic PWA service worker (`public/sw.js`)
- ✅ **Manifest**: PWA manifest file (`public/manifest.json`)
- ✅ **Offline Support**: IndexedDB integration for drafts

### Styling
- ✅ **Global Styles**: Tailwind setup with safe-area insets (`app/globals.css`)
- ✅ **Print Styles**: Print CSS (`styles/print.css`)
- ✅ **Mobile-First**: Touch targets, safe areas, responsive design

---

## 🔧 What You Must Do Manually

### 1. Install Dependencies (5 minutes)
```bash
pnpm install
```
**OR** if you prefer npm:
```bash
npm install
```

### 2. Set Up Supabase (15-20 minutes)

#### Step 2.1: Create Supabase Project
1. Go to [supabase.com](https://supabase.com)
2. Sign up/login
3. Click "New Project"
4. Fill in:
   - Project name: `ar-sop-builder` (or your choice)
   - Database password: (save this securely)
   - Region: Choose closest to you
5. Wait for project to be created (~2 minutes)

#### Step 2.2: Run Database Schema
1. In Supabase dashboard, go to **SQL Editor**
2. Click **New Query**
3. Open `supabase/schema.sql` from this project
4. Copy the entire contents
5. Paste into SQL Editor
6. Click **Run** (or press Ctrl+Enter)
7. Verify success message

#### Step 2.3: Verify Storage Bucket
1. Go to **Storage** in Supabase dashboard
2. Check that `sop-videos` bucket exists
3. If it doesn't exist, the schema should have created it, but you can manually create:
   - Click "New bucket"
   - Name: `sop-videos`
   - Public: **No** (unchecked)
   - Click "Create bucket"

#### Step 2.4: Get API Keys
1. Go to **Settings** → **API**
2. Copy these values:
   - **Project URL** (under "Project URL")
   - **anon/public key** (under "Project API keys" → "anon public")
   - **service_role key** (under "Project API keys" → "service_role" - **KEEP SECRET!**)

### 3. Create Environment Variables (2 minutes)

Create a file named `.env.local` in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

**Replace the values** with what you copied from Supabase.

⚠️ **IMPORTANT**: 
- Never commit `.env.local` to git (it's already in `.gitignore`)
- Never expose `SUPABASE_SERVICE_ROLE_KEY` to the client
- The service role key bypasses RLS - keep it secure!

### 4. Create PWA Icons (5-10 minutes)

You need to create two icon files:

#### Option A: Use Online Tool (Easiest)
1. Go to [PWA Asset Generator](https://github.com/onderceylan/pwa-asset-generator) or [RealFaviconGenerator](https://realfavicongenerator.net/)
2. Upload a logo/image (512x512 or larger)
3. Generate icons
4. Download and extract
5. Place these files in `public/` folder:
   - `icon-192x192.png`
   - `icon-512x512.png`

#### Option B: Create Manually
1. Create or find a logo/image
2. Resize to 192x192 pixels → save as `public/icon-192x192.png`
3. Resize to 512x512 pixels → save as `public/icon-512x512.png`
4. Use any image editor (Photoshop, GIMP, online tools)

#### Option C: Use Placeholder (Quick Test)
For quick testing, you can create simple colored squares:
- Use any image editor to create 192x192 and 512x512 PNG files
- Place them in `public/` folder
- Replace later with proper icons

### 5. Test the Application (5 minutes)

```bash
# Start development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000)

**Test Flow:**
1. ✅ Sign up with email/password
2. ✅ Create a new SOP
3. ✅ Add a step
4. ✅ Record/upload a video
5. ✅ Add annotations (arrow/label)
6. ✅ Publish and view share link

### 6. Test on Mobile Device (Optional but Recommended)

#### Option A: Local Network
1. Find your computer's IP address:
   - Windows: `ipconfig` → look for IPv4 Address
   - Mac/Linux: `ifconfig` or `ip addr`
2. Start dev server on all interfaces:
   ```bash
   pnpm dev -- -H 0.0.0.0
   ```
3. On your phone, open: `http://YOUR_IP:3000`
   - Example: `http://192.168.1.100:3000`

#### Option B: HTTPS Tunnel (For Camera Testing)
Camera access requires HTTPS in production. For testing:
1. Use [ngrok](https://ngrok.com):
   ```bash
   ngrok http 3000
   ```
2. Use the HTTPS URL ngrok provides
3. Open on your phone

---

## 🐛 Common Issues & Solutions

### Issue: "Cannot find module '@supabase/ssr'"
**Solution**: Run `pnpm install` again

### Issue: "Supabase client error"
**Solution**: 
- Check `.env.local` exists and has correct values
- Restart dev server after creating `.env.local`

### Issue: "Storage bucket not found"
**Solution**: 
- Go to Supabase Storage
- Manually create `sop-videos` bucket if schema didn't create it
- Set it to **private** (not public)

### Issue: "Camera not working on mobile"
**Solution**:
- Use HTTPS (ngrok or deploy to Vercel)
- Check browser permissions
- Try file upload fallback instead

### Issue: "RLS policy violation"
**Solution**:
- Verify you ran the complete `schema.sql`
- Check that RLS policies were created
- Ensure you're logged in when testing

### Issue: "PWA not installing"
**Solution**:
- Check that icons exist in `public/` folder
- Verify `manifest.json` is accessible
- Must be served over HTTPS (or localhost)

---

## 📋 Quick Start Summary

**Minimum steps to get running:**

1. ✅ `pnpm install`
2. ✅ Create Supabase project
3. ✅ Run `supabase/schema.sql` in SQL Editor
4. ✅ Create `.env.local` with your keys
5. ✅ Create PWA icons (or use placeholders)
6. ✅ `pnpm dev`
7. ✅ Test at http://localhost:3000

**Total time: ~30-45 minutes** (mostly waiting for Supabase setup)

---

## 🚀 Next Steps After Setup

1. **Test all features**:
   - Create SOP → Add steps → Record videos → Add annotations → Publish

2. **Deploy to production** (Vercel recommended):
   ```bash
   # Install Vercel CLI
   npm i -g vercel
   
   # Deploy
   vercel
   ```
   - Add environment variables in Vercel dashboard
   - Get HTTPS URL for mobile testing

3. **Customize**:
   - Update app name in `manifest.json`
   - Replace placeholder icons
   - Adjust colors in `tailwind.config.ts`
   - Add your branding

---

## 📝 Notes

- **Offline Mode**: Drafts are saved to IndexedDB automatically. Videos upload when connection is restored.
- **Video Format**: Uses MP4/H.264 for iOS compatibility. WebM may not work on iOS Safari.
- **Touch Gestures**: Fully supported on mobile. Test on real device for best experience.
- **Database**: All data is stored in Supabase. IndexedDB is only for offline drafts.

---

## ✅ Verification Checklist

Before considering setup complete, verify:

- [ ] Dependencies installed (`pnpm install` completed)
- [ ] Supabase project created
- [ ] Database schema executed successfully
- [ ] Storage bucket `sop-videos` exists
- [ ] `.env.local` file created with correct keys
- [ ] PWA icons created and placed in `public/`
- [ ] Dev server starts without errors
- [ ] Can sign up/login
- [ ] Can create SOP
- [ ] Can record/upload video
- [ ] Can add annotations
- [ ] Can publish and view share link

---

**Need Help?** Check the main `README.md` for detailed documentation.
