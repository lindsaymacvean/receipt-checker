# MetaWebhook

Simple AWS Lambda + API Gateway setup for handling Meta webhooks with CORS support.

## Overview

This project includes:
- A Node.js 18.x Lambda function (`MetaWebhookHandler`) that logs incoming request bodies to CloudWatch Logs and returns a simple JSON response.
- An API Gateway REST API (`MetaWebhookAPI`) with:
  - POST `/meta_webhook` endpoint integrated with the Lambda.
  - OPTIONS method for CORS preflight (Allow-Origin: `*`).
- Two deployment stages: `dev` and `prod`, with separate endpoints.

## Repository Structure
```
lambdas/metaWebhookHandler.js    # Lambda handler code
template.yaml                    # CloudFormation template for production deployments
template-sam.yaml                # AWS SAM template for local testing
events/event.json                # Sample event payload for `sam local invoke`
deploy.sh                        # Bash script to deploy `template.yaml`
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
Run:
```bash
./deploy.sh
```
This deploys `template.yaml` as the `MetaWebhookStack` CloudFormation stack, including IAM capabilities.

### Manual deployment
```bash
aws cloudformation deploy \
  --template-file template.yaml \
  --stack-name MetaWebhookStack \
  --capabilities CAPABILITY_IAM
```

### Endpoints
After deployment, your endpoints are:
- Dev stage: `https://<api-id>.execute-api.<region>.amazonaws.com/dev/meta_webhook`
- Prod stage: `https://<api-id>.execute-api.<region>.amazonaws.com/prod/meta_webhook`

Outputs with exact URLs are available in the CloudFormation stack outputs.

## Cleanup
```bash
aws cloudformation delete-stack --stack-name MetaWebhookStack
```