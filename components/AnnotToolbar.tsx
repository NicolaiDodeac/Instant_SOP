'use client'

interface AnnotToolbarProps {
  onAddArrow: () => void
  onAddLabel: () => void
  onDelete: () => void
  hasSelection: boolean
  /** When a label is selected: its text and callback to update. */
  selectedLabelText?: string
  onLabelTextChange?: (text: string) => void
  /** When an annotation is selected: kind and style for size controls. */
  selectedAnnotationKind?: 'arrow' | 'label'
  selectedAnnotationStyle?: { strokeWidth?: number; fontSize?: number }
  onStyleChange?: (style: { strokeWidth?: number; fontSize?: number }) => void
}

const ARROW_SIZE = { min: 20, max: 80, default: 35, small: 24, medium: 35, large: 65 }
const LABEL_FONT_SIZE = { min: 12, max: 48, default: 28, small: 14, medium: 28, large: 36 }

export default function AnnotToolbar({
  onAddArrow,
  onAddLabel,
  onDelete,
  hasSelection,
  selectedLabelText,
  onLabelTextChange,
  selectedAnnotationKind,
  selectedAnnotationStyle,
  onStyleChange,
}: AnnotToolbarProps) {
  const showLabelEditor = selectedLabelText !== undefined && onLabelTextChange !== undefined
  const showSizeControl = hasSelection && selectedAnnotationKind && onStyleChange

  const arrowSize = selectedAnnotationStyle?.strokeWidth ?? ARROW_SIZE.default
  const labelFontSize = selectedAnnotationStyle?.fontSize ?? LABEL_FONT_SIZE.default

  return (
    <div className="flex flex-col gap-1.5 p-1.5 bg-gray-100 dark:bg-gray-800 rounded-lg">
      {showLabelEditor && (
        <div className="space-y-0.5">
          <label htmlFor="label-text-edit" className="text-sm font-medium text-gray-700 dark:text-gray-300 block">
            Label text
          </label>
          <textarea
            id="label-text-edit"
            value={selectedLabelText}
            onChange={(e) => onLabelTextChange(e.target.value)}
            placeholder="Type your label… (Enter = new line)"
            rows={3}
            className="w-full min-h-10 px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 placeholder-gray-500 focus:ring-2 focus:ring-green-500 focus:border-green-500 touch-target resize-y"
            autoComplete="off"
          />
        </div>
      )}

      {showSizeControl && (
        <div className="space-y-1">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 block">
            {selectedAnnotationKind === 'arrow' ? 'Arrow size' : 'Text size'}
          </span>
          {selectedAnnotationKind === 'arrow' ? (
            <>
              <div className="flex gap-2">
                {(['small', 'medium', 'large'] as const).map((preset) => {
                  const v = ARROW_SIZE[preset]
                  const label = preset === 'small' ? 'S' : preset === 'medium' ? 'M' : 'L'
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => onStyleChange({ ...selectedAnnotationStyle, strokeWidth: v })}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium touch-target ${
                        arrowSize === v
                          ? 'bg-blue-600 text-white'
                          : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600'
                      }`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={ARROW_SIZE.min}
                  max={ARROW_SIZE.max}
                  value={arrowSize}
                  onChange={(e) => onStyleChange({ ...selectedAnnotationStyle, strokeWidth: Number(e.target.value) })}
                  className="flex-1 h-10 accent-blue-600 touch-target"
                />
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400 w-8 tabular-nums">
                  {arrowSize}
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="flex gap-2">
                {(['small', 'medium', 'large'] as const).map((preset) => {
                  const v = LABEL_FONT_SIZE[preset]
                  const label = preset === 'small' ? 'S' : preset === 'medium' ? 'M' : 'L'
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => onStyleChange({ ...selectedAnnotationStyle, fontSize: v })}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium touch-target ${
                        labelFontSize === v
                          ? 'bg-green-600 text-white'
                          : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600'
                      }`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={LABEL_FONT_SIZE.min}
                  max={LABEL_FONT_SIZE.max}
                  value={labelFontSize}
                  onChange={(e) => onStyleChange({ ...selectedAnnotationStyle, fontSize: Number(e.target.value) })}
                  className="flex-1 h-10 accent-green-600 touch-target"
                />
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400 w-8 tabular-nums">
                  {labelFontSize}
                </span>
              </div>
            </>
          )}
        </div>
      )}
      <div className="flex gap-1.5">
        <button
          onClick={onAddArrow}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-3 rounded-lg touch-target flex items-center justify-center gap-1.5 text-sm"
        >
          <span>➡️</span>
          <span>Arrow</span>
        </button>
        <button
          onClick={onAddLabel}
          className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-3 rounded-lg touch-target flex items-center justify-center gap-1.5 text-sm"
        >
          <span>🏷️</span>
          <span>Label</span>
        </button>
        {hasSelection && (
          <button
            onClick={onDelete}
            className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-3 rounded-lg touch-target text-sm"
          >
            🗑️
          </button>
        )}
      </div>
    </div>
  )
}
