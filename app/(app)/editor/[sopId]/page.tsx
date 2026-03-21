'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useSupabaseClient } from '@/lib/supabase/client'
import type { SOP, SOPStep, StepAnnotation, DraftSOP, DraftStep } from '@/lib/types'
import {
  saveDraft,
  getDraft,
  deleteDraft,
  getVideoBlob,
  saveVideoBlob,
  markVideoUploaded,
  deleteVideoBlob,
  getImageBlob,
  markImageUploaded,
  deleteImageBlob,
  saveImageBlob,
} from '@/lib/idb'
import { compressVideoWithMediabunny } from '@/lib/video-compress-mediabunny'
import { generateThumbnail } from '@/lib/thumbnail'
import { isVideoCutAsync, isVideoCutEnabled } from '@/lib/feature-flags'
import { nanoid } from 'nanoid'
import VideoCapture from '@/components/VideoCapture'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** True if id is a DB-generated UUID (not a local nanoid). */
function isAnnotationIdFromDb(id: string): boolean {
  return UUID_REGEX.test(id)
}

/** True if step id is from DB (sop_steps); false for draft steps with nanoid. */
function isStepIdFromDb(stepId: string): boolean {
  return UUID_REGEX.test(stepId)
}
import TimeBar, { type TimelineDragMode } from '@/components/TimeBar'
import AnnotToolbar from '@/components/AnnotToolbar'
import StepPlayer from '@/components/StepPlayer'

/** Editor-only preview; does not change exported video file. */
const VIDEO_PREVIEW_SPEEDS = [0.5, 1, 1.5, 2, 3, 4, 8] as const

/** Server-side segment speed-up (ffmpeg); encoded into the file. */
const SEGMENT_SPEED_FACTORS = [2, 3, 4, 8] as const

