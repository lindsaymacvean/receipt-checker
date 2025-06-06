// Lambda: imageProcessingWorker.js
// Triggered by SQS queue (ImageProcessingQueue)
// Goal: Log incoming WhatsApp messages, and later process receipts

const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { DynamoDBClient, PutItemCommand, UpdateItemCommand, GetItemCommand } = require('@aws-sdk/client-dynamodb');
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const crypto = require('crypto');
const { saveReceipt } = require('./utils/saveReceiptService');
const { inferCurrency, isValidReceipt } = require('./utils/receiptOCRHelperFunctions');
/**
 * Fetches the exchange rate between two currencies.
 * Returns how many units of toCurrency equal 1 unit of fromCurrency.
 */
async function getExchangeRate(fromCurrency, toCurrency) {
  const secretId = process.env.EXCHANGE_RATE_SECRET_ID;
  if (!secretId) throw new Error('Missing EXCHANGE_RATE_SECRET_ID env var');
  // Retrieve API key for exchange rate service
  const secResp = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: secretId })
  );
  const sec = JSON.parse(secResp.SecretString || '{}');
  const apiKey = sec.api_key;
  if (!apiKey) throw new Error('Missing api_key in ExchangeRate secret');

  const url = `https://v6.exchangerate-api.com/v6/${apiKey}/pair/${fromCurrency}/${toCurrency}`;
  console.log(`Calling exchange rate API: ${url}`);

  const resp = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!resp.ok) {
    console.error(`Exchange rate fetch failed: ${resp.statusText}`);
    throw new Error(`Exchange rate fetch failed: ${resp.statusText}`);
  }

  const data = await resp.json();
  if (typeof data.conversion_rate !== 'number') {
    console.error('Unexpected exchange rate API response:', JSON.stringify(data, null, 2));
    throw new Error(`Exchange rate missing in response: ${JSON.stringify(data)}`);
  }

  return data.conversion_rate;
}

const secretsClient = new SecretsManagerClient();
const ddbClient = new DynamoDBClient();
// SQS client for heartbeat messages
const sqsClient = new SQSClient();
// Error handler layer
const IS_LOCAL = process.env.AWS_SAM_LOCAL === 'true';
let handleError;
if (!IS_LOCAL) {
  try {
    ({ handleError } = require('errorHandler'));
  } catch (e) {
    console.warn('Layer errorHandler not available locally.');
  }
}

