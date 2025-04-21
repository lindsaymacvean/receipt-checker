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
      if (!accessToken) throw new Error('Missing access_token in secret');

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
      const mediaResp = await fetch(downloadUrl);
      const imageBuffer = await mediaResp.arrayBuffer();

      // Step 2e: Send image to Azure OCR
      if (!ocrEndpoint || !ocrKey) {
        throw new Error('Azure OCR endpoint or key not configured');
      }
      const ocrInit = await fetch(`${ocrEndpoint}/vision/v3.2/read/analyze`, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': ocrKey,
          'Content-Type': 'application/octet-stream'
        },
        body: Buffer.from(imageBuffer)
      });
      if (!ocrInit.ok) throw new Error(`OCR init failed: ${ocrInit.statusText}`);
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
      const lines = ocrResult.analyzeResult.readResults.flatMap(r => r.lines.map(l => l.text));
      const ocrText = lines.join('\n');
      console.log('OCR Text:', ocrText);

      // Step 2f: Write OCR result to ReceiptsTable
      await ddbClient.send(
        new PutItemCommand({
          TableName: 'ReceiptsTable',
          Item: {
            pk: { S: `RECEIPT#${imageId}` },
            sk: { S: new Date().toISOString() },
            imageUrl: { S: downloadUrl },
            text: { S: ocrText }
          }
        })
      );
      console.log('Saved OCR result to ReceiptsTable');

      // Step 2g: Optionally link back to MessagesTable
      const messageId = messageBody.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.id;
      if (messageId) {
        await ddbClient.send(
          new PutItemCommand({
            TableName: 'MessagesTable',
            Item: {
              pk: { S: `MESSAGE#${messageId}` },
              sk: { S: 'OCR_PROCESSED' },
              receiptRef: { S: `RECEIPT#${imageId}` }
            }
          })
        );
        console.log('Linked receipt to message in MessagesTable');
      }

    } catch (err) {
      console.error("❌ Failed to process SQS record", err);
    }
  }
};
