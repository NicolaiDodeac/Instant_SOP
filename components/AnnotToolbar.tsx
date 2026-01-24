'use client'

interface AnnotToolbarProps {
  onAddArrow: () => void
  onAddLabel: () => void
  onDelete: () => void
  hasSelection: boolean
}

export default function AnnotToolbar({
  onAddArrow,
  onAddLabel,
  onDelete,
  hasSelection,
}: AnnotToolbarProps) {
  return (
    <div className="flex gap-2 p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
      <button
        onClick={onAddArrow}
        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg touch-target flex items-center justify-center gap-2"
      >
        <span>➡️</span>
        <span>Arrow</span>
      </button>
      <button
        onClick={onAddLabel}
        className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-lg touch-target flex items-center justify-center gap-2"
      >
        <span>🏷️</span>
        <span>Label</span>
      </button>
      {hasSelection && (
        <button
          onClick={onDelete}
          className="bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-4 rounded-lg touch-target"
        >
          🗑️
        </button>
      )}
    </div>
  )
}
