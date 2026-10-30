import { HTMLSelect } from '@blueprintjs/core'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'

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
  readonly children: ReactNode
  /** Removes vertical cell spacing so a block spanning several rows reads as one region. */
  readonly joinRows?: boolean
}

export const TraceTable = ({ caption, headers, children, joinRows }: TraceTableProps): ReactNode => (
  <table style={joinRows ? { borderSpacing: '2px 0' } : undefined}>
    <caption>{caption}</caption>
    <thead><tr>{headers.map((header) => <th key={header} scope="col">{header}</th>)}</tr></thead>
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
  /** Trace row this lane row shares a table row with; unanchored rows follow the previous anchor. */
  readonly anchor?: string
}

/**
 * An optional lane, hidden until a round-key chip in the trace is selected. While open it covers
 * the trace's bit and detail columns. Between anchors, whichever side has fewer rows is padded with
 * empty rows that disappear on close. Anchors must appear in the same order as their trace rows.
 */
export type KeyExpansionLane = {
  readonly caption: string
  readonly closeLabel: string
  readonly rows: readonly KeyExpansionLaneRow[]
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
    readonly relatedLabel: (count: number, size: number, positions: string) => string
    readonly selectedLabel: string
    readonly detailsLabel: string
  }
  readonly keyExpansionLane?: KeyExpansionLane
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
}

export type LineageLocation = { readonly x: number; readonly y: number }

const lineageStroke = (state: LearningState): string => {
  if (state === 'selected' || state === 'related') return learningColors.text
  if (state === 'changed') return learningColors.changed
  if (state === 'warning') return learningColors.warning
  if (state === 'incomplete') return learningColors.incomplete
  return learningColors.mutedText
}

