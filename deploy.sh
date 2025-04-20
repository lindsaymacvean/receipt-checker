#!/usr/bin/env bash
#
# deploy.sh - Deploy the CloudFormation stack using AWS CLI
#
set -euo pipefail

# Name of the CloudFormation stack
STACK_NAME="MetaWebhookStack"

# CloudFormation template file to deploy
TEMPLATE_FILE="template.yaml"

echo "Deploying stack '$STACK_NAME' with template '$TEMPLATE_FILE'..."

aws cloudformation deploy \
  --template-file "$TEMPLATE_FILE" \
  --stack-name "$STACK_NAME" \
  --capabilities CAPABILITY_IAM

echo "Deployment complete."