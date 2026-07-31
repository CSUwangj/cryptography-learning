# Frontend module guidance

- Organize code by owning module: `app`, `practice`, `learning`,
  `completion_board`, `terminal`, `crypto_graph`, `lesson_runtime`,
  `visualizers`, and `transport`.
- Keep module interfaces small and hide implementation details within the
  owning module.
- Tolerate small duplication initially. Extract code only when repeated uses
  represent the same concept and must change together.
- Shared UI primitives used by multiple modules may move to a narrowly scoped
  `ui` module.
- Shared pure types or encoding helpers may move to a narrowly named foundation
  module.
- Before extracting, first consider whether deepening the owning module's
  interface removes duplication from callers.
- Do not create catch-all `common`, `shared`, or `utils` modules.
