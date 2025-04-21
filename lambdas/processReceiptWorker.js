/**
 * Lambda function to process receipts from SQS messages.
 * Logs the body of each received message.
 */
exports.handler = async (event) => {
  if (!event.Records || event.Records.length === 0) {
    console.log('No SQS records to process');
    return { status: 'no_records' };
  }
  for (const record of event.Records) {
    console.log('Processing SQS message body:', record.body);
  }
  return { status: 'success' };
};