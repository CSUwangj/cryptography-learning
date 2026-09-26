import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'

export type LearningState = 'default' | 'changed' | 'selected' | 'related' | 'warning' | 'incomplete'

export const learningColors = {
  text: '#17324d',
  mutedText: '#4b6075',
  canvas: '#fbfdff',
  border: '#8aa0b6',
  related: '#e0f2fe',
  selected: '#dbeafe',
  changed: '#fff3cd',
  warning: '#fee2e2',
  incomplete: '#e5e7eb',
} as const

const stateStyles: Record<LearningState, CSSProperties> = {
  default: {},
  changed: { backgroundColor: learningColors.changed },
  selected: { backgroundColor: learningColors.selected },
  related: { backgroundColor: learningColors.related },
  warning: { backgroundColor: learningColors.warning },
  incomplete: { backgroundColor: learningColors.incomplete },
}

export type TraceTableProps = {
  readonly caption: string
  readonly headers: readonly string[]
  readonly children: ReactNode
}

export const TraceTable = ({ caption, headers, children }: TraceTableProps): ReactNode => (
  <table>
    <caption>{caption}</caption>
    <thead><tr>{headers.map((header) => <th key={header} scope="col">{header}</th>)}</tr></thead>
    <tbody>{children}</tbody>
  </table>
)

export type ComparisonRowProps = {
  readonly label: string
  readonly state?: LearningState
  readonly children: ReactNode
}

export const ComparisonRow = ({ label, state = 'default', children }: ComparisonRowProps): ReactNode => (
  <tr data-state={state} style={stateStyles[state]}>
    <th scope="row">{label}</th>{children}
  </tr>
)

type PassiveValueCellProps = { readonly ariaLabel?: string; readonly onSelect?: never }
type SelectableValueCellProps = { readonly ariaLabel: string; readonly onSelect: () => void }

export type ValueCellProps = {
  readonly children: ReactNode
  readonly state?: LearningState
} & (PassiveValueCellProps | SelectableValueCellProps)

export const ValueCell = ({ children, state = 'default', ...selection }: ValueCellProps): ReactNode => (
  <td aria-label={selection.ariaLabel} data-state={state} style={stateStyles[state]}>
    {'onSelect' in selection
      ? <button aria-label={selection.ariaLabel} aria-pressed={state === 'selected'} onClick={selection.onSelect} type="button">{children}</button>
      : children}
  </td>
)

export type FieldLabelProps = { readonly children: string; readonly htmlFor?: string }

export const FieldLabel = ({ children, htmlFor }: FieldLabelProps): ReactNode =>
  htmlFor ? <label htmlFor={htmlFor}>{children}</label> : <span>{children}</span>

export type LearningCell = {
  readonly value: ReactNode
  readonly state?: LearningState
  readonly ariaLabel?: string
}

export type LearningBit = {
  readonly id: string
  readonly bit: number
  readonly value: ReactNode
  readonly state?: LearningState
  readonly ariaLabel: string
}

export type LearningRelationship = {
  readonly from: string
  readonly to: string
  readonly state?: LearningState
}

export type LearningRow = {
  readonly id: string
  readonly label: string
  readonly state?: LearningState
  readonly cells: readonly LearningCell[]
  readonly selectableBits?: readonly LearningBit[]
  readonly relationships?: readonly LearningRelationship[]
  readonly detail?: ReactNode
}

export type LearningSection = {
  readonly kind: 'trace' | 'comparison' | 'details' | 'raw'
  readonly caption: string
  readonly headers: readonly string[]
  readonly rows: readonly LearningRow[]
}

export type LearningPresentation = {
  readonly title: string
  readonly instructions?: string
  readonly sections: readonly LearningSection[]
  readonly executionIdentity?: string
  readonly initialSelection?: string
}

const relationshipsFor = (presentation: LearningPresentation): readonly LearningRelationship[] =>
  presentation.sections.flatMap((section) => section.rows.flatMap((row) => row.relationships ?? []))

export const relatedBitIds = (presentation: LearningPresentation, selected: string | undefined): ReadonlySet<string> => {
  if (!selected) return new Set()
  const related = new Set([selected])
  const relationships = relationshipsFor(presentation)
  for (let index = 0; index < relationships.length; index += 1) {
    const size = related.size
    for (const relationship of relationships) {
      if (related.has(relationship.from)) related.add(relationship.to)
      if (related.has(relationship.to)) related.add(relationship.from)
    }
    if (related.size === size) break
  }
  return related
}

const bitState = (bit: LearningBit, selected: string | undefined, related: ReadonlySet<string>): LearningState =>
  bit.id === selected ? 'selected' : related.has(bit.id) ? 'related' : bit.state ?? 'default'

export const LearningPresentationView = ({ presentation }: { readonly presentation: LearningPresentation }): ReactNode => {
  const [selected, setSelected] = useState<string | undefined>(presentation.initialSelection)
  useEffect(() => { setSelected(presentation.initialSelection) }, [presentation.executionIdentity])
  const related = useMemo(() => relatedBitIds(presentation, selected), [presentation, selected])

  return <section aria-label={presentation.title}>
    <h3>{presentation.title}</h3>
    {presentation.instructions && <p>{presentation.instructions}</p>}
    {presentation.sections.map((section) => {
      const hasBits = section.rows.some((row) => row.selectableBits?.length)
      const hasDetails = section.rows.some((row) => row.detail)
      const incomplete = section.rows.some((row) => row.state === 'incomplete')
      return <div key={`${section.kind}-${section.caption}`}>
        {incomplete && <p role="status">{section.caption}</p>}
        <TraceTable caption={section.caption} headers={section.headers}>
          {section.rows.map((row) => <ComparisonRow key={row.id} label={row.label} state={row.state}>
            {row.cells.map((cell, index) => <ValueCell ariaLabel={cell.ariaLabel} key={index} state={cell.state}>{cell.value}</ValueCell>)}
            {hasBits && <td>{row.selectableBits?.map((bit) => {
              const state = bitState(bit, selected, related)
              return <button
                aria-label={bit.ariaLabel}
                aria-pressed={state === 'selected'}
                data-state={state}
                key={bit.id}
                onClick={() => setSelected(bit.id)}
                style={{ ...stateStyles[state], borderColor: learningColors.border, color: learningColors.text }}
                type="button"
              >{bit.value}</button>
            })}</td>}
            {hasDetails && <ValueCell>{row.detail}</ValueCell>}
          </ComparisonRow>)}
        </TraceTable>
      </div>
    })}
  </section>
}
