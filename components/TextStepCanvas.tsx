'use client'

import type { TextStepPayload } from '@/lib/types'

const DEFAULT_BG_SRC = '/backgrounds/magna_background.png'

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

export default function TextStepCanvas({
  payload,
  className = '',
}: {
  payload: TextStepPayload | null | undefined
  className?: string
}) {
  const bg = payload?.background
  const bgSrc = bg?.kind === 'image' && typeof bg.src === 'string' && bg.src.trim() ? bg.src : DEFAULT_BG_SRC
  const fit = bg?.fit === 'contain' ? 'contain' : 'cover'
  const blurPx = clamp(typeof bg?.blurPx === 'number' ? bg.blurPx : 6, 0, 40)
  const overlayOpacity = clamp(typeof bg?.overlayOpacity === 'number' ? bg.overlayOpacity : 0.72, 0, 0.9)

  const title = payload?.title?.trim() ?? ''
  const bullets = (payload?.bullets ?? []).map((b) => b.trim()).filter(Boolean)
  const titleSize = clamp(typeof payload?.titleSize === 'number' ? payload.titleSize : 36, 18, 64)
  const bulletSize = clamp(typeof payload?.bulletSize === 'number' ? payload.bulletSize : 22, 14, 48)
  const rowGap = clamp(typeof payload?.rowGap === 'number' ? payload.rowGap : 10, 0, 60)

  return (
    <div
      className={`relative w-full rounded-lg overflow-hidden shadow-lg ${className}`}
      style={{
        // Keep a stable 9:16 canvas regardless of container width.
        aspectRatio: '9 / 16',
        backgroundColor: '#0b0b0b',
      }}
    >
      {/* Blurred background image */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage: `url(${bgSrc})`,
          backgroundSize: fit,
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          transform: fit === 'cover' ? 'scale(1.08)' : 'scale(1.02)',
          filter: `blur(${blurPx}px)`,
        }}
      />
      {/* Dark overlay for readability */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: `rgba(0,0,0,${overlayOpacity})`,
        }}
      />

      {/* Content */}
      <div className="absolute inset-0 p-6 sm:p-7 md:p-8 flex">
        <div className="w-full">
          {title ? (
            <div
              className="text-white font-extrabold tracking-tight leading-tight"
              style={{ fontSize: `${titleSize}px` }}
            >
              {title}
            </div>
          ) : null}

          {bullets.length > 0 ? (
            <div className={title ? 'mt-4' : ''}>
              <ul className="list-disc pl-6 text-white/95">
                {bullets.map((b, i) => (
                  <li
                    key={`${i}-${b}`}
                    className="leading-snug"
                    style={{
                      fontSize: `${bulletSize}px`,
                      marginTop: i === 0 ? 0 : `${rowGap}px`,
                    }}
                  >
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

