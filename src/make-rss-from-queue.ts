import { SQSHandler } from "aws-lambda";
import { ddbDocClient } from "./utils/dynamoClient";
import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { Podcast } from "podcast";
import { addDays } from "date-fns";
import { v4 } from "uuid";
import { s3 } from "./utils/s3Client";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { AudioFile } from "./put-file-rss";

export const handler: SQSHandler = async (event) => {
  try {
    await Promise.all(
      event.Records.map(async (rec) => {
        console.log(JSON.stringify(event, null, 2));
        const bookFile = await ddbDocClient.send(
          new GetCommand({
            TableName: process.env.DYNAMO_NAME,
            Key: {
              s3Key: rec.body,
            },
          })
        );

        const file = bookFile.Item as AudioFile;
        console.log(JSON.stringify(file, null, 2));
        const feedUuid = v4();

        const feed = new Podcast({
          author: file.format.tags.artist,
          siteUrl: process.env.RSS_ROOT,
          title: file.format.tags.title,
          description: file.format.tags.comment,
          feedUrl: `${process.env.RSS_ROOT}/${feedUuid}`,
        });
        const client = new S3Client({ region: process.env.AWS_REGION });

        const final = await file.chapters.reduce(async (prev, chap, index) => {
          if (!file.doneCaps?.has(chap.id)) {
            return prev;
          }

          const command = new GetObjectCommand({
            Bucket: process.env.FILES_BUCKET,
            Key: `${rec.body}/${chap.tags.title}`.replace(" ", "_"),
          });
          const url = await getSignedUrl(client, command, {
            expiresIn: 3600,
          });

          console.log(url);
          (await prev).addItem({
            date: addDays(new Date(2000, 1, 1), index),
            title: chap.tags.title,
            description: chap.tags.title,
            url: `${process.env.RSS_ROOT}`,
            enclosure: { url: encodeURI(url) },
          });
          return prev;
        }, Promise.resolve(feed));

        await s3.putObject({
          Bucket: process.env.RSS_BUCKET,
          Key: feedUuid,
          Body: final.buildXml({ indent: " " }),
          ContentType: "text/xml",
        });
      })
    );
    return;
  } catch (e: unknown) {
    console.error(e);
    return;
  }
};

export default handler;
