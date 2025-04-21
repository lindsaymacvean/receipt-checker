// Lambda: processReceiptWorker.js
// Triggered by SQS queue (ReceiptProcessingQueue)
// Goal: Log incoming WhatsApp messages, and later process receipts

export const handler = async (event) => {
  for (const record of event.Records) {
    try {
      const messageBody = JSON.parse(record.body);
      console.log("📥 Received SQS message:", JSON.stringify(messageBody, null, 2));

      // TODO: Step 2a - Extract image ID from messageBody
      // const imageId = messageBody.entry[0]?.changes[0]?.value?.messages?.[0]?.image?.id;

      // TODO: Step 2b - Use Secrets Manager to get WhatsApp token
      // TODO: Step 2c - Get download URL for media from Graph API
      // TODO: Step 2d - Download media
      // TODO: Step 2e - Send image to Azure OCR
      // TODO: Step 2f - Parse OCR result and write to ReceiptsTable
      // TODO: Step 2g - Optionally link back to MessagesTable

    } catch (err) {
      console.error("❌ Failed to process SQS record", err);
    }
  }
};
