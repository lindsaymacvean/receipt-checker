// Lambda: textProcessingWorker.js
// Triggered by SQS queue (TextProcessingQueue)
// Fetches text messages and sends to OpenAI Chat Completions API

const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const secretsClient = new SecretsManagerClient();

exports.handler = async (event) => {
  const openaiSecretId = process.env.OPENAI_SECRET_ID;
  if (!openaiSecretId) {
    console.error('Missing OPENAI_SECRET_ID in environment');
    return;
  }
  let openaiApiKey;
  try {
    const sec = await secretsClient.send(new GetSecretValueCommand({ SecretId: openaiSecretId }));
    const secret = JSON.parse(sec.SecretString);
    openaiApiKey = secret.openai_api_key;
    if (!openaiApiKey) {
      throw new Error('Secret does not contain openai_api_key');
    }
  } catch (err) {
    console.error('Error retrieving OpenAI API key from Secrets Manager', err);
    return;
  }
  // Retrieve WhatsApp access token from MetaSecrets
  const metaSecretId = process.env.META_SECRET_ID;
  if (!metaSecretId) {
    console.error('Missing META_SECRET_ID in environment');
    return;
  }
  let metaAccessToken;
  try {
    const metaSec = await secretsClient.send(new GetSecretValueCommand({ SecretId: metaSecretId }));
    const metaSecret = JSON.parse(metaSec.SecretString);
    metaAccessToken = metaSecret.access_token;
    if (!metaAccessToken) throw new Error('Secret does not contain access_token');
  } catch (err) {
    console.error('Error retrieving WhatsApp token from Secrets Manager', err);
    return;
  }
  for (const record of event.Records) {
    try {
      const body = JSON.parse(record.body);
      // Extract WhatsApp phone number ID for replies
      const waChanges = body.entry?.[0]?.changes;
      let phoneNumberId;
      if (Array.isArray(waChanges) && waChanges.length > 0) {
        phoneNumberId = waChanges[0].value.metadata?.phone_number_id;
      } else {
        console.warn('No phone_number_id found in webhook payload; WhatsApp replies may fail');
      }
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
        // WhatsApp recipient ID
        const waId = msg.from;
        if (!waId) {
          console.warn('No wa_id (msg.from) found; skipping WhatsApp reply');
        }
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
          // Send reply back to WhatsApp user
          const replyContent = data.choices?.[0]?.message?.content;
          if (replyContent && waId && phoneNumberId) {
            try {
              const whatsappUrl = `https://graph.facebook.com/v17.0/${phoneNumberId}/messages`;
              const sendResp = await fetch(whatsappUrl, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${metaAccessToken}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  messaging_product: 'whatsapp',
                  to: waId,
                  text: { body: replyContent }
                })
              });
              const sendData = await sendResp.json();
              console.log('✅ WhatsApp reply sent:', JSON.stringify(sendData, null, 2));
            } catch (err) {
              console.error('❌ Error sending WhatsApp reply', err);
            }
          } else {
            console.warn('No replyContent or missing waId/phoneNumberId, skipping send');
          }
        } catch (err) {
          console.error('❌ Error calling OpenAI API', err);
        }
      }
    } catch (err) {
      console.error("❌ Failed to parse or process message", err);
    }
  }
};