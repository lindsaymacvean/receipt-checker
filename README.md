# Receipt Intelligence Platform (via WhatsApp)

## Purpose
This project allows users to send receipts by WhatsApp. It extracts structured data (merchant, date, amount, items), stores it, and lets users ask natural language questions like “How much did I spend on food last month?” and get smart, conversational answers.

Refer to `AGENTS.md` for full business and architectural context.

### Local Development (Monorepo)

This project uses a true monorepo structure. The backend and frontend have totally separate dependency management and deploy flows. You can run both locally in parallel—ideal for development!

**Start backend API locally:**
```bash
cd backend
sam local start-api -t template-sam.yaml
```

**Start frontend app (in a new terminal):**
```bash
cd frontend
npm run dev
```

- The frontend (Next.js) is at [http://localhost:3000](http://localhost:3000)
- The backend API runs at [http://127.0.0.1:3000/meta_webhook](http://127.0.0.1:3000/meta_webhook) by default (on same port—be sure not to conflict)

> You may want to configure API requests in your frontend (during local dev) to hit the correct endpoint (use proxy or ENV var).

#### Example: Test the local API
```bash
curl -X POST http://127.0.0.1:3000/meta_webhook -H 'Content-Type: application/json' -d '{"hello":"world"}'
```

### Deployment & Testing
See individual frontend/README.md and backend/README.md

### Repository Structure
```
backend/                    # All backend AWS Lambda/SAM/API infra
frontend/                   # Next.js web frontend (dashboard/admin UI)
README.md                   # Main entrypoint for repo documentation
AGENTS.md                   # Agent/AI/maintainers onboarding notes
```

## CI/CD

- **Pre-commit hooks:**
  - `cfn-lint` to lint CloudFormation templates
  - `aws cloudformation validate-template`
  - Run in `backend/` for all CloudFormation/SAM validation (`cfn-lint`)
- **GitHub Actions:**
  - Runs pre-commit checks on push and pull request
  - Validates template.yaml
  - Runs pre-commit checks on push and pull request (usually for `backend/` infra)
  - Frontend is typically built/tested/deployed via separate workflow

## Future Plans

- Smarter duplicate receipt detection (Bayesian methods)
- Currency conversion
- Image archival in S3
- Automated spending summaries
- Reconcilliation with bank/credit card statements
- Admin dashboard
- 'Find it cheaper' mobile app
- Full test strategy, see 'test/context.md'

## Trouble Shooting
If you encounter lint warnings about CloudFormation intrinsic functions (like !Ref, !GetAtt) in VSCode, update your VSCode `settings.json`:

```json
"yaml.schemas": {
  "https://raw.githubusercontent.com/awslabs/goformation/master/schema/cloudformation.schema.json": [
    "backend/template.yaml"
  ],
  "https://raw.githubusercontent.com/awslabs/goformation/master/schema/cloudformation.schema.json": [
    "frontend/template.yaml"
  ]
}
```
This associates the templates with the correct schema for CloudFormation/SAM templates.

---

For full system architecture, philosophy, and RAG strategy, please see `AGENTS.md`.