import React from 'react'

type XorTerm = { readonly left: string; readonly right: string; readonly output: string }

export const XorVisual: React.FC<{ readonly label: string; readonly terms: readonly XorTerm[] }> = ({ label, terms }) =>
  <><p>{label}</p><ul>{terms.map((term) => <li key={`${term.left}-${term.right}-${term.output}`}>{`${term.left} ⊕ ${term.right} = ${term.output}`}</li>)}</ul></>

type SubstitutionLane = { readonly input: string; readonly output: string }

export const SubstitutionVisual: React.FC<{
  readonly lanes: readonly SubstitutionLane[]
  readonly sBox: readonly number[]
  readonly selectedBit?: number
  readonly lookupLabel: string
}> = ({ lanes, sBox, selectedBit, lookupLabel }) => {
  const inputs = lanes.map(({ input }) => input.slice(2))
  const outputs = lanes.map(({ output }) => output.slice(2))
  const selectedNibble = selectedBit === undefined ? undefined : Math.floor(selectedBit / 4)
  const lookup = selectedNibble === undefined ? '' : `${lookupLabel}: S${selectedNibble}[${inputs[0]?.[selectedNibble]}] = ${sBox[parseInt(inputs[0]?.[selectedNibble] ?? '0', 16)]}`
  return <>{lookup && <p>{lookup}</p>}<ul>{lanes.map((lane) => <li key={`${lane.input}-${lane.output}`}>{`${lane.input} → ${lane.output}`}</li>)}</ul></>
}

export const PermutationVisual: React.FC<{ readonly permutation: readonly number[] }> = ({ permutation }) =>
  <ul>{permutation.map((target, source) => <li key={source}>{`${source} → ${target}`}</li>)}</ul>
