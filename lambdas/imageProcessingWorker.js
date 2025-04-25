// Lambda: imageProcessingWorker.js
// Triggered by SQS queue (ImageProcessingQueue)
// Goal: Log incoming WhatsApp messages, and later process receipts

const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { DynamoDBClient, PutItemCommand, UpdateItemCommand, GetItemCommand } = require('@aws-sdk/client-dynamodb');
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const crypto = require('crypto');

const secretsClient = new SecretsManagerClient();
const ddbClient = new DynamoDBClient();
// SQS client for heartbeat messages
const sqsClient = new SQSClient();
// Error handler layer
const { handleError } = require('errorHandler');

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

      // TODO: start a heartbeat to an sqs queue to tell the user that images have been processed

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
      const ocrKey = azureSecret.ocr_key;
      if (ocrEndpoint !== 'https://receipt-organizer.cognitiveservices.azure.com')
        console.warn('⚠️ Warning: ocrEndpoint does not match the expected value.');
      if (!ocrKey || typeof ocrKey !== 'string' || !ocrKey.startsWith('1EC'))
        console.warn('⚠️ Warning: ocrKey does not start with the expected prefix "1EC".');

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

      // Step 2d.1: Check for duplicate image via ImagesTable
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
            messageSk: { S: dateMessageId }
          }
        }));
        console.log('✅ Recorded new image hash to ImagesTable');
      } catch (dupErr) {
        console.error('Error checking/recording image hash', dupErr);
      }

      // TODO: add the image to S3 bucket for backup

      // Step 2e: Send image to Azure OCR (Receipt model)
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

      const f = doc.fields;
      const merchant = f.MerchantName?.valueString || 'UNKNOWN';
      const total = f.Total?.valueNumber || 0;
      const txDate = f.TransactionDate?.valueDate || null;
      const txTime = f.TransactionTime?.valueTime || null;

      const items = (f.Items?.valueArray || []).map(item => {
        const desc = item.valueObject?.Description?.valueString || '';
        const qty = item.valueObject?.Quantity?.valueNumber || 1;
        const price = item.valueObject?.Price?.valueNumber || item.valueObject?.TotalPrice?.valueNumber || 0;
        return `${qty} x ${desc} @ ${price.toFixed(2)}`;
      });

      // TODO: check if receipt is low confidence and send message to user
      // TODO: check if receipt data is bayesian (see arch) likely duplicate and send message to user
      // Lookup category from CategoryTable or use placeholder
      let category = 'UNKNOWN';
      try {
        const catKey = { companyName: { S: merchant } };
        const catResp = await ddbClient.send(new GetItemCommand({
          TableName: 'CategoryTable',
          Key: catKey
        }));
        if (catResp.Item?.category?.S) {
          category = catResp.Item.category.S;
        }
      } catch (catErr) {
        console.error('Error fetching category for merchant', merchant, catErr);
      }

      // Step 2f: Write structured OCR result to ReceiptsTable
      const receiptPk = `USER#${waId}`;
      const receiptSk = `RECEIPT#${new Date().toISOString()}#${total.toString()}`;
      await ddbClient.send(
        new PutItemCommand({
          TableName: 'ReceiptsTable',
          Item: {
            pk: { S: receiptPk },
            sk: { S: receiptSk },
            // Reference back to UsersTable keys
            userPk: { S: waId },
            merchant: { S: merchant },
            total: { N: total.toString() },
            txDate: { S: txDate || 'UNKNOWN' },
            txTime: { S: txTime || 'UNKNOWN' },
            items: { S: items.join('\n') },
            imageId: { S: imageId },
            category: { S: category },
            rawJson: { S: JSON.stringify(ocrResult) }
          }
        })
      );
      console.log('✅ Saved structured receipt to ReceiptsTable');

      // Step 2g: Optionally link back to MessagesTable
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
      await handleError(err, { waId, phoneNumberId, accessToken });
    }
  }
};
