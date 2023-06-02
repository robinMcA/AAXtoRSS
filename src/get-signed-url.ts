import { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { s3 } from "./utils/s3Client";

const Bucket = process.env.S3_BUCKET ?? "test";

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async ({
  queryStringParameters,
  requestContext,
}) => {
  if (queryStringParameters === undefined) {
    return { statusCode: 500 };
  }

  const key = queryStringParameters["filename"];

  if (key === undefined) {
    return { statusCode: 500 };
  }

  const folderPath = requestContext.authorizer.jwt.claims["username"] as string;

  const Key = `${folderPath}/${key}`;

  const { url, fields } = await createPresignedPost(s3, {
    Bucket,
    Key,
    Expires: 900, //Seconds before the presigned post expires. 3600 by default.
  });

  return { url, fields };
};

export default handler;
