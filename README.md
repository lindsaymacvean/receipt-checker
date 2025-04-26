# Receipt Intelligence Platform (via WhatsApp)

## Purpose

This project allows users to send receipts by WhatsApp. It extracts structured data (merchant, date, amount, items), stores it, and lets users ask natural language questions like “How much did I spend on food last month?” and get smart, conversational answers.

Refer to `context.md` for full business and architectural context.

## Quickstart Guide

### Prerequisites

- AWS CLI configured with credentials and region
- AWS SAM CLI for local builds and deployment
- Python 3 for pre-commit hooks
- Node.js 18+ installed
- WhatsApp Business API setup (via Meta/Facebook)
- Secrets stored in AWS Secrets Manager

### Setup

1. Install dependencies:
    ```bash
    pip install cfn-lint pre-commit
    pre-commit install
    npm install
    ```

2. (Optional) Install VSCode plugins:
   - CloudFormation Linter (kddejong)
   - AWS Toolkit

4. (Optional) If you encounter lint warnings about CloudFormation intrinsic functions (like !Ref, !GetAtt) in VSCode, update your VSCode `settings.json`:

   ```json
   "yaml.schemas": {
     "https://raw.githubusercontent.com/awslabs/goformation/master/schema/cloudformation.schema.json": [
       "template.yaml"
     ]
   }
   ```
   This associates `template.yaml` with the correct schema for CloudFormation/SAM templates.

3. Populate Secrets Manager with required secrets:
   ```bash
   aws secretsmanager put-secret-value --secret-id MetaSecrets --secret-string '{"access_token":"YOUR_TOKEN"}'
   aws secretsmanager put-secret-value --secret-id AzureSecrets --secret-string '{"ocr_endpoint":"https://your-endpoint", "ocr_key":"your-key"}'
   aws secretsmanager put-secret-value --secret-id OpenAISecrets --secret-string '{"openai_api_key":"your-openai-key"}'
   aws secretsmanager put-secret-value --secret-id BraveSecrets --secret-string '{"brave_api_key":"your-brave-api-key"}'
   ```

### Local Development

- Run the API locally:
  ```bash
  sam local start-api -t template-sam.yaml
  ```
- Test locally:
  ```bash
  curl -X POST http://127.0.0.1:3000/meta_webhook -H 'Content-Type: application/json' -d '{"hello":"world"}'
  ```

### Deployment

Deploy to pre-production (`dev` branch):
```bash
STAGE_NAME=preprod ./deploy.sh
```

Deploy to production (`main` branch):
```bash
./deploy.sh
```

Outputs will show the deployed endpoint URL.

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

### Repository Structure

```
lambdas/metaWebhookHandler.js       # Webhook handler Lambda
lambdas/imageProcessingWorker.js    # Image processing worker Lambda
lambdas/textProcessingWorker.js     # Text processing worker Lambda
scripts/                            # Helper deployment scripts
template.yaml                       # AWS SAM CloudFormation template
context.md                          # Business and architecture context
README.md                           # Technical guide (you are here)
```

## CI/CD

- **Pre-commit hooks:**
  - `cfn-lint` to lint CloudFormation templates
  - `aws cloudformation validate-template`
- **GitHub Actions:**
  - Runs pre-commit checks on push and pull request
  - Validates template.yaml

## Secrets Management

Secrets required:

- `MetaSecrets`: WhatsApp API token
- `AzureSecrets`: Azure OCR endpoint/key
- `OpenAISecrets`: OpenAI API key
- `BraveSecrets`: Brave Search API key

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

Alternatively, you can use the included `teardown.sh` script to target a specific AWS CLI profile:

```bash
./teardown.sh <aws-profile>
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

---

For full system architecture, philosophy, and RAG strategy, please see `context.md`.