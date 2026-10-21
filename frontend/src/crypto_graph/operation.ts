import type { AuthoredNode, CryptoValue, Diagnostic, OperationManifest, PortType, AlphabetMapping } from './index'

type LineageSource = { readonly port: string; readonly bit: number }
export type LineageDeclaration = Readonly<Record<string, readonly (readonly LineageSource[])[]>>
export type Result<T> = { ok: true; value: T } | { ok: false; diagnostics: readonly Diagnostic[] }

export type Operation<K extends string, P> = {
  manifest: OperationManifest & { identity: K }
  validateParameters?: (parameters: Record<string, unknown>, node: AuthoredNode) => Diagnostic[]
  inferOutputTypes?: (inputTypes: Readonly<Record<string, PortType>>, parameters: Readonly<P>, node?: AuthoredNode) => Result<Readonly<Record<string, PortType>>>
  lineage?: (parameters: Readonly<P>, inputTypes: Readonly<Record<string, PortType>>) => LineageDeclaration
  execute: (inputs: Record<string, CryptoValue>, parameters: P, mappings: ReadonlyMap<string, AlphabetMapping>) => Record<string, CryptoValue>
}