export const LineageDiagram = ({ relationships, locations, width, height, related, selected }: LineageDiagramProps): ReactNode => {
  if (!relationships.length) return null
  const lines = relationships.map((relationship) => ({
    relationship,
    state: relationship.from === selected?.id || relationship.to === selected?.id
      ? 'selected' as const
      : related.has(relationship.from) && related.has(relationship.to)
        ? 'related' as const
        : relationship.state ?? 'default',
  }))
  return <svg aria-hidden="true" data-lineage height={height} style={{ left: 0, pointerEvents: 'none', position: 'absolute', top: 0 }} viewBox={`0 0 ${width} ${height}`} width={width}>
    {[...lines.filter((line) => line.state === 'default'), ...lines.filter((line) => line.state !== 'default')].map(({ relationship, state }) => {
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
  const [unitSizes, setUnitSizes] = useState<Readonly<Record<string, number>>>({})
  const [selected, setSelected] = useState<LearningSelection | undefined>(() => initialSelectionFor(presentation))
  // Which round key's lane is open. Tracked separately from `selected` so that selecting a bit
  // inside the open lane (to inspect its lineage) highlights that bit without closing the lane.
  const [openKeyId, setOpenKeyId] = useState<string | undefined>(() => presentation.initialKeySelection)
  useEffect(() => {
    setUnitSizes({})
    setSelected(initialSelectionFor(presentation))
    setOpenKeyId(presentation.initialKeySelection)
  }, [presentation.executionIdentity])
  const related = useMemo(() => relatedBitIds(presentation, selected?.bitIds ?? selected?.id), [presentation, selected])
  const relationships = relationshipsFor(presentation)
  // Wider rows carry longer diagonal lines, so give them proportionally more vertical room.
  const rows = presentation.sections.flatMap((section) => section.rows)
  const laneRows = presentation.keyExpansionLane?.rows ?? []
  const lineageGap = Math.max(6, ...[...rows, ...laneRows].map((row) => Math.ceil((row.selectableBits?.length ?? 0) / (unitSizes[row.id] ?? 1))))
  const rawSelectedTarget = selected?.kind === 'bit'
    ? [...rows, ...laneRows].flatMap((row) => row.selectableBits ?? []).find((bit) => bit.id === selected.id)
    : rows.map((row) => row.selectableKey).find((key) => key?.id === selected?.id)
  const sourceRow = presentation.unitSelection && rows.find((row) => row.selectableBits?.some((bit) => bit.id === selected?.id))
  const sourceBits = sourceRow?.selectableBits?.filter((bit) => selected?.bitIds?.includes(bit.id)) ?? []
  const selectedTarget = rawSelectedTarget && sourceRow && sourceBits.length > 1
    ? { ...rawSelectedTarget, ariaLabel: presentation.unitSelection!.rangeLabel(sourceRow, sourceBits[0].bit, sourceBits[sourceBits.length - 1].bit, sourceBits.map((bit) => bit.value).join('')) }
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
  const laneOpen = openKeyId !== undefined && presentation.keyExpansionLane !== undefined
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
    const state = keyState(key, selected, openKeyId, related)
    return <button
      aria-label={key.ariaLabel}
      aria-pressed={state === 'selected'}
      data-state={state}
      key={key.id}
      onClick={() => {
        const closing = openKeyId === key.id
        setOpenKeyId(closing ? undefined : key.id)
        select(closing ? undefined : { kind: 'key', id: key.id })
      }}
      ref={targetRef(key.id)}
      style={{ ...stateStyles[state], borderColor: learningColors.border, color: learningColors.text, position: 'relative' }}
      type="button"
    >{key.value}</button>
  }

  const renderUnits = (row: LearningRow): ReactNode => {
    const copy = presentation.unitSelection!
    const bits = row.selectableBits ?? []
    const size = unitSizes[row.id] ?? 1
    const units = Array.from({ length: bits.length / size }, (_, index) => bits.slice(index * size, (index + 1) * size))
    return <>
      <HTMLSelect
        aria-label={`${row.label} (${row.id}): ${copy.label}`}
        onChange={(event) => {
          const next = Number(event.target.value)
          if (next === size) return
          setUnitSizes((previous) => ({ ...previous, [row.id]: next }))
          select(undefined)
        }}
        options={Array.from({ length: bits.length }, (_, index) => index + 1).filter((candidate) => bits.length % candidate === 0).map((candidate) => ({ value: candidate, label: copy.sizeLabel(candidate) }))}
        value={size}
      />{' '}
      <span style={{ display: 'inline-flex' }}>
        {units.map((unit, unitIndex) => {
          const first = unit[0]
          const start = unitIndex * size
          const groupSize = row.bitGrouping?.size
          const group = groupSize && start % groupSize === 0 ? start / groupSize : undefined
          const positions = unit.filter((bit) => related.has(bit.id)).map((bit) => bit.bit)
          const isSelected = selected?.kind === 'bit' && selected.id === first.id && selected.bitIds?.length === unit.length
          const state: LearningState = isSelected ? 'selected' : positions.length ? 'related' : 'default'
          const label = size === 1 ? first.ariaLabel : copy.rangeLabel(row, first.bit, unit[unit.length - 1].bit, unit.map((bit) => bit.value).join(''))
          const relatedLabel = positions.length ? copy.relatedLabel(positions.length, size, positions.join(', ')) : ''
          const description = `${label}${isSelected ? `; ${copy.selectedLabel}` : ''}${relatedLabel ? `; ${relatedLabel}` : ''}`
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
            style={{ ...stateStyles[state], borderColor: learningColors.border, boxShadow: group ? `-2px 0 0 ${learningColors.text}` : undefined, color: learningColors.text, position: 'relative', minWidth: size === 1 ? undefined : '8ch', outline: isSelected ? `2px solid ${learningColors.text}` : undefined }}
            title={description}
            type="button"
          >{unit.map((bit, index) => index && groupSize && (start + index) % groupSize === 0
            ? <span data-bit-group={(start + index) / groupSize} key={bit.id} style={{ boxShadow: `-2px 0 0 ${learningColors.text}` }}>{bit.value}</span>
            : bit.value)}{positions.length > 0 && <small style={{ display: 'block' }}>{positions.length}/{size}</small>}</button>
        })}
      </span>
      {units.some((unit) => unit.some((bit) => related.has(bit.id))) && <details>
        <summary>{copy.detailsLabel}</summary>
        {units.map((unit) => {
          const positions = unit.filter((bit) => related.has(bit.id)).map((bit) => bit.bit)
          return positions.length ? <p key={unit[0].id}>{copy.rangeLabel(row, unit[0].bit, unit[unit.length - 1].bit, unit.map((bit) => bit.value).join(''))}; {copy.relatedLabel(positions.length, size, positions.join(', '))}</p> : null
        })}
      </details>}
    </>
  }
  const renderBits = (row: Pick<LearningRow, 'selectableBits' | 'bitGrouping'> & Partial<Pick<LearningRow, 'id' | 'label'>>): ReactNode => presentation.unitSelection && row.id && row.selectableBits?.length ? renderUnits(row as LearningRow) : bitGroups(row).map((group, index) => {
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
          boxShadow: row.bitGrouping && index && !position ? `-2px 0 0 ${learningColors.text}` : undefined,
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
      for (const [id, target] of targets.current) {
        const targetBounds = target.getBoundingClientRect()
        locations.set(id, { x: targetBounds.left - bounds.left + targetBounds.width / 2, y: targetBounds.top - bounds.top + targetBounds.height / 2 })
      }
      setLineage((previous) => ({ measure: previous.measure + 1, presentation, width: bounds.width, height: bounds.height, locations }))
    }
    measure()
    // Font loading can change row metrics after the first layout.
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    return () => observer.disconnect()
  }, [presentation, laneOpen, unitSizes])

  return <section aria-label={presentation.title} style={{ overflowX: 'auto' }}>
    <h3>{presentation.title}</h3>
    {presentation.instructions && <p>{presentation.instructions}</p>}
    {presentation.diagnostics?.filter((item) => item.message !== presentation.instructions).map((item) => <p data-diagnostic-code={item.code} key={`${item.code}-${item.path}`}>{item.message}</p>)}
    {presentation.selectionStatus && <p aria-live="polite" role="status">{presentation.selectionStatus(selectedTarget)}</p>}
    {presentation.sections.filter((section) => section.rows.some((row) => row.state === 'incomplete'))
      .map((section) => <p key={`${section.kind}-${section.caption}`} role="status">{section.caption}</p>)}
    <div ref={lineageContainer} style={{ minWidth: '100%', position: 'relative', width: 'max-content' }}>
      {/* Remount per measurement, drawing only this presentation's locations: inserting tens of
          thousands of lines into a mounted SVG is quadratic in React. */}
      <LineageDiagram
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
        const table = <TraceTable caption={section.caption} headers={section.headers} joinRows={!!lane} key={key}>
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
                        borderInline: `2px solid ${learningColors.laneBorder}`,
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
                    <td data-lane={inLane ? 'true' : undefined} data-lane-row={laneRow?.id} style={laneStyle}>
                      {laneRow?.label && <span style={{ marginInline: 8 }}>{laneRow.label}</span>}
                      {laneRow && renderBits(laneRow)}
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
              <button onClick={() => { setOpenKeyId(undefined); select(undefined) }} type="button">{lane.closeLabel}</button>
              {table}
            </div>
          : table
      })}
    </div>
  </section>
}
