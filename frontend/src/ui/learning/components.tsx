import type { CSSProperties, ReactNode } from 'react'

export type LearningState = 'default' | 'changed' | 'selected' | 'related' | 'warning' | 'incomplete'

const stateStyles: Record<LearningState, CSSProperties> = {
  default: {},
  changed: { backgroundColor: '#fff3cd' },
  selected: { backgroundColor: '#dbeafe' },
  related: { backgroundColor: '#e0f2fe' },
  warning: { backgroundColor: '#fee2e2' },
  incomplete: { backgroundColor: '#e5e7eb' },
}

export type TraceTableProps = {
  readonly caption: string
  readonly headers: readonly string[]
  readonly children: ReactNode
}

export const TraceTable = ({ caption, headers, children }: TraceTableProps): ReactNode => (
  <table>
    <caption>{caption}</caption>
    <thead>
      <tr>{headers.map((header) => <th key={header} scope="col">{header}</th>)}</tr>
    </thead>
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
    <th scope="row">{label}</th>
    {children}
  </tr>
)

type PassiveValueCellProps = {
  readonly ariaLabel?: never
  readonly onSelect?: never
}

type SelectableValueCellProps = {
  readonly ariaLabel: string
  readonly onSelect: () => void
}

export type ValueCellProps = {
  readonly children: ReactNode
  readonly state?: LearningState
} & (PassiveValueCellProps | SelectableValueCellProps)

export const ValueCell = ({ children, state = 'default', ...selection }: ValueCellProps): ReactNode => (
  <td data-state={state} style={stateStyles[state]}>
    {'onSelect' in selection
      ? <button aria-label={selection.ariaLabel} aria-pressed={state === 'selected'} data-state={state} onClick={selection.onSelect} type="button">{children}</button>
      : children}
  </td>
)

export type FieldLabelProps = {
  readonly children: string
  readonly htmlFor?: string
}

export const FieldLabel = ({ children, htmlFor }: FieldLabelProps): ReactNode =>
  htmlFor ? <label htmlFor={htmlFor}>{children}</label> : <span>{children}</span>
