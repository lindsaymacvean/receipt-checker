IF YOU DO NOT HAVE ENOUGH INFORMATION TO COMPLETE THE TASK PLEASE DO NOT ATTEMPT THE TASK, INSTEAD ASK THE USER FOR THE INFORMATION THAT MIGHT HELP TO COMPLETE THE TASK.

# 📘 Project Context: Receipt Intelligence via WhatsApp

This file provides high-level context for the architecture and business purpose of this project. It is designed to guide AI tooling and new developers in understanding what the system is for, how it is structured, and how its parts relate.

---

## 🧠 Business Purpose

This project enables users to send images of receipts via **WhatsApp** to a designated business number. The goal is to turn messy, offline receipt data into structured, queryable insight.

- Users add our WhatsApp Business number to a **chat** (1:1 only, due to WhatsApp API constraints).
- Users then send **images of receipts** (1 or many).
- The app processes those images using **Azure Form Recognizer** (Document Intelligence).
- Structured receipt data is stored (currently via AWS DynamoDB).
- Users can later **ask questions in WhatsApp** ("How much did I spend on food last week?"), which are:
  - Interpreted via **OpenAI’s GPT API**
  - Answered using the previously stored receipt data

---

## 🏛️ Architectural Overview

This is a serverless, event-driven application hosted on AWS.

### Inbound Flow:
1. **WhatsApp Cloud API** delivers a message webhook to our API Gateway endpoint (`/{StageName}/meta_webhook`)
2. **AWS::Serverless::Api** (`MetaWebhookApi`) invokes **Lambda functions** (`MetaWebhookGetHandler` for GET and `MetaWebhookPostHandler` for POST)
3. **Lambda**:
   - Handles WhatsApp webhook verification (`GET`)
   - Logs incoming messages (`POST`)
   - Extracts media IDs for receipts
   - Optionally fetches media & stores metadata

### Outbound Flow (Planned):
- Another Lambda (or the same one) will:
  - Extract receipt data via **Azure Document Intelligence**
  - Store it in **DynamoDB**
  - Parse natural language queries via **OpenAI GPT**
  - Return analysis to the user via WhatsApp reply API

---
## Agents and Monorepo Structure

### Monorepo Layout (As of June 2024)

- `backend/` — AWS Lambda, SAM templates, deployment scripts, all infrastructure code
- `frontend/` — Next.js TypeScript project for admin/dashboard UI
- Each side has **fully separate build and deploy mechanisms** (SAM for backend, Vercel/S3/CloudFront/other for frontend)
- Top-level docs (`README.md`, `AGENTS.md`) explain how to run, develop, and deploy each independently

**Quick Start:**
- Backend API: see `backend/README.md` and deploy/test as in root README
- Next.js frontend: run with `npm run dev` in the `frontend/` directory

**Purpose:**
- The frontend is for exploring and visualizing uploaded receipts, managing user/admin actions, and will be extended to integrate with backend APIs (authenticated via Cognito)

## 🧱 Key Components Backend
### Lambda Handlers
- `backend/lambdas/metaWebhookGetHandler.js`: handles the GET subscription verification handshake
- `backend/lambdas/metaWebhookHandler.js`: handles incoming POST webhooks and logs payloads

### SAM Templates (local/prod split)

This monorepo often uses the pattern of maintaining both a

- `backend/template.yaml`: Production/prod-ready, with full security (Cognito authorizers, etc.)
- `backend/template-sam.yaml`: Local-only, relaxed (auth/triggers/off), for fast `sam local start-api`

This allows fast Lambda API dev and iteration without full security blocking local runs/testing. **Do not edit out auth from `template.yaml`—instead, modify only `template-sam.yaml` while developing locally.** Push/deploy only the secure template.

### Infrastructure
- `backend/template.yaml`:  
  AWS SAM template defining:
  - Two Lambda functions (GET & POST handlers)
  - Single `AWS::Serverless::Api` (**MetaWebhookApi**) with `StageName` parameter for preprod or prod paths
  - CORS enabled for OPTIONS, GET, POST
  - Custom domain mapping via parameters

- `backend/template-sam.yaml`:  
  SAM template for local testing via `sam local start-api`.

### Supporting Scripts
- `backend/deploy.sh`, `backend/teardown.sh`: CLI scripts for deploying and deleting stacks.
- `test/test_preprod.sh`, `test/test_prod.sh`: scripts to verify preprod and prod endpoints
- `events/event.json`: Test payload for local simulation.

---

## 🌐 Domains
- Custom domain configured: `receipt-api.ukbennettinnovations.com`
- Supports both `/preprod/meta_webhook` and `/prod/meta_webhook` paths via the `StageName` parameter
- Certificates managed via ACM and Lightsail DNS

## Local Development: template-local.yaml and DynamoDB Local

    - Production infra is always described in backend/template.yaml and deployed to AWS.
    - For local work, run backend/scripts/sync-templates.sh after each backend template edit to
regenerate backend/template-local.yaml.
      - This disables Cognito authorizers, making all endpoints open for rapid local use.
      - The script also auto-injects DYNAMODB_ENDPOINT for any Lambda using RECEIPTS_TABLE_NAME, 
so your code talks to DynamoDB Local instead of AWS.
    - Use `docker run -d -p 8000:8000 amazon/dynamodb-local` to start DynamoDB Local.
    - Always create test tables manually in DynamoDB Local as per template-local.yaml.
    - All Lambdas use `DYNAMODB_ENDPOINT` to communicate with DynamoDB Local during local dev.

---

## 🗂️ Data Model Overview

- **UsersTable**:
  - `pk`: WhatsApp ID
  - Attributes: phone number, currency, status, credits

- **ReceiptsTable**:
  - `pk`: USER#<wa_id>
  - `sk`: RECEIPT#<timestamp>#<amount>
  - Attributes: merchant, total, txDate, txTime, items, category, imageId

- **MessagesTable**:
  - `pk`: USER#<wa_id>
  - `sk`: MESSAGE#<timestamp>#<messageId>
  - Attributes: status, raw message, links to receipt

- **ImagesTable**:
  - `imageHash`: SHA-256 hash of image
  - Attributes: messagePk, messageSk

- **CategoryTable**:
  - `companyName`: Company name
  - Attributes: category

---

## 🔗 External Integrations

- **WhatsApp Cloud API**: receiving incoming messages and sending replies.
- **Azure Document Intelligence (Form Recognizer)**: OCR for receipt extraction.
- **OpenAI GPT API**: natural language query understanding and friendly responses.
- **Brave Search API**: infer merchant details and enrich receipt data if necessary.

---

## 🔒 Security Overview

- API keys and tokens (Meta, Azure, OpenAI, Brave) securely retrieved from **AWS Secrets Manager**.
- Webhook endpoint validation via Meta challenge-response during setup.
- Receipt images downloaded using short-lived, authenticated URLs.
- IAM policies restrict Lambdas to only the resources they require.

---

_Last monorepo restructure: 2024-06-02_