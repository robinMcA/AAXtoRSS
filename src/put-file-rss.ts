import { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { ddbDocClient } from "./utils/dynamoClient";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { Podcast } from "podcast";
import { addDays } from "date-fns";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
export type Chapter = {
  start_time: string;
  time_base: string;
  start: number;
  end_time: string;
  end: number;
  id: number;
  tags: { title: string };
};

export type S3FileData = { bucket: string; key: string };

export type AudioFile = {
  chapters: Chapter[];
  infile: S3FileData;
  doneCaps?: Set<number>;
  outFile: S3FileData;
  s3Key: string;
  format: {
    duration: string;
    start_time: string;
    bit_rate: string;
    filename: string;
    size: string;
    probe_score: number;
    nb_programs: number;
    format_long_name: string;
    nb_streams: number;
    format_name: string;
    tags: {
      date: string;
      copyright: string;
      artist: string;
      album_artist: string;
      album: string;
      major_brand: string;
      genre: string;
      comment: string;
      title: string;
      encoder: string;
      minor_version: string;
      compatible_brands: string;
    };
  };
};

const snsClient = new SNSClient({});
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async ({
  pathParameters,
}) => {
  try {
    if (pathParameters === undefined || pathParameters.dir === undefined) {
      return { statusCode: 404 };
    }

    const s3Key = `${pathParameters.dir}/${pathParameters.file}`;

    const bookFile = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.DYNAMO_NAME,
        Key: {
          s3Key,
        },
      })
    );

    if (bookFile.Item === undefined) {
      return { statusCode: 404 };
    }

    await snsClient.send(
      new PublishCommand({
        Message: s3Key,
        TopicArn: process.env.CREATE_RRS_TOPIC,
      })
    );

    return {
      statusCode: 204,
    };
  } catch (e: unknown) {
    console.error(e);
    return { statusCode: 503 };
  }
};

export default handler;