exports.handler = async (event) => {
  for (const record of event.Records) {
    // Context for error handling
    let waId;
    let phoneNumberId;
    let accessToken;
    try {
      const messageBody = JSON.parse(record.body);
      console.log("📥 Received SQS message:", JSON.stringify(messageBody, null, 2));

      // Get the user's WhatsApp ID (wa_id) and phone number ID for replies
      waId = messageBody.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.wa_id;
      phoneNumberId = messageBody.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;
      if (!waId) throw new Error('Missing wa_id in message');
      const messageId = messageBody.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.id;
      if (!messageId) throw new Error('Missing messageId in message');
      const dateMessageId = `MESSAGE#${new Date().toISOString()}#${messageId}`;

      // Step 1: Log the received message into MessagesTable
      await ddbClient.send(
        new PutItemCommand({
          TableName: 'MessagesTable',
          Item: {
            pk: { S: `USER#${waId}` },
            sk: { S: dateMessageId },
            // Reference back to UsersTable keys
            userPk: { S: waId },
            status: { S: 'RECEIVED' },
            rawMessage: { S: JSON.stringify(messageBody) }
          }
        })
      );
      console.log('✅ Logged message into MessagesTable');

      // Step 2a: Extract image ID from messageBody
      const imageId = messageBody.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.image?.id;
      if (!imageId) {
        console.log('No image ID found in message, skipping');
        continue;
      }

      // Step 2b: Retrieve secrets from Secrets Manager
      const metaSecretId = process.env.META_SECRET_ID;
      if (!metaSecretId) throw new Error('Missing META_SECRET_ID in environment');
      const metaSec = await secretsClient.send(
        new GetSecretValueCommand({ SecretId: metaSecretId })
      );
      const metaSecret = JSON.parse(metaSec.SecretString);
      accessToken = metaSecret.access_token;
      if (!accessToken || typeof accessToken !== 'string' || !accessToken.startsWith('EAA'))
        throw new Error('Invalid or missing access_token in MetaSecrets');

      const azureSecretId = process.env.AZURE_SECRET_ID;
      if (!azureSecretId) throw new Error('Missing AZURE_SECRET_ID in environment');
      const azureSec = await secretsClient.send(
        new GetSecretValueCommand({ SecretId: azureSecretId })
      );
      const azureSecret = JSON.parse(azureSec.SecretString);
      const ocrEndpoint = azureSecret.ocr_endpoint;
      if (ocrEndpoint !== 'https://receipt-organizer.cognitiveservices.azure.com')
        console.warn('⚠️ Warning: ocrEndpoint does not match the expected value.');
      const ocrKey = azureSecret.ocr_key;
      if (!ocrKey || typeof ocrKey !== 'string' || !ocrKey.startsWith('1EC'))
        console.warn('⚠️ Warning: ocrKey does not start with the expected prefix "1EC".');
      const visionEndpoint = azureSecret.vision_endpoint;
      if (visionEndpoint !== 'https://receipt-classifier.cognitiveservices.azure.com')
        console.warn('⚠️ Warning: visionEndpoint does not match the expected value.');

      // Step 2c: Get media download URL from WhatsApp Graph API
      const graphUrl = `https://graph.facebook.com/v17.0/${imageId}?fields=url`;
      const graphResp = await fetch(graphUrl, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const graphData = await graphResp.json();
      const downloadUrl = graphData.url;
      if (!downloadUrl) throw new Error('Failed to get download URL');
      console.log('Media download URL:', downloadUrl);

      // Step 2d: Download media content
      const mediaResp = await fetch(downloadUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`
        },
        redirect: 'follow'
      });
      if (!mediaResp.ok) throw new Error(`Failed to download media: ${mediaResp.statusText}`);
      const imageBuffer = await mediaResp.arrayBuffer();

      // Step 2d.1: Classify image using Azure Computer Vision (optional pre-filter)
      try {
        console.log('Sending image to Azure Computer Vision for classification...');
        const visionResp = await fetch(`${visionEndpoint}/vision/v3.2/analyze?visualFeatures=Categories,Tags`, {
          method: 'POST',
          headers: {
            'Ocp-Apim-Subscription-Key': ocrKey,
            'Content-Type': 'application/octet-stream'
          },
          body: Buffer.from(imageBuffer)
        });

        if (visionResp.ok) {
          const visionResult = await visionResp.json();
          const tags = visionResult.tags?.map(tag => tag.name.toLowerCase()) || [];
          console.log('Vision tags:', tags.join(', '));
          const likelyReceipt = tags.includes('receipt') || tags.includes('invoice') || tags.includes('bill');

          if (!likelyReceipt) {
            console.warn('This image does not appear to be a receipt');
            if (waId && phoneNumberId && accessToken) {
              const notReceiptUrl = `https://graph.facebook.com/v17.0/${phoneNumberId}/messages`;
              await fetch(notReceiptUrl, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  messaging_product: 'whatsapp',
                  to: waId,
                  text: { body: 'Hmm, this image doesn\'t look like a receipt. Please send a clear photo of a receipt.' }
                })
              });
              console.log('✅ Non-receipt notification sent');
            }
            continue; // Skip further processing
          }
        } else {
          console.error('Failed to classify image:', visionResp.statusText);
        }
      } catch (visionErr) {
        console.error('Error during image classification', visionErr);
      }

      // Step 2d.2: Check for duplicate image via ImagesTable
      try {
        const hash = crypto.createHash('sha256').update(Buffer.from(imageBuffer)).digest('hex');
        const dupResp = await ddbClient.send(new GetItemCommand({
          TableName: 'ImagesTable',
          Key: { imageHash: { S: hash } }
        }));
        if (dupResp.Item) {
          // Duplicate found: notify user and exit early
          if (waId && phoneNumberId && accessToken) {
            const dupUrl = `https://graph.facebook.com/v17.0/${phoneNumberId}/messages`;
            await fetch(dupUrl, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: waId,
                text: { body: 'You already added that receipt' }
              })
            });
            console.log('✅ Duplicate image receipt notification sent');
          }
          return;
        }
        // New image: record hash in ImagesTable
        await ddbClient.send(new PutItemCommand({
          TableName: 'ImagesTable',
          Item: {
            imageHash: { S: hash },
            messagePk: { S: `USER#${waId}` },
            messageSk: { S: dateMessageId },
            createdAt: { N: `${Date.now()}` },
            whatsappImageId: { S: imageId },
            userPk: { S: waId }
          }
        }));
        console.log('✅ Recorded new image hash to ImagesTable');
      } catch (dupErr) {
        console.error('Error checking/recording image hash', dupErr);
      }

      // TODO: add the image to S3 bucket for backup

      // Step 2e: Send image to Azure OCR (Receipt model)
      

      console.log('Sending image to Azure OCR...');
      const ocrInit = await fetch(`${ocrEndpoint}/formrecognizer/documentModels/prebuilt-receipt:analyze?api-version=2023-07-31`, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': ocrKey,
          'Content-Type': 'application/octet-stream'
        },
        body: Buffer.from(imageBuffer)
      });

      if (ocrInit.status !== 202) throw new Error(`OCR init failed: ${ocrInit.statusText}`);
      const operationLocation = ocrInit.headers.get('operation-location');
      if (!operationLocation) throw new Error('Missing operation-location header');

      // Poll for OCR result
      let ocrResult;
      for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 1000));
        const poll = await fetch(operationLocation, {
          headers: { 'Ocp-Apim-Subscription-Key': ocrKey }
        });
        ocrResult = await poll.json();
        if (ocrResult.status === 'succeeded') break;
      }
      if (ocrResult.status !== 'succeeded') throw new Error('OCR processing did not succeed');

      const doc = ocrResult.analyzeResult.documents?.[0];
      if (!doc) throw new Error('No document returned');
      console.log('OCR result:', JSON.stringify(doc, null, 2));

      // Check receipt confidence using helper; if low, notify user and exit
      if (!isValidReceipt(ocrResult.analyzeResult)) {
        const lowConfUrl = `https://graph.facebook.com/v17.0/${phoneNumberId}/messages`;
        await fetch(lowConfUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: waId,
            context: { message_id: messageId },
            text: { body: 'Sorry, I could not read the receipt in that picture. Please try with a clearer image.' }
          })
        });
        console.log('✅ Low-confidence receipt notification sent');
        continue; // Skip saving this receipt
      }

      const f = doc.fields;
      const merchant = f.MerchantName?.valueString || 'UNKNOWN';
      let total = f.Total?.valueNumber || 0;
      const currency = inferCurrency(ocrResult.analyzeResult);
      const txDate = f.TransactionDate?.valueDate || null;
      const txTime = f.TransactionTime?.valueTime || null;

      // Retrieve the user's preferred currency from UsersTable and detect foreign receipts
      let userCurrency = 'EUR';
      try {
        const userResp = await ddbClient.send(new GetItemCommand({
          TableName: 'UsersTable',
          Key: { pk: { S: waId } }
        }));
        if (userResp.Item?.currency?.S) {
          userCurrency = userResp.Item.currency.S;
        }
      } catch (usrErr) {
        console.error('Error fetching user currency, defaulting to USD', usrErr);
      }
      const foreignReceipt = currency !== userCurrency;
      // If foreign receipt, fetch exchange rate and compute converted total
      let exchangeRate = 1;
      let convertedTotal = total;
      if (foreignReceipt) {
        console.log('Foreign receipt detected, fetching exchange rate');
        try {
          exchangeRate = await getExchangeRate(currency, userCurrency);
          convertedTotal = parseFloat((total * exchangeRate).toFixed(2));
        } catch (rateErr) {
          console.error('Error fetching exchange rate', rateErr);
        }
        total = convertedTotal;
      }

      const items = (f.Items?.valueArray || []).map(item => {
        const desc = item.valueObject?.Description?.valueString || '';
        const qty = item.valueObject?.Quantity?.valueNumber || 1;
        const price = item.valueObject?.Price?.valueNumber || item.valueObject?.TotalPrice?.valueNumber || 0;
        // convert price if foreign receipt
        const displayPrice = price * exchangeRate;
        return `${qty} x ${desc} @ ${displayPrice.toFixed(2)}`;
      });

      // Check for existing receipt with same date and total
      try {
        const receiptResp = await ddbClient.send(new GetItemCommand({
          TableName: 'ReceiptsTable',
          Key: { 
            pk: { S: waId }, 
            sk: { S: `RECEIPT#${txDate || new Date().toISOString().split('T')[0]}#${total}` }
          }
        }));
        if (receiptResp.Item) {
          const duplicateUrl = `https://graph.facebook.com/v17.0/${phoneNumberId}/messages`;
          await fetch(duplicateUrl, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: waId,
              context: { message_id: messageId },
              text: {
                body: `🧾 It looks like you already uploaded a receipt for ${merchant} totaling ${total} on ${txDate}. No need to upload it again!`
              }
            })
          });
          console.log('✅ Duplicate receipt notification sent');
          continue; // Skip saving this receipt
        }
      } catch (dupCheckErr) {
        console.error('Error checking for existing receipt', dupCheckErr);
        // Continue processing normally
      }

      // Step 2f: Save structured receipt via helper
      const { receiptPk, receiptSk } = await saveReceipt({
        ddbClient,
        merchant,
        waId,
        total,
        txDate,
        txTime,
        items,
        imageId,
        ocrResult,
        currency
      });
      console.log('✅ Saved structured receipt to ReceiptsTable');

      // Step 2g: link back to MessagesTable and Images Table
      await ddbClient.send(
        new UpdateItemCommand({
          TableName: 'MessagesTable',
          Key: {
            pk: { S: `USER#${waId}` },
            sk: { S: dateMessageId }
          },
          UpdateExpression: 'SET #status = :status, imageId = :imageId, receiptRefPk = :receiptRefPk, receiptRefSk = :receiptRefSk',
          ExpressionAttributeNames: {
            '#status': 'status'
          },
          ExpressionAttributeValues: {
            ':status': { S: 'OCR_PROCESSED' },
            ':imageId': { S: imageId },
            ':receiptRefPk': { S: receiptPk },
            ':receiptRefSk': { S: receiptSk }
          }
        })
      );
      console.log('Linked receipt to message in MessagesTable');

      // TODO: update the imagesTable with the receipt pk/sk and status

      // Step 2h: Send heartbeat message to HeartbeatQueue
      if (process.env.HEARTBEAT_QUEUE_URL) {
        try {
          await sqsClient.send(new SendMessageCommand({
            QueueUrl: process.env.HEARTBEAT_QUEUE_URL,
            MessageBody: JSON.stringify({ 
              userId: waId,
              timestamp: new Date().toISOString()
            })
          }));
          console.log('✅ Sent heartbeat message to HeartbeatQueue');
        } catch (hbErr) {
          console.error('❌ Failed to send heartbeat message', hbErr);
        }
      }

      // TODO: Update summary table - daily, weekly, monthly / vendor, category, total spend (see arch)
      // TODO: deduct credits from user (for 1 receipt 1cent?)

    } catch (err) {
      console.error("❌ Failed to process SQS record", err);
      if (handleError) {
        await handleError(err, { waId, phoneNumberId, accessToken });
      }
    }
  }
};
