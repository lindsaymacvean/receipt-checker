/**
 * Detailed prompt: include merchant site info to help infer the category of spend.
 * @param {string} merchant
 * @param {{url: string, title: string, description: string}} info
 * @returns {string}
 */
function detailedMerchantPrompt(merchant, info) {
  return `
    You are an assistant that classifies merchants into spending categories such as 
    "Groceries", "Restaurants", "Electronics", "Clothing", "Pharmacy", etc.

    Merchant Name: ${merchant}
    Official Website: ${info.url}
    Summary: ${info.description}

    Please infer the most appropriate spending category for this merchant. 
    Respond with only the category name, no explanation.
  `;
}

/**
 * Prompt for initial message classification (triage)
 */
const triagePrompt = `
  You are a classifier for a receipt assistant.

  First, classify the user's message as one of:
  - finance_query
  - system_command
  - irrelevant

  Then, answer: could the request benefit from a visual/graph/summary that could be shown as a chart?

  Return JSON like:
  { "category": "finance_query", "needsGraph": true }
`;

/**
 * Prompt generator for DynamoDB query plan based on user partition key value
 * @param {string} pkValue
 * @returns {string}
 */
function queryPlanPrompt(pkValue) {
  const currentDate = new Date().toISOString();
  return `
    Translate the user question into a DynamoDB QueryCommand parameter object.
    The table is "ReceiptsTable" with primary key "pk" and sort key "sk".
    - "pk" is of the form "${pkValue}".
    - "sk" starts with "RECEIPT#<ISO timestamp>#<amount>", e.g., "RECEIPT#2025-04-24T13:15:35.264Z#20.99".

    The current date is "${currentDate}".

    When the user query references a time period (e.g. "last week", "yesterday", "March"), 
    generate a KeyConditionExpression that includes a BETWEEN clause on the sort key using ISO 8601 timestamps.

    Respond ONLY with valid, comment-free JSON that can be parsed with JSON.parse().
    Do NOT include any explanations or inline comments.
  `;
}

/**
 * Prompt generator for summarizing receipt data with user currency
 * @param {string} userCurrency
 * @returns {string}
 */
function summaryPrompt(userCurrency) {
  return `
    You are a helpful assistant that summarizes receipt data in a friendly, 
    conversational tone. Present all monetary values using the ${userCurrency} currency.
  `;
}

/**
 * User message builder for final summary step
 * @param {string} content
 * @param {any[]} cleanedItems
 * @returns {string}
 */
function summaryUserMessage(content, cleanedItems) {
  const itemsJson = JSON.stringify(cleanedItems);
  return `
    Here is the user question: "${content}"

    Here are the results from the database: ${itemsJson}

    Write a friendly, conversational summary.
  `;
}

module.exports = {
  detailedMerchantPrompt,
  // Initial message classification (triage)
  triagePrompt,
  // Generate DynamoDB query plan based on user partition key
  queryPlanPrompt,
  // Summarize receipt data in user's currency
  summaryPrompt,
  // Build user message for final summary step
  summaryUserMessage,
};