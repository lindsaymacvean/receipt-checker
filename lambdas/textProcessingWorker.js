// Lambda: textProcessingWorker.js
// Triggered by SQS queue (TextProcessingQueue)
// Fetches text messages and sends to OpenAI Chat Completions API

const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const secretsClient = new SecretsManagerClient();
// DynamoDB client for querying receipt data
const { DynamoDBClient, QueryCommand, GetItemCommand, UpdateItemCommand } = require('@aws-sdk/client-dynamodb');
const ddbClient = new DynamoDBClient();
// Shared error handler from Lambda layer
const { handleError } = require('errorHandler');
// Centralized OpenAI prompt templates
const prompts = require('./prompts');

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
        // Stage 1: Triage - classify the message
        let category;
        let needsGraph = false;
        try {
          const triageResp = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${openaiApiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: 'gpt-3.5-turbo',
              messages: [
                { role: 'system', content: prompts.triagePrompt },
                { role: 'user', content }
              ]
            })
          });
          const triageData = await triageResp.json();
          // Parse JSON result: { category: '...', needsGraph: true }
          const triageContent = triageData.choices?.[0]?.message?.content.trim() || '';
          try {
            const triageResult = JSON.parse(triageContent);
            category = (triageResult.category || '').toLowerCase();
            needsGraph = Boolean(triageResult.needsGraph);
          } catch (parseErr) {
            // Fallback to raw string
            category = triageContent.toLowerCase();
          }
          console.log('🔍 Triage category:', category, 'needsGraph:', needsGraph);
        } catch (err) {
          console.error('❌ Error during triage classification', err);
          continue;
        }

        // If not a finance query, send a friendly default reply and skip further processing
        if (category !== 'finance_query') {
          console.log(`Category is '${category}', sending default non-finance reply.`);
          const defaultReply = "This does not appear to be a finance query, try asking a question about your receipts like 'How much did I spend on pet food last week?'";
          if (waId && phoneNumberId) {
            try {
              const whatsappUrl = `https://graph.facebook.com/v17.0/${phoneNumberId}/messages`;
              await fetch(whatsappUrl, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${metaAccessToken}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  messaging_product: 'whatsapp',
                  to: waId,
                  text: { body: defaultReply }
                })
              });
            } catch (err) {
              console.error('❌ Error sending default non-finance reply', err);
            }
          } else {
            console.warn('No waId or phoneNumberId for sending default non-finance reply');
          }
          continue;
        }

        // Stage 2: Generate DynamoDB query plan
        // Stage 2: Generate DynamoDB query plan (JSON)
        let queryParams;
        try {
          // Build a system prompt with the actual user partition key value
          const pkValue = `USER#${waId}`; // Replace <wa_id> with actual value
          const systemPrompt = prompts.queryPlanPrompt(pkValue);
          const queryResp = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${openaiApiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: 'gpt-3.5-turbo',
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content }
              ]
            })
          });
          const queryData = await queryResp.json();
          let queryText = queryData.choices?.[0]?.message?.content || '';
          console.log('📋 Query plan (raw):', queryText);
          // Try parsing raw JSON; if it fails, sanitize common JS literal patterns
          const trimmed = queryText.trim();
          try {
            queryParams = JSON.parse(trimmed);
          } catch (err1) {
            // Wrap unquoted keys and remove trailing commas
            const wrapped = trimmed.replace(/([{,]\s*)([A-Za-z0-9_]+)\s*:/g, '$1"$2":');
            const clean = wrapped.replace(/,(\s*})/g, '$1');
            console.log('📋 Sanitized query plan:', clean);
            queryParams = JSON.parse(clean);
          }
        } catch (err) {
          console.error('❌ Error generating or parsing query plan', err);
          continue;
        }

        // Execute the DynamoDB query
        let items = [];
        try {
          // Convert primitive ExpressionAttributeValues to DynamoDB AttributeValue types
          if (queryParams.ExpressionAttributeValues) {
            for (const key of Object.keys(queryParams.ExpressionAttributeValues)) {
              const val = queryParams.ExpressionAttributeValues[key];
              if (typeof val === 'string') {
                queryParams.ExpressionAttributeValues[key] = { S: val };
              } else if (typeof val === 'number') {
                queryParams.ExpressionAttributeValues[key] = { N: val.toString() };
              }
            }
          }
          const result = await ddbClient.send(new QueryCommand(queryParams));
          items = result.Items || [];
          console.log('📊 DynamoDB query returned items:', JSON.stringify(items, null, 2));
        } catch (err) {
          console.error('❌ Error executing DynamoDB query', err);
          continue;
        }

        // Stage 3: Generate user-facing response
        let finalReply;
        try {
          // Retrieve user currency for formatting
          let userCurrency = 'USD';
          try {
            const userKey = { pk: { S: waId }, sk: { S: waId } };
            const userResp = await ddbClient.send(new GetItemCommand({ TableName: 'UsersTable', Key: userKey }));
            if (userResp.Item?.currency?.S) {
              userCurrency = userResp.Item.currency.S;
            }
          } catch (err) {
            console.error('Error fetching user currency, defaulting to USD', err);
          }
          // Retrieve short-term conversation history for context
          let memoryHistory = '';
          try {
            const histKey = { pk: { S: `USER#${waId}` }, sk: { S: 'SHORTMEMORY' } };
            const histResp = await ddbClient.send(new GetItemCommand({
              TableName: 'ConversationHistoryTable',
              Key: histKey,
              ProjectionExpression: 'history'
            }));
            memoryHistory = histResp.Item?.history?.S || '';
          } catch (histErr) {
            console.error('Error fetching conversation history', histErr);
          }
          const systemPrompt = prompts.summaryPrompt(userCurrency);
          const cleanedItems = items.map(({ rawJson, ...rest }) => rest);
          // Build chat messages array including conversation history
          const chatMessages = [
            { role: 'system', content: systemPrompt }
          ];
          if (memoryHistory) {
            chatMessages.push({ role: 'system', content: `Short-term conversation memory:\n${memoryHistory}` });
          }
          chatMessages.push({ role: 'user', content: prompts.summaryUserMessage(content, cleanedItems) });
          const respondResp = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${openaiApiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: 'gpt-4',
              messages: chatMessages
            })
          });
          const respondData = await respondResp.json();
          finalReply = respondData.choices?.[0]?.message?.content.trim();
          console.log('💬 Final reply:', finalReply);
        } catch (err) {
          console.error('❌ Error generating final response', err);
          // Notify user of the error via WhatsApp with a unique error ID
          await handleError(err, { waId, phoneNumberId, accessToken: metaAccessToken });
          continue;
        }

        // Update conversation history in DynamoDB
        try {
          const pkKey = `USER#${waId}`;
          const skKey = 'SHORTMEMORY';
          const getResp = await ddbClient.send(new GetItemCommand({
            TableName: 'ConversationHistoryTable',
            Key: { pk: { S: pkKey }, sk: { S: skKey } },
            ProjectionExpression: 'history'
          }));
          const existing = getResp.Item?.history?.S || '';
          const newEntry = `User: ${content}\nAssistant: ${finalReply}`;
          const combined = existing ? `${existing}\n${newEntry}` : newEntry;
          const truncated = combined.slice(-1000);
          await ddbClient.send(new UpdateItemCommand({
            TableName: 'ConversationHistoryTable',
            Key: { pk: { S: pkKey }, sk: { S: skKey } },
            UpdateExpression: 'SET history = :h',
            ExpressionAttributeValues: { ':h': { S: truncated } }
          }));
        } catch (err) {
          console.error('❌ Error updating conversation history', err);
        }
        // Send reply back to WhatsApp user
        if (finalReply && waId && phoneNumberId) {
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
                text: { body: finalReply }
              })
            });
            const sendData = await sendResp.json();
            console.log('✅ WhatsApp reply sent:', JSON.stringify(sendData, null, 2));
          } catch (err) {
            console.error('❌ Error sending WhatsApp reply', err);
          }
        } else {
          console.warn('No finalReply or missing waId/phoneNumberId, skipping send');
        }
      }
    } catch (err) {
      console.error("❌ Failed to parse or process message", err);
      // Notify user of the error via WhatsApp with a unique error ID
      await handleError(err, { waId, phoneNumberId, accessToken: metaAccessToken });
    }
  }
};