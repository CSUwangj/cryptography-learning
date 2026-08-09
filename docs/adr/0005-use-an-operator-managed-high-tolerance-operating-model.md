# Use an operator-managed, high-tolerance operating model

This repository is primarily a maintainer's side project. Its use in a real university does not
imply enterprise availability, scale, or unattended-operation requirements. It is a small,
operator-managed educational system in which brief downtime and manual intervention are
acceptable.

Ordinary user data should receive the storage behavior the product explicitly promises. After an
exceptional infrastructure failure, an operator may diagnose and repair state, restore a backup,
regenerate configuration or keys, or ask a student to repeat an action. Agents must not infer
zero-downtime operation, extraordinary crash durability, automated recovery, self-healing, or a
recovery objective. Irreplaceable data or secrets must be identified during specification, and a
stronger guarantee requires explicit maintainer approval.

The default threat model treats browser and network input as untrusted. It must not gain
unauthorized access, corrupt trusted state, execute code, or disclose secrets. Configured
operators, the deployment environment, Lab Hosts, and maintainer-selected dependencies are
trusted unless another recorded decision narrows that trust. In particular, ADR 0004 deliberately
places a compromised or misconfigured trusted Lab Host outside the Completion Evidence protocol's
threat model.

Do not infer defenses against a compromised Host, malicious operator, hostile local user,
dependency compromise, nation-state attacker, sophisticated traffic analysis, or unusually large
denial-of-service load. Adding one of those actors or capabilities requires a concrete threat and
example, current evidence, costs, a simpler accepted-risk alternative, and explicit maintainer
approval.

These defaults favor the smallest design that is correct for ordinary operation. Tickets record
only approved deviations rather than repeating this decision.
