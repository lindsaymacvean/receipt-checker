# Receipt Intelligence Platform (via WhatsApp)
This is the backend API for the Receipt Intelligence Platform. It is a AWS SAM application that uses AWS Lambda and AWS API Gateway to process WhatsApp messages and extract structured data from receipts.

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
    pip install cfn-lint pre-commit
    pre-commit install
    cd lambdas
    npm install
    cd ..
    ```

2. (Optional) Install VSCode plugins:
   - CloudFormation Linter (kddejong)
   - AWS Toolkit

3. Populate Secrets Manager with required secrets:
   ```bash
   aws secretsmanager put-secret-value --secret-id MetaSecrets --secret-string '{"access_token":"YOUR_TOKEN"}'
   aws secretsmanager put-secret-value --secret-id AzureSecrets --secret-string '{"ocr_endpoint":"https://your-endpoint", "ocr_key":"your-key"}'
   aws secretsmanager put-secret-value --secret-id OpenAISecrets --secret-string '{"openai_api_key":"your-openai-key"}'
   aws secretsmanager put-secret-value --secret-id BraveSecrets --secret-string '{"brave_api_key":"your-brave-api-key"}'
   ```

**Start API locally:**
```bash
sam local start-api -t template-local.yaml
```

- The backend API runs at [http://127.0.0.1:3000/meta_webhook](http://127.0.0.1:3000/meta_webhook) by default (on same port—be sure not to conflict)

#### Example: Test the local API
```bash
curl -X POST http://127.0.0.1:3000/meta_webhook -H 'Content-Type: application/json' -d '{"hello":"world"}'
```

### Development


### Deployment
#### Backend (AWS/SAM):
Deploy to pre-production (`dev` branch):
```bash
STAGE_NAME=preprod ./deploy.sh
```
Deploy to production (`main` branch):
```bash
./deploy.sh
```
Outputs will show the deployed endpoint URL.

#### Manual Step after first Backend Deployment
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

lambdas/metaWebhookHandler.js       # Webhook handler Lambda
lambdas/imageProcessingWorker.js    # Image processing worker Lambda
lambdas/textProcessingWorker.js     # Text processing worker Lambda

### Repository Structure

```
lambdas/                  # Lambda sources
layers/                   # Lambda layers
scripts/                  # Utility/deploy scripts
template.yaml             # Cloud/SAM stack template
deploy.sh, teardown.sh    # AWS deployment scripts
test/                       # Integration and API/local e2e test scripts
README.md                   # Main entrypoint for repo documentation
```


## CI/CD
- **Pre-commit hooks:**
  - `cfn-lint` to lint CloudFormation templates
  - `aws cloudformation validate-template`
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

---

For full system architecture, philosophy, and RAG strategy, please see `context.md`.