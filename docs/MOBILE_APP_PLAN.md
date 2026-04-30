# Fanclips Mobile-First Plan

This project is developed mobile-first, while continuously validating desktop browser compatibility.

## Product Direction

- Primary target: mobile users (touch interactions, vertical feed ergonomics, low-bandwidth resilience).
- Secondary target: desktop browser support for admin, creator workflows, and QA.
- Current runtime: React + Vite web app, optimized as a PWA while preparing a future native wrapper path.

## Build and Test Defaults

- Local dev: `npm run dev`
- Unit tests: `npm run test`
- Lint checks: `npm run lint`
- Production build: `npm run build`

## Browser QA Matrix

- Mobile: Chrome (Android emulation), Safari viewport profile, Samsung Internet profile.
- Desktop: Chrome, Edge.
- Responsive breakpoints:
  - 360x800 (small Android)
  - 390x844 (iPhone 13/14 profile)
  - 768x1024 (tablet portrait)
  - 1366x768 (desktop baseline)

## Mobile-First Engineering Rules

- Design and implement for 360px width first, then scale up.
- Avoid hover-only UI for primary actions.
- Keep tap targets >= 44px where possible.
- Guard all heavy effects for low-end devices.
- Prefer lazy loading and list virtualization for feed-heavy screens.

