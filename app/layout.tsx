import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'AR SOP Builder',
  description: 'Create interactive video SOPs with AR overlays',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'AR SOP Builder',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#000000',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon-32x32.png" />
        <link rel="apple-touch-icon" href="/ios/apple-touch-icon-180x180.png" />
        {/* <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                  navigator.serviceWorker.register('/sw.js')
                    .then(reg => console.log('SW registered', reg))
                    .catch(err => console.log('SW registration failed', err));
                });
              }
            `,
          }}
        /> */}
      </head>
      <body className="min-h-screen bg-background text-foreground">
        {children}
      </body>
    </html>
  )
}
