import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'

export type LearningState = 'default' | 'changed' | 'selected' | 'related' | 'related-changed' | 'warning' | 'incomplete'

export const learningColors = {
  text: '#17324d',
  mutedText: '#4b6075',
  canvas: '#fbfdff',
  border: '#8aa0b6',
  related: '#e0f2fe',
  selected: '#dbeafe',
  changed: '#fff3cd',
  relatedChanged: '#fca5a5',
  warning: '#fee2e2',
  incomplete: '#e5e7eb',
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

/**
 * An optional lane, hidden until a round-key chip in the trace is selected, showing round-key
 * bits aligned under the master-key bits they derive from. `rowsById` supplies bit content only
 * for rows with lane data (the master-key input row and each round-key row); every other trace
 * row renders as an empty filler row so the lane's rows line up one-to-one with the trace.
 */
export type KeyExpansionLane = {
  readonly caption: string
  readonly closeLabel: string
  readonly rowsById: Readonly<Record<string, Pick<LearningRow, 'selectableBits' | 'relationships'>>>
}

export type LearningSelection = { readonly kind: 'bit' | 'key'; readonly id: string }

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
  readonly keyExpansionLane?: KeyExpansionLane
  /** Notified on every bit/chip selection change, including chip open/close/reselect. Lets a
   * caller observe or react to key-expansion lane chip selection without owning the state. */
  readonly onSelectionChange?: (selection: LearningSelection | undefined) => void
}

const relationshipsFor = (presentation: LearningPresentation): readonly LearningRelationship[] => [
  ...presentation.sections.flatMap((section) => section.rows.flatMap((row) => row.relationships ?? [])),
  ...Object.values(presentation.keyExpansionLane?.rowsById ?? {}).flatMap((row) => row.relationships ?? []),
]

export const relatedBitIds = (presentation: LearningPresentation, selected: string | undefined): ReadonlySet<string> => {
  if (!selected) return new Set()
  const relationships = relationshipsFor(presentation)
  const reach = (source: 'from' | 'to', target: 'from' | 'to'): ReadonlySet<string> => {
    const reached = new Set([selected])
    for (let size = 0; size !== reached.size;) {
      size = reached.size
      for (const relationship of relationships) if (reached.has(relationship[source])) reached.add(relationship[target])
    }
    return reached
  }
  return new Set([...reach('from', 'to'), ...reach('to', 'from')])
}

