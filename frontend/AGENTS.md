# Frontend module guidance

- Organize code by owning module: `app`, `practice`, `learning`,
  `completion_board`, `terminal`, `crypto_graph`, `lesson_runtime`,
  `visualizers`, `transport`, and `ui`.
- Create a module directory only when it has real code; do not add empty future
  modules.
- Each top-level module exposes a small explicit public surface, normally
  through `<module>/index.ts`. Callers import from that surface, not from
  implementation files.
- Keep module interfaces small and hide implementation details within the
  owning module.
- Feature modules own their GraphQL documents and map generated results into
  local domain types. Generated GraphQL types are not cross-module domain types.
  Feature mapping layers may import `transport/generated/*` as the codegen seam
  only; other callers still use module entry points.
- Tolerate small duplication initially. Extract code only when repeated uses
  represent the same concept and must change together.
- Shared UI primitives used by multiple modules may move to a narrowly scoped
  `ui` module.
- Shared pure types or encoding helpers may move to a narrowly named foundation
  module.
- Before extracting, first consider whether deepening the owning module's
  interface removes duplication from callers.
- Do not create catch-all `common`, `shared`, or `utils` modules.

## Conditional UI workflow guidance

- When using the `prototype` skill for a UI question, inspect the target route,
  existing components, and local visual conventions first. Keep the prototype
  anchored to those real seams: reuse existing components and content unless
  they are the subject being explored, and mark deliberate stand-ins or
  departures. Carry validated interaction and layout decisions into production;
  do not treat prototype code as production architecture.
- When changing frontend UI, inspect existing Blueprint.js usage in the affected
  module before choosing custom markup or CSS. Prefer the Blueprint 6
  components, classes, and theme behavior already used by the app. Custom
  surface and text colors must follow the active light/dark theme; check both
  themes for visual changes.
