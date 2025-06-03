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