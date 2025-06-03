# Receipt Intelligence Platform (via WhatsApp)

This is the Next.js frontend of the Receipt Checker App. 

## Quickstart Guide

### Prerequisites


### Setup

1. **Next.js setup:**
    ```bash
    npm install
    cp .env.local.example .env.local
    ```

2. (Optional) Install VSCode plugins:
   ```

### Local Development (Monorepo)

This project uses a true monorepo structure. The backend and frontend have totally separate dependency management and deploy flows. You can run both locally in parallel—ideal for development!

**Start frontend app (in a separate terminal):**
```bash
npm run dev
```

- The frontend (Next.js) is at [http://localhost:3000](http://localhost:3000)
- The backend API runs at [http://127.0.0.1:3000/meta_webhook](http://127.0.0.1:3000/meta_webhook) by default (on same port—be sure not to conflict)

> You may want to configure API requests in your frontend (during local dev) to hit the correct endpoint (use proxy or ENV var).

#### Example: Test the local API
```bash
curl -X POST http://127.0.0.1:3000/meta_webhook -H 'Content-Type: application/json' -d '{"hello":"world"}'
```

### Deployment

#### Frontend (Next.js):
Deploy with your preferred platform (e.g. Vercel, Netlify, or S3+CloudFront for static export). See `frontend/README.md` for details.

### Testing

### Repository Structure

## Troubleshooting

---

For full system architecture, philosophy, and RAG strategy, please see root `AGENTS.md`.