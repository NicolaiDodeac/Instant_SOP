/** Resolved via auth admin API for dashboard / viewer footers */
export interface SopAuthorInfo {
  displayName: string
  email: string | null
  avatarUrl: string | null
}

export interface TrainingModule {
  id: string
  code: string
  name: string
  description?: string | null
  active: boolean
}

export interface MachineFamily {
  id: string
  code: string
  name: string
  supplier?: string | null
  active: boolean
}

export interface Line {
  id: string
  code?: string | null
  name: string
  active: boolean
}

export interface LineLeg {
  id: string
  line_id: string
  code: string
  name: string
  active: boolean
}

export interface Machine {
  id: string
  line_leg_id: string
  machine_family_id: string
  code?: string | null
  name: string
  active: boolean
  machine_family?: MachineFamily
}

export interface MachineFamilyStation {
  id: string
  machine_family_id: string
  station_code: number
  name: string
  section: string
  sort_order?: number | null
  keywords?: string | null
  active: boolean
}

/** Creator, optional last editor (when different from owner), and timestamps */
export interface SopAuthorMeta {
  creator: SopAuthorInfo
  /** Set when the last save was by someone other than the owner (e.g. super user). */
  lastEditor: SopAuthorInfo | null
  created_at: string
  updated_at: string
}

export interface SOP {
  id: string
  /** Stable numeric code for quick communication (OPL / supervisors). */
  sop_number?: number | null
  title: string
  description?: string
  owner: string
  published: boolean
  share_slug?: string
  created_at: string
  /** Server row update time; used to reconcile local IndexedDB drafts */
  updated_at?: string
  /** User who last saved this SOP (sync/publish); may differ from owner */
  last_edited_by?: string | null
}

export interface SOPStep {
  id: string
  sop_id: string
  idx: number
  title: string
  instructions?: string
  video_path?: string
  thumbnail_path?: string
  image_path?: string
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
  /** Set when local state matches last successful PUT /sync (ms since epoch) */
  lastSyncedAt?: number
}

export interface DraftStep {
  id: string
  idx: number
  title: string
  instructions?: string
  videoBlob?: Blob
  videoPath?: string
  thumbnailPath?: string
  imagePath?: string
  duration_ms?: number
  annotations: StepAnnotation[]
  uploadStatus?: 'pending' | 'compressing' | 'uploading' | 'uploaded' | 'failed'
  uploadProgress?: number
}
