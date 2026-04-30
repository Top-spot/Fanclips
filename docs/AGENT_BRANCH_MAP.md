# Multi-Agent Branch and Task Map

This repo uses a 6-agent parallel workflow with mobile-first scope.

## Branch Strategy

- `main`: production-ready, protected, merge only from reviewed PRs.
- `develop`: integration branch for validated feature work.
- `feature/agent-1-mobile-shell-nav`
- `feature/agent-2-auth-profile`
- `feature/agent-3-feed-clips-comments`
- `feature/agent-4-upload-processing`
- `feature/agent-5-rewards-notifications`
- `feature/agent-6-quality-performance`

## Agent Ownership

- Agent 1: App shell, bottom nav, responsive layout primitives, route guards UX.
- Agent 2: Authentication, reset password, profile and onboarding preferences.
- Agent 3: Home feed ranking integration, clip detail page, comments and interaction UX.
- Agent 4: Upload page, media processing handoff, clip validation and error handling.
- Agent 5: Rewards page, notification bell/drawer, push notification flows.
- Agent 6: Test coverage, lint/quality gates, performance budget and regression checks.

## Integration Rules

- Each agent opens PRs into `develop`.
- Keep PRs focused and small (single concern).
- Rebase feature branches on latest `develop` before opening PR.
- Do not commit secrets (`.env` stays local).
- Each PR includes mobile viewport screenshots and desktop sanity screenshots.

