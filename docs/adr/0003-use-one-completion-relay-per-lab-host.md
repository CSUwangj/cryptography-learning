# Use one Completion Relay per Lab Host

Each Lab Host runs one long-lived Host Completion Relay shared by all Challenges
assigned to that Host. Challenges submit completion reports to their local relay;
the relay alone owns the Host signing key, creates Completion Evidence, and
synchronously submits it to the central backend. Failed delivery is logged with
the exact signed evidence for manual replay. This keeps keys and backend protocol
behavior out of Challenge implementations while containing each private key to
one Host, without adding a local outbox or automated recovery system.
