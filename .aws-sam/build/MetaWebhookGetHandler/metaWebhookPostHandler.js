exports.handler = async (event) => {
  // Safely parse the JSON body
  let body;
  try {
    body = JSON.parse(event.body);
    console.log('Parsed body:', JSON.stringify(body, null, 2));
  } catch (err) {
    console.error('Failed to parse JSON:', err);
    return {
      statusCode: 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Invalid JSON' })
    };
  }

  // Placeholder: you can handle different message types here
  // e.g., if (body.entry && body.entry[0].changes) { ... }

  return {
    statusCode: 200,
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ message: 'OK' })
  };
};