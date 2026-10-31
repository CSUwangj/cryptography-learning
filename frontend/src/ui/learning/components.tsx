import { Button, HTMLSelect } from '@blueprintjs/core'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import './learning.css'

export type LearningState = 'default' | 'changed' | 'selected' | 'related' | 'related-changed' | 'warning' | 'incomplete'

export const learningColors = {
  text: 'var(--learning-text, #17324d)',
  mutedText: 'var(--learning-muted-text, #4b6075)',
  canvas: 'var(--learning-canvas, #fbfdff)',
  border: 'var(--learning-border, #8aa0b6)',
  related: 'var(--learning-related, #e0f2fe)',
  selected: 'var(--learning-selected, #dbeafe)',
  changed: 'var(--learning-changed, #fff3cd)',
  relatedChanged: 'var(--learning-related-changed, #fca5a5)',
  warning: 'var(--learning-warning, #fee2e2)',
  incomplete: 'var(--learning-incomplete, #e5e7eb)',
  lane: 'var(--learning-lane, #ecfdf5)',
  laneBorder: 'var(--learning-lane-border, #059669)',
} as const

const stateStyles: Record<LearningState, CSSProperties> = {
  default: {},
  changed: { backgroundColor: learningColors.changed },
  selected: { backgroundColor: learningColors.selected },
  related: { backgroundColor: learningColors.related },
  'related-changed': { backgroundColor: learningColors.relatedChanged },
  warning: { backgroundColor: learningColors.warning },
  incomplete: { backgroundColor: learningColors.incomplete },
}

export type TraceTableProps = {
  readonly caption: string
  readonly headers: readonly string[]
  readonly laneHeaders?: readonly string[]
  readonly children: ReactNode
  /** Removes vertical cell spacing so a block spanning several rows reads as one region. */
  readonly joinRows?: boolean
}

export const TraceTable = ({ caption, headers, laneHeaders = [], children, joinRows }: TraceTableProps): ReactNode => (
  <table style={joinRows ? { borderSpacing: '2px 0' } : undefined}>
    <caption>{caption}</caption>
    <thead><tr>{[...headers, ...laneHeaders].map((header, index) => <th data-lane-heading={index >= headers.length ? 'true' : undefined} key={index} scope="col">{header}</th>)}</tr></thead>
    <tbody>{children}</tbody>
  </table>
)

export type ComparisonRowProps = {
  readonly label: string
  readonly state?: LearningState
  readonly rowId?: string
  readonly rowRef?: (target: HTMLTableRowElement | null) => void
  readonly children: ReactNode
}

export const ComparisonRow = ({ label, state = 'default', rowId, rowRef, children }: ComparisonRowProps): ReactNode => (
  <tr data-row-id={rowId} data-state={state} ref={rowRef} style={stateStyles[state]}>
    <th scope="row">{label}</th>{children}
  </tr>
)

const hexadecimalValue = (value: ReactNode): ReactNode => typeof value === 'string' && /^0x[\da-f]+$/i.test(value)
  ? <span className="learning-hex-value">{value.match(/^0x|[\da-f]{1,2}(?=(?:[\da-f]{2})*$)/gi)!.map((byte, index) => <span className={index ? 'learning-hex-byte' : undefined} key={index}>{byte}</span>)}</span>
  : value

type PassiveValueCellProps = { readonly ariaLabel?: string; readonly onSelect?: never }
type SelectableValueCellProps = { readonly ariaLabel: string; readonly onSelect: () => void }

export type ValueCellProps = {
  readonly children: ReactNode
  readonly state?: LearningState
} & (PassiveValueCellProps | SelectableValueCellProps)

export const ValueCell = ({ children, state = 'default', ...selection }: ValueCellProps): ReactNode => (
  <td aria-label={selection.ariaLabel} data-state={state} style={stateStyles[state]}>
    {'onSelect' in selection
      ? <button aria-label={selection.ariaLabel} aria-pressed={state === 'selected'} onClick={selection.onSelect} type="button">{hexadecimalValue(children)}</button>
      : hexadecimalValue(children)}
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
  /** Draws a boundary every `size` bits; `active` marks one group. Absent means no boundaries. */
  readonly bitGrouping?: { readonly size: number; readonly active?: number }
  readonly detail?: ReactNode
}

