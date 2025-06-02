const { GetItemCommand, PutItemCommand } = require('@aws-sdk/client-dynamodb');

/**
 * Saves a structured receipt item into the ReceiptsTable.
 * Performs category lookup in CategoryTable.
 * Returns the composite keys { receiptPk, receiptSk }.
 */
async function saveReceipt({ ddbClient, merchant, waId, dateMessageId, total, txDate, txTime, items, imageId, ocrResult, currency }) {
  // Lookup category or use placeholder
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
  } catch (err) {
    console.error('Error fetching category for merchant', merchant, err);
  }

  // Compose receipt item
  const receiptPk = `USER#${waId}`;
  let receiptTimestamp;
  try {
    if (txDate && txTime) {
      // Combine txDate and txTime into ISO string
      const [year, month, day] = txDate.split('-');
      receiptTimestamp = new Date(`${year}-${month}-${day}T${txTime}Z`).toISOString();
    } else if (txDate) {
      receiptTimestamp = new Date(txDate).toISOString();
    } else {
      receiptTimestamp = new Date().toISOString();
    }
  } catch (e) {
    console.error('Failed to compose receipt timestamp, defaulting to now', e);
    receiptTimestamp = new Date().toISOString();
  }
  const receiptSk = `RECEIPT#${receiptTimestamp}#${total.toString()}`;
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
    originalCurrency: { S: currency }
  };
  // Persist to ReceiptsTable
  await ddbClient.send(new PutItemCommand({
    TableName: 'ReceiptsTable',
    Item: record
  }));
  return { receiptPk, receiptSk };
}

module.exports = { saveReceipt };