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
1. **WhatsApp Cloud API** delivers a message webhook to our API Gateway endpoint (`/meta_webhook`)
2. **API Gateway** invokes a **Lambda function** (`MetaWebhookHandler`)
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
- `lambdas/metaWebhookHandler.js`:  
  Receives and logs messages from Meta; future logic will extract image media.

### Infrastructure
- `template.yaml`:  
  CloudFormation script defining:
  - Lambda function
  - IAM roles
  - API Gateway (`/meta_webhook`)
  - Domain mapping for custom domain (optional)
  - preprod and prod stages
  - Optional CORS config

- `template-sam.yaml`:  
  SAM template for local testing via `sam local start-api`.

### Supporting Scripts
- `deploy.sh`, `teardown.sh`: CLI scripts for deploying and deleting stacks.
- `events/event.json`: Test payload for local simulation.

---

## 🌐 Domains
- Custom domain configured: `receipt-api.ukbennettinnovations.com`
- Supports both `/preprod/meta_webhook` and `/prod/meta_webhook` paths
- Certificates managed via ACM and Lightsail DNS

---

## 🧩 Next Planned Features
- Downloading WhatsApp media using Graph API
- Sending images to Azure for OCR
- Storing structured results
- Chat-based analysis using OpenAI

---

_Last updated: 2025-04-20_