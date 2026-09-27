import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'

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

export type LearningRoundKey = {
  readonly id: string
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
  readonly selectableKey?: LearningRoundKey
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
  readonly initialKeySelection?: string
  readonly selectionStatus?: (selected: LearningBit | LearningRoundKey | undefined) => ReactNode
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

export type LearningSelection = { readonly kind: 'bit' | 'key'; readonly id: string }

const initialSelectionFor = (presentation: LearningPresentation): LearningSelection | undefined =>
  presentation.initialKeySelection
    ? { kind: 'key', id: presentation.initialKeySelection }
    : presentation.initialSelection
      ? { kind: 'bit', id: presentation.initialSelection }
      : undefined

const bitState = (bit: LearningBit, selected: LearningSelection | undefined, related: ReadonlySet<string>): LearningState =>
  selected?.kind === 'bit' && bit.id === selected.id ? 'selected' : related.has(bit.id) ? 'related' : bit.state ?? 'default'

const keyState = (key: LearningRoundKey, selected: LearningSelection | undefined, related: ReadonlySet<string>): LearningState =>
  selected?.kind === 'key' && key.id === selected.id ? 'selected' : related.has(key.id) ? 'related' : key.state ?? 'default'

export type LineageDiagramProps = {
  readonly relationships: readonly LearningRelationship[]
  readonly locations: ReadonlyMap<string, LineageLocation>
  readonly width: number
  readonly height: number
  readonly related: ReadonlySet<string>
  readonly selected?: LearningSelection
}

export type LineageLocation = { readonly x: number; readonly y: number }

const lineageStroke = (state: LearningState): string => {
  if (state === 'selected') return learningColors.text
  if (state === 'related') return learningColors.related
  if (state === 'changed') return learningColors.changed
  if (state === 'warning') return learningColors.warning
  if (state === 'incomplete') return learningColors.incomplete
  return learningColors.mutedText
}

export const LineageDiagram = ({ relationships, locations, width, height, related, selected }: LineageDiagramProps): ReactNode => {
  if (!relationships.length) return null
  return <svg aria-hidden="true" data-lineage height={height} style={{ left: 0, pointerEvents: 'none', position: 'absolute', top: 0 }} viewBox={`0 0 ${width} ${height}`} width={width}>
    {relationships.map((relationship) => {
      const from = locations.get(relationship.from)
      const to = locations.get(relationship.to)
      if (!from || !to) return null
      const state = relationship.from === selected?.id || relationship.to === selected?.id
        ? 'selected'
        : related.has(relationship.from) && related.has(relationship.to)
          ? 'related'
          : relationship.state ?? 'default'
      return <line
        data-state={state}
        key={`${relationship.from}-${relationship.to}`}
        stroke={lineageStroke(state)}
        strokeWidth={state === 'default' ? 1 : 3}
        x1={from.x}
        x2={to.x}
        y1={from.y}
        y2={to.y}
      />
    })}
  </svg>
}

export const LearningPresentationView = ({ presentation }: { readonly presentation: LearningPresentation }): ReactNode => {
  const [selected, setSelected] = useState<LearningSelection | undefined>(() => initialSelectionFor(presentation))
  useEffect(() => { setSelected(initialSelectionFor(presentation)) }, [presentation.executionIdentity])
  const related = useMemo(() => relatedBitIds(presentation, selected?.id), [presentation, selected])
  const rows = presentation.sections.flatMap((section) => section.rows)
  const selectedTarget = selected?.kind === 'bit'
    ? rows.flatMap((row) => row.selectableBits ?? []).find((bit) => bit.id === selected.id)
    : rows.map((row) => row.selectableKey).find((key) => key?.id === selected?.id)
  const lineageContainer = useRef<HTMLDivElement>(null)
  const targets = useRef(new Map<string, HTMLElement>())
  const [lineage, setLineage] = useState<{ readonly width: number; readonly height: number; readonly locations: ReadonlyMap<string, LineageLocation> }>({
    width: 0,
    height: 0,
    locations: new Map(),
  })
  const targetRef = (id: string) => (target: HTMLButtonElement | null): void => {
    if (target) targets.current.set(id, target)
    else targets.current.delete(id)
  }

  useLayoutEffect(() => {
    const container = lineageContainer.current
    if (!container) return
    const bounds = container.getBoundingClientRect()
    const locations = new Map<string, LineageLocation>()
    for (const [id, target] of targets.current) {
      const bounds = target.getBoundingClientRect()
      locations.set(id, { x: bounds.left - container.getBoundingClientRect().left + bounds.width / 2, y: bounds.top - container.getBoundingClientRect().top + bounds.height / 2 })
    }
    setLineage({ width: bounds.width, height: bounds.height, locations })
  }, [presentation])

  return <section aria-label={presentation.title}>
    <h3>{presentation.title}</h3>
    {presentation.instructions && <p>{presentation.instructions}</p>}
    {presentation.selectionStatus && <p aria-live="polite" role="status">{presentation.selectionStatus(selectedTarget)}</p>}
    {presentation.sections.filter((section) => section.rows.some((row) => row.state === 'incomplete'))
      .map((section) => <p key={`${section.kind}-${section.caption}`} role="status">{section.caption}</p>)}
    <div ref={lineageContainer} style={{ position: 'relative' }}>
      <LineageDiagram
        height={lineage.height}
        locations={lineage.locations}
        relationships={relationshipsFor(presentation)}
        related={related}
        selected={selected}
        width={lineage.width}
      />
      {presentation.sections.map((section) => {
        const hasControls = section.rows.some((row) => row.selectableBits?.length || row.selectableKey)
        const hasDetails = section.rows.some((row) => row.detail)
        return <TraceTable caption={section.caption} headers={section.headers} key={`${section.kind}-${section.caption}`}>
          {section.rows.map((row) => <ComparisonRow key={row.id} label={row.label} state={row.state}>
            {row.cells.map((cell, index) => <ValueCell ariaLabel={cell.ariaLabel} key={index} state={cell.state}>{cell.value}</ValueCell>)}
            {hasControls && <td>{(row.selectableBits ?? []).map((bit) => {
              const state = bitState(bit, selected, related)
              return <button
                aria-label={bit.ariaLabel}
                aria-pressed={state === 'selected'}
                data-state={state}
                key={bit.id}
                onClick={() => setSelected({ kind: 'bit', id: bit.id })}
                ref={targetRef(bit.id)}
                style={{ ...stateStyles[state], borderColor: learningColors.border, color: learningColors.text }}
                type="button"
              >{bit.value}</button>
            })}{row.selectableKey && (() => {
              const key = row.selectableKey
              const state = keyState(key, selected, related)
              return <button
                aria-label={key.ariaLabel}
                aria-pressed={state === 'selected'}
                data-state={state}
                onClick={() => setSelected({ kind: 'key', id: key.id })}
                ref={targetRef(key.id)}
                style={{ ...stateStyles[state], borderColor: learningColors.border, color: learningColors.text }}
                type="button"
              >{key.value}</button>
            })()}</td>}
            {hasDetails && <ValueCell>{row.detail}</ValueCell>}
          </ComparisonRow>)}
        </TraceTable>
      })}
    </div>
  </section>
}
