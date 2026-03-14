'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useSupabaseClient } from '@/lib/supabase/client'
import type { SOP, SOPStep, StepAnnotation, DraftSOP, DraftStep } from '@/lib/types'
import { saveDraft, getDraft, getVideoBlob, markVideoUploaded } from '@/lib/idb'
import { nanoid } from 'nanoid'
import VideoCapture from '@/components/VideoCapture'

/** True if id is a DB-generated UUID (not a local nanoid). */
function isAnnotationIdFromDb(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
}
import TimeBar, { type TimelineDragMode } from '@/components/TimeBar'
import AnnotToolbar from '@/components/AnnotToolbar'
import StepPlayer from '@/components/StepPlayer'

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
  const [currentTime, setCurrentTime] = useState(0)
  const [videoDuration, setVideoDuration] = useState(0) // Track actual video duration from video element
  const [startTime, setStartTime] = useState(0)
  const [endTime, setEndTime] = useState(0)
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null)
  const [timelineDragMode, setTimelineDragMode] = useState<TimelineDragMode>('seek')
  const [loading, setLoading] = useState(true)
  const [isOffline, setIsOffline] = useState(false)

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

  // Load video for current step
  useEffect(() => {
    if (!currentStepId) return

    const step = steps.find((s) => s.id === currentStepId)
    if (!step) return

    if (step.video_path) {
      // Load signed URL
      loadVideoUrl(step.video_path)
    } else {
      // Try loading from IndexedDB
      loadLocalVideo()
    }

    // Reset time range when switching steps
    setStartTime(0)
    setEndTime(step.duration_ms || 0)
    setSelectedAnnotationId(null) // Deselect annotation when switching steps
  }, [currentStepId, steps])

  // Sync TimeBar with selected annotation's times
  useEffect(() => {
    if (selectedAnnotationId && currentStepId) {
      const stepAnns = annotations[currentStepId] || []
      const selectedAnn = stepAnns.find((ann) => ann.id === selectedAnnotationId)
      if (selectedAnn) {
        setStartTime(selectedAnn.t_start_ms)
        setEndTime(selectedAnn.t_end_ms)
      }
    }
  }, [selectedAnnotationId, annotations, currentStepId])

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
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }))
        
        // If file not found in storage, try loading from IndexedDB
        if (res.status === 500 && errorData.error === 'Object not found') {
          if (process.env.NODE_ENV === 'development') {
            console.warn('Video not found in storage, trying IndexedDB:', videoPath)
          }
          loadLocalVideo()
        } else {
          if (process.env.NODE_ENV === 'development') {
            console.error('Error loading video URL:', {
              status: res.status,
              error: errorData.error,
              path: videoPath,
            })
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

  const currentStep = steps.find((s) => s.id === currentStepId)
  const currentAnnotations = currentStepId ? annotations[currentStepId] || [] : []

  async function handleVideoCaptured(blob: Blob, duration: number) {
    if (!currentStepId) return

    // Update step with duration
    const updatedSteps = steps.map((s) =>
      s.id === currentStepId ? { ...s, duration_ms: duration } : s
    )
    setSteps(updatedSteps)

    // Upload video
    await uploadVideo(blob, currentStepId)
  }

  async function uploadVideo(blob: Blob, stepId: string) {
    try {
      const filename = `${stepId}-${Date.now()}.mp4`
      const res = await fetch('/api/videos/sign-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, contentType: 'video/mp4' }),
      })

      if (!res.ok) throw new Error('Failed to get upload URL')

      const { signedUrl, storagePath } = await res.json()

      // Upload with progress
      const xhr = new XMLHttpRequest()
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const progress = (e.loaded / e.total) * 100
          // Update step upload status
        }
      })

      await new Promise<void>((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status === 200) {
            resolve()
          } else {
            reject(new Error('Upload failed'))
          }
        }
        xhr.onerror = () => reject(new Error('Upload failed'))
        xhr.open('PUT', signedUrl)
        xhr.setRequestHeader('Content-Type', 'video/mp4')
        xhr.send(blob)
      })

      // Update step with video_path
      const { error } = await supabase
        .from('sop_steps')
        .update({ video_path: storagePath })
        .eq('id', stepId)

      if (!error) {
        await markVideoUploaded(stepId)
        // Update local state immediately so video shows up
        setSteps((prev) =>
          prev.map((s) => (s.id === stepId ? { ...s, video_path: storagePath } : s))
        )
        // Load the video URL right away
        loadVideoUrl(storagePath)
        // Also reload SOP to sync everything
        loadSOP()
      }
    } catch (err) {
      console.error('Error uploading video:', err)
      // Will retry later when online
    }
  }

  async function handleAddStep() {
    const newIdx = steps.length
    const newStepId = nanoid()

    if (isOffline) {
      // Save as draft
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
    } else {
      const { data, error } = await supabase
        .from('sop_steps')
        .insert({
          sop_id: sopId,
          idx: newIdx,
          title: `Step ${newIdx + 1}`,
        })
        .select()
        .single()

      if (!error && data) {
        setSteps([...steps, data as SOPStep])
        setCurrentStepId(data.id)
      }
    }
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
      y: 0.5,
      angle: kind === 'arrow' ? 0 : undefined,
      text: kind === 'label' ? 'Label' : undefined,
      style: kind === 'arrow' 
        ? { color: '#00ff00', strokeWidth: 5 } // Big green arrow
        : { color: '#ffffff', fontSize: 20 }, // White label
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

    // Save to server
    if (!isOffline) {
      // Prepare data for Supabase
      // Don't send 'id' - let Supabase generate UUID, but keep our nanoid for local state
      const dbAnnotation: any = {
        step_id: newAnn.step_id,
        t_start_ms: newAnn.t_start_ms,
        t_end_ms: newAnn.t_end_ms,
        kind: newAnn.kind,
        x: newAnn.x,
        y: newAnn.y,
      }
      
      // Only include optional fields if they have values
      if (newAnn.angle !== undefined) {
        dbAnnotation.angle = newAnn.angle
      }
      if (newAnn.text !== undefined) {
        dbAnnotation.text = newAnn.text
      }
      if (newAnn.style) {
        dbAnnotation.style = newAnn.style
      }
      
      const { data, error } = await supabase
        .from('step_annotations')
        .insert(dbAnnotation)
        .select()
        .single()
      
      if (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error saving annotation:', error, { 
            errorMessage: error.message,
            errorDetails: error.details,
            errorHint: error.hint,
            dbAnnotation, 
            newAnn 
          })
        }
        // Don't throw - annotation is already in local state
      } else if (data) {
        // Update local annotation with Supabase-generated UUID
        // Replace the nanoid with the database UUID so future updates work
        const annotationWithDbId = { ...newAnn, id: data.id }
        // Use stepId variable to ensure we update the correct step's annotations
        setAnnotations(prev => {
          const stepAnnotations = prev[stepId] || []
          const updatedAnnsWithDbId = stepAnnotations.map(ann =>
            ann.id === newAnn.id ? annotationWithDbId : ann
          )
          return { ...prev, [stepId]: updatedAnnsWithDbId }
        })
        // Keep the new annotation selected; its id changed from nanoid to UUID
        setSelectedAnnotationId(prev => (prev === newAnn.id ? data.id : prev))

        if (process.env.NODE_ENV === 'development') {
          console.log('Annotation saved to DB, updated local ID:', { 
            oldId: newAnn.id, 
            newId: data.id,
            stepId,
            stepTitle: step.title,
            data 
          })
        }
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

    // Save to server
    if (!isOffline) {
      const isSavedToDb = isAnnotationIdFromDb(id)
      
      if (isSavedToDb) {
        // Annotation exists in DB - update it
        // Build payload with valid types; DB has x,y in [0,1], times as int
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

        // Only update if there are actual changes
        if (Object.keys(cleanUpdates).length === 0) {
          if (process.env.NODE_ENV === 'development') {
            console.log('No changes to update for annotation:', id)
          }
          return
        }

        const { error } = await supabase
          .from('step_annotations')
          .update(cleanUpdates)
          .eq('id', id)

        if (error) {
          if (process.env.NODE_ENV === 'development') {
            console.error(
              'Error updating annotation:',
              error.message,
              '| code:',
              error.code,
              '| id:',
              id,
              '| updates:',
              cleanUpdates
            )
          }
        } else if (process.env.NODE_ENV === 'development') {
          console.log('Annotation updated successfully:', { id, cleanUpdates })
        }
      } else {
        // Annotation not saved yet - it will be saved when created
        // Just update local state
        if (process.env.NODE_ENV === 'development') {
          console.log('Annotation not yet saved to DB, skipping update:', id)
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

    // Delete from server only if annotation was ever saved (has UUID)
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
        duration_ms: step.duration_ms,
        annotations: annotations[step.id] || [],
      })),
      lastModified: Date.now(),
    }

    await saveDraft(draft)
  }

  async function handlePublish() {
    if (!sop) return

    // Preserve existing share_slug if SOP is already published
    // Only generate a new one if it doesn't exist
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
      {/* Sticky header */}
      <div className="sticky top-0 z-20 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 safe-top">
        <div className="flex items-center justify-between p-4">
          <button
            onClick={() => router.push('/dashboard')}
            className="text-blue-600 dark:text-blue-400 touch-target px-2 min-w-[48px]"
          >
            ← Back
          </button>
          <h1 className="flex-1 text-center font-semibold text-lg truncate">
            {sop.title}
          </h1>
          <div className="flex items-center gap-2">
            {isOffline && (
              <span className="text-xs bg-yellow-200 dark:bg-yellow-800 px-2 py-1 rounded">
                Offline
              </span>
            )}
            <button
              onClick={handlePublish}
              className={`px-3 py-2 rounded-lg touch-target text-sm min-w-[48px] ${
                sop.published
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-300 dark:bg-gray-700'
              }`}
            >
              {sop.published ? 'Published' : 'Publish'}
            </button>
          </div>
        </div>
      </div>

      {/* Step chips: smooth horizontal scroll on Android */}
      <div className="p-4 overflow-x-auto scroll-touch safe-left safe-right">
        <div className="flex gap-2">
          {steps.map((step) => (
            <button
              key={step.id}
              onClick={() => setCurrentStepId(step.id)}
              className={`px-4 py-2 rounded-lg touch-target whitespace-nowrap ${
                currentStepId === step.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700'
              }`}
            >
              {step.title}
            </button>
          ))}
          <button
            onClick={handleAddStep}
            className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 touch-target whitespace-nowrap"
          >
            + Add Step
          </button>
        </div>
      </div>

      {/* Main editor */}
      {currentStep && (
        <div className="p-4 space-y-4">
          <h2 className="text-xl font-semibold">{currentStep.title}</h2>

          {/* Video capture/player */}
          {!currentStep.video_path && !videoUrl ? (
            <VideoCapture
              stepId={currentStep.id}
              sopId={sopId}
              onVideoCaptured={handleVideoCaptured}
            />
          ) : (
            <>
              <StepPlayer
                videoUrl={videoUrl}
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
              />
              <TimeBar
                duration={videoDuration || currentStep.duration_ms || 0}
                currentTime={currentTime}
                startTime={startTime}
                endTime={endTime}
                onStartTimeChange={(time) => {
                  if (selectedAnnotationId) {
                    handleAnnotationUpdate(selectedAnnotationId, { t_start_ms: time })
                  } else {
                    setStartTime(time)
                  }
                }}
                onEndTimeChange={(time) => {
                  if (selectedAnnotationId) {
                    handleAnnotationUpdate(selectedAnnotationId, { t_end_ms: time })
                  } else {
                    setEndTime(time)
                  }
                }}
                onSeek={setCurrentTime}
                dragMode={timelineDragMode}
                onDragModeChange={setTimelineDragMode}
                disabled={!selectedAnnotationId}
                selectionHint={
                  selectedAnnotationId
                    ? (() => {
                        const ann = (currentAnnotations || []).find((a) => a.id === selectedAnnotationId)
                        return ann ? `Editing selected ${ann.kind}` : undefined
                      })()
                    : undefined
                }
              />
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
            </>
          )}

          {/* Share panel if published */}
          {sop.published && sop.share_slug && (
            <div className="p-4 bg-white dark:bg-gray-800 rounded-lg">
              <h3 className="font-semibold mb-2">Share this SOP</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
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
