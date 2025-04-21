#!/usr/bin/env bash
# Test script for Prod endpoint of MetaWebhook API
set -euo pipefail
set -x

### Test script for Prod endpoint via custom domain ###
# Custom domain for Prod endpoint (override with env var if needed)
CUSTOM_DOMAIN_NAME=${CUSTOM_DOMAIN_NAME:-receipt-api.ukbennettinnovations.com}
# Verification token (must match deployed VerifyToken)
VERIFY_TOKEN=${VERIFY_TOKEN:-my_super_secret_token_123}

# Construct the Prod endpoint URL using the custom domain and stage
ENDPOINT="https://${CUSTOM_DOMAIN_NAME}/meta_webhook"

echo "Testing Prod endpoint via custom domain: $ENDPOINT"

# 1) GET handshake test
CHALLENGE="prodTestChallenge456"
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