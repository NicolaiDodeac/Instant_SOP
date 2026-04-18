'use client'

import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  horizontalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { SOPStep } from '@/lib/types'

function SortableStepChip({
  id,
  label,
  active,
  reorderMode,
  disabled,
  onClick,
}: {
  id: string
  label: string
  active: boolean
  reorderMode: boolean
  disabled: boolean
  onClick: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled: !reorderMode || disabled })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    touchAction: reorderMode ? 'none' : 'manipulation',
  }

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg touch-target whitespace-nowrap text-sm no-select ${
        active
          ? 'bg-blue-600 text-white'
          : 'bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100'
      } ${reorderMode ? 'cursor-grab active:cursor-grabbing' : ''} ${
        disabled ? 'opacity-60 cursor-not-allowed' : ''
      }`}
      style={style}
      aria-label={label}
      {...attributes}
      {...listeners}
      disabled={disabled}
    >
      {label}
    </button>
  )
}

function orderedStepsForChips(
  steps: SOPStep[],
  reorderMode: boolean,
  reorderOrderIds: string[] | null
): SOPStep[] {
  if (!reorderMode || !reorderOrderIds) return steps
  const byId = new Map(steps.map((s) => [s.id, s]))
  const ordered = reorderOrderIds.map((id) => byId.get(id)).filter((s): s is SOPStep => !!s)
  return ordered.length === steps.length ? ordered : steps
}

export type EditorStepChipsBarProps = {
  steps: SOPStep[]
  reorderMode: boolean
  reorderOrderIds: string[] | null
  canEdit: boolean
  currentStepId: string | null
  onSelectStep: (stepId: string) => void
  onReorderOrderIdsChange: (ids: string[]) => void
  onStartReorderMode: () => void
  onDoneReorderMoves: () => void
  onAddStep: () => void
  onDeleteCurrentStep: () => void
}

export default function EditorStepChipsBar({
  steps,
  reorderMode,
  reorderOrderIds,
  canEdit,
  currentStepId,
  onSelectStep,
  onReorderOrderIdsChange,
  onStartReorderMode,
  onDoneReorderMoves,
  onAddStep,
  onDeleteCurrentStep,
}: EditorStepChipsBarProps) {
  const dndSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { delay: 350, tolerance: 8 },
    })
  )

  function handleReorderDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const ids = reorderOrderIds ?? steps.map((s) => s.id)
    const oldIndex = ids.findIndex((id) => id === String(active.id))
    const newIndex = ids.findIndex((id) => id === String(over.id))
    if (oldIndex < 0 || newIndex < 0) return
    onReorderOrderIdsChange(arrayMove(ids, oldIndex, newIndex))
  }

  const chipSteps = orderedStepsForChips(steps, reorderMode, reorderOrderIds)
  const sortableIds = (reorderOrderIds ?? steps.map((s) => s.id)) as string[]

  return (
    <div className="py-2">
      <div className="flex flex-wrap gap-2 items-center">
        <DndContext
          sensors={dndSensors}
          collisionDetection={closestCenter}
          onDragEnd={handleReorderDragEnd}
        >
          <SortableContext items={sortableIds} strategy={horizontalListSortingStrategy}>
            {chipSteps.map((step) => (
              <SortableStepChip
                key={step.id}
                id={step.id}
                label={`Step ${step.idx + 1}`}
                active={currentStepId === step.id}
                reorderMode={reorderMode}
                disabled={!canEdit || steps.length <= 1}
                onClick={() => onSelectStep(step.id)}
              />
            ))}
          </SortableContext>
        </DndContext>
        {canEdit && (
          <>
            <button
              type="button"
              onClick={onAddStep}
              className="px-3 py-1.5 rounded-lg bg-gray-200 dark:bg-gray-700 touch-target whitespace-nowrap text-sm"
              disabled={reorderMode}
              aria-disabled={reorderMode}
              aria-label="Add step"
            >
              <span className="md:hidden">Add</span>
              <span className="hidden md:inline">+ Add Step</span>
            </button>
            {steps.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  if (!reorderMode) {
                    onStartReorderMode()
                  } else {
                    onDoneReorderMoves()
                  }
                }}
                className={`px-3 py-1.5 rounded-lg touch-target whitespace-nowrap text-sm ${
                  reorderMode ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700'
                }`}
                aria-label={reorderMode ? 'Done moving steps' : 'Move steps'}
              >
                {reorderMode ? 'Done' : 'Move'}
              </button>
            )}
            {steps.length > 1 && currentStepId && (
              <button
                type="button"
                onClick={onDeleteCurrentStep}
                className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white touch-target"
                aria-label="Delete current step"
                disabled={reorderMode}
                aria-disabled={reorderMode}
              >
                🗑️
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
