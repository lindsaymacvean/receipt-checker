const AWS = require("aws-sdk");
const ddb = new AWS.DynamoDB.DocumentClient();

const TABLE_NAME = process.env.RECEIPTS_TABLE_NAME;

// Assumes pk = USER#{sub} as in context.md
exports.handler = async (event) => {
  // console.log("EVENT", JSON.stringify(event, null, 2));
  const claims = event.requestContext?.authorizer?.claims;
  if (!claims) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: "No claims in token" }),
    };
  }
  // Use sub as unique id; if you use email instead, replace here.
  const sub = claims.sub;
  if (!sub) {
    return {
      statusCode: 403,
      body: JSON.stringify({ error: "No sub in claims" }),
    };
  }

  try {
    // pk = USER#<sub>
    const pk = `USER#${sub}`;
    const params = {
      TableName: TABLE_NAME,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: {
        ":pk": pk,
      },
    };
    const result = await ddb.query(params).promise();
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        // For local dev, add:
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify(result.Items || []),
    };
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: e.message }),
    };
  }
};