export type LearningSection = {
  readonly kind: 'trace' | 'comparison' | 'details' | 'raw'
  readonly caption: string
  readonly headers: readonly string[]
  readonly rows: readonly LearningRow[]
}

export type KeyExpansionLaneRow = Pick<LearningRow, 'id' | 'selectableBits' | 'relationships' | 'bitGrouping'> & {
  readonly label?: string
  readonly cells?: readonly LearningCell[]
  /** Trace row this lane row shares a table row with; unanchored rows follow the previous anchor. */
  readonly anchor?: string
}

/**
 * An optional lane, opened by the v2 schedule toggle or a legacy round-key chip. While open it covers
 * the trace's bit and detail columns. Between anchors, whichever side has fewer rows is padded with
 * empty rows that disappear on close. Anchors must appear in the same order as their trace rows.
 */
export type KeyExpansionLane = {
  readonly caption: string
  readonly closeLabel: string
  readonly rows: readonly KeyExpansionLaneRow[]
  readonly headers?: readonly string[]
  /** The v2 whole-schedule toggle preserves the exact bit origin. */
  readonly sharedSelection?: { readonly toggleLabel: string; readonly clearLabel: string }
  readonly originalOrder?: LearningSection
}

export type LearningSelection = { readonly kind: 'bit' | 'key'; readonly id: string; readonly bitIds?: readonly string[] }

/**
 * A structured issue about the presentation's underlying data (e.g. a truncated trace), kept as
 * a narrow, self-contained shape here rather than importing a crypto_graph-specific diagnostic
 * type, so this generic presentation layer stays free of a crypto_graph dependency.
 */
export type LearningDiagnostic = {
  readonly code: string
  readonly message: string
  readonly path: string
  readonly details?: Readonly<Record<string, string | number | boolean | null>>
}

export type LearningPresentation = {
  readonly title: string
  readonly instructions?: string
  /** Structured issues (stable code/path/details) about the data behind this presentation, such
   * as a truncated trace - distinct from `instructions`/`selectionStatus`, which are plain
   * human-readable copy with no machine-checkable shape. */
  readonly diagnostics?: readonly LearningDiagnostic[]
  readonly sections: readonly LearningSection[]
  readonly executionIdentity?: string
  readonly initialSelection?: string
  readonly initialKeySelection?: string
  readonly selectionStatus?: (selected: LearningBit | LearningRoundKey | undefined) => ReactNode
  readonly unitSelection?: {
    readonly label: string
    readonly sizeLabel: (size: number) => string
    readonly rangeLabel: (row: LearningRow, start: number, end: number, value: string) => string
    readonly relatedLabel: string
    readonly selectedLabel: string
  }
  readonly keyExpansionLane?: KeyExpansionLane
  /** Equal-width bit identities used for traversal only, never drawn as lineage edges. */
  readonly bitCorrespondence?: readonly LearningRelationship[]
  /** Notified on every bit/chip selection change, including chip open/close/reselect. Lets a
   * caller observe or react to key-expansion lane chip selection without owning the state. */
  readonly onSelectionChange?: (selection: LearningSelection | undefined) => void
}

const relationshipsFor = (presentation: LearningPresentation): readonly LearningRelationship[] => [
  ...presentation.sections.flatMap((section) => section.rows.flatMap((row) => row.relationships ?? [])),
  ...(presentation.keyExpansionLane?.rows ?? []).flatMap((row) => row.relationships ?? []),
]

type LaneLayoutRow = { readonly row?: LearningRow; readonly lane?: KeyExpansionLaneRow }

