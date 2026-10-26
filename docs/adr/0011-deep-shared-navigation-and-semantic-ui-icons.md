---
status: accepted
---

# Use a deep shared navigation module and semantic application UI icons

For [#119](https://github.com/CSUWangj/cryptography-learning/issues/119), Learning and Practice keep their distinct domain data and destinations but use one deep category/item navigation module behind a small use-case-level interface. Application-owned UI icons, including shared meanings used by retained demos, have one semantic definition; authored content icons, branding, teaching notation and UI-library internals remain outside that definition. This keeps repeated interaction and icon decisions local, so a change is made once without turning the module into a generic navigation or icon-registration framework.

## Considered Options

- Keep separate Learning and Practice navigation implementations and update duplicated icon literals: rejected because the same interaction and semantic decisions would continue to drift.
- Build a broad generic navigation or icon-registration framework: rejected because it adds an extension mechanism beyond the two existing experiences and their fixed application meanings.

## Consequences

Domain adapters still own catalog mapping, route parsing, localized title fallback and Practice's Completion Records action. Callers must use the shared module's small interface rather than reconstructing popover lifecycle, selection, breadcrumbs or panel layout. Completion Records continues to use the existing theme contract and report layout.
