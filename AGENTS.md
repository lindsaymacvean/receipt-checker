## Agents and Monorepo Structure

### Monorepo Layout (As of June 2024)

- `backend/` — AWS Lambda, SAM templates, deployment scripts, all infrastructure code
- `frontend/` — Next.js TypeScript project for admin/dashboard UI
- Each side has **fully separate build and deploy mechanisms** (SAM for backend, Vercel/S3/CloudFront/other for frontend)
- Top-level docs (`README.md`, `context.md`) explain how to run, develop, and deploy each independently

**Quick Start:**
- Backend API: see `backend/README.md` and deploy/test as in root README
- Next.js frontend: run with `npm run dev` in the `frontend/` directory

**Purpose:**
- The frontend is for exploring and visualizing uploaded receipts, managing user/admin actions, and will be extended to integrate with backend APIs (authenticated via Cognito)

---

_Last monorepo restructure: 2024-06-02_