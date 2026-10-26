# Script-owned handoff check plan

## Status

Accepted decision for [#118](https://github.com/CSUWangj/cryptography-learning/issues/118).

The handoff script owns staged scope discovery and check-plan selection. `create`
derives a Check Plan from staged target paths, freezes commands, working
directories, environment values, and reasons in the Handoff Packet, and prints
the packet path and snapshot identity. `run PACKET` executes that frozen plan;
the hidden label form exists only to rerun one planned check.

This removes repeated caller configuration from AI instructions and prevents a
caller from presenting an unrelated command as acceptance evidence. The
trade-off is that a missing or unsuitable check must be corrected in the
internal planner, followed by a new packet; routine callers lose custom check
commands and paths. CI continues to invoke the planner directly so its existing
coverage remains unchanged.
