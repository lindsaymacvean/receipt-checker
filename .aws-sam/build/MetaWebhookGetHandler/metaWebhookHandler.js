exports.handler = async (event) => {
  // Log the incoming request body
  console.log('Request body:', event.body);
  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({ message: 'OK' })
  };
};