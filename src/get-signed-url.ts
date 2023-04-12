import { S3RequestPresigner } from "@aws-sdk/s3-request-presigner";
import { Hash } from "@aws-sdk/hash-node";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { parseUrl } from "@aws-sdk/url-parser";

import { HttpRequest } from "@aws-sdk/protocol-http";

const credentials = fromNodeProviderChain();

const presigner = new S3RequestPresigner({
  credentials: credentials,
  region: process.env.AWS_REGION ?? "us-east-1",
  service: "",
  sha256: Hash.bind(null, "sha256"),
  uriEscapePath: true,
});

const createPreSignedLink = async (key: string, user: string) => {
  const s3ObjectUrl = parseUrl(
    `https://${process.env.S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${user}/${key}`
  );

  return presigner.presign(new HttpRequest({ ...s3ObjectUrl, method: "PUT" }));
};

const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async ({
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
  const folderPath = requestContext.authorizer.principalId;

  return { link: createPreSignedLink(key, folderPath) };
};

export default handler;
