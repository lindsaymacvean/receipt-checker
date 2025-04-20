# Project Context for AI Assistance

This document provides essential high-level context for the MetaWebhook project. It should be referenced to quickly onboard future AI assistants or developers.

## 1. Purpose
- Receive Meta webhook POST requests at `/meta_webhook`.
- Log incoming JSON payloads to CloudWatch Logs.
- Respond with HTTP 200 and appropriate CORS headers.

## 2. Code Structure
- `lambdas/metaWebhookHandler.js`: Node.js 18.x handler that logs `event.body` and returns `{ message: 'OK' }` with `'Access-Control-Allow-Origin': '*'`.

### Infrastructure as Code
- `template.yaml` (CloudFormation):
  - IAM Role for Lambda logging.
  - Lambda function definition.
  - API Gateway REST API (`MetaWebhookAPI`), resource `/meta_webhook`, POST & OPTIONS methods, dev/prod stages.
  - Optional custom domain (parameters: `CustomDomainName`, `CertificateArn`), DomainName & BasePathMapping.
  - Outputs include API endpoints and DNS info (`DomainNameConfiguration`, `HostedZoneId`).

- `template-sam.yaml` (AWS SAM):
  - `AWS::Serverless::Function` for local testing with `sam local start-api`.
  - Defines API event on POST `/meta_webhook`.

### Deployment Scripts
- `deploy.sh`: Deploy `template.yaml` via AWS CLI, shows caller identity and region.
- `teardown.sh`: Delete the CloudFormation stack for a given AWS CLI profile.

### Events
- `events/event.json`: Sample payload for `sam local invoke`.

## 3. Local Testing (SAM)
```bash
sam local start-api -t template-sam.yaml
curl -X POST http://127.0.0.1:3000/meta_webhook \
     -H 'Content-Type: application/json' \
     -d '{"hello":"world"}'
sam local invoke MetaWebhookHandler -t template-sam.yaml -e events/event.json
```

## 4. Deployment
- Default: `./deploy.sh`
- Manual:
  ```bash
  aws cloudformation deploy \
    --template-file template.yaml \
    --stack-name MetaWebhookStack \
    --capabilities CAPABILITY_IAM \
    --parameter-overrides \
      CustomDomainName=<your-domain> \
      CertificateArn=<your-acm-cert-arn>
  ```

## 5. Teardown
- Default: `aws cloudformation delete-stack --stack-name MetaWebhookStack`
- Specific profile: `./teardown.sh <aws-profile>`

## 6. Notes
- All resources are managed by `MetaWebhookStack`.
- CORS handled via OPTIONS method on API Gateway.
- Lambda code inline in CFN but stored in `lambdas/` for modularity.
  
---
*Last updated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")*