const laneLayout = (rows: readonly LearningRow[], lane: readonly KeyExpansionLaneRow[]): readonly LaneLayoutRow[] => {
  const rowIds = new Set(rows.map((row) => row.id))
  const anchors = new Set(lane.flatMap((row) => row.anchor && rowIds.has(row.anchor) ? [row.anchor] : []))
  const segments = <T,>(items: readonly T[], anchorOf: (item: T) => string | undefined): Map<string | undefined, T[]> => {
    let current: T[] = []
    const result = new Map<string | undefined, T[]>([[undefined, current]])
    for (const item of items) {
      const anchor = anchorOf(item)
      if (anchor !== undefined && anchors.has(anchor)) result.set(anchor, current = [])
      current.push(item)
    }
    return result
  }
  const laneSegments = segments(lane, (row) => row.anchor)
  return [...segments(rows, (row) => row.id)].flatMap(([anchor, traceRows]) => {
    const laneRows = laneSegments.get(anchor) ?? []
    return Array.from({ length: Math.max(traceRows.length, laneRows.length) }, (_, index) => ({ row: traceRows[index], lane: laneRows[index] }))
  })
}

export const relatedBitIds = (presentation: LearningPresentation, selected: string | readonly string[] | undefined): ReadonlySet<string> => {
  if (!selected) return new Set()
  const relationships = relationshipsFor(presentation)
  const reach = (source: 'from' | 'to', target: 'from' | 'to'): ReadonlySet<string> => {
    const reached = new Set(typeof selected === 'string' ? [selected] : selected)
    for (let size = 0; size !== reached.size;) {
      size = reached.size
      for (const relationship of relationships) if (reached.has(relationship[source])) reached.add(relationship[target])
      for (const pair of presentation.bitCorrespondence ?? []) {
        if (reached.has(pair.from)) reached.add(pair.to)
        if (reached.has(pair.to)) reached.add(pair.from)
      }
    }
    return reached
  }
  return new Set([...reach('from', 'to'), ...reach('to', 'from')])
}

const bitGroups = (row: Pick<LearningRow, 'selectableBits' | 'bitGrouping'>): readonly (readonly LearningBit[])[] => {
  const selectable = row.selectableBits ?? []
  if (!row.bitGrouping) return [selectable]
  const { size } = row.bitGrouping
  return Array.from({ length: Math.ceil(selectable.length / size) }, (_, group) => selectable.slice(group * size, (group + 1) * size))
}

const unitValue = (unit: readonly LearningBit[]): string => {
  const binary = unit.map((bit) => bit.value).join('')
  return unit.length >= 4 ? `0x${BigInt(`0b${binary}`).toString(16).padStart(Math.ceil(unit.length / 4), '0')}` : binary
}

const initialSelectionFor = (presentation: LearningPresentation): LearningSelection | undefined =>
  presentation.initialKeySelection
    ? { kind: 'key', id: presentation.initialKeySelection }
    : presentation.initialSelection
      ? { kind: 'bit', id: presentation.initialSelection }
      : undefined

const bitState = (bit: LearningBit, selected: LearningSelection | undefined, related: ReadonlySet<string>): LearningState =>
  selected?.kind === 'bit' && (selected.bitIds?.includes(bit.id) ?? bit.id === selected.id)
    ? 'selected'
    : related.has(bit.id) ? (bit.state === 'changed' ? 'related-changed' : 'related') : bit.state ?? 'default'

const keyState = (key: LearningRoundKey, selected: LearningSelection | undefined, openKeyId: string | undefined, related: ReadonlySet<string>): LearningState =>
  (selected?.kind === 'key' && key.id === selected.id) || key.id === openKeyId
    ? 'selected'
    : related.has(key.id) ? 'related' : key.state ?? 'default'

export type LineageDiagramProps = {
  readonly relationships: readonly LearningRelationship[]
  readonly locations: ReadonlyMap<string, LineageLocation>
  readonly width: number
  readonly height: number
  readonly related: ReadonlySet<string>
  readonly selected?: LearningSelection
  readonly aggregate?: boolean
}

export type LineageLocation = { readonly x: number; readonly y: number; readonly group?: string }

const lineageStroke = (state: LearningState): string => {
  if (state === 'selected' || state === 'related') return learningColors.text
  if (state === 'changed') return learningColors.changed
  if (state === 'warning') return learningColors.warning
  if (state === 'incomplete') return learningColors.incomplete
  return learningColors.mutedText
}