const bitGroups = (row: LearningRow): readonly (readonly LearningBit[])[] => {
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
  selected?.kind === 'bit' && bit.id === selected.id
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
  const [selected, setSelected] = useState<LearningSelection | undefined>(() => initialSelectionFor(presentation))
  // Which round key's lane is open. Tracked separately from `selected` so that selecting a bit
  // inside the open lane (to inspect its lineage) highlights that bit without closing the lane.
  const [openKeyId, setOpenKeyId] = useState<string | undefined>(() => presentation.initialKeySelection)
  useEffect(() => {
    setSelected(initialSelectionFor(presentation))
    setOpenKeyId(presentation.initialKeySelection)
  }, [presentation.executionIdentity])
  const related = useMemo(() => relatedBitIds(presentation, selected?.id), [presentation, selected])
  const relationships = relationshipsFor(presentation)
  // Wider rows carry longer diagonal lines, so give them proportionally more vertical room.
  const lineageGap = Math.max(6, ...presentation.sections.flatMap((section) => section.rows.map((row) => row.selectableBits?.length ?? 0)))
  const rows = presentation.sections.flatMap((section) => section.rows)
  const laneBits = Object.values(presentation.keyExpansionLane?.rowsById ?? {}).flatMap((row) => row.selectableBits ?? [])
  const selectedTarget = selected?.kind === 'bit'
    ? [...rows.flatMap((row) => row.selectableBits ?? []), ...laneBits].find((bit) => bit.id === selected.id)
    : rows.map((row) => row.selectableKey).find((key) => key?.id === selected?.id)
  const lineageContainer = useRef<HTMLDivElement>(null)
  const targets = useRef(new Map<string, HTMLElement>())
  const rowTargets = useRef(new Map<string, HTMLTableRowElement>())
  const [lineage, setLineage] = useState<{ readonly width: number; readonly height: number; readonly locations: ReadonlyMap<string, LineageLocation> }>({
    width: 0,
    height: 0,
    locations: new Map(),
  })
  const [keyExpansionLayout, setKeyExpansionLayout] = useState<{ readonly left: number; readonly top: number; readonly width: number; readonly rowHeights: ReadonlyMap<string, number> } | undefined>(undefined)
  const targetRef = (id: string) => (target: HTMLButtonElement | null): void => {
    if (target) targets.current.set(id, target)
    else targets.current.delete(id)
  }
  const rowRef = (id: string) => (target: HTMLTableRowElement | null): void => {
    if (target) rowTargets.current.set(id, target)
    else rowTargets.current.delete(id)
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
  // Shared between the trace table's own control cell and the open lane: while the lane is open
  // it covers every row's control cell (issue #83 requires covering State flow/Operation detail
  // while the lane is open), so a round-key row's chip renders here - and only here, via the
  // single `targetRef` registration - so that chip stays reachable and can move the open lane to
  // a different round key (or close it) even though the trace table's own copy is hidden beneath.
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

  // Computes the lane's cover position (independent of lineage). Runs first so its resulting
  // `keyExpansionLayout` change (below) drives the second effect to re-measure lineage targets
  // only once the lane's own bit buttons have actually mounted.
  useLayoutEffect(() => {
    const container = lineageContainer.current
    if (!container || !laneOpen) {
      setKeyExpansionLayout(undefined)
      return
    }
    const bounds = container.getBoundingClientRect()
    const coverStart = container.querySelector('[data-cover-start="true"]')
    const firstRow = rows[0] && rowTargets.current.get(rows[0].id)
    if (!coverStart || !firstRow) {
      setKeyExpansionLayout(undefined)
      return
    }
    const coverBounds = coverStart.getBoundingClientRect()
    const firstRowBounds = firstRow.getBoundingClientRect()
    const rowHeights = new Map<string, number>()
    for (const row of rows) {
      const target = rowTargets.current.get(row.id)
      if (target) rowHeights.set(row.id, target.getBoundingClientRect().height)
    }
    setKeyExpansionLayout({
      left: coverBounds.left - bounds.left,
      top: firstRowBounds.top - bounds.top,
      width: bounds.right - coverBounds.left,
      rowHeights,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `rows` is derived from `presentation` every render
  }, [presentation, laneOpen])

  // Measures every registered bit/key target's position for the lineage overlay. Depends on
  // `keyExpansionLayout` so it reruns after the lane's own bit buttons mount (they only exist
  // once the effect above has set a layout), instead of only measuring the main trace table.
  useLayoutEffect(() => {
    const container = lineageContainer.current
    if (!container) return
    const bounds = container.getBoundingClientRect()
    const locations = new Map<string, LineageLocation>()
    for (const [id, target] of targets.current) {
      const targetBounds = target.getBoundingClientRect()
      locations.set(id, { x: targetBounds.left - bounds.left + targetBounds.width / 2, y: targetBounds.top - bounds.top + targetBounds.height / 2 })
    }
    setLineage({ width: bounds.width, height: bounds.height, locations })
  }, [presentation, laneOpen, keyExpansionLayout])

  return <section aria-label={presentation.title} style={{ overflowX: 'auto' }}>
    <h3>{presentation.title}</h3>
    {presentation.instructions && <p>{presentation.instructions}</p>}
    {presentation.selectionStatus && <p aria-live="polite" role="status">{presentation.selectionStatus(selectedTarget)}</p>}
    {presentation.sections.filter((section) => section.rows.some((row) => row.state === 'incomplete'))
      .map((section) => <p key={`${section.kind}-${section.caption}`} role="status">{section.caption}</p>)}
    <div ref={lineageContainer} style={{ minWidth: '100%', position: 'relative', width: 'max-content' }}>
      <LineageDiagram
        height={lineage.height}
        locations={lineage.locations}
        relationships={relationships}
        related={related}
        selected={selected}
        width={lineage.width}
      />
      {presentation.sections.map((section) => {
        const hasControls = section.rows.some((row) => row.selectableBits?.length || row.selectableKey)
        const hasDetails = section.rows.some((row) => row.detail)
        return <TraceTable caption={section.caption} headers={section.headers} key={`${section.kind}-${section.caption}`}>
          {section.rows.map((row) => <ComparisonRow key={row.id} label={row.label} rowId={row.id} rowRef={rowRef(row.id)} state={row.state}>
            {row.cells.map((cell, index) => <ValueCell ariaLabel={cell.ariaLabel} key={index} state={cell.state}>{cell.value}</ValueCell>)}
            {hasControls && <td data-cover-start={presentation.keyExpansionLane ? 'true' : undefined} style={{ paddingBlock: relationships.length ? lineageGap : undefined, whiteSpace: 'nowrap' }}>{bitGroups(row).map((group, index) => {
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
            })}{/* Hidden (rather than removed) while the lane is open: this cell must stay in the
                DOM so `data-cover-start` keeps measuring the covered column's position, but the
                lane renders this same chip on top of it (see `renderKeyChip`) so it remains
                reachable - rendering both would fight over one `targetRef` and duplicate the
                chip's aria-label. */}
            {row.selectableKey && !laneOpen && renderKeyChip(row.selectableKey)}</td>}
            {hasDetails && <ValueCell>{row.detail}</ValueCell>}
          </ComparisonRow>)}
        </TraceTable>
      })}
      {laneOpen && presentation.keyExpansionLane && keyExpansionLayout && <div
        aria-label={presentation.keyExpansionLane.caption}
        role="region"
        style={{
          left: keyExpansionLayout.left,
          position: 'absolute',
          top: keyExpansionLayout.top,
          width: keyExpansionLayout.width,
          zIndex: 1,
        }}
      >
        {/* Positioned above the row-aligned area (not in its normal flow) so the close control
            does not push the lane's rows down and out of alignment with the trace table. */}
        <div style={{ bottom: '100%', position: 'absolute', right: 0 }}>
          <button onClick={() => { setOpenKeyId(undefined); select(undefined) }} type="button">{presentation.keyExpansionLane.closeLabel}</button>
        </div>
        {/* `overflow-x: auto` keeps wide rows (e.g. a 256-bit AES-256 master key) scrollable
            inside the lane's own fixed width instead of widening the page. */}
        <div style={{ overflowX: 'auto', width: '100%' }}>
          {/* No `borderCollapse`/`borderSpacing` override: the trace table above (`TraceTable`)
              sets none either, so both tables share the browser's default row spacing and each
              lane row's forced height (`rowHeights`, from the trace table's own measured rows)
              lines up with its trace-table counterpart instead of drifting row over row. */}
          <table style={{ background: learningColors.canvas, border: `1px solid ${learningColors.border}` }}>
            <tbody>
              {rows.map((row) => {
                const laneRow = presentation.keyExpansionLane!.rowsById[row.id]
                return <tr data-row-id={row.id} key={row.id} style={{ height: keyExpansionLayout.rowHeights.get(row.id) }}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {row.selectableKey && <span style={{ display: 'inline-block', marginRight: 4 }}>{renderKeyChip(row.selectableKey)}</span>}
                    {(laneRow?.selectableBits ?? []).map((bit) => {
                      const state = bitState(bit, selected, related)
                      return <button
                        aria-label={bit.ariaLabel}
                        aria-pressed={state === 'selected'}
                        data-state={state}
                        key={bit.id}
                        onClick={() => selectBit(bit.id)}
                        ref={targetRef(bit.id)}
                        style={{ ...stateStyles[state], borderColor: learningColors.border, color: learningColors.text, display: 'inline-block', height: 20, position: 'relative', width: 16 }}
                        type="button"
                      >{bit.value}</button>
                    })}
                  </td>
                </tr>
              })}
            </tbody>
          </table>
        </div>
      </div>}
    </div>
  </section>
}