export default function EditorPage() {
  const params = useParams()
  const sopId = params.sopId as string
  const router = useRouter()
  const supabase = useSupabaseClient()

  const [sop, setSop] = useState<SOP | null>(null)
  const [steps, setSteps] = useState<SOPStep[]>([])
  const [annotations, setAnnotations] = useState<Record<string, StepAnnotation[]>>({})
  const [currentStepId, setCurrentStepId] = useState<string | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [videoDuration, setVideoDuration] = useState(0) // Track actual video duration from video element
  const [startTime, setStartTime] = useState(0)
  const [endTime, setEndTime] = useState(0)
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null)
  const [timelineDragMode, setTimelineDragMode] = useState<TimelineDragMode>('seek')
  const [loading, setLoading] = useState(true)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isEditor, setIsEditor] = useState<boolean | null>(null)
  const [isSuperUser, setIsSuperUser] = useState(false)
  const [isOffline, setIsOffline] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'saving' | 'updated'>('idle')
  const [loadedFromServer, setLoadedFromServer] = useState(false)
  const [stepUploadStatus, setStepUploadStatus] = useState<Record<string, 'compressing' | 'uploading' | 'failed' | null>>({})
  const [stepUploadProgress, setStepUploadProgress] = useState<Record<string, number>>({})
  const [stepUploadResult, setStepUploadResult] = useState<Record<string, 'compressed' | 'original' | null>>({})
  const [stepUploadSizes, setStepUploadSizes] = useState<Record<string, { before: number; after: number } | null>>({})
  const [cutMode, setCutMode] = useState(false)
  const [cutProgress, setCutProgress] = useState<number | null>(null)
  const [cutError, setCutError] = useState<string | null>(null)
  const [speedMode, setSpeedMode] = useState(false)
  const [speedFactor, setSpeedFactor] = useState(2)
  const [speedProgress, setSpeedProgress] = useState<number | null>(null)
  const [speedError, setSpeedError] = useState<string | null>(null)
  const [playbackRate, setPlaybackRate] = useState(1)
  const stepInstructionsRef = useRef<string>('')
  const isOwner = !!(sop && currentUserId && sop.owner === currentUserId)
  const canEdit = isOwner || isSuperUser
  const editAsDraft = canEdit && loadedFromServer

  useEffect(() => {
    void supabase.auth.getUser().then((res: { data?: { user?: { id: string } } }) => {
      const user = res.data?.user
      if (user) setCurrentUserId(user.id)
    })
  }, [supabase])

  useEffect(() => {
    fetch('/api/user/me')
      .then((res) => res.json())
      .then((data) => {
        setIsEditor(data?.isEditor === true)
        setIsSuperUser(data?.isSuperUser === true)
      })
      .catch(() => {
        setIsEditor(false)
        setIsSuperUser(false)
      })
  }, [])

  // Non-editors must not use the editor: send to viewer or dashboard
  useEffect(() => {
    if (loading || isEditor === null || isEditor) return
    if (!sop) return
    if (sop.published && sop.share_slug) {
      router.replace(`/sop/${sop.share_slug}`)
    } else {
      router.replace('/dashboard')
    }
  }, [loading, isEditor, sop, router])

  // Check online status
  useEffect(() => {
    setIsOffline(!navigator.onLine)
    const handleOnline = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Load SOP data
  useEffect(() => {
    loadSOP()
  }, [sopId])

  async function loadSOP() {
    try {
      // Try to load from server
      const { data: sopData, error: sopError } = await supabase
        .from('sops')
        .select('*')
        .eq('id', sopId)
        .single()

      if (sopError || !sopData) {
        setLoadedFromServer(false)
        // Try loading from draft
        const draft = await getDraft(sopId)
        if (draft) {
          // Convert draft to local state
          setSop({
            id: draft.id,
            title: draft.title,
            description: draft.description,
            owner: '',
            published: false,
            created_at: new Date(draft.lastModified).toISOString(),
          })
          // Convert draft steps
          const draftSteps: SOPStep[] = draft.steps.map((s) => ({
            id: s.id,
            sop_id: sopId,
            idx: s.idx,
            title: s.title,
            instructions: s.instructions,
            video_path: s.videoPath,
            thumbnail_path: s.thumbnailPath,
            image_path: s.imagePath,
            duration_ms: s.duration_ms,
          }))
          setSteps(draftSteps)
          // Load annotations from draft
          const annsMap: Record<string, StepAnnotation[]> = {}
          draft.steps.forEach((s) => {
            if (s.annotations.length > 0) {
              annsMap[s.id] = s.annotations
            }
          })
          setAnnotations(annsMap)
          if (draftSteps.length > 0) {
            setCurrentStepId(draftSteps[0].id)
          }
          setLoading(false)
          return
        }
        setLoading(false)
        return
      }

      setSop(sopData as SOP)
      setLoadedFromServer(true)

      // Load steps
      const { data: stepsData } = await supabase
        .from('sop_steps')
        .select('*')
        .eq('sop_id', sopId)
        .order('idx', { ascending: true })

      if (stepsData) {
        setSteps(stepsData as SOPStep[])
        if (stepsData.length > 0) {
          setCurrentStepId(stepsData[0].id)
        }
      }

      // Load annotations
      if (stepsData && stepsData.length > 0) {
        const stepIds = stepsData.map((s: SOPStep) => s.id)
        const { data: annsData } = await supabase
          .from('step_annotations')
          .select('*')
          .in('step_id', stepIds)

        if (annsData) {
          const annsMap: Record<string, StepAnnotation[]> = {}
          annsData.forEach((ann: StepAnnotation) => {
            if (!annsMap[ann.step_id]) {
              annsMap[ann.step_id] = []
            }
            annsMap[ann.step_id].push(ann as StepAnnotation)
          })
          setAnnotations(annsMap)
        }
      }
    } catch (err) {
      console.error('Error loading SOP:', err)
    } finally {
      setLoading(false)
    }
  }

  // Load video or image for current step
  useEffect(() => {
    if (!currentStepId) return

    const step = steps.find((s) => s.id === currentStepId)
    if (!step) return

    // Prefer image when present (even if video_path also exists).
    if (step.image_path) {
      setVideoUrl(null)
      loadImageUrl(step.image_path)
    } else if (step.video_path) {
      setImageUrl(null)
      loadVideoUrl(step.video_path)
    } else {
      setVideoUrl(null)
      setImageUrl(null)
      loadLocalVideo()
      loadLocalImage()
    }

    // Reset time range when switching steps
    setStartTime(0)
    setEndTime(step.duration_ms ?? 0)
    setSelectedAnnotationId(null)
    setCutMode(false)
    setCutError(null)
  }, [currentStepId, steps])

  // Sync TimeBar with selected annotation's times (only when not in cut mode)
  useEffect(() => {
    if (cutMode || !selectedAnnotationId || !currentStepId) return
    const stepAnns = annotations[currentStepId] || []
    const selectedAnn = stepAnns.find((ann) => ann.id === selectedAnnotationId)
    if (selectedAnn) {
      setStartTime(selectedAnn.t_start_ms)
      setEndTime(selectedAnn.t_end_ms)
    }
  }, [cutMode, selectedAnnotationId, annotations, currentStepId])

  useEffect(() => {
    if (!isVideoCutEnabled && cutMode) {
      setCutMode(false)
      setCutError(null)
    }
    if (!isVideoCutEnabled && speedMode) {
      setSpeedMode(false)
      setSpeedError(null)
    }
  }, [isVideoCutEnabled, cutMode, speedMode])

  // Keep instructions ref in sync when switching steps
  useEffect(() => {
    if (currentStepId) {
      const step = steps.find((s) => s.id === currentStepId)
      stepInstructionsRef.current = step?.instructions ?? ''
    }
  }, [currentStepId, steps])

  useEffect(() => {
    setPlaybackRate(1)
  }, [currentStepId])

  // Save draft when annotations (or other draft data) change, so we always persist latest state
  useEffect(() => {
    if (!sop) return
    saveDraftState()
  }, [sop, steps, annotations])

  async function loadVideoUrl(videoPath: string) {
    try {
      const res = await fetch(`/api/videos/signed-url?path=${encodeURIComponent(videoPath)}`)
      if (res.ok) {
        const { url } = await res.json()
        setVideoUrl(url)
      } else {
        const text = await res.text()
        let errorMessage: string
        try {
          const errorData = JSON.parse(text) as { error?: string }
          errorMessage = (errorData?.error ?? text) || `HTTP ${res.status}`
        } catch {
          errorMessage = text || `HTTP ${res.status} ${res.statusText}`
        }

        // If file not found in storage (404/500), try loading from IndexedDB (local draft)
        const notFound = res.status === 404 || (res.status === 500 && (errorMessage === 'Object not found' || errorMessage.includes('not found')))
        if (notFound) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('Video not found in storage, trying IndexedDB:', videoPath)
          }
          loadLocalVideo()
        } else if (res.status === 401 || res.status === 403) {
          // No access (e.g. viewing draft as non-owner); try local draft
          loadLocalVideo()
        } else {
          if (process.env.NODE_ENV === 'development') {
            console.error('Error loading video URL:', res.status, errorMessage, videoPath)
          }
        }
      }
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error loading video URL:', err)
      }
      // Fallback to IndexedDB on network errors
      loadLocalVideo()
    }
  }

  async function loadLocalVideo() {
    if (!currentStepId) return
    const blob = await getVideoBlob(currentStepId)
    if (blob) {
      setVideoUrl(URL.createObjectURL(blob))
    } else {
      setVideoUrl(null)
    }
  }

  async function loadImageUrl(imagePath: string) {
    try {
      const res = await fetch(`/api/videos/signed-url?path=${encodeURIComponent(imagePath)}`)
      if (res.ok) {
        const { url } = await res.json()
        setImageUrl(url)
      } else {
        const notFound = res.status === 404 || res.status === 500
        if (notFound) loadLocalImage()
        else setImageUrl(null)
      }
    } catch {
      loadLocalImage()
    }
  }

  async function loadLocalImage() {
    if (!currentStepId) return
    const blob = await getImageBlob(currentStepId)
    if (blob) {
      setImageUrl(URL.createObjectURL(blob))
    } else {
      setImageUrl(null)
    }
  }

  const currentStep = steps.find((s) => s.id === currentStepId)
  const currentAnnotations = currentStepId ? annotations[currentStepId] || [] : []

  async function handleVideoCaptured(blob: Blob, duration: number) {
    if (!currentStepId) return

    const updatedSteps = steps.map((s) =>
      s.id === currentStepId ? { ...s, duration_ms: duration } : s
    )
    setSteps(updatedSteps)

    if (isOffline) {
      // Blob already saved in IndexedDB by VideoCapture; play from local
      loadLocalVideo()
      return
    }

    await processAndUploadVideo(blob, currentStepId, duration)
  }

  async function handleImageCaptured(blob: Blob) {
    if (!currentStepId || !sopId) return

    if (isOffline) {
      loadLocalImage()
      return
    }

    try {
      const imageCt = blob.type?.startsWith('image/') ? blob.type : 'image/jpeg'
      const signRes = await fetch('/api/videos/sign-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sopId,
          stepId: currentStepId,
          file: 'image' as const,
          imageContentType: imageCt,
        }),
      })
      if (!signRes.ok) throw new Error('Failed to get image upload URL')
      const { signedUrl, storagePath } = (await signRes.json()) as {
        signedUrl: string
        storagePath: string
      }
      const putRes = await fetch(signedUrl, {
        method: 'PUT',
        body: blob,
        headers: { 'Content-Type': imageCt },
      })
      if (!putRes.ok) throw new Error('Image upload failed')

      await markImageUploaded(currentStepId)
      setSteps((prev) =>
        prev.map((s) =>
          s.id === currentStepId ? { ...s, image_path: storagePath } : s
        )
      )
      loadImageUrl(storagePath)
      if (editAsDraft) {
        setHasUnsavedChanges(true)
      } else {
        const { error } = await supabase
          .from('sop_steps')
          .update({ image_path: storagePath })
          .eq('id', currentStepId)
        if (error) {
          console.error('Failed to persist image_path to DB:', error)
        } else {
          loadSOP()
        }
      }
    } catch (err) {
      console.error('Error uploading image:', err)
      loadLocalImage()
    }
  }

  async function handleCut() {
    if (!isVideoCutEnabled) return
    if (!currentStepId || !currentStep || currentStep.image_path) return
    const duration = videoDuration || currentStep.duration_ms || 0
    if (duration <= 0 || startTime >= endTime || endTime > duration) return
    setCutError(null)
    setCutProgress(0)

    if (isOffline) {
      setCutError('Cut requires internet connection (server-side processing).')
      return
    }

    const cutLen = endTime - startTime
    const newDuration = duration - cutLen
    const cutStartMs = startTime
    const cutEndMs = endTime
    const stepId = currentStepId
    const t = currentTime

    try {
      // Server-side cut (native ffmpeg). Optional async job + poll on Vercel for long runs.
      const res = await fetch('/api/videos/cut', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sopId,
          stepId,
          startMs: cutStartMs,
          endMs: cutEndMs,
          ...(isVideoCutAsync ? { async: true } : {}),
        }),
      })

      if (res.status === 202) {
        const { jobId } = (await res.json()) as { jobId: string }
        const deadline = Date.now() + 5 * 60 * 1000
        let lastStatus = 'pending'
        while (Date.now() < deadline) {
          setCutProgress(50)
          await new Promise((r) => setTimeout(r, 600))
          const jr = await fetch(`/api/videos/jobs/${jobId}`)
          if (!jr.ok) continue
          const j = (await jr.json()) as { status: string; error?: string | null }
          lastStatus = j.status
          if (j.status === 'completed') break
          if (j.status === 'failed') throw new Error(j.error ?? 'Cut failed')
        }
        if (lastStatus !== 'completed') {
          throw new Error('Cut timed out — try again or use a shorter clip')
        }
      } else if (!res.ok) {
        const text = await res.text()
        let msg = text
        try {
          const j = JSON.parse(text) as { error?: string }
          msg = j.error ?? text
        } catch {}
        throw new Error(msg || `Cut failed (HTTP ${res.status})`)
      }

      setSteps((prev) =>
        prev.map((s) => (s.id === stepId ? { ...s, duration_ms: newDuration } : s))
      )
      setAnnotations((prev) => {
        const stepAnns = prev[stepId] || []
        const updated = stepAnns
          .filter((ann) => {
            if (ann.t_end_ms <= cutStartMs) return true
            if (ann.t_start_ms >= cutEndMs) return true
            return false
          })
          .map((ann) => {
            if (ann.t_start_ms >= cutEndMs) {
              return {
                ...ann,
                t_start_ms: ann.t_start_ms - cutLen,
                t_end_ms: ann.t_end_ms - cutLen,
              }
            }
            return ann
          })
        return { ...prev, [stepId]: updated }
      })
      setStartTime(0)
      setEndTime(newDuration)
      setCutMode(false)
      setCurrentTime(Math.min(t, cutStartMs >= t ? t : Math.max(0, t - cutLen)))

      // Video is overwritten in storage at the same path; refresh URL.
      loadVideoUrl(currentStep.video_path ?? '')

      await regenerateAndUploadThumbnailFromStorage(stepId)
    } catch (err) {
      setCutError(err instanceof Error ? err.message : 'Cut failed')
    } finally {
      setCutProgress(null)
    }
  }

  async function handleSpeedSegment() {
    if (!isVideoCutEnabled) return
    if (!currentStepId || !currentStep || currentStep.image_path) return
    const duration = videoDuration || currentStep.duration_ms || 0
    if (duration <= 0 || startTime >= endTime || endTime > duration) return
    setSpeedError(null)
    setSpeedProgress(0)

    if (isOffline) {
      setSpeedError('Speed change requires internet (server-side processing).')
      setSpeedProgress(null)
      return
    }

    const t0 = startTime
    const t1 = endTime
    const L = t1 - t0
    const S = speedFactor
    const delta = L - L / S
    const newDuration = duration - delta
    const stepId = currentStepId
    const t = currentTime

    try {
      const res = await fetch('/api/videos/speed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sopId,
          stepId,
          startMs: t0,
          endMs: t1,
          speedFactor: S,
          ...(isVideoCutAsync ? { async: true } : {}),
        }),
      })

      if (res.status === 202) {
        const { jobId } = (await res.json()) as { jobId: string }
        const deadline = Date.now() + 5 * 60 * 1000
        let lastStatus = 'pending'
        while (Date.now() < deadline) {
          setSpeedProgress(50)
          await new Promise((r) => setTimeout(r, 600))
          const jr = await fetch(`/api/videos/jobs/${jobId}`)
          if (!jr.ok) continue
          const j = (await jr.json()) as { status: string; error?: string | null }
          lastStatus = j.status
          if (j.status === 'completed') break
          if (j.status === 'failed') throw new Error(j.error ?? 'Speed change failed')
        }
        if (lastStatus !== 'completed') {
          throw new Error('Timed out — try again or use a shorter segment')
        }
      } else if (!res.ok) {
        const text = await res.text()
        let msg = text
        try {
          const j = JSON.parse(text) as { error?: string }
          msg = j.error ?? text
        } catch {}
        throw new Error(msg || `Failed (HTTP ${res.status})`)
      }

      setSteps((prev) =>
        prev.map((s) => (s.id === stepId ? { ...s, duration_ms: newDuration } : s))
      )
      setAnnotations((prev) => {
        const stepAnns = prev[stepId] || []
        const updated = stepAnns
          .map((ann) => {
            if (ann.t_end_ms <= t0) return ann
            if (ann.t_start_ms >= t1) {
              return {
                ...ann,
                t_start_ms: ann.t_start_ms - delta,
                t_end_ms: ann.t_end_ms - delta,
              }
            }
            if (ann.t_start_ms >= t0 && ann.t_end_ms <= t1) {
              return {
                ...ann,
                t_start_ms: t0 + (ann.t_start_ms - t0) / S,
                t_end_ms: t0 + (ann.t_end_ms - t0) / S,
              }
            }
            return null
          })
          .filter((a): a is StepAnnotation => a !== null)
        return { ...prev, [stepId]: updated }
      })
      setStartTime(0)
      setEndTime(newDuration)
      setSpeedMode(false)
      {
        let nt = t
        if (t >= t1) nt = t - delta
        else if (t > t0) nt = t0 + (t - t0) / S
        setCurrentTime(Math.min(Math.max(0, nt), newDuration))
      }

      loadVideoUrl(currentStep.video_path ?? '')
      await regenerateAndUploadThumbnailFromStorage(stepId)
    } catch (err) {
      setSpeedError(err instanceof Error ? err.message : 'Speed change failed')
    } finally {
      setSpeedProgress(null)
    }
  }

  async function regenerateAndUploadThumbnailFromStorage(stepId: string) {
    const step = steps.find((s) => s.id === stepId)
    if (!step?.video_path) return
    const res = await fetch(`/api/videos/signed-url?path=${encodeURIComponent(step.video_path)}`)
    if (!res.ok) return
    const { url } = (await res.json()) as { url: string }
    const fileRes = await fetch(url)
    if (!fileRes.ok) return
    const videoBlob = await fileRes.blob()
    const thumbnailBlob = await generateThumbnail(videoBlob)

    const signRes = await fetch('/api/videos/sign-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sopId, stepId, file: 'thumbnail' as const }),
    })
    if (!signRes.ok) return
    const { signedUrl: thumbSignedUrl, storagePath: thumbnailStoragePath } = (await signRes.json()) as {
      signedUrl: string
      storagePath: string
    }
    const putRes = await fetch(thumbSignedUrl, {
      method: 'PUT',
      body: thumbnailBlob,
      headers: { 'Content-Type': 'image/jpeg' },
    })
    if (!putRes.ok) return

    setSteps((prev) =>
      prev.map((s) => (s.id === stepId ? { ...s, thumbnail_path: thumbnailStoragePath } : s))
    )
    if (!editAsDraft) {
      await supabase
        .from('sop_steps')
        .update({ thumbnail_path: thumbnailStoragePath })
        .eq('id', stepId)
    } else {
      setHasUnsavedChanges(true)
    }
  }

  async function uploadTrimmedVideoWithoutCompression(blob: Blob, stepId: string, durationMs: number) {
    if (currentStepId === stepId) {
      loadLocalVideo()
    }
    setStepUploadStatus((prev) => ({ ...prev, [stepId]: 'uploading' }))
    setStepUploadProgress((prev) => ({ ...prev, [stepId]: 0 }))

    try {
      const thumbnailBlob = await generateThumbnail(blob)
      const videoCt = blob.type?.startsWith('video/') ? blob.type : 'video/mp4'

      const [resVideo, resThumb] = await Promise.all([
        fetch('/api/videos/sign-upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sopId,
            stepId,
            file: 'video' as const,
            videoContentType: videoCt,
          }),
        }),
        fetch('/api/videos/sign-upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sopId, stepId, file: 'thumbnail' as const }),
        }),
      ])

      if (!resVideo.ok) throw new Error('Failed to get video upload URL')
      if (!resThumb.ok) throw new Error('Failed to get thumbnail upload URL')

      const { signedUrl: videoSignedUrl, storagePath: videoStoragePath } = await resVideo.json()
      const { signedUrl: thumbSignedUrl, storagePath: thumbnailStoragePath } = await resThumb.json()

      const [videoResp, thumbResp] = await Promise.all([
        fetch(videoSignedUrl, {
          method: 'PUT',
          body: blob,
          headers: { 'Content-Type': videoCt },
        }),
        fetch(thumbSignedUrl, {
          method: 'PUT',
          body: thumbnailBlob,
          headers: { 'Content-Type': 'image/jpeg' },
        }),
      ])
      if (!videoResp.ok) throw new Error('Video upload failed')
      if (!thumbResp.ok) throw new Error('Thumbnail upload failed')

      await markVideoUploaded(stepId)
      setSteps((prev) =>
        prev.map((s) =>
          s.id === stepId
            ? {
                ...s,
                video_path: videoStoragePath,
                thumbnail_path: thumbnailStoragePath,
                duration_ms: durationMs,
              }
            : s
        )
      )
      loadVideoUrl(videoStoragePath)
      if (editAsDraft) {
        setHasUnsavedChanges(true)
      } else {
        const { error } = await supabase
          .from('sop_steps')
          .update({
            video_path: videoStoragePath,
            thumbnail_path: thumbnailStoragePath,
            duration_ms: durationMs,
          })
          .eq('id', stepId)
        if (!error) loadSOP()
      }
      setStepUploadStatus((prev) => ({ ...prev, [stepId]: null }))
      setStepUploadProgress((prev) => ({ ...prev, [stepId]: 0 }))
      setStepUploadResult((prev) => ({ ...prev, [stepId]: 'original' }))
      setStepUploadSizes((prev) => ({ ...prev, [stepId]: { before: blob.size, after: blob.size } }))
      setTimeout(() => {
        setStepUploadResult((prev) => ({ ...prev, [stepId]: null }))
        setStepUploadSizes((prev) => ({ ...prev, [stepId]: null }))
      }, 5000)
    } catch (err) {
      console.error('Upload trimmed video failed:', err)
      setStepUploadStatus((prev) => ({ ...prev, [stepId]: 'failed' }))
    }
  }

  async function processAndUploadVideo(blob: Blob, stepId: string, durationMs: number) {
    if (currentStepId === stepId) {
      loadLocalVideo()
    }
    setStepUploadStatus((prev) => ({ ...prev, [stepId]: 'compressing' }))
    setStepUploadProgress((prev) => ({ ...prev, [stepId]: 0 }))

    try {
      let videoBlob: Blob
      let usedCompression = false
      try {
        videoBlob = await compressVideoWithMediabunny(blob, {
          onProgress: (p) => {
            setStepUploadProgress((prev) => ({ ...prev, [stepId]: Math.round(p * 100) }))
          },
        })
        usedCompression = true
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('Compression skipped:', err)
        }
        videoBlob = blob
      }

      setStepUploadStatus((prev) => ({ ...prev, [stepId]: 'uploading' }))
      setStepUploadProgress((prev) => ({ ...prev, [stepId]: 0 }))
      const thumbnailBlob = await generateThumbnail(videoBlob)
      const videoCt = videoBlob.type?.startsWith('video/') ? videoBlob.type : 'video/mp4'

      const [resVideo, resThumb] = await Promise.all([
        fetch('/api/videos/sign-upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sopId,
            stepId,
            file: 'video' as const,
            videoContentType: videoCt,
          }),
        }),
        fetch('/api/videos/sign-upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sopId, stepId, file: 'thumbnail' as const }),
        }),
      ])

      if (!resVideo.ok) throw new Error('Failed to get video upload URL')
      if (!resThumb.ok) throw new Error('Failed to get thumbnail upload URL')

      const { signedUrl: videoSignedUrl, storagePath: videoStoragePath } = await resVideo.json()
      const { signedUrl: thumbSignedUrl, storagePath: thumbnailStoragePath } = await resThumb.json()

      const [videoResp, thumbResp] = await Promise.all([
        fetch(videoSignedUrl, {
          method: 'PUT',
          body: videoBlob,
          headers: { 'Content-Type': videoCt },
        }),
        fetch(thumbSignedUrl, {
          method: 'PUT',
          body: thumbnailBlob,
          headers: { 'Content-Type': 'image/jpeg' },
        }),
      ])
      if (!videoResp.ok) throw new Error('Video upload failed')
      if (!thumbResp.ok) throw new Error('Thumbnail upload failed')

      await markVideoUploaded(stepId)
      setSteps((prev) =>
        prev.map((s) =>
          s.id === stepId
            ? {
                ...s,
                video_path: videoStoragePath,
                thumbnail_path: thumbnailStoragePath,
                duration_ms: durationMs,
              }
            : s
        )
      )
      loadVideoUrl(videoStoragePath)
      if (editAsDraft) {
        setHasUnsavedChanges(true)
      } else {
        const { error } = await supabase
          .from('sop_steps')
          .update({
            video_path: videoStoragePath,
            thumbnail_path: thumbnailStoragePath,
            duration_ms: durationMs,
          })
          .eq('id', stepId)
        if (!error) loadSOP()
      }
      setStepUploadStatus((prev) => ({ ...prev, [stepId]: null }))
      setStepUploadProgress((prev) => ({ ...prev, [stepId]: 0 }))
      setStepUploadResult((prev) => ({ ...prev, [stepId]: usedCompression ? 'compressed' : 'original' }))
      setStepUploadSizes((prev) => ({ ...prev, [stepId]: { before: blob.size, after: videoBlob.size } }))
      setTimeout(() => {
        setStepUploadResult((prev) => ({ ...prev, [stepId]: null }))
        setStepUploadSizes((prev) => ({ ...prev, [stepId]: null }))
      }, 5000)
    } catch (err) {
      console.error('Error in video pipeline:', err)
      setStepUploadStatus((prev) => ({ ...prev, [stepId]: 'failed' }))
      setStepUploadProgress((prev) => ({ ...prev, [stepId]: 0 }))
      // Blob remains in IndexedDB for retry
    }
  }

  function handleStepInstructionsChange(stepId: string, instructions: string) {
    stepInstructionsRef.current = instructions
    setSteps((prev) =>
      prev.map((s) => (s.id === stepId ? { ...s, instructions } : s))
    )
    if (editAsDraft) setHasUnsavedChanges(true)
  }

  async function handleStepInstructionsBlur(stepId: string) {
    if (editAsDraft) return
    const value = stepInstructionsRef.current
    if (isOffline) return
    await supabase
      .from('sop_steps')
      .update({ instructions: value || null })
      .eq('id', stepId)
  }

  async function handleAddStep() {
    const newIdx = steps.length
    const newStepId = nanoid()
    const newStep: SOPStep = {
      id: newStepId,
      sop_id: sopId,
      idx: newIdx,
      title: `Step ${newIdx + 1}`,
    }

    if (editAsDraft) {
      setSteps((prev) => [...prev, newStep])
      setCurrentStepId(newStepId)
      setAnnotations((prev) => ({ ...prev, [newStepId]: [] }))
      setHasUnsavedChanges(true)
      return
    }
    if (isOffline) {
      const draft = await getDraft(sopId)
      if (draft) {
        draft.steps.push({
          id: newStepId,
          idx: newIdx,
          title: `Step ${newIdx + 1}`,
          annotations: [],
        })
        await saveDraft(draft)
      }
      setSteps((prev) => [...prev, newStep])
      setCurrentStepId(newStepId)
      setAnnotations((prev) => ({ ...prev, [newStepId]: [] }))
      return
    }
    const { data, error } = await supabase
      .from('sop_steps')
      .insert({ sop_id: sopId, idx: newIdx, title: newStep.title })
      .select()
      .single()

    if (!error && data) {
      setSteps((prev) => [...prev, data as SOPStep])
      setCurrentStepId(data.id)
      setAnnotations((prev) => ({ ...prev, [data.id]: [] }))
    }
  }

  async function handleDeleteStep(stepId: string, e?: React.MouseEvent) {
    e?.stopPropagation()
    if (steps.length <= 1) return
    if (editAsDraft) {
      setSteps((prev) => prev.filter((s) => s.id !== stepId))
      setAnnotations((prev) => {
        const next = { ...prev }
        delete next[stepId]
        return next
      })
      if (currentStepId === stepId) {
        const remaining = steps.filter((s) => s.id !== stepId)
        setCurrentStepId(remaining[0]?.id ?? null)
        setVideoUrl(null)
        setImageUrl(null)
      }
      setHasUnsavedChanges(true)
      await deleteVideoBlob(stepId)
      await deleteImageBlob(stepId)
      return
    }
    if (isOffline) {
      const draft = await getDraft(sopId)
      if (draft) {
        draft.steps = draft.steps.filter((s) => s.id !== stepId)
        await saveDraft(draft)
      }
      setSteps((prev) => prev.filter((s) => s.id !== stepId))
      setAnnotations((prev) => {
        const next = { ...prev }
        delete next[stepId]
        return next
      })
      if (currentStepId === stepId) {
        const remaining = steps.filter((s) => s.id !== stepId)
        setCurrentStepId(remaining[0]?.id ?? null)
        setVideoUrl(null)
        setImageUrl(null)
      }
      await deleteVideoBlob(stepId)
      await deleteImageBlob(stepId)
      return
    }
    const { error } = await supabase.from('sop_steps').delete().eq('id', stepId)
    if (error) {
      console.error('Error deleting step:', error)
      return
    }
    setSteps((prev) => prev.filter((s) => s.id !== stepId))
    setAnnotations((prev) => {
      const next = { ...prev }
      delete next[stepId]
      return next
    })
    if (currentStepId === stepId) {
      const remaining = steps.filter((s) => s.id !== stepId)
      setCurrentStepId(remaining[0]?.id ?? null)
      setVideoUrl(null)
      setImageUrl(null)
    }
    await deleteVideoBlob(stepId)
    await deleteImageBlob(stepId)
  }

  async function handleAddAnnotation(kind: 'arrow' | 'label') {
    // Get the current step ID directly from state to avoid closure issues
    const stepId = currentStepId
    if (!stepId) {
      console.error('Cannot add annotation: no step selected')
      return
    }

    // Verify the step exists
    const step = steps.find((s) => s.id === stepId)
    if (!step) {
      console.error('Cannot add annotation: step not found', { stepId, steps })
      return
    }

    // Determine default times for new annotation
    let defaultStartTime = startTime
    let defaultEndTime = endTime

    // If start and end are both 0, or if they're the same, set a default 3-second range from current time
    if ((defaultStartTime === 0 && defaultEndTime === 0) || defaultStartTime === defaultEndTime) {
      defaultStartTime = currentTime
      defaultEndTime = Math.min(currentTime + 3000, step.duration_ms || currentTime + 3000)
      setStartTime(defaultStartTime)
      setEndTime(defaultEndTime)
    }

    const newAnn: StepAnnotation = {
      id: nanoid(),
      step_id: stepId, // Use the local variable to ensure we have the correct step ID
      t_start_ms: defaultStartTime,
      t_end_ms: defaultEndTime,
      kind,
      x: 0.5,
      y: kind === 'label' ? 0.22 : 0.5, // Labels start near top to avoid play button; arrows stay centered
      angle: kind === 'arrow' ? 0 : undefined,
      text: kind === 'label' ? 'Label' : undefined,
style: kind === 'arrow'
        ? { color: '#00ff00', strokeWidth: 35 } // Arrow size (toolbar default = starting size)
        : { color: '#ffffff', fontSize: 28 }, // White label, larger default
    }

    // Select the newly created annotation so user can immediately edit its times
    setSelectedAnnotationId(newAnn.id)

    if (process.env.NODE_ENV === 'development') {
      console.log('Adding annotation:', { 
        kind, 
        newAnn, 
        startTime, 
        endTime, 
        currentTime,
        currentStepId: stepId,
        stepTitle: step.title,
        stepIdx: step.idx,
        allSteps: steps.map(s => ({ id: s.id, title: s.title, idx: s.idx }))
      })
    }

    // Get current annotations for this specific step (functional update to avoid races)
    setAnnotations((prev) => {
      const stepAnnotations = prev[stepId] || []
      return { ...prev, [stepId]: [...stepAnnotations, newAnn] }
    })

    if (editAsDraft) {
      setHasUnsavedChanges(true)
      return
    }
    // Save to server only when the step exists in DB and not editing as draft.
    if (!isOffline && isStepIdFromDb(stepId)) {
      const dbAnnotation: Record<string, unknown> = {
        step_id: newAnn.step_id,
        t_start_ms: newAnn.t_start_ms,
        t_end_ms: newAnn.t_end_ms,
        kind: newAnn.kind,
        x: newAnn.x,
        y: newAnn.y,
      }
      if (newAnn.angle !== undefined) dbAnnotation.angle = newAnn.angle
      if (newAnn.text !== undefined) dbAnnotation.text = newAnn.text
      if (newAnn.style) dbAnnotation.style = newAnn.style

      const res = await fetch('/api/annotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dbAnnotation),
      })
      const body = await res.json().catch(() => ({}))
      const data = res.ok ? body : null
      const err = !res.ok ? (body.error ?? res.statusText) : null

      if (err) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error saving annotation:', err, { stepId, dbAnnotation })
        }
      } else if (data?.id) {
        const annotationWithDbId = { ...newAnn, id: data.id }
        setAnnotations(prev => {
          const stepAnnotations = prev[stepId] || []
          return {
            ...prev,
            [stepId]: stepAnnotations.map(ann =>
              ann.id === newAnn.id ? annotationWithDbId : ann
            ),
          }
        })
        setSelectedAnnotationId(prev => (prev === newAnn.id ? data.id : prev))
      }
    }
  }

  async function handleAnnotationUpdate(
    id: string,
    updates: Partial<StepAnnotation>
  ) {
    if (!currentStepId) return

    setAnnotations((prev) => {
      const stepAnns = prev[currentStepId] || []
      const updatedAnns = stepAnns.map((ann) =>
        ann.id === id ? { ...ann, ...updates } : ann
      )
      return { ...prev, [currentStepId]: updatedAnns }
    })

    // If updating times of the selected annotation, sync TimeBar
    if (selectedAnnotationId === id && (updates.t_start_ms !== undefined || updates.t_end_ms !== undefined)) {
      const stepAnns = annotations[currentStepId] || []
      const ann = stepAnns.find((a) => a.id === id)
      if (ann) {
        const updatedAnn = { ...ann, ...updates }
        if (updates.t_start_ms !== undefined) {
          setStartTime(updatedAnn.t_start_ms)
        }
        if (updates.t_end_ms !== undefined) {
          setEndTime(updatedAnn.t_end_ms)
        }
      }
    }

    if (editAsDraft) {
      setHasUnsavedChanges(true)
      return
    }
    // Save to server when not editing as draft
    if (!isOffline) {
      const isSavedToDb = isAnnotationIdFromDb(id)
      if (isSavedToDb) {
        const cleanUpdates: Record<string, unknown> = {}
        if ('x' in updates && typeof updates.x === 'number') {
          cleanUpdates.x = Math.max(0, Math.min(1, updates.x))
        }
        if ('y' in updates && typeof updates.y === 'number') {
          cleanUpdates.y = Math.max(0, Math.min(1, updates.y))
        }
        if ('angle' in updates) cleanUpdates.angle = updates.angle ?? null
        if ('text' in updates) cleanUpdates.text = updates.text ?? null
        if ('style' in updates) cleanUpdates.style = updates.style ?? null
        if ('t_start_ms' in updates && typeof updates.t_start_ms === 'number') {
          cleanUpdates.t_start_ms = Math.round(updates.t_start_ms)
        }
        if ('t_end_ms' in updates && typeof updates.t_end_ms === 'number') {
          cleanUpdates.t_end_ms = Math.round(updates.t_end_ms)
        }
        if (Object.keys(cleanUpdates).length > 0) {
          await supabase.from('step_annotations').update(cleanUpdates).eq('id', id)
        }
      }
    }
  }

  async function handleAnnotationDelete(id: string) {
    if (!currentStepId) return

    setAnnotations((prev) => {
      const stepAnns = prev[currentStepId] || []
      return { ...prev, [currentStepId]: stepAnns.filter((ann) => ann.id !== id) }
    })

    if (editAsDraft) {
      setHasUnsavedChanges(true)
      return
    }
    if (!isOffline && isAnnotationIdFromDb(id)) {
      await supabase.from('step_annotations').delete().eq('id', id)
    }
  }

  async function saveDraftState() {
    if (!sop) return

    const draft: DraftSOP = {
      id: sop.id,
      title: sop.title,
      description: sop.description,
      steps: steps.map((step) => ({
        id: step.id,
        idx: step.idx,
        title: step.title,
        instructions: step.instructions,
        videoPath: step.video_path,
        thumbnailPath: step.thumbnail_path,
        imagePath: step.image_path,
        duration_ms: step.duration_ms,
        annotations: annotations[step.id] || [],
      })),
      lastModified: Date.now(),
    }

    await saveDraft(draft)
  }

  async function handleUpdateDraft() {
    if (!sop) return
    setUpdateStatus('saving')
    try {
      const payload = {
        title: sop.title,
        description: sop.description ?? null,
        steps: steps.map((s) => ({
          id: s.id,
          idx: s.idx,
          title: s.title,
          instructions: s.instructions ?? null,
          video_path: s.video_path ?? null,
          thumbnail_path: s.thumbnail_path ?? null,
          image_path: s.image_path ?? null,
          duration_ms: s.duration_ms ?? null,
        })),
        annotations: Object.fromEntries(
          steps.map((step) => [
            step.id,
            (annotations[step.id] || []).map((a) => ({
              t_start_ms: a.t_start_ms,
              t_end_ms: a.t_end_ms,
              kind: a.kind,
              x: a.x,
              y: a.y,
              angle: a.angle,
              text: a.text,
              style: a.style,
            })),
          ])
        ),
      }
      const res = await fetch(`/api/sops/${sopId}/sync`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = res.ok ? await res.json() : null
      if (!res.ok) throw new Error((data as { error?: string })?.error ?? res.statusText)
      const newStepIds = (data as { newStepIds?: Record<string, string> })?.newStepIds ?? {}
      if (Object.keys(newStepIds).length > 0) {
        setSteps((prev) =>
          prev.map((s) => ({ ...s, id: newStepIds[s.id] ?? s.id }))
        )
        setAnnotations((prev) => {
          const next: Record<string, StepAnnotation[]> = {}
          for (const [stepId, anns] of Object.entries(prev)) {
            const finalId = newStepIds[stepId] ?? stepId
            next[finalId] = anns.map((a) => ({ ...a, step_id: finalId }))
          }
          return next
        })
        setCurrentStepId((id) => (id ? newStepIds[id] ?? id : null))
      }
      setHasUnsavedChanges(false)
      setUpdateStatus('updated')
    } catch (err) {
      console.error('Sync failed:', err)
      setUpdateStatus('idle')
    }
  }

  async function handlePublishOrUpdate() {
    if (!sop) return

    if (editAsDraft) {
      // 1) Sync the full draft (title, steps, annotations) to the DB
      await handleUpdateDraft()

      // 2) If SOP is not published yet, publish it now so it appears on the dashboard
      if (!sop.published) {
        const shareSlug = sop.share_slug || nanoid(8)
        const { error } = await supabase
          .from('sops')
          .update({
            title: sop.title,
            description: sop.description ?? null,
            published: true,
            share_slug: shareSlug,
          })
          .eq('id', sop.id)

        if (!error) {
          setSop((prev) =>
            prev ? { ...prev, published: true, share_slug: shareSlug } : prev
          )
        }
      }

      // 3) Clear local draft and go back to dashboard
      await deleteDraft(sopId)
      router.push('/dashboard')
      return
    }

    if (sop.published) {
      const { error } = await supabase
        .from('sops')
        .update({ title: sop.title, description: sop.description ?? null })
        .eq('id', sop.id)
      if (!error) setUpdateStatus('updated')
      setTimeout(() => setUpdateStatus('idle'), 2000)
      return
    }

    const shareSlug = sop.share_slug || nanoid(8)
    const { error } = await supabase
      .from('sops')
      .update({ published: true, share_slug: shareSlug })
      .eq('id', sop.id)

    if (!error) {
      setSop({ ...sop, published: true, share_slug: shareSlug })
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center safe-top safe-bottom bg-gray-50 dark:bg-gray-900">
        <p className="text-gray-600 dark:text-gray-400">Loading...</p>
      </div>
    )
  }

  if (!sop) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center safe-top safe-bottom p-4 bg-gray-50 dark:bg-gray-900">
        <p className="text-gray-600 dark:text-gray-400 mb-4">SOP not found</p>
        <button
          onClick={() => router.push('/dashboard')}
          className="text-blue-600 dark:text-blue-400 touch-target font-medium"
        >
          Back to dashboard
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen min-h-[100dvh] safe-top safe-bottom safe-left safe-right bg-gray-50 dark:bg-gray-900">
      {!canEdit && (
        <div className="z-10 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800 px-2 py-1.5 text-center text-xs text-blue-800 dark:text-blue-200">
          View only — only the owner or a super user can edit this SOP
        </div>
      )}
      {/* Sticky header - thin */}
      <div className="z-20 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between px-2 py-1.5 min-h-[44px]">
          <button
            onClick={() => router.push('/dashboard')}
            className="text-blue-600 dark:text-blue-400 touch-target px-2 py-1.5 min-w-[44px] text-sm font-medium shrink-0"
            aria-label="Back to dashboard"
          >
            ← Back
          </button>
          {canEdit ? (
            <input
              type="text"
              value={sop.title}
              onChange={(e) => {
                setSop((prev) => (prev ? { ...prev, title: e.target.value } : null))
                if (editAsDraft) setHasUnsavedChanges(true)
              }}
              className="flex-1 min-w-0 text-center font-semibold text-xs px-0.5 py-0.5 bg-transparent border border-transparent rounded focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="SOP title"
            />
          ) : (
            <h1 className="flex-1 text-center font-semibold text-xs truncate px-0.5">
              {sop.title}
            </h1>
          )}
          <div className="flex items-center gap-0.5">
            {isOffline && (
              <span className="text-[10px] bg-yellow-200 dark:bg-yellow-800 px-1 py-0.5 rounded">
                Offline
              </span>
            )}
            {canEdit && (
              <button
                onClick={handlePublishOrUpdate}
                disabled={updateStatus === 'saving'}
                className={`px-1.5 py-1.5 rounded text-xs min-w-[40px] ${
                  updateStatus === 'updated'
                    ? 'bg-yellow-500 text-black'
                    : updateStatus === 'saving'
                    ? 'bg-gray-400 dark:bg-gray-600 text-white'
                    : editAsDraft
                    ? hasUnsavedChanges
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-300 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                    : sop.published
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-300 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                }`}
              >
                {updateStatus === 'saving'
                  ? 'Saving…'
                  : updateStatus === 'updated'
                  ? 'Updated'
                  : sop.published
                  ? 'Update'
                  : 'Publish'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Step chips: wrap to next line when no space */}
      <div className="px-2 py-1.5 safe-left safe-right">
        <div className="flex flex-wrap gap-2 items-center">
          {steps.map((step, i) => (
            <button
              key={step.id}
              type="button"
              onClick={() => setCurrentStepId(step.id)}
              className={`px-3 py-1.5 rounded-lg touch-target whitespace-nowrap text-sm ${
                currentStepId === step.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100'
              }`}
            >
              {i + 1}
            </button>
          ))}
          {canEdit && (
            <>
              <button
                type="button"
                onClick={handleAddStep}
                className="px-3 py-1.5 rounded-lg bg-gray-200 dark:bg-gray-700 touch-target whitespace-nowrap text-sm"
              >
                <span className="md:hidden">Add</span>
                <span className="hidden md:inline">+ Add Step</span>
              </button>
              {steps.length > 1 && currentStepId && (
                <button
                  type="button"
                  onClick={() => handleDeleteStep(currentStepId)}
                  className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white touch-target"
                  aria-label="Delete current step"
                >
                  🗑️
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Main editor: title + description at top, then video + timeline */}
      {currentStep && (
        <div className="p-2 md:p-3 space-y-2 md:space-y-3">
          <h2 className="text-xl md:text-lg font-semibold truncate">{currentStep.title}</h2>

          <textarea
            id="step-description"
            value={currentStep.instructions ?? ''}
            onChange={(e) => handleStepInstructionsChange(currentStep.id, e.target.value)}
            onBlur={() => handleStepInstructionsBlur(currentStep.id)}
            placeholder="Describe what to do in this step…"
            rows={2}
            readOnly={!canEdit}
            className="w-full min-h-[52px] md:min-h-[64px] px-3 text-xl bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 touch-target resize-y disabled:opacity-90 disabled:cursor-not-allowed"
            autoComplete="off"
          />

          {/* Video or image + timeline (timeline only for video) */}
          {!currentStep.video_path && !videoUrl && !currentStep.image_path && !imageUrl ? (
            canEdit ? (
              <div className="-mx-3 md:mx-0">
                <VideoCapture
                  stepId={currentStep.id}
                  sopId={sopId}
                  onVideoCaptured={handleVideoCaptured}
                  onImageCaptured={handleImageCaptured}
                  existingVideoPath={currentStep.video_path}
                  existingImagePath={currentStep.image_path}
                />
              </div>
            ) : (
              <div className="w-full aspect-video bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center text-gray-500">
                No media for this step
              </div>
            )
          ) : (
            <div className="space-y-1">
              <div className="w-full rounded-lg overflow-hidden shadow-lg bg-black">
                <StepPlayer
                  // Pass both; StepPlayer prefers image when imageUrl is present.
                  videoUrl={videoUrl}
                  imageUrl={imageUrl}
                  annotations={currentAnnotations}
                  currentTime={currentTime}
                  startTime={startTime}
                  endTime={endTime}
                  onAnnotationUpdate={handleAnnotationUpdate}
                  onAnnotationDelete={handleAnnotationDelete}
                  selectedAnnotationId={selectedAnnotationId}
                  onSelectAnnotation={setSelectedAnnotationId}
                  onTimeUpdate={setCurrentTime}
                  onDurationUpdate={setVideoDuration}
                  showControls={false}
                  seekTime={currentTime}
                  filterAnnotationsByTime={!canEdit}
                  playbackRate={playbackRate}
                />
              </div>
              {!currentStep.image_path && (videoUrl || currentStep.video_path) && (
                <div className="flex flex-wrap items-center gap-2 py-1 px-0.5">
                  <span className="text-xs text-gray-600 dark:text-gray-400 shrink-0">Preview speed</span>
                  <div className="flex flex-wrap gap-1">
                    {VIDEO_PREVIEW_SPEEDS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setPlaybackRate(s)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold touch-target min-w-[40px] ${
                          playbackRate === s
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
                        }`}
                      >
                        {s === 1 ? '1×' : `${s}×`}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {!currentStep.image_path && (
                <>
                {isVideoCutEnabled && (
                <>
                {/* Cut mode: scissors toggles timeline for selecting segment to remove; Cut removes it */}
                <div className="flex flex-wrap items-center gap-2 py-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (cutMode) {
                        setCutMode(false)
                        setCutError(null)
                      } else {
                        const dur = videoDuration || currentStep.duration_ms || 0
                        setSpeedMode(false)
                        setSpeedError(null)
                        setCutMode(true)
                        setCutError(null)
                        setStartTime(currentTime)
                        setEndTime(Math.min(currentTime + 2000, dur))
                        setTimelineDragMode('seek')
                      }
                    }}
                    className={`p-2 rounded-lg touch-target transition-colors ${
                      cutMode
                        ? 'bg-amber-500 text-white ring-2 ring-amber-400 ring-offset-2'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                    }`}
                    title={cutMode ? 'Exit cut mode' : 'Set range to cut from video'}
                    aria-label={cutMode ? 'Exit cut mode' : 'Cut video'}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 9l6 6 4-4M4 4l4 4M20 20l-4-4M6 9a3 3 0 100-6 3 3 0 000 6zM18 15a3 3 0 100-6 3 3 0 000 6z" />
                    </svg>
                  </button>
                  {cutMode && (
                    <span className="text-sm text-amber-700 dark:text-amber-300 font-medium">
                      Select range to remove, then press Cut
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (speedMode) {
                        setSpeedMode(false)
                        setSpeedError(null)
                      } else {
                        const dur = videoDuration || currentStep.duration_ms || 0
                        setCutMode(false)
                        setCutError(null)
                        setSpeedMode(true)
                        setSpeedError(null)
                        setStartTime(currentTime)
                        setEndTime(Math.min(currentTime + 2000, dur))
                        setTimelineDragMode('seek')
                      }
                    }}
                    className={`p-2 rounded-lg touch-target transition-colors ${
                      speedMode
                        ? 'bg-violet-500 text-white ring-2 ring-violet-400 ring-offset-2'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                    }`}
                    title={speedMode ? 'Exit speed mode' : 'Speed up a segment'}
                    aria-label={speedMode ? 'Exit speed mode' : 'Speed up segment'}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </button>
                  {speedMode && (
                    <span className="text-sm text-violet-700 dark:text-violet-300 font-medium">
                      Select range, pick factor, Apply
                    </span>
                  )}
                </div>
                </>
                )}
                <TimeBar
                  duration={videoDuration || currentStep.duration_ms || 0}
                  currentTime={currentTime}
                  startTime={startTime}
                  endTime={endTime}
                  onStartTimeChange={(time) => {
                    if (isVideoCutEnabled && (cutMode || speedMode)) {
                      setStartTime(time)
                    } else if (selectedAnnotationId) {
                      handleAnnotationUpdate(selectedAnnotationId, { t_start_ms: time })
                    } else {
                      setStartTime(time)
                    }
                  }}
                  onEndTimeChange={(time) => {
                    if (isVideoCutEnabled && (cutMode || speedMode)) {
                      setEndTime(time)
                    } else if (selectedAnnotationId) {
                      handleAnnotationUpdate(selectedAnnotationId, { t_end_ms: time })
                    } else {
                      setEndTime(time)
                    }
                  }}
                  onSeek={setCurrentTime}
                  dragMode={timelineDragMode}
                  onDragModeChange={setTimelineDragMode}
                  disabled={!canEdit || ((!(isVideoCutEnabled && (cutMode || speedMode))) && !selectedAnnotationId)}
                  selectionHint={
                    isVideoCutEnabled && cutMode
                      ? 'Range to remove from video'
                      : isVideoCutEnabled && speedMode
                        ? 'Range to speed up (encoded)'
                        : selectedAnnotationId
                        ? (() => {
                            const ann = (currentAnnotations || []).find((a) => a.id === selectedAnnotationId)
                            return ann ? `Editing selected ${ann.kind}` : undefined
                          })()
                        : undefined
                  }
                />
                {isVideoCutEnabled && cutMode && (
                  <div className="flex flex-wrap items-center gap-2 py-1.5">
                    <button
                      type="button"
                      onClick={handleCut}
                      disabled={cutProgress !== null || speedProgress !== null || startTime >= endTime}
                      className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold touch-target"
                    >
                      {cutProgress !== null ? `Cutting… ${cutProgress}%` : 'Cut'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setCutMode(false); setCutError(null) }}
                      disabled={cutProgress !== null || speedProgress !== null}
                      className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-medium touch-target disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    {cutError && (
                      <span className="text-sm text-red-600 dark:text-red-400">{cutError}</span>
                    )}
                  </div>
                )}
                {isVideoCutEnabled && speedMode && (
                  <div className="flex flex-col gap-2 py-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-gray-600 dark:text-gray-400 shrink-0">Encode ×</span>
                      <div className="flex flex-wrap gap-1">
                        {SEGMENT_SPEED_FACTORS.map((f) => (
                          <button
                            key={f}
                            type="button"
                            onClick={() => setSpeedFactor(f)}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold touch-target min-w-[40px] ${
                              speedFactor === f
                                ? 'bg-violet-600 text-white'
                                : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
                            }`}
                          >
                            {f}×
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleSpeedSegment()}
                        disabled={speedProgress !== null || cutProgress !== null || startTime >= endTime}
                        className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold touch-target"
                      >
                        {speedProgress !== null ? `Processing… ${speedProgress}%` : 'Apply speed'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setSpeedMode(false); setSpeedError(null) }}
                        disabled={speedProgress !== null || cutProgress !== null}
                        className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-medium touch-target disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      {speedError && (
                        <span className="text-sm text-red-600 dark:text-red-400">{speedError}</span>
                      )}
                    </div>
                  </div>
                )}
              {currentStepId && canEdit && (() => {
                const status = stepUploadStatus[currentStepId]
                const progress = stepUploadProgress[currentStepId] ?? 0
                const result = stepUploadResult[currentStepId]
                if (status === 'compressing' || status === 'uploading') {
                  return (
                    <div className="flex items-center gap-2 py-1.5 px-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm text-blue-800 dark:text-blue-200">
                      <span>{status === 'compressing' ? 'Compressing…' : 'Uploading…'}</span>
                      {progress > 0 && <span>{progress}%</span>}
                    </div>
                  )
                }
                if (status === 'failed') {
                  return (
                    <div className="flex items-center gap-2 py-1.5 px-2 bg-red-50 dark:bg-red-900/20 rounded-lg text-sm text-red-800 dark:text-red-200">
                      <span>Upload failed.</span>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!currentStepId) return
                          const blob = await getVideoBlob(currentStepId)
                          const step = steps.find((s) => s.id === currentStepId)
                          if (blob && step) {
                            await processAndUploadVideo(blob, currentStepId, step.duration_ms ?? 0)
                          }
                        }}
                        className="font-medium underline touch-target"
                      >
                        Retry
                      </button>
                    </div>
                  )
                }
                if (result === 'compressed' || result === 'original') {
                  const sizes = stepUploadSizes[currentStepId]
                  return (
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-1.5 px-2 bg-green-50 dark:bg-green-900/20 rounded-lg text-sm text-green-800 dark:text-green-200">
                      <span>
                        {result === 'compressed'
                          ? 'Uploaded (compressed)'
                          : 'Uploaded (original — compression skipped)'}
                      </span>
                      {sizes && (
                        <span className="text-green-700 dark:text-green-300">
                          {formatBytes(sizes.before)} → {formatBytes(sizes.after)}
                          {result === 'compressed' && sizes.after < sizes.before && (
                            <span className="ml-0.5">
                              ({Math.round((1 - sizes.after / sizes.before) * 100)}% smaller)
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  )
                }
                return null
              })()}
              </> )}
            </div>
          )}

          {(currentStep.video_path || currentStep.image_path) && (videoUrl || imageUrl) && canEdit && (
              <AnnotToolbar
                onAddArrow={() => handleAddAnnotation('arrow')}
                onAddLabel={() => handleAddAnnotation('label')}
                onDelete={() => {
                  if (selectedAnnotationId) {
                    handleAnnotationDelete(selectedAnnotationId)
                    setSelectedAnnotationId(null)
                  }
                }}
                hasSelection={!!selectedAnnotationId}
                selectedLabelText={
                  selectedAnnotationId
                    ? (() => {
                        const ann = currentAnnotations.find((a) => a.id === selectedAnnotationId)
                        return ann?.kind === 'label' ? (ann.text ?? '') : undefined
                      })()
                    : undefined
                }
                onLabelTextChange={
                  selectedAnnotationId
                    ? (text) => handleAnnotationUpdate(selectedAnnotationId, { text })
                    : undefined
                }
                selectedAnnotationKind={
                  selectedAnnotationId
                    ? currentAnnotations.find((a) => a.id === selectedAnnotationId)?.kind
                    : undefined
                }
                selectedAnnotationStyle={
                  selectedAnnotationId
                    ? currentAnnotations.find((a) => a.id === selectedAnnotationId)?.style
                    : undefined
                }
                onStyleChange={
                  selectedAnnotationId
                    ? (style) => {
                        const ann = currentAnnotations.find((a) => a.id === selectedAnnotationId)
                        if (ann)
                          handleAnnotationUpdate(selectedAnnotationId, {
                            style: { ...ann.style, ...style },
                          })
                      }
                    : undefined
                }
              />
            )}

          {/* Share panel if published */}
          {sop.published && sop.share_slug && (
            <div className="p-2 md:p-3 bg-white dark:bg-gray-800 rounded-lg">
              <h3 className="font-semibold text-sm mb-1">Share this SOP</h3>
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                {typeof window !== 'undefined' &&
                  `${window.location.origin}/sop/${sop.share_slug}`}
              </p>
              <img
                src={`/api/qr?url=${encodeURIComponent(
                  typeof window !== 'undefined'
                    ? `${window.location.origin}/sop/${sop.share_slug}`
                    : ''
                )}`}
                alt="QR code to share this SOP"
                className="w-48 h-48 mx-auto"
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
