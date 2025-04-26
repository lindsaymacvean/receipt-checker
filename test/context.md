📊 Test Strategy for Receipt Intelligence System

1. CloudFormation Template Testing

Tool: cfn-lint

Purpose: Ensure template.yaml and other infrastructure files are syntactically correct and comply with best practices.

Implementation Plan:



2. Unit Testing of Lambda Functions

Tool: jest (Node.js testing framework)

Purpose: Test pure business logic inside each Lambda function individually.

Implementation Plan:



3. Integration Testing

Purpose: Test groups of Lambdas working together by simulating real SQS events, WhatsApp events, and expected downstream behavior.

Implementation Plan:



4. API Gateway Endpoint Testing

Purpose: Ensure the /meta_webhook API endpoints accept WhatsApp webhooks properly and respond with correct status codes.

Implementation Plan:



5. Regression Testing Before Deployment

Purpose: Verify that no unintended changes break receipt parsing, storage, or replies.

Implementation Plan:



6. Optional Enhancements

Contract Testing:

If time allows, write tests that validate WhatsApp, Azure, OpenAI, and Brave API payloads match expected schemas.

Load Testing:

Test SQS handling under load to ensure scaling works

Chaos Testing:

Simulate outages of Azure OCR or OpenAI and validate retries or error handling.

💪 Status Tracker



