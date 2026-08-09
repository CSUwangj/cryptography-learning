# Use one Completion Relay per Lab Host

Each Lab Host runs one long-lived Host Completion Relay shared by all Challenges
assigned to that Host. Challenges submit completion reports to their local relay;
the relay alone owns the Host signing key and durable outbox and contacts the
central backend. This keeps keys and delivery behavior out of Challenge
implementations while containing each private key to one Host.
