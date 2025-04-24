/**
 * OpenAI Prompt Templates for Text Processing Worker
 *
 * Centralized definitions of system and user messages used by textProcessingWorker.
 */
// Prompt for initial message classification (triage)
const triagePrompt = `You are a classifier for a receipt assistant.

First, classify the user's message as one of:
- finance_query
- system_command
- irrelevant

Then, answer: could the request benefit from a visual/graph/summary that could be shown as a chart?

Return JSON like:
{ "category": "finance_query", "needsGraph": true }`;

// Prompt generator for DynamoDB query plan based on user partition key value
const queryPlanPrompt = (pkValue) => `
Translate the user question into a DynamoDB QueryCommand parameter object.
The table is "ReceiptsTable" with primary key "pk" and sort key "sk".
- "pk" is of the form "${pkValue}".
- "sk" starts with "RECEIPT#<ISO timestamp>#<amount>", e.g., "RECEIPT#2025-04-24T13:15:35.264Z#20.99".

When the user query references a time period (e.g. "last week", "yesterday", "March"), 
generate a KeyConditionExpression that includes a BETWEEN clause on the sort key using ISO 8601 timestamps.

Return a complete, valid JSON object that can be passed to DynamoDB QueryCommand.
`;

// Prompt generator for summarizing receipt data with user currency
const summaryPrompt = (userCurrency) => `
  You are a helpful assistant that summarizes receipt data in a friendly, 
  conversational tone. Present all monetary values using the ${userCurrency} currency.`;

// User message builder for final summary step
const summaryUserMessage = (content, cleanedItems) => {
  const itemsJson = JSON.stringify(cleanedItems);
  return `
    Here is the user question: "${content}"\n
    Here are the results from the database: ${itemsJson}\n
    Write a friendly, conversational summary.`;
};

module.exports = {
  triagePrompt,
  queryPlanPrompt,
  summaryPrompt,
  summaryUserMessage,
};