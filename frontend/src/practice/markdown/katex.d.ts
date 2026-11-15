declare module 'katex' {
  export type KatexOptions = { displayMode?: boolean, throwOnError?: boolean, errorColor?: string }
  export function renderToString(source: string, options?: KatexOptions): string
}
