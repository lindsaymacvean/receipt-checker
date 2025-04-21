const AWS = require('aws-sdk');
const sqs = new AWS.SQS();

const QUEUE_URL = process.env.RECEIPT_PROCESSING_QUEUE_URL;

exports.handler = async (event) => {
  let body;
  try {
    body = JSON.parse(event.body);
    console.log('Parsed body:', JSON.stringify(body, null, 2));
  } catch (err) {
    console.error('Failed to parse JSON:', err);
    return {
      statusCode: 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Invalid JSON' })
    };
  }

  // Send message to SQS
  try {
    await sqs.sendMessage({
      QueueUrl: QUEUE_URL,
      MessageBody: JSON.stringify(body)
    }).promise();
    console.log('Message sent to SQS');
  } catch (err) {
    console.error('Failed to send to SQS:', err);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Failed to enqueue message' })
    };
  }

  return {
    statusCode: 200,
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ message: 'Queued for processing' })
  };
};