export const LineageDiagram = ({ relationships, locations, width, height, related, selected, aggregate }: LineageDiagramProps): ReactNode => {
  if (!relationships.length) return null
  const selectedIds = new Set(selected?.bitIds ?? (selected ? [selected.id] : []))
  const lines = relationships.map((relationship) => ({
    relationship,
    state: selectedIds.has(relationship.from) || selectedIds.has(relationship.to)
      ? 'selected' as const
      : related.has(relationship.from) && related.has(relationship.to)
        ? 'related' as const
        : relationship.state ?? 'default',
  }))
  const paths = new Map<LearningState, string[]>()
  const pairs = new Map<string, { readonly segment: string; readonly state: LearningState }>()
  if (aggregate) for (const { relationship, state } of lines) {
    const from = locations.get(relationship.from)
    const to = locations.get(relationship.to)
    if (!from || !to) continue
    const pair = JSON.stringify([from.group ?? [from.x, from.y], to.group ?? [to.x, to.y]])
    const previous = pairs.get(pair)
    if (previous === undefined || state === 'selected' || (state === 'related' && previous.state !== 'selected')) pairs.set(pair, { segment: `M${from.x},${from.y}L${to.x},${to.y}`, state })
  }
  for (const { segment, state } of pairs.values()) {
    if (!paths.has(state)) paths.set(state, [])
    paths.get(state)!.push(segment)
  }
  return <svg aria-hidden="true" data-lineage height={height} style={{ left: 0, pointerEvents: 'none', position: 'absolute', top: 0 }} viewBox={`0 0 ${width} ${height}`} width={width}>
    {/* Batch unit-view geometry without changing the bit relationships used for traversal. */}
    {aggregate ? [...paths].sort(([left], [right]) => Number(left !== 'default') - Number(right !== 'default')).map(([state, segments]) => <path
      d={segments.join(' ')} data-state={state} fill="none" key={state}
      stroke={lineageStroke(state)} strokeOpacity={state === 'default' && selected ? 0.15 : 0.6} strokeWidth={state === 'default' ? 1 : 3}
    />) : [...lines.filter((line) => line.state === 'default'), ...lines.filter((line) => line.state !== 'default')].map(({ relationship, state }) => {
      const from = locations.get(relationship.from)
      const to = locations.get(relationship.to)
      if (!from || !to) return null
      return <line
        data-state={state}
        key={`${relationship.from}-${relationship.to}`}
        stroke={lineageStroke(state)}
        strokeOpacity={state === 'default' && selected ? 0.15 : 0.6}
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
  const [unitSize, setUnitSize] = useState(1)
  const [laneUnitSize, setLaneUnitSize] = useState(1)
  const [selected, setSelected] = useState<LearningSelection | undefined>(() => initialSelectionFor(presentation))
  // Which round key's lane is open. Tracked separately from `selected` so that selecting a bit
  // inside the open lane (to inspect its lineage) highlights that bit without closing the lane.
  const [openKeyId, setOpenKeyId] = useState<string | undefined>(() => presentation.initialKeySelection)
  useEffect(() => {
    setUnitSize(1)
    setLaneUnitSize(1)
    setSelected(initialSelectionFor(presentation))
    setOpenKeyId(presentation.initialKeySelection)
  }, [presentation.executionIdentity])
  const related = useMemo(() => relatedBitIds(presentation, selected?.bitIds ?? selected?.id), [presentation, selected])
  const relationships = relationshipsFor(presentation)
  // Unit views keep readable spacing across granularity changes; legacy bit views retain their spacing.
  const rows = presentation.sections.flatMap((section) => section.rows)
  const laneRows = presentation.keyExpansionLane?.rows ?? []
  const laneOpen = openKeyId !== undefined && presentation.keyExpansionLane !== undefined
  const spacingRows = laneOpen || !presentation.keyExpansionLane?.sharedSelection ? laneRows : []
  const lineageGap = presentation.unitSelection ? 24 : Math.max(6, ...rows.map((row) => row.selectableBits?.length ?? 0), ...spacingRows.map((row) => row.selectableBits?.length ?? 0))
  const rawSelectedTarget = selected?.kind === 'bit'
    ? [...rows, ...laneRows].flatMap((row) => row.selectableBits ?? []).find((bit) => bit.id === selected.id)
    : rows.map((row) => row.selectableKey).find((key) => key?.id === selected?.id)
  const sourceRow = presentation.unitSelection && [...rows, ...laneRows].find((row) => row.selectableBits?.some((bit) => bit.id === selected?.id))
  const sourceBits = sourceRow?.selectableBits?.filter((bit) => selected?.bitIds?.includes(bit.id)) ?? []
  const selectedTarget = rawSelectedTarget && sourceRow && sourceBits.length > 1
    ? { ...rawSelectedTarget, ariaLabel: presentation.unitSelection!.rangeLabel(sourceRow as LearningRow, sourceBits[0].bit, sourceBits[sourceBits.length - 1].bit, unitValue(sourceBits)) }
    : rawSelectedTarget
  const lineageContainer = useRef<HTMLDivElement>(null)
  const targets = useRef(new Map<string, HTMLElement>())
  const [lineage, setLineage] = useState<{ readonly measure: number; readonly presentation?: LearningPresentation; readonly width: number; readonly height: number; readonly locations: ReadonlyMap<string, LineageLocation> }>({
    measure: 0,
    width: 0,
    height: 0,
    locations: new Map(),
  })
  const targetRef = (id: string) => (target: HTMLButtonElement | null): void => {
    if (target) targets.current.set(id, target)
    else targets.current.delete(id)
  }
  const select = (next: LearningSelection | undefined): void => {
    setSelected(next)
    presentation.onSelectionChange?.(next)
  }
  // Selecting a bit highlights it for lineage. Presentations without a key-expansion lane keep
  // bit and whole-key selection mutually exclusive (the prior, still-tested behavior); presentations
  // with a lane keep it open so a bit inside it can be inspected without losing the open round key.
  const selectBit = (id: string): void => {
    select({ kind: 'bit', id })
    if (!presentation.keyExpansionLane) setOpenKeyId(undefined)
  }
  const renderKeyChip = (key: LearningRoundKey): ReactNode => {
    const lane = presentation.keyExpansionLane
    const state = lane?.sharedSelection ? (laneOpen ? 'selected' : 'default') : keyState(key, selected, openKeyId, related)
    const label = lane?.sharedSelection ? (laneOpen ? lane.closeLabel : lane.sharedSelection.toggleLabel) : key.ariaLabel
    return <button
      aria-label={label}
      aria-pressed={state === 'selected'}
      data-state={state}
      key={key.id}
      onClick={() => {
        const closing = lane?.sharedSelection ? laneOpen : openKeyId === key.id
        setOpenKeyId(closing ? undefined : key.id)
        if (!presentation.keyExpansionLane?.sharedSelection) select(closing ? undefined : { kind: 'key', id: key.id })
      }}
      ref={targetRef(key.id)}
      style={{ ...stateStyles[state], borderColor: learningColors.border, color: learningColors.text, position: 'relative' }}
      type="button"
    >{lane?.sharedSelection ? label : key.value}</button>
  }

  const renderUnitControl = (scopeRows: readonly Pick<LearningRow, 'selectableBits'>[], size: number, setSize: (size: number) => void, title: string): ReactNode => {
    const widths = scopeRows.flatMap((row) => row.selectableBits?.length ? [row.selectableBits.length] : [])
    if (!presentation.unitSelection || !widths.length) return null
    const copy = presentation.unitSelection
    return <label>{title}: {copy.label}{' '}
      <HTMLSelect
        aria-label={`${title}: ${copy.label}`}
        onChange={(event) => {
          const next = Number(event.target.value)
          if (next === size) return
          setSize(next)
          select(undefined)
        }}
        options={Array.from({ length: Math.min(...widths) }, (_, index) => index + 1).filter((candidate) => widths.every((width) => width % candidate === 0)).map((candidate) => ({ value: candidate, label: copy.sizeLabel(candidate) }))}
        value={size}
      />
    </label>
  }
  const renderUnits = (row: LearningRow, size: number): ReactNode => {
    const copy = presentation.unitSelection!
    const bits = row.selectableBits ?? []
    const units = Array.from({ length: bits.length / size }, (_, index) => bits.slice(index * size, (index + 1) * size))
    return <>
      <span style={{ display: 'inline-flex' }}>
        {units.map((unit, unitIndex) => {
          const first = unit[0]
          const start = unitIndex * size
          const groupSize = row.bitGrouping?.size
          const group = groupSize && start % groupSize === 0 ? start / groupSize : undefined
          const isRelated = unit.some((bit) => related.has(bit.id))
          const isSelected = selected?.kind === 'bit' && selected.id === first.id && selected.bitIds?.length === unit.length
          const state: LearningState = isSelected ? 'selected' : isRelated ? 'related' : 'default'
          const value = unitValue(unit)
          const label = size === 1 ? first.ariaLabel : copy.rangeLabel(row, first.bit, unit[unit.length - 1].bit, value)
          const description = `${label}${isSelected ? `; ${copy.selectedLabel}` : isRelated ? `; ${copy.relatedLabel}` : ''}`
          return <button
            aria-label={description}
            aria-pressed={isSelected}
            data-bit-group={group}
            data-state={state}
            key={first.id}
            onClick={() => select({ kind: 'bit', id: first.id, bitIds: unit.map((bit) => bit.id) })}
            ref={(target) => {
              for (const bit of unit) {
                if (target) targets.current.set(bit.id, target)
                else targets.current.delete(bit.id)
              }
            }}
            style={{ ...stateStyles[state], borderColor: learningColors.border, boxShadow: group ? `-1px 0 0 ${learningColors.border}` : undefined, boxSizing: 'content-box', color: learningColors.text, flexShrink: 0, fontFamily: 'monospace', position: 'relative', width: `${(size === 1 ? 3 : Math.max(8, size >= 4 ? Math.ceil(size / 4) + 2 : size)) + Math.max(0, Math.ceil(size / 8) - 1) * 0.25}ch`, outline: isSelected ? `2px solid ${learningColors.text}` : undefined }}
            title={description}
            type="button"
          >{[...value].map((character, index) => {
            const offset = size >= 4 ? size - (value.length - index) * 4 : index
            // Authored boundaries can fall inside a hexadecimal digit.
            const boundaries = groupSize ? Array.from({ length: size >= 4 ? 4 : 1 }, (_, bit) => bit).filter((bit) => offset + bit > 0 && (start + offset + bit) % groupSize === 0) : []
            const byteStart = size > 8 && index > 2 && (value.length - index) % 2 === 0
            return boundaries.length || byteStart
              ? <span className={byteStart ? 'learning-hex-byte-gap' : undefined} key={index} style={{ display: 'inline-block', position: 'relative' }}>{character}{[...new Set([...boundaries, ...(byteStart ? [0] : [])])].map((bit) => <span
                aria-hidden="true"
                className="learning-unit-separator"
                data-bit-group={boundaries.includes(bit) ? (start + offset + bit) / groupSize! : undefined}
                key={bit}
                style={{ left: byteStart && bit === 0 ? '-0.125ch' : `${bit * (size >= 4 ? 25 : 100)}%` }}
              />)}</span>
              : character
          })}</button>
        })}
      </span>
    </>
  }
  const renderBits = (row: Pick<LearningRow, 'selectableBits' | 'bitGrouping'> & Partial<Pick<LearningRow, 'id' | 'label'>>, size = unitSize): ReactNode => presentation.unitSelection && row.id && row.selectableBits?.length ? renderUnits(row as LearningRow, size) : bitGroups(row).map((group, index) => {
    const buttons = group.map((bit, position) => {
      const state = bitState(bit, selected, related)
      return <button
        aria-label={bit.ariaLabel}
        aria-pressed={state === 'selected'}
        data-state={state}
        key={bit.id}
        onClick={() => selectBit(bit.id)}
        ref={targetRef(bit.id)}
        style={{
          ...stateStyles[state],
          borderColor: learningColors.border,
          // A shadow rather than a border so group boundaries never shift bit columns.
          boxShadow: row.bitGrouping && index && !position ? `-1px 0 0 ${learningColors.border}` : undefined,
          color: learningColors.text,
          position: 'relative',
        }}
        type="button"
      >{bit.value}</button>
    })
    return row.bitGrouping
      ? <span
          data-active={index === row.bitGrouping.active ? 'true' : undefined}
          data-bit-group={index}
          key={index}
          style={{ outline: index === row.bitGrouping.active ? `2px dashed ${learningColors.text}` : undefined, outlineOffset: 2 }}
        >{buttons}</span>
      : buttons
  })
  const controlStyle: CSSProperties = { paddingBlock: relationships.length ? lineageGap : undefined, whiteSpace: 'nowrap' }

  useLayoutEffect(() => {
    const container = lineageContainer.current
    if (!container) return
    const measure = (): void => {
      const bounds = container.getBoundingClientRect()
      const locations = new Map<string, LineageLocation>()
      const groups = new Map<HTMLElement, string>()
      for (const [id, target] of targets.current) {
        const targetBounds = target.getBoundingClientRect()
        if (!groups.has(target)) groups.set(target, id)
        locations.set(id, { x: targetBounds.left - bounds.left + targetBounds.width / 2, y: targetBounds.top - bounds.top + targetBounds.height / 2, group: groups.get(target) })
      }
      setLineage((previous) => ({ measure: previous.measure + 1, presentation, width: bounds.width, height: bounds.height, locations }))
    }
    measure()
    // Font loading can change row metrics after the first layout.
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    return () => observer.disconnect()
  }, [presentation, laneOpen, unitSize, laneUnitSize])

  return <section aria-label={presentation.title} className="learning-presentation" data-lane-open={laneOpen ? 'true' : undefined} style={{ overflowX: 'auto' }}>
    <h3>{presentation.title}</h3>
    {presentation.instructions && <p>{presentation.instructions}</p>}
    {presentation.diagnostics?.filter((item) => item.message !== presentation.instructions).map((item) => <p data-diagnostic-code={item.code} key={`${item.code}-${item.path}`}>{item.message}</p>)}
    {presentation.selectionStatus && <p aria-live="polite" role="status">{presentation.selectionStatus(selectedTarget)}</p>}
    {renderUnitControl(rows, unitSize, setUnitSize, presentation.title)}
    {presentation.keyExpansionLane?.sharedSelection && <div role="toolbar" aria-label={presentation.keyExpansionLane.caption}>
      <Button active={laneOpen} aria-pressed={laneOpen} onClick={() => setOpenKeyId(laneOpen ? undefined : 'schedule')}>{laneOpen ? presentation.keyExpansionLane.closeLabel : presentation.keyExpansionLane.sharedSelection.toggleLabel}</Button>
      <Button onClick={() => select(undefined)}>{presentation.keyExpansionLane.sharedSelection.clearLabel}</Button>
    </div>}
    {presentation.unitSelection && laneOpen && <div>{renderUnitControl(laneRows, laneUnitSize, setLaneUnitSize, presentation.keyExpansionLane!.caption)}</div>}
    {presentation.sections.filter((section) => section.rows.some((row) => row.state === 'incomplete'))
      .map((section) => <p key={`${section.kind}-${section.caption}`} role="status">{section.caption}</p>)}
    <div ref={lineageContainer} style={{ minWidth: '100%', position: 'relative', width: 'max-content' }}>
      {/* Remount per measurement, drawing only this presentation's locations: inserting tens of
          thousands of lines into a mounted SVG is quadratic in React. */}
      <LineageDiagram
        aggregate={!!presentation.unitSelection}
        height={lineage.height}
        key={presentation.unitSelection ? `${lineage.measure}-${selected?.id}-${selected?.bitIds?.length}` : lineage.measure}
        locations={lineage.presentation === presentation ? lineage.locations : new Map()}
        relationships={relationships}
        related={related}
        selected={selected}
        width={lineage.width}
      />
      {presentation.sections.map((section, sectionIndex) => {
        const hasControls = section.rows.some((row) => row.selectableBits?.length || row.selectableKey)
        const hasDetails = section.rows.some((row) => row.detail)
        const lane = laneOpen && hasControls && section.kind === 'trace' ? presentation.keyExpansionLane : undefined
        const key = presentation.unitSelection ? `${section.kind}-${sectionIndex}` : `${section.kind}-${section.caption}`
        const table = <TraceTable caption={section.caption} headers={section.headers} laneHeaders={lane?.headers} joinRows={!!lane} key={key}>
          {lane
            ? (() => {
                const layout = laneLayout(section.rows, lane.rows)
                const first = layout.findIndex((entry) => entry.lane)
                const last = layout.findLastIndex((entry) => entry.lane)
                return layout.map(({ row, lane: laneRow }, index) => {
                  const inLane = index >= first && index <= last
                  // A tinted, bordered block keeps the schedule from reading as part of the cipher trace.
                  const laneStyle: CSSProperties = inLane
                    ? {
                        ...controlStyle,
                        backgroundColor: learningColors.lane,
                        borderTop: index === first ? `2px solid ${learningColors.laneBorder}` : undefined,
                        borderBottom: index === last ? `2px solid ${learningColors.laneBorder}` : undefined,
                      }
                    : controlStyle
                  return <ComparisonRow
                    key={row?.id ?? `lane-${laneRow!.id}`}
                    label={row?.label ?? ''}
                    rowId={row?.id}
                    state={row?.state}
                  >
                    {(row ?? section.rows[0]).cells.map((cell, cellIndex) => row
                      ? <ValueCell ariaLabel={cell.ariaLabel} key={cellIndex} state={cell.state}>{cell.value}</ValueCell>
                      : <td key={cellIndex} />)}
                    <td style={controlStyle}>{row?.selectableKey && renderKeyChip(row.selectableKey)}</td>
                    {Array.from({ length: lane.headers ? lane.headers.length - 1 : 1 }, (_, cellIndex) => <td
                      data-lane-cell={inLane ? 'true' : undefined}
                      key={cellIndex}
                      style={{ ...laneStyle, borderInlineStart: inLane && cellIndex === 0 ? `2px solid ${learningColors.laneBorder}` : undefined, paddingInline: 8 }}
                    >{laneRow?.cells ? hexadecimalValue(laneRow.cells[cellIndex]?.value) : laneRow?.label}</td>)}
                    <td data-lane={inLane ? 'true' : undefined} data-lane-cell={inLane ? 'true' : undefined} data-lane-row={laneRow?.id} style={{ ...laneStyle, borderInlineEnd: inLane ? `2px solid ${learningColors.laneBorder}` : undefined }}>
                      {laneRow && renderBits(laneRow, laneUnitSize)}
                    </td>
                  </ComparisonRow>
                })
              })()
            : section.rows.map((row) => <ComparisonRow key={row.id} label={row.label} rowId={row.id} state={row.state}>
                {row.cells.map((cell, index) => <ValueCell ariaLabel={cell.ariaLabel} key={index} state={cell.state}>{cell.value}</ValueCell>)}
                {hasControls && <td style={controlStyle}>{renderBits(row)}{row.selectableKey && renderKeyChip(row.selectableKey)}</td>}
                {hasDetails && <ValueCell>{row.detail}</ValueCell>}
              </ComparisonRow>)}
        </TraceTable>
        return lane
          ? <div aria-label={lane.caption} key={key} role="region">
              {!lane.sharedSelection && <button onClick={() => { setOpenKeyId(undefined); select(undefined) }} type="button">{lane.closeLabel}</button>}
              {table}
            </div>
          : table
      })}
    </div>
    {laneOpen && presentation.keyExpansionLane?.originalOrder && <details>
      <summary>{presentation.keyExpansionLane.originalOrder.caption}</summary>
      <TraceTable caption={presentation.keyExpansionLane.originalOrder.caption} headers={presentation.keyExpansionLane.originalOrder.headers}>
        {presentation.keyExpansionLane.originalOrder.rows.map((row) => <ComparisonRow key={row.id} label={row.label} rowId={row.id}>
          {row.cells.map((cell, index) => <ValueCell key={index}>{cell.value}</ValueCell>)}
        </ComparisonRow>)}
      </TraceTable>
    </details>}
  </section>
}
