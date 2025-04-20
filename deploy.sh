#!/usr/bin/env bash
#
# deploy.sh - Deploy the SAM application using the AWS SAM CLI
#
set -euo pipefail

# Stack and template settings
STACK_NAME="MetaWebhookStack"
TEMPLATE_FILE="template.yaml"
S3_BUCKET="meta-webhook-deployments"   # You can change this to your actual bucket name
REGION=$(aws configure get region || echo "us-east-1")
PROFILE="default"                      # Optional: change if you use a named profile

echo "🔐 AWS Identity:"
aws sts get-caller-identity || true
echo "🌍 AWS Region: $REGION"
echo
echo "📦 Building SAM application..."
sam build --template "$TEMPLATE_FILE"

echo "🚀 Deploying stack '$STACK_NAME' to region '$REGION'..."
sam deploy \
  --template-file .aws-sam/build/template.yaml \
  --stack-name "$STACK_NAME" \
  --s3-bucket "$S3_BUCKET" \
  --capabilities CAPABILITY_IAM \
  --region "$REGION" \
  --profile "$PROFILE" \
  --confirm-changeset \
  --no-fail-on-empty-changeset

echo "✅ Deployment complete."