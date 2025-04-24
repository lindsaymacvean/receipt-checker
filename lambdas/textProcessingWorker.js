// Lambda: textProcessingWorker.js
// Triggered by SQS queue (TextProcessingQueue)
// Logs received messages for now

exports.handler = async (event) => {
  for (const record of event.Records) {
    try {
      const messageBody = JSON.parse(record.body);
      console.log("📥 Received text SQS message:", JSON.stringify(messageBody, null, 2));
    } catch (err) {
      console.error("❌ Failed to parse or log message", err);
    }
  }
};