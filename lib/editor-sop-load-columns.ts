/**
 * Supabase `select()` column lists for the editor SOP bootstrap.
 * Keeps payloads small vs `*` (fewer columns over the wire and in JSON parse).
 */
export const EDITOR_SOP_COLUMNS = [
  'id',
  'sop_number',
  'title',
  'description',
  'owner',
  'published',
  'share_slug',
  'created_at',
  'updated_at',
  'last_edited_by',
].join(',')

export const EDITOR_SOP_STEP_COLUMNS = [
  'id',
  'sop_id',
  'idx',
  'title',
  'kind',
  'instructions',
  'video_path',
  'thumbnail_path',
  'image_path',
  'text_payload',
  'duration_ms',
].join(',')

export const EDITOR_STEP_ANNOTATION_COLUMNS = [
  'id',
  'step_id',
  't_start_ms',
  't_end_ms',
  'kind',
  'x',
  'y',
  'angle',
  'text',
  'style',
].join(',')
