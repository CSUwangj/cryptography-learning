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

## Keep changes reviewable

- Make the smallest change that solves the request. Do not fold in unrelated
  refactors, cleanup, migrations, or new abstractions unless they are needed to
  make that change safe or possible.
- Keep work easy to review. Split independently understandable changes at a
  meaningful boundary; if a larger change must stay together, explain why.
- Match verification to the risk and changed behavior. Start with the narrowest
  meaningful check; run broader checks when a cross-tree contract, build path,
  or deployable behavior is affected. Say which relevant checks were not run.
- Tests should show the requested observable behavior or guard a credible
  regression. Do not rely only on implementation-detail assertions or mocks
  that merely repeat the implementation's assumptions.
- Never delete, weaken, skip, or call a test flaky just to make work pass,
  unless the requested behavior itself is changing and the reason is clear.
- For ambiguous or multi-component work, state the intended behavior,
  assumptions, and evidence that will show it works before changing code.
- Before declaring work complete, read the final diff against the request.
  Passing tests and CI are evidence, not proof that the requested result was
  delivered.
