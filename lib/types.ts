export interface SOP {
  id: string
  title: string
  description?: string
  owner: string
  published: boolean
  share_slug?: string
  created_at: string
}

export interface SOPStep {
  id: string
  sop_id: string
  idx: number
  title: string
  instructions?: string
  video_path?: string
  duration_ms?: number
}

export interface StepAnnotation {
  id: string
  step_id: string
  t_start_ms: number
  t_end_ms: number
  kind: 'arrow' | 'label'
  x: number // normalized [0..1]
  y: number // normalized [0..1]
  angle?: number // for arrows
  text?: string // for labels
  style?: {
    color?: string
    fontSize?: number
    strokeWidth?: number
  }
}

export interface DraftSOP {
  id: string
  title: string
  description?: string
  steps: DraftStep[]
  lastModified: number
}

export interface DraftStep {
  id: string
  idx: number
  title: string
  instructions?: string
  videoBlob?: Blob
  videoPath?: string
  duration_ms?: number
  annotations: StepAnnotation[]
  uploadStatus?: 'pending' | 'uploading' | 'uploaded' | 'failed'
  uploadProgress?: number
}
