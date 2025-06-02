#!/usr/bin/env bash
# Test script for Preprod endpoint of MetaWebhook API
set -euo pipefail
set -x

### Test script for Preprod endpoint ###
# Use CFN ApiEndpoint output (should be deployed with StageName=preprod)
STACK_NAME=${STACK_NAME:-MetaWebhookStack}
# Verification token (must match deployed VerifyToken)
VERIFY_TOKEN=${VERIFY_TOKEN:-my_super_secret_token_123}

# Fetch the ApiEndpoint output from CloudFormation
ENDPOINT=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --query "Stacks[0].Outputs[?OutputKey=='ApiEndpoint'].OutputValue" \
  --output text)

echo "Testing Preprod endpoint: $ENDPOINT"

# 1) GET handshake test
CHALLENGE="testChallenge123"
echo -e "\n[GET handshake] challenge=$CHALLENGE"
HTTP_CODE=$(curl -v -o response.txt -w "%{http_code}" \
  -G "$ENDPOINT" \
  --data-urlencode "hub.mode=subscribe" \
  --data-urlencode "hub.verify_token=$VERIFY_TOKEN" \
  --data-urlencode "hub.challenge=$CHALLENGE")
echo "HTTP status: $HTTP_CODE"
echo "Response body: $(cat response.txt)"

# 2) POST webhook test
echo -e "\n[POST webhook] payload={\\"hello\\":\\"world\\"}"
HTTP_CODE=$(curl -v -o response.txt -w "%{http_code}" \
  -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -d '{"hello":"world"}')
echo "HTTP status: $HTTP_CODE"
echo "Response body: $(cat response.txt)"

# Cleanup
rm -f response.txt