# MetaWebhook

Simple AWS Lambda + API Gateway setup for handling Meta webhooks with CORS support.

## Overview

- This project includes:
- A Node.js 18.x Lambda function (`MetaWebhookHandler`) that logs incoming request bodies to CloudWatch Logs and returns a simple JSON response.
- An API Gateway REST API (`MetaWebhookApi`) with:
  - POST `/meta_webhook` endpoint integrated with the Lambda.
  - OPTIONS method for CORS preflight (Allow-Origin: `*`).
- A single SAM API Gateway deployed with a configurable `StageName` (default `prod`), allowing preprod or prod stages per deployment.

## Repository Structure
```
lambdas/metaWebhookHandler.js    # Lambda handler code
template.yaml                    # AWS SAM template for prod/preprod deployments with StageName parameter
template-sam.yaml                # AWS SAM template for local testing
events/event.json                # Sample event payload for `sam local invoke`
deploy.sh                        # Bash script to build & deploy with StageName, domain, token parameters
test/test_preprod.sh             # Script to test preprod (StageName=preprod) endpoint
test/test_prod.sh                # Script to test prod (StageName=prod or custom domain) endpoint
README.md                        # Project overview and instructions
``` 

## Prerequisites
- AWS CLI configured with default credentials/region
- AWS SAM CLI for local testing
- `curl` or similar for testing HTTP endpoints

## Local Testing with SAM
1. Start the local API:
   ```bash
   sam local start-api -t template-sam.yaml
   ```
   By default, it listens on `http://127.0.0.1:3000`.

2. Test the endpoint:
   ```bash
   curl -v -X POST http://127.0.0.1:3000/meta_webhook \
     -H 'Content-Type: application/json' \
     -d '{"hello":"world"}'
   ```
   Expected response:
   ```json
   {"message":"OK"}
   ```

3. View logs in the SAM terminal; you should see:
   ```
   Request body: {"hello":"world"}
   ```

4. Alternatively, invoke directly without starting the API:
   ```bash
   sam local invoke MetaWebhookHandler \
     -t template-sam.yaml \
     -e events/event.json
   ```

## Deployment
### Using the helper script
By default, `deploy.sh` deploys the stack with `StageName=prod`. To deploy a different stage (e.g., `preprod`), set the `STAGE_NAME` environment variable.
```bash
# For prod (default):
./deploy.sh

# For preprod stage:
STAGE_NAME=preprod ./deploy.sh
```
This deploys `template.yaml` as the `MetaWebhookStack` CloudFormation stack, including IAM capabilities.

### Manual deployment
You can also deploy manually using the AWS SAM CLI. Specify the `StageName` parameter to choose the stage.
```bash
# Deploy prod (default)
sam build --template template.yaml
sam deploy \
  --template-file .aws-sam/build/template.yaml \
  --stack-name MetaWebhookStack \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides StageName=prod

# Deploy preprod
sam build --template template.yaml
sam deploy \
  --template-file .aws-sam/build/template.yaml \
  --stack-name MetaWebhookStack-Preprod \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides StageName=preprod
```

### Endpoints
## Testing
You can use the included scripts to verify your deployment:
```bash
# Preprod tests (requires StageName=preprod deployment)
bash test/test_preprod.sh

# Prod tests (uses custom domain)
bash test/test_prod.sh
```
After deployment, use the CloudFormation `ApiEndpoint` output to find your base URL:
```
ApiEndpoint: https://<api-id>.execute-api.<region>.amazonaws.com/${StageName}/meta_webhook
CustomDomainName: <your custom domain>
``` 
If you have configured a custom domain, the URL will be:
```
https://<CustomDomainName>/${StageName}/meta_webhook
```

## Post-Deployment Configuration
After deploying the stack, you must populate the system user access token used by the WhatsApp Cloud API. The SAM template creates a Secrets Manager secret named `ReceiptCheckerSecrets`.

To set your system user token, run:
```bash
aws secretsmanager put-secret-value \
  --secret-id ReceiptCheckerSecrets \
  --secret-string '{
          "access_token": "YOUR_WA_TOKEN",
          "ocr_endpoint": "https://<app-name>.cognitiveservices.azure.com/formrecognizer/documentModels/prebuilt-receipt:analyze?api-version=2023-07-31",
          "ocr_key": "abc123secret"
        }'
```

Alternatively, you can update the `ReceiptCheckerSecrets` secret via the AWS Console under Secrets Manager.

## Cleanup
```bash
# Manual cleanup via AWS CLI (uses default profile/region)
aws cloudformation delete-stack --stack-name MetaWebhookStack
```

Alternatively, you can use the included `teardown.sh` script to target a specific AWS CLI profile:

```bash
./teardown.sh <aws-profile>
```

## FAQs

If struggling to register a number on whatsapp business platform see here
[https://stackoverflow.com/questions/78348741/the-account-does-not-exist-in-the-cloud-api-whatsapp-business-api-problem-wi](https://stackoverflow.com/questions/78348741/the-account-does-not-exist-in-the-cloud-api-whatsapp-business-api-problem-wi)

If struggling with webhooks from meta see here
[https://stackoverflow.com/questions/79175537/whatsapp-business-api-messages-webhook-not-triggering-even-with-manual-testin](https://stackoverflow.com/questions/79175537/whatsapp-business-api-messages-webhook-not-triggering-even-with-manual-testin)