const { GetItemCommand, PutItemCommand } = require('@aws-sdk/client-dynamodb');
const { lookupMerchantInfo } = require('./braveLookup');
const { detailedMerchantPrompt } = require('./prompts');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
// Secret client for OpenAI key retrieval
const secretsClient = new SecretsManagerClient();

/**
 * Saves a structured receipt item into the ReceiptsTable.
 * Performs category lookup in CategoryTable.
 * Returns the composite keys { receiptPk, receiptSk }.
 */
async function saveReceipt({ 
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
}) {
  let category = 'UNKNOWN';
  let merchantInfo;

  if (merchant !== 'UNKNOWN') {
    // Attempt to fetch category from CategoryTable
    try {
      const catKey = { companyName: { S: merchant } };
      const catResp = await ddbClient.send(new GetItemCommand({
        TableName: 'CategoryTable',
        Key: catKey
      }));
      if (catResp.Item?.category?.S) {
        category = catResp.Item.category.S;
      }
    } catch (err) {
      console.error('Error fetching category for merchant', merchant, err);
    }
    // If no category found, attempt merchant info lookup via Brave Search
    
    if (category === 'UNKNOWN') {
      console.log('No category found, attempting to fetch merchant info from Brave');
      try {
        merchantInfo = await lookupMerchantInfo(merchant);
        console.log('Brave lookup info for merchant', merchant, merchantInfo);
      } catch (infoErr) {
        console.error('Error fetching merchant info from Brave', merchant, infoErr);
      }
      // If merchant info found, classify with OpenAI
      if (merchantInfo) {
        try {
          const openaiSecretId = process.env.OPENAI_SECRET_ID;
          if (!openaiSecretId) throw new Error('Missing OPENAI_SECRET_ID env var');
          const sec = await secretsClient.send(
            new GetSecretValueCommand({ SecretId: openaiSecretId })
          );
          const oa = JSON.parse(sec.SecretString || '{}');
          const openaiApiKey = oa.openai_api_key;
          if (!openaiApiKey) throw new Error('Missing openai_api_key in secret');
          // Prepare prompt for classification using merchant info
          const prompt = detailedMerchantPrompt(merchant, merchantInfo);
          const resp = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${openaiApiKey}`
            },
            body: JSON.stringify({
              model: 'gpt-3.5-turbo',
              messages: [{ role: 'user', content: prompt }]
            })
          });
          if (!resp.ok) throw new Error(`OpenAI classification failed: ${resp.statusText}`);
          const data = await resp.json();
          const content = data.choices?.[0]?.message?.content?.trim();
          if (content) {
            category = content;
            console.log('OpenAI classified category for merchant', merchant, category);
          }
        } catch (claErr) {
          console.error('Error classifying merchant with OpenAI', merchant, claErr);
        }
      }
    }
  } else {
    console.log('Merchant not found, skipping category lookup');
  }

  // Compose receipt item
  const receiptPk = `USER#${waId}`;
  const receiptSk = `RECEIPT#${new Date().toISOString()}#${total.toString()}`;
  const record = {
    pk: { S: receiptPk },
    sk: { S: receiptSk },
    userPk: { S: waId },
    merchant: { S: merchant },
    total: { N: total.toString() },
    txDate: { S: txDate || 'UNKNOWN' },
    txTime: { S: txTime || 'UNKNOWN' },
    items: { S: items.join('\n') },
    imageId: { S: imageId },
    category: { S: category },
    rawJson: { S: JSON.stringify(ocrResult) },
    createdAt: { N: Date.now().toString() },
    originalCurrency: { S: currency },
    // Include fetched merchant info if available
    ...(merchantInfo ? { merchantInfo: { S: JSON.stringify(merchantInfo) } } : {})
  };
  // Persist to ReceiptsTable
  await ddbClient.send(new PutItemCommand({
    TableName: 'ReceiptsTable',
    Item: record
  }));
  return { receiptPk, receiptSk };
}

module.exports = { saveReceipt };