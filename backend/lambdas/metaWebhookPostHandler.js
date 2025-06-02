const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const { DynamoDBClient, GetItemCommand, PutItemCommand } = require('@aws-sdk/client-dynamodb');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const sqsClient = new SQSClient();
// Secrets Manager client for retrieving WhatsApp token
const secretsClient = new SecretsManagerClient();
// Error handler layer
const { handleError } = require('errorHandler');

// SQS queue URLs for image and text processing
const IMAGE_QUEUE_URL = process.env.IMAGE_PROCESSING_QUEUE_URL;
const TEXT_QUEUE_URL = process.env.TEXT_PROCESSING_QUEUE_URL;
// DynamoDB client for user lookup
const ddbClient = new DynamoDBClient();
// Mapping of country calling codes to currency codes
const countryCurrencyMap = {
  '353': 'EUR',
  '44': 'GBP'
};

exports.handler = async (event) => {
  // TODO: secure the webhook with a certificate
  // Context for error handling
  let body;
  let waId;
  let phoneNumberId;
  let metaAccessToken;
  try {
    body = JSON.parse(event.body);
    console.log('Parsed body:', JSON.stringify(body, null, 2));
    // Extract WhatsApp identifiers
    const entry0 = body.entry?.[0];
    const changesArr = entry0?.changes;
    if (Array.isArray(changesArr) && changesArr.length > 0) {
      waId = changesArr[0].value?.contacts?.[0]?.wa_id;
      phoneNumberId = changesArr[0].value?.metadata?.phone_number_id;
    }
    // Retrieve Meta access token for error notifications
    try {
      const sec = await secretsClient.send(new GetSecretValueCommand({ SecretId: process.env.META_SECRET_ID }));
      const metaSecret = JSON.parse(sec.SecretString);
      metaAccessToken = metaSecret.access_token;
    } catch (e) {
      console.error('Error retrieving META_SECRET for error handler', e);
    }
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
        // Use composite key: pk=waId, sk=waId (phone number as sort key)
        const userKey = { pk: { S: waId } };
        const getResp = await ddbClient.send(new GetItemCommand({
          TableName: 'UsersTable',
          Key: userKey
        }));
        if (!getResp.Item) {
          // Save phone number and infer currency
          const phoneNumber = waId;
          let currency = 'USD';
          for (const code in countryCurrencyMap) {
            if (phoneNumber.startsWith(code)) {
              currency = countryCurrencyMap[code];
              break;
            }
          }
          const newUser = {
            ...userKey,
            phoneNumber: { S: phoneNumber },
            currency: { S: currency },
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
              const accessToken = metaAccessToken;
              // Customize welcome text based on incoming message type
              const incomingMessages = changes[0].value?.messages || [];
              const isImageMessage = incomingMessages.some(m => m.type === 'image' || m.image);
              let welcomeText;
              if (isImageMessage) {
                welcomeText = `Thanks for the image! I\'ve queued it to be added to your database of spending. 
                 Feel free to send me another one or ask me a question about your spending.`;
              } else {
                welcomeText = 'Welcome to ReceiptChecker! Ok lets get started. Try sending us a photo of a receipt.';
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
              if (!isImageMessage) {
                // If no image then nothing else to do
                console.log('New user and no image message, so exiting early');
                return {
                  statusCode: 200,
                  headers: { 'Access-Control-Allow-Origin': '*' },
                  body: JSON.stringify({ message: 'Welcome message sent. Awaiting receipt image.' })
                };
              }
            } catch (err) {
              console.error('❌ Error sending welcome message', err);
            }
          } else {
            console.warn('No phone_number_id found, cannot send welcome message');
          }
        } else {
          console.log(`This is an existing user: ${waId}`);
        }

        // TODO: if user exists check has enough credits
        // TODO: if not enough credits and new, send a message to the user to sign up
        // TODO: if not enough credits and existing, send a message to the user to top up

      }

    }
  } catch (err) {
    console.error('Error checking/creating user in UsersTable:', err);
    await handleError(err, { waId, phoneNumberId, accessToken: metaAccessToken });
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
    // 👉 NEW: If still no messages, exit early
    if (!messages || messages.length === 0) {
      console.log('No messages found, skipping processing.');
      return {
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ message: 'No actionable message found, ignored.' })
      };
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
    await handleError(err, { waId, phoneNumberId, accessToken: metaAccessToken });
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
    await handleError(err, { waId, phoneNumberId, accessToken: metaAccessToken });
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