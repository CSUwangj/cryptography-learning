import React from 'react'

type XorTerm = { readonly left: string; readonly right: string; readonly output: string }

export const XorVisual: React.FC<{ readonly label: string; readonly terms: readonly XorTerm[] }> = ({ label, terms }) =>
  <><p>{label}</p><ul>{terms.map((term) => <li key={`${term.left}-${term.right}-${term.output}`}>{`${term.left} ⊕ ${term.right} = ${term.output}`}</li>)}</ul></>

type SubstitutionLane = { readonly input: string; readonly output: string }

export const SubstitutionVisual: React.FC<{
  readonly lanes: readonly SubstitutionLane[]
  readonly sBox: readonly number[]
  readonly label: string
}> = ({ lanes, sBox, label }) =>
  <><p>{label}</p><ul>{lanes.map(({ input, output }) => <li key={`${input}-${output}`}>
    {`${input} → ${output} (${[...input.slice(2)].map((nibble, index) => `S${index}[${nibble}] = ${sBox[parseInt(nibble, 16)].toString(16)}`).join(', ')})`}
  </li>)}</ul></>

export const PermutationVisual: React.FC<{ readonly permutation: readonly number[] }> = ({ permutation }) =>
  <ul>{permutation.map((target, source) => <li key={source}>{`${source} → ${target}`}</li>)}</ul>
