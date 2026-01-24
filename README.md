# AR SOP Builder

A mobile-first MVP for creating interactive video Standard Operating Procedures (SOPs) with AR-style overlays. Built with Next.js 15, TypeScript, Supabase, and optimized for phones and tablets.

## Features

- 📱 **Mobile-First Design**: Optimized for touch interactions on phones and tablets
- 🎥 **Video Capture**: Record or upload short clips per step directly from device camera
- 🎯 **AR Overlays**: Add arrows and labels with intuitive touch gestures:
  - One-finger drag to move
  - Two-finger rotate for arrows (or visible rotation handle)
  - Pinch-zoom canvas for precise placement
  - Touch-friendly timeline with draggable start/end handles
- 📴 **Offline Support**: Save drafts and recordings locally; auto-upload when online
- 🔗 **PWA**: Installable app with offline viewing capabilities
- 📊 **QR Codes**: Generate QR codes for easy sharing
- 🔒 **Secure**: Row-level security with Supabase RLS

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Database & Auth**: Supabase
- **Storage**: Supabase Storage (videos)
- **Overlays**: react-konva
- **Offline**: IndexedDB (idb)
- **QR Codes**: qrcode

## Prerequisites

- Node.js 18+ and pnpm (or npm/yarn)
- Supabase account and project
- Modern mobile browser (iOS Safari 14+, Android Chrome 90+)

## Setup Instructions

### 1. Clone and Install

```bash
# Install dependencies
pnpm install
```

### 2. Supabase Setup

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Go to SQL Editor and run the schema from `supabase/schema.sql`
3. Go to Storage and verify the `sop-videos` bucket was created
4. Get your project URL and anon key from Settings > API

### 3. Environment Variables

Create a `.env.local` file in the root directory:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

**Important**: The service role key is needed for server-side operations like generating signed upload URLs. Keep it secure and never expose it to the client.

### 4. PWA Icons

Create PWA icons and place them in the `public` directory:

- `icon-192x192.png` (192x192 pixels)
- `icon-512x512.png` (512x512 pixels)

You can use a tool like [PWA Asset Generator](https://github.com/onderceylan/pwa-asset-generator) or create them manually.

### 5. Run Development Server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 6. Test on Mobile Device

For testing on a real device:

1. Find your local IP address (e.g., `192.168.1.100`)
2. Run: `pnpm dev -- -H 0.0.0.0`
3. Access from your phone: `http://192.168.1.100:3000`

Or use a service like [ngrok](https://ngrok.com) for HTTPS (required for camera access on mobile).

## Project Structure

```
├── app/
│   ├── (app)/              # Protected routes
│   │   ├── dashboard/      # SOP list and creation
│   │   └── editor/[sopId]/ # Main editor page
│   ├── auth/               # Authentication
│   ├── sop/[share]/        # Public viewer
│   ├── api/                # API routes
│   │   ├── qr/             # QR code generation
│   │   └── videos/         # Video upload/signed URLs
│   └── layout.tsx          # Root layout with PWA setup
├── components/
│   ├── VideoCapture.tsx    # Camera/upload component
│   ├── StepPlayer.tsx     # Video player with Konva overlays
│   ├── TimeBar.tsx        # Timeline with start/end controls
│   └── AnnotToolbar.tsx   # Annotation tools
├── lib/
│   ├── supabase/          # Supabase client/server utilities
│   ├── idb.ts             # IndexedDB helpers
│   ├── types.ts           # TypeScript types
│   └── schemas.ts         # Zod validation schemas
├── public/
│   ├── manifest.json      # PWA manifest
│   └── sw.js              # Service worker
└── supabase/
    └── schema.sql         # Database schema
```

## Usage

### Creating an SOP

1. Sign up/Login on the dashboard
2. Click "New SOP" and enter a title
3. Add steps using the "+ Add Step" button
4. For each step:
   - Record or upload a video
   - Play the video and add annotations:
     - Use "Arrow" or "Label" buttons
     - Drag to position, rotate arrows, pinch-zoom for precision
     - Set show/hide times using the timeline
   - Annotations are saved automatically

### Publishing

1. Click "Publish" in the editor header
2. A unique share link and QR code are generated
3. Share the link or QR code with viewers

### Viewing

- Public viewers can access published SOPs via the share link
- Steps play sequentially with overlays synchronized
- Works offline after first load (PWA)

## Mobile Considerations

### iOS Safari

- Videos must be MP4/H.264 (not WebM)
- Autoplay with sound is disabled (user gesture required)
- Camera access requires HTTPS in production
- Safe area insets are handled via CSS

### Android Chrome

- Full WebM support
- Better background sync support
- Camera access works on HTTP for localhost

### Touch Gestures

- **Drag**: Single finger to move annotations
- **Rotate**: Two-finger gesture or use rotation handle (when selected)
- **Zoom**: Pinch gesture or use +/- buttons
- **Timeline**: Drag start/end thumbs or tap "Set Start/End = Now"

### Offline Mode

- Drafts are saved to IndexedDB automatically
- Videos are stored locally until uploaded
- Upload status is shown with badges
- Automatic retry when connection is restored

## Development Notes

### Video Upload Flow

1. Video is captured/selected
2. Blob is saved to IndexedDB immediately
3. Upload request is made to `/api/videos/sign-upload`
4. Server returns signed URL from Supabase Storage
5. Client uploads directly to signed URL
6. On success, `video_path` is saved to database
7. Local blob is marked as uploaded (can be deleted)

### Normalized Coordinates

All annotation coordinates are stored normalized `[0..1]` to ensure they stay aligned across different screen sizes and orientations. The StepPlayer component converts these to pixel coordinates at render time.

### Service Worker

The service worker caches:
- HTML, CSS, JS (app shell)
- Static assets (icons, fonts)
- Does NOT cache videos (stored in IndexedDB)

Background sync is set up for retrying failed uploads, though the current implementation relies on client-side retry logic.

## Building for Production

```bash
pnpm build
pnpm start
```

For deployment to Vercel/Netlify:
1. Set environment variables in your platform
2. Deploy
3. Ensure HTTPS is enabled (required for camera/PWA)

## Troubleshooting

### Camera not working
- Ensure HTTPS (or localhost for development)
- Check browser permissions
- Try the file upload fallback

### Videos not uploading
- Check Supabase Storage bucket exists
- Verify storage policies are set correctly
- Check network tab for errors
- Videos are queued for upload when offline

### Overlays not aligned
- Ensure normalized coordinates are being used
- Check that StepPlayer dimensions are calculated correctly
- Verify video aspect ratio matches container

### PWA not installing
- Must be served over HTTPS
- Check manifest.json is accessible
- Verify icons exist at specified paths
- Check browser console for errors

## Future Enhancements

- [ ] Step view analytics
- [ ] Multi-user collaboration
- [ ] Video trimming UI
- [ ] More annotation types (shapes, highlights)
- [ ] Export to PDF/print
- [ ] Voice-over narration
- [ ] Step branching/conditional flows

## License

MIT

## Support

For issues and questions, please open an issue on the repository.
