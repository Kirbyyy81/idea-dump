# Companion domain

- Follow the root and library guides. Keep credentials scoped to companion routes only.
- Pairing bootstrap and credential lookup are authentication boundaries. Their service-role RPCs may run before user authentication. Every subsequent query must use the verified user and device.
- Browser approval and device management use authorizeFinance, including mutation origin checks.
- Never log tokens, pairing proofs, notification text, or database error payloads.
- Device credentials cannot confirm, edit, or delete Finance transactions.
