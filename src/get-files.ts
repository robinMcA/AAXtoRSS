import { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { ddbDocClient, unmarshalDdObj } from "./utils/dynamoClient";
import { GetCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { ComparisonOperator } from "@aws-sdk/client-dynamodb";

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer<{
  books?: string[];
}> = async () => {
  try {
    const files = await ddbDocClient.send(
      new ScanCommand({
        TableName: process.env.DYNAMO_NAME,
      })
    );

    return { files: files.Items?.map(unmarshalDdObj) };
  } catch (e: unknown) {
    console.error(e);
    return { statusCode: 503 };
  }
};

export default handler;
