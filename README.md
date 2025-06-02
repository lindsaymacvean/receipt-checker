# Receipt Intelligence Platform (via WhatsApp)

## Purpose

This project allows users to send receipts by WhatsApp. It extracts structured data (merchant, date, amount, items), stores it, and lets users ask natural language questions like “How much did I spend on food last month?” and get smart, conversational answers.

Refer to `AGENTS.md` for full business and architectural context.

## Quickstart Guide

### Prerequisites

- AWS CLI configured with credentials and region
- AWS SAM CLI for local builds and deployment
- Python 3 for pre-commit hooks
- Node.js 18+ installed
- WhatsApp Business API setup (via Meta/Facebook)
- Secrets stored in AWS Secrets Manager

### Setup

1. **Backend AWS/SAM setup:**
    ```bash
    cd backend
    pip install cfn-lint pre-commit
    pre-commit install
    ```

2. **Frontend (Next.js) setup:**
    ```bash
    cd frontend
    npm install
    ```

2. (Optional) Install VSCode plugins:
   - CloudFormation Linter (kddejong)
   - AWS Toolkit

4. (Optional) If you encounter lint warnings about CloudFormation intrinsic functions (like !Ref, !GetAtt) in VSCode, update your VSCode `settings.json`:

```json
"yaml.schemas": {
  "https://raw.githubusercontent.com/awslabs/goformation/master/schema/cloudformation.schema.json": [
    "backend/template.yaml"
  ]
}
```
This associates `backend/template.yaml` with the correct schema for CloudFormation/SAM templates.

3. Populate Secrets Manager with required secrets:
   ```bash
   aws secretsmanager put-secret-value --secret-id MetaSecrets --secret-string '{"access_token":"YOUR_TOKEN"}'
   aws secretsmanager put-secret-value --secret-id AzureSecrets --secret-string '{"ocr_endpoint":"https://your-endpoint", "ocr_key":"your-key"}'
   aws secretsmanager put-secret-value --secret-id OpenAISecrets --secret-string '{"openai_api_key":"your-openai-key"}'
   aws secretsmanager put-secret-value --secret-id BraveSecrets --secret-string '{"brave_api_key":"your-brave-api-key"}'
   ```



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


### Deployment

#### Backend (AWS/SAM):
Deploy to pre-production (`dev` branch):
```bash
cd backend
STAGE_NAME=preprod ./deploy.sh
```
Deploy to production (`main` branch):
```bash
cd backend
./deploy.sh
```
Outputs will show the deployed endpoint URL.

#### Frontend (Next.js):
Deploy with your preferred platform (e.g. Vercel, Netlify, or S3+CloudFront for static export). See `frontend/README.md` for details.

#### Manual Step after first Deployment
- After deploying the SAM stack:
  - Navigate to API Gateway > Custom Domains.
  - Create a custom domain (receipt-api.ukbennettinnovations.com).
  - Add a Base Path Mapping:
    - API: MetaWebhookApi
    - Stage: prod
    - Path: (empty)

### Testing

Test deployed endpoints:
```bash
bash test/test_preprod.sh
bash test/test_prod.sh
```

backend/lambdas/metaWebhookHandler.js       # Webhook handler Lambda
backend/lambdas/imageProcessingWorker.js    # Image processing worker Lambda
backend/lambdas/textProcessingWorker.js     # Text processing worker Lambda
backend/scripts/                            # Helper deployment scripts
backend/template.yaml                       # AWS SAM CloudFormation template
context.md                          # Business and architecture context
README.md                           # Technical guide (you are here)


### Repository Structure

```
backend/                    # All backend AWS Lambda/SAM/API infra
  lambdas/                  # Lambda sources
  layers/                   # Lambda layers
  scripts/                  # Utility/deploy scripts
  template.yaml             # Cloud/SAM stack template
  deploy.sh, teardown.sh    # AWS deployment scripts
frontend/                   # Next.js web frontend (dashboard/admin UI)
test/                       # Integration and API/local e2e test scripts
context.md                  # Project architecture/business overview
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

## Secrets Management

Secrets required:

- `MetaSecrets`: WhatsApp API token
- `AzureSecrets`: Azure OCR endpoint/key
- `OpenAISecrets`: OpenAI API key
- `BraveSecrets`: Brave Search API key
- `ExchangeRateSecrets` : Exchange Rate API key

Stored securely in AWS Secrets Manager.

### GitHub Actions Secrets

When using GitHub Actions for deployment or CI, ensure that your AWS credentials are securely set in the repository's GitHub settings under **Settings > Secrets and variables > Actions**. Set:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- (Optional) `AWS_REGION` if not default

## Cleanup

```bash
# Manual cleanup via AWS CLI (uses default profile/region)
aws cloudformation delete-stack --stack-name MetaWebhookStack
```

Alternatively, you can use the included `backend/teardown.sh` script to target a specific AWS CLI profile:

```bash
./backend/teardown.sh <aws-profile>
```

## Troubleshooting

- If struggling to register a number on whatsapp business platform see here
[https://stackoverflow.com/questions/78348741/the-account-does-not-exist-in-the-cloud-api-whatsapp-business-api-problem-wi](https://stackoverflow.com/questions/78348741/the-account-does-not-exist-in-the-cloud-api-whatsapp-business-api-problem-wi)
- If struggling with webhooks from meta see here
[https://stackoverflow.com/questions/79175537/whatsapp-business-api-messages-webhook-not-triggering-even-with-manual-testin](https://stackoverflow.com/questions/79175537/whatsapp-business-api-messages-webhook-not-triggering-even-with-manual-testin)
- **Webhook not triggering?** Check Meta app settings and webhook subscription URL.
- **CloudFormation errors?** Validate templates manually with `cfn-lint` and `aws cloudformation validate-template`.
- **OCR failures?** Verify Azure Form Recognizer configuration.
- If deleting the entire stack (e.g. starting again), you will need to delete the custom comain link in apigateway and force delete the secrets (because otherwise it takes 7 days)

## Future Plans

- Smarter duplicate receipt detection (Bayesian methods)
- Currency conversion
- Image archival in S3
- Automated spending summaries
- Reconcilliation with bank/credit card statements
- Admin dashboard
- 'Find it cheaper' mobile app
- Full test strategy, see 'test/context.md'

---

For full system architecture, philosophy, and RAG strategy, please see `context.md`.