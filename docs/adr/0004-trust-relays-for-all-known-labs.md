# Trust Completion Relays for all known Labs

A configured Host Completion Relay key may submit Completion Evidence for any Lab
known to the central backend in the configured Course Run. The relay trusts the Lab
ID reported by a Challenge on its private Host network, so relay configuration does
not repeat Host-to-Lab assignments. This avoids duplicating the private Lab Registry;
a compromised or misconfigured trusted Host can submit claims for another known Lab
and is deliberately outside the protocol's threat model.
