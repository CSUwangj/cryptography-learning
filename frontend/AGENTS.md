# Frontend module guidance

- Organize code by owning module: `app`, `practice`, `learning`,
  `completion_board`, `terminal`, `crypto_graph`, `lesson_runtime`,
  `visualizers`, and `transport`.
- Create a module directory only when it has real code; do not add empty future
  modules.
- Each module exposes one public entry at `<module>/index.ts`. Callers import
  from that entry, not from implementation files.
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
