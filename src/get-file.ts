import { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { ddbDocClient, unmarshalDdObj } from "./utils/dynamoClient";
import { GetCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { ComparisonOperator } from "@aws-sdk/client-dynamodb";

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer<{
  books?: string[];
}> = async ({ pathParameters }) => {
  try {
    if (pathParameters === undefined || pathParameters.dir === undefined) {
      return { statusCode: 404 };
    }

    const s3Key = `${pathParameters.dir}/${pathParameters.file}`;

    const audioFile = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.DYNAMO_NAME,
        Key: {
          s3Key,
        },
      })
    );

    if (audioFile.Item === undefined) {
      const audioSecondChance = await ddbDocClient.send(
        new ScanCommand({
          TableName: process.env.DYNAMO_NAME,
          ScanFilter: {
            s3Key: {
              ComparisonOperator: ComparisonOperator.CONTAINS,
              AttributeValueList: [pathParameters.dir],
            },
          },
        })
      );
      if (audioSecondChance.Items === undefined) {
        return { statusCode: 404 };
      }

      return unmarshalDdObj(audioSecondChance.Items[0]);
    }

    return unmarshalDdObj(audioFile.Item);
  } catch (e: unknown) {
    console.error(e);
    return { statusCode: 503 };
  }
};

export default handler;
