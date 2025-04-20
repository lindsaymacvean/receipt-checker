#!/usr/bin/env bash
#
# deploy.sh - Deploy the SAM application using the AWS SAM CLI
#
set -euo pipefail

# Stack and template settings
STACK_NAME="MetaWebhookStack"
TEMPLATE_FILE="template.yaml"
# S3 bucket for deployment artifacts
S3_BUCKET="meta-webhook-deployments"   # Change this to your actual bucket name
# AWS region and named profile
REGION=$(aws configure get region || echo "us-east-1")
PROFILE="default"                      # Optional: change if you use a named profile

# Ensure deployment S3 bucket exists (needed for SAM deploy artifacts)
echo "Checking S3 bucket '$S3_BUCKET' in region '$REGION'..."
if ! aws s3api head-bucket --bucket "$S3_BUCKET" --region "$REGION" 2>/dev/null; then
  echo "S3 bucket '$S3_BUCKET' does not exist. Creating..."
  if [[ "$REGION" == "us-east-1" ]]; then
    aws s3api create-bucket --bucket "$S3_BUCKET"
  else
    aws s3api create-bucket --bucket "$S3_BUCKET" --create-bucket-configuration LocationConstraint="$REGION"
  fi
  echo "S3 bucket '$S3_BUCKET' created."
fi
CUSTOM_DOMAIN_NAME=${CUSTOM_DOMAIN_NAME:-receipt-api.ukbennettinnovations.com}
# Attempt to locate certificate ARN for the custom domain if not provided
if [ -z "${CERTIFICATE_ARN:-}" ]; then
  echo "Searching for ACM certificate matching domain '$CUSTOM_DOMAIN_NAME'..."
  CERTIFICATE_ARN=$(aws acm list-certificates \
    --region "$REGION" \
    --query "CertificateSummaryList[?DomainName=='$CUSTOM_DOMAIN_NAME'].CertificateArn | [0]" \
    --output text)
  if [ -z "$CERTIFICATE_ARN" ] || [ "$CERTIFICATE_ARN" == "None" ]; then
    echo "❌ Error: ACM certificate for domain '$CUSTOM_DOMAIN_NAME' not found."
    echo "   Please export CERTIFICATE_ARN environment variable with the appropriate ARN."
    exit 1
  fi
  echo "Found certificate ARN: $CERTIFICATE_ARN"
else
  echo "Using provided CERTIFICATE_ARN"
fi
# SAM parameter overrides - supply your custom domain, certificate ARN, and verify token
VERIFY_TOKEN=${VERIFY_TOKEN:-my_super_secret_token_123}

# Determine if custom domain already exists
echo "Checking API Gateway for existing custom domain '$CUSTOM_DOMAIN_NAME'..."
EXISTS=$(aws apigateway get-domain-names --region "$REGION" \
  --query "length(items[?domainName=='$CUSTOM_DOMAIN_NAME'])" --output text)
if [ "$EXISTS" != "0" ]; then
  echo "Custom domain '$CUSTOM_DOMAIN_NAME' already exists; will not create it."
  CREATE_CUSTOM_DOMAIN="false"
else
  echo "Custom domain '$CUSTOM_DOMAIN_NAME' not found; will create it."
  CREATE_CUSTOM_DOMAIN="true"
fi

PARAM_OVERRIDES="CreateCustomDomain=$CREATE_CUSTOM_DOMAIN CustomDomainName=$CUSTOM_DOMAIN_NAME CertificateArn=$CERTIFICATE_ARN VerifyToken=$VERIFY_TOKEN"

echo "AWS Identity:"
aws sts get-caller-identity || true
echo "AWS Region: $REGION"
echo
echo "Building SAM application..."
sam build --template "$TEMPLATE_FILE"

echo "Deploying stack '$STACK_NAME' to region '$REGION' with parameters: $PARAM_OVERRIDES"
sam deploy \
  --template-file .aws-sam/build/template.yaml \
  --stack-name "$STACK_NAME" \
  --s3-bucket "$S3_BUCKET" \
  --capabilities CAPABILITY_IAM \
  --region "$REGION" \
  --profile "$PROFILE" \
  --no-confirm-changeset \
  --no-fail-on-empty-changeset \
  --parameter-overrides $PARAM_OVERRIDES

echo "Deployment complete."