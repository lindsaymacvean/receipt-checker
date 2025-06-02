// Lambda: heartbeatLogger.js
// Triggered by SQS queue HeartbeatQueue - logs heartbeat messages for now
exports.handler = async (event) => {
  for (const record of event.Records) {
    try {
      const body = JSON.parse(record.body);
      console.log("🫀 Heartbeat message received:", JSON.stringify(body));
    } catch (err) {
      console.error("🫀 Heartbeat: failed to parse record body:", record.body, err);
    }
  }
};