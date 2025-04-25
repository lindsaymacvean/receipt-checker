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

## 🧱 Key Components

### Lambda Handlers
- `lambdas/metaWebhookGetHandler.js`: handles the GET subscription verification handshake
- `lambdas/metaWebhookHandler.js`: handles incoming POST webhooks and logs payloads

### Infrastructure
- `template.yaml`:  
  AWS SAM template defining:
  - Two Lambda functions (GET & POST handlers)
  - Single `AWS::Serverless::Api` (**MetaWebhookApi**) with `StageName` parameter for preprod or prod paths
  - CORS enabled for OPTIONS, GET, POST
  - Custom domain mapping via parameters

- `template-sam.yaml`:  
  SAM template for local testing via `sam local start-api`.

### Supporting Scripts
- `deploy.sh`, `teardown.sh`: CLI scripts for deploying and deleting stacks.
- `test/test_preprod.sh`, `test/test_prod.sh`: scripts to verify preprod and prod endpoints
- `events/event.json`: Test payload for local simulation.

---

## 🌐 Domains
- Custom domain configured: `receipt-api.ukbennettinnovations.com`
- Supports both `/preprod/meta_webhook` and `/prod/meta_webhook` paths via the `StageName` parameter
- Certificates managed via ACM and Lightsail DNS

---

## 🧩 Next Planned Features
1. **metaWebhookPostHandler.js**
    * Secure the webhook (e.g., with TLS client cert or validation certificate)
    * Enforce credit checks:
          • If a user exists, verify they have enough credits
          • If new and no credits, prompt signup
          • If existing and out of credits, prompt recharge
2. **imageProcessingWorker.js**
    * Backup receipt images to S3
    * Convert amounts to the user’s currency (currency conversion)
    * Handle low‐confidence OCR results (alert user for manual review)
    * Detect likely duplicates via Bayesian logic, notify the user
    * Update the `ImagesTable` with receipt reference (pk/sk & status)
    * Populate a summary table (daily/weekly/monthly spend by vendor/category)
    * Deduct credits per receipt processed

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

_Last updated: 2025-04-25_