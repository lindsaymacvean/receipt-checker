#!/bin/bash

# Path to your main and local SAM templates
MAIN_TEMPLATE="template.yaml"
LOCAL_TEMPLATE="template-local.yaml"

# Copy the main template to local
cp "$MAIN_TEMPLATE" "$LOCAL_TEMPLATE"

# Remove Cognito authorizers for local use (basic, regex-based)
# You can tweak the pattern below to suit your structure
#sed -i '' 's/Authorizer: CognitoAuthorizer/Authorizer: None/' $LOCAL_TEMPLATE
# awk '
# /^\s*Auth:/ { skip=1; next }
# /^\S/      { skip=0 }
# !skip
# ' "$MAIN_TEMPLATE" > "$LOCAL_TEMPLATE"

# Add DYNAMODB_ENDPOINT to every Lambda using RECEIPTS_TABLE_NAME if not already present
# This assumes env block and RECEIPTS_TABLE_NAME are at the same level of indentation.
sed -i '' '/RECEIPTS_TABLE_NAME:/a\
          DYNAMODB_ENDPOINT: http://host.docker.internal:8000
    ' "$LOCAL_TEMPLATE"

# Optional: echo for feedback
echo "Synced $MAIN_TEMPLATE to $LOCAL_TEMPLATE with Cognito authorizers removed."