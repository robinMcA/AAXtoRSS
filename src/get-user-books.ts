import { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { ddbDocClient } from "./utils/dynamoClient";
import { GetCommand } from "@aws-sdk/lib-dynamodb";

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer<{
  books?: string[];
}> = async ({ requestContext }) => {
  try {
    const username = requestContext.authorizer.jwt.claims["username"] as string;
    console.log(username, process.env.USER_DYNAMO);
    const userFiles = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.USER_DYNAMO,
        Key: { user: username },
      })
    );

    console.log(userFiles);

    return { books: Array.from(userFiles.Item?.Books) as string[] | undefined };
  } catch (e: unknown) {
    console.error(e);
    return { statusCode: 503 };
  }
};

export default handler;
