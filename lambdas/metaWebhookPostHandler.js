const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const sqsClient = new SQSClient();

// SQS queue URLs for image and text processing
const IMAGE_QUEUE_URL = process.env.IMAGE_PROCESSING_QUEUE_URL;
const TEXT_QUEUE_URL = process.env.TEXT_PROCESSING_QUEUE_URL;

exports.handler = async (event) => {
  // TODO: secure the webhook with a certificate
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

  // Determine which queue to use based on message content (supports Messenger and WhatsApp)
  let queueUrl;
  try {
    // Collect message objects from possible event shapes
    let messages = [];
    // Facebook Messenger format
    const messengerEvents = body.entry?.[0]?.messaging;
    if (Array.isArray(messengerEvents) && messengerEvents.length > 0) {
      messages = messengerEvents.map(evt => evt.message).filter(m => m);
    }
    // WhatsApp Business format
    if (messages.length === 0) {
      const changes = body.entry?.[0]?.changes;
      if (Array.isArray(changes) && changes.length > 0) {
        messages = changes[0].value?.messages || [];
      }
    }
    // Choose queue based on first message type
    if (Array.isArray(messages) && messages.length > 0) {
      const msg = messages[0] || {};
      // Image message (WhatsApp or Messenger attachments)
      if (msg.type === 'image' || msg.image || (Array.isArray(msg.attachments) && msg.attachments.some(att => att.type === 'image'))) {
        queueUrl = IMAGE_QUEUE_URL;
      // Text message (WhatsApp or Messenger)
      } else if (msg.type === 'text' || (msg.text && (typeof msg.text === 'string' || typeof msg.text.body === 'string'))) {
        queueUrl = TEXT_QUEUE_URL;
      } else {
        console.warn('Unsupported message type, defaulting to text queue');
        queueUrl = TEXT_QUEUE_URL;
      }
    } else {
      console.warn('No messaging events found, defaulting to text queue');
      queueUrl = TEXT_QUEUE_URL;
    }
  } catch (err) {
    console.error('Error determining queue URL, defaulting to text queue:', err);
    queueUrl = TEXT_QUEUE_URL;
  }
  console.log(`Selected SQS queue URL: ${queueUrl}`);
  // Send message to the selected SQS queue
  try {
    await sqsClient.send(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(body)
      })
    );
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