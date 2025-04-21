exports.handler = async (event) => {
  // TODO: check the signature of the request
  // https://developers.facebook.com/docs/graph-api/webhooks/getting-started#create-endpoint
  
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