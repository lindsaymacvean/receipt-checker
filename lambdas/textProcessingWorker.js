// Lambda: textProcessingWorker.js
// Triggered by SQS queue (TextProcessingQueue)
// Fetches text messages and sends to OpenAI Chat Completions API

const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const secretsClient = new SecretsManagerClient();

exports.handler = async (event) => {
  const secretId = process.env.OPENAI_SECRET_ID;
  if (!secretId) {
    console.error('Missing OPENAI_SECRET_ID in environment');
    return;
  }
  let openaiApiKey;
  try {
    const sec = await secretsClient.send(new GetSecretValueCommand({ SecretId: secretId }));
    const secret = JSON.parse(sec.SecretString);
    openaiApiKey = secret.openai_api_key;
    if (!openaiApiKey) {
      throw new Error('Secret does not contain openai_api_key');
    }
  } catch (err) {
    console.error('Error retrieving OpenAI API key from Secrets Manager', err);
    return;
  }
  for (const record of event.Records) {
    try {
      const body = JSON.parse(record.body);
      // Extract text messages from body (Messenger or WhatsApp)
      let messages = [];
      const messagingEvents = body.entry?.[0]?.messaging;
      if (Array.isArray(messagingEvents) && messagingEvents.length > 0) {
        messages = messagingEvents.map(evt => evt.message).filter(m => m);
      }
      if (messages.length === 0) {
        const changes = body.entry?.[0]?.changes;
        if (Array.isArray(changes) && changes.length > 0) {
          messages = changes[0].value?.messages || [];
        }
      }
      for (const msg of messages) {
        let content;
        if (typeof msg.text === 'string') {
          content = msg.text;
        } else if (msg.text?.body) {
          content = msg.text.body;
        } else if (typeof msg === 'string') {
          content = msg;
        } else {
          console.warn('No text content found in message, skipping', msg);
          continue;
        }
        console.log("📥 Processing text message:", content);
        // Send to OpenAI API
        try {
          const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${openaiApiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: 'gpt-3.5-turbo',
              messages: [{ role: 'user', content }]
            })
          });
          const data = await response.json();
          console.log('🧠 OpenAI response:', JSON.stringify(data, null, 2));
        } catch (err) {
          console.error('❌ Error calling OpenAI API', err);
        }
      }
    } catch (err) {
      console.error("❌ Failed to parse or process message", err);
    }
  }
};