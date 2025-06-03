
// Support DynamoDB Local by honoring a DYNAMODB_ENDPOINT env var
const AWS = require("aws-sdk");
const ddbOptions = process.env.DYNAMODB_ENDPOINT ? { endpoint: process.env.DYNAMODB_ENDPOINT } : {};
const ddb = new AWS.DynamoDB.DocumentClient(ddbOptions);

const TABLE_NAME = process.env.RECEIPTS_TABLE_NAME;

exports.handler = async (event) => {
// TODO: In production, filter by user sub extracted from Cognito claims.
  // console.log("EVENT", JSON.stringify(event, null, 2));
  //   return {
  //     statusCode: 401,
  //   };
  // }
    return {
      statusCode: 403,
    };
  }

  try {
    const params = {
      TableName: TABLE_NAME,
        ":pk": pk,
      },
    };
    const result = await ddb.scan(params).promise();
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