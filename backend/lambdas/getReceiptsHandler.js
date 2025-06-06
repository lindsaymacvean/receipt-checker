
// Support DynamoDB Local by honoring a DYNAMODB_ENDPOINT env var
const AWS = require("aws-sdk");
const ddbOptions = process.env.DYNAMODB_ENDPOINT ? { endpoint: process.env.DYNAMODB_ENDPOINT } : {};
const ddb = new AWS.DynamoDB.DocumentClient(ddbOptions);

const TABLE_NAME = process.env.RECEIPTS_TABLE_NAME;

// Assumes pk = USER#{sub} as in context.md
exports.handler = async (event) => {
  // console.log("EVENT", JSON.stringify(event, null, 2));
  // const claims = event.requestContext?.authorizer?.claims;
  // if (!claims) {
  //   return {
  //     statusCode: 401,
  //     body: JSON.stringify({ error: "No claims in token" }),
  //   };
  // }
  // // Use sub as unique id; if you use email instead, replace here.
  // const sub = claims.sub;
  // if (!sub) {
  //   return {
  //     statusCode: 403,
  //     body: JSON.stringify({ error: "No sub in claims" }),
  //   };
  // }

  // TODO: filter each users receipts for their own login
  console.log("TABLE_NAME", TABLE_NAME);
  console.log("DYNAMODB_ENDPOINT", process.env.DYNAMODB_ENDPOINT);
  try {
    const params = {
      TableName: TABLE_NAME,
      Limit: 5
    };
    const result = await ddb.scan(params).promise();
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify(result.Items || []),
    };
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: e.message }),
    };
  };
};