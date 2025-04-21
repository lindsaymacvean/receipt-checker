// Lambda: processReceiptWorker.js
// Triggered by SQS queue (ReceiptProcessingQueue)
// Goal: Log incoming WhatsApp messages, and later process receipts

const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb');

const secretsClient = new SecretsManagerClient();
const ddbClient = new DynamoDBClient();

exports.handler = async (event) => {
  for (const record of event.Records) {
    try {
      const messageBody = JSON.parse(record.body);
      console.log("📥 Received SQS message:", JSON.stringify(messageBody, null, 2));

      // Get the user's WhatsApp ID (wa_id) from the message
      const waId = messageBody.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.wa_id;
      if (!waId) throw new Error('Missing wa_id in message');
      const messageId = messageBody.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.id;
      if (!messageId) throw new Error('Missing messageId in message');
      const messageTableSK = `MESSAGE#${new Date().toISOString()}#${messageId}`;

      // Step 1: Log the received message into MessagesTable
      await ddbClient.send(
        new PutItemCommand({
          TableName: 'MessagesTable',
          Item: {
            pk: { S: `USER#${waId}` },
            sk: { S: messageTableSK },
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
      const sec = await secretsClient.send(
        new GetSecretValueCommand({ SecretId: 'ReceiptCheckerSecrets' })
      );
      const secret = JSON.parse(sec.SecretString);
      const accessToken = secret.access_token;
      const ocrEndpoint = secret.ocr_endpoint;
      const ocrKey = secret.ocr_key;
      if (!accessToken || typeof accessToken !== 'string' || !accessToken.startsWith('EAA'))
        throw new Error('Invalid or missing access_token in secret');
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

      // Step 2f: Write structured OCR result to ReceiptsTable
      await ddbClient.send(
        new PutItemCommand({
          TableName: 'ReceiptsTable',
          Item: {
            pk: { S: `USER#${waId}` },
            sk: { S: `RECEIPT#${new Date().toISOString()}#${imageId}` },
            merchant: { S: merchant },
            total: { N: total.toString() },
            txDate: { S: txDate || 'UNKNOWN' },
            txTime: { S: txTime || 'UNKNOWN' },
            items: { S: items.join('\n') },
            imageUrl: { S: downloadUrl },
            rawJson: { S: JSON.stringify(ocrResult) } // keep full OCR data for debugging
          }
        })
      );
      console.log('✅ Saved structured receipt to ReceiptsTable');

      // Step 2g: Optionally link back to MessagesTable
      await ddbClient.send(
        new PutItemCommand({
          TableName: 'MessagesTable',
          Item: {
            pk: { S: `USER#${waId}` },
            sk: { S: messageTableSK },
            status: { S: 'OCR_PROCESSED' },
            receiptRef: { S: `RECEIPT#${imageId}` }
          }
        })
      );
      console.log('Linked receipt to message in MessagesTable');
    

    } catch (err) {
      console.error("❌ Failed to process SQS record", err);
    }
  }
};
