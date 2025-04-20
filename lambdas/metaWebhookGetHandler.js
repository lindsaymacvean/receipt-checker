// GET handler for Meta webhook subscription verification
exports.handler = async (event) => {
  const method = event.httpMethod;
  const qs = event.queryStringParameters || {};
  // Meta subscription handshake
  if (
    method === 'GET' &&
    qs['hub.mode'] === 'subscribe' &&
    qs['hub.verify_token'] === process.env.VERIFY_TOKEN
  ) {
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: qs['hub.challenge']
    };
  }
  // All other methods not allowed
  return {
    statusCode: 405,
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: 'Method Not Allowed'
  };
};