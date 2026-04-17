import { z } from 'zod'

/** Max length for explicit machine family `code` (must match API / DB expectations). */
export const MACHINE_FAMILY_MAX_CODE_LEN = 180

/** POST `/api/admin/editors` */
export const adminAddEditorBodySchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Email is required')
    .email('Enter a valid email')
    .transform((s) => s.toLowerCase()),
})

/** DELETE `/api/admin/editors?user_id=` */
export const adminEditorUserIdParamSchema = z.string().uuid()

/** POST `/api/admin/machine-families` */
export const adminCreateMachineFamilyBodySchema = z.object({
  code: z.string().trim().max(MACHINE_FAMILY_MAX_CODE_LEN).optional(),
  name: z.string().trim().min(1).max(2000),
  supplier: z.string().trim().max(2000).nullable().optional(),
  uses_hmi_station_codes: z.boolean().optional(),
})

/** PATCH `/api/admin/machine-families/[familyId]` */
export const adminPatchMachineFamilyBodySchema = z
  .object({
    name: z.string().trim().min(1).max(2000).optional(),
    supplier: z.string().trim().max(2000).nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.name === undefined && v.supplier === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'No valid fields to update',
      })
    }
  })

/** POST `/api/admin/machine-families/[familyId]/stations` */
export const adminCreateStationBodySchema = z.object({
  station_code: z.number().finite().int(),
  name: z.string().trim().min(1).max(2000),
  section: z.string().trim().min(1).max(2000),
  sort_order: z.union([z.number().finite().int(), z.null()]).optional(),
})

/** PATCH `/api/admin/machine-families/[familyId]/stations/[stationId]` */
export const adminPatchStationBodySchema = z
  .object({
    station_code: z.number().finite().int().optional(),
    name: z.string().trim().min(1).max(2000).optional(),
    section: z.string().trim().min(1).max(2000).optional(),
    sort_order: z.union([z.number().finite().int(), z.null()]).optional(),
  })
  .superRefine((v, ctx) => {
    if (
      v.station_code === undefined &&
      v.name === undefined &&
      v.section === undefined &&
      v.sort_order === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'No valid fields to update',
      })
    }
  })

/** POST `/api/admin/machines` */
export const adminCreateMachineBodySchema = z.object({
  line_leg_id: z.string().trim().min(1, 'line_leg_id is required'),
  machine_family_id: z.string().trim().min(1, 'machine_family_id is required'),
  name: z.string().trim().min(1, 'name is required'),
  code: z
    .union([z.string().trim().min(1).max(64), z.literal('')])
    .optional()
    .nullable()
    .transform((v) => {
      if (v == null) return null
      const s = typeof v === 'string' ? v.trim() : ''
      return s.length ? s : null
    }),
})

/** PATCH `/api/admin/machines/[machineId]` */
export const adminPatchMachineBodySchema = z
  .object({
    name: z.string().trim().min(1).max(2000).optional(),
    active: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.name === undefined && v.active === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'No valid fields to update',
      })
    }
  })
