#!/usr/bin/env bash
#
# teardown.sh - Remove the CloudFormation stack and all associated resources
# Usage: ./teardown.sh <aws-profile>
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <aws-profile>"
  exit 1
fi

PROFILE="$1"
# Determine region for this profile (fallback to empty if unset)
REGION=$(aws configure get region --profile "$PROFILE" || echo "")

echo "AWS Caller Identity (profile: $PROFILE):"
aws sts get-caller-identity --profile "$PROFILE" || true
echo "AWS Region: ${REGION:-default}"
echo
STACK_NAME="MetaWebhookStack"

echo "Deleting CloudFormation stack '$STACK_NAME'..."
if [ -n "$REGION" ]; then
  aws cloudformation delete-stack --profile "$PROFILE" --region "$REGION" --stack-name "$STACK_NAME"
  aws cloudformation wait stack-delete-complete --profile "$PROFILE" --region "$REGION" --stack-name "$STACK_NAME"
else
  aws cloudformation delete-stack --profile "$PROFILE" --stack-name "$STACK_NAME"
  aws cloudformation wait stack-delete-complete --profile "$PROFILE" --stack-name "$STACK_NAME"
fi

echo "Stack deletion initiated. Verifying..."
if [ -n "$REGION" ]; then
  if aws cloudformation describe-stacks --profile "$PROFILE" --region "$REGION" --stack-name "$STACK_NAME" >/dev/null 2>&1; then
    echo "ERROR: Stack '$STACK_NAME' still exists in profile '$PROFILE' region '${REGION:-default}'"
    exit 1
  fi
else
  if aws cloudformation describe-stacks --profile "$PROFILE" --stack-name "$STACK_NAME" >/dev/null 2>&1; then
    echo "ERROR: Stack '$STACK_NAME' still exists in profile '$PROFILE'"
    exit 1
  fi
fi

echo "Stack '$STACK_NAME' successfully deleted."