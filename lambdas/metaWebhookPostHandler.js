const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const { DynamoDBClient, GetItemCommand, PutItemCommand } = require('@aws-sdk/client-dynamodb');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const sqsClient = new SQSClient();
// Secrets Manager client for retrieving WhatsApp token
const secretsClient = new SecretsManagerClient();

// SQS queue URLs for image and text processing
const IMAGE_QUEUE_URL = process.env.IMAGE_PROCESSING_QUEUE_URL;
const TEXT_QUEUE_URL = process.env.TEXT_PROCESSING_QUEUE_URL;
// DynamoDB client for user lookup
const ddbClient = new DynamoDBClient();

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
  // Check if this is a WhatsApp message and new user
  try {
    const changes = body.entry?.[0]?.changes;
    if (Array.isArray(changes) && changes.length > 0) {
      const waId = changes[0].value?.contacts?.[0]?.wa_id;
      if (waId) {
        // Use composite key: pk=waId, sk=METADATA
        const userKey = { pk: { S: waId }, sk: { S: 'METADATA' } };
        const getResp = await ddbClient.send(new GetItemCommand({
          TableName: 'UsersTable',
          Key: userKey
        }));
        if (!getResp.Item) {
          const newUser = {
            ...userKey,
            status: { S: 'freetrial' },
            credits: { N: '100' },
            createdAt: { S: new Date().toISOString() }
          };
          await ddbClient.send(new PutItemCommand({
            TableName: 'UsersTable',
            Item: newUser
          }));
          console.log(`New user created: ${waId}`);
          // Send welcome message to the new WhatsApp user
          const phoneNumberId = changes[0].value?.metadata?.phone_number_id;
          if (phoneNumberId) {
            try {
              const sec = await secretsClient.send(new GetSecretValueCommand({ SecretId: process.env.META_SECRET_ID }));
              const metaSecret = JSON.parse(sec.SecretString);
              const accessToken = metaSecret.access_token;
              // Customize welcome text based on incoming message type
              const incomingMessages = changes[0].value?.messages || [];
              const isImageMessage = incomingMessages.some(m => m.type === 'image' || m.image);
              let welcomeText;
              if (isImageMessage) {
                welcomeText = 'Thanks for the image! We\'ve queued your receipt. Feel free to send me another one or ask me a question about your spending.';
              } else {
                welcomeText = 'Welcome to ReceiptChecker! Ok lets get started. Send us a photo of a receipt to get started.';
              }
              const whatsappUrl = `https://graph.facebook.com/v17.0/${phoneNumberId}/messages`;
              const sendResp = await fetch(whatsappUrl, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  messaging_product: 'whatsapp',
                  to: waId,
                  text: { body: welcomeText }
                })
              });
              const sendData = await sendResp.json();
              console.log('✅ Welcome message sent:', JSON.stringify(sendData, null, 2));
            } catch (err) {
              console.error('❌ Error sending welcome message', err);
            }
          } else {
            console.warn('No phone_number_id found, cannot send welcome message');
          }
        }
      }
    }
  } catch (err) {
    console.error('Error checking/creating user in UsersTable:', err);
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