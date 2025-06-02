## Agents and Monorepo Structure

This codebase now includes a Next.js frontend in the `frontend/` directory. The `frontend` app is designed to provide a web dashboard for viewing, managing, and querying uploaded receipts, and may allow administrative or user access, authenticated via Cognito.

**Additional Details:**
- This monorepo includes both backend (AWS Lambda, SAM, API Gateway) and frontend (Next.js) code for development and deployment consistency.
- See the root `README.md` for starter commands for local development and deployment.

_Added 2024-06-02: Next.js admin/frontend scaffold integrated._