import { exec as rawExec } from "child_process";
import { S3CreateEvent, SQSHandler } from "aws-lambda";
import { inspect, promisify } from "util";
import { readFile, writeFile } from "fs/promises";
import { PutObjectCommandInput } from "@aws-sdk/client-s3/dist-types/commands/PutObjectCommand";
import { ProbeChapter, ProbeOut } from "./types";
import { v4 } from "uuid";
import { PutCommand, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { SendMessageBatchCommand, SQSClient } from "@aws-sdk/client-sqs";
import chunk from "lodash.chunk";
import { SendMessageBatchRequestEntry } from "@aws-sdk/client-sqs/dist-types/models/models_0";
import { ddbDocClient } from "./utils/dynamoClient";
import { s3 } from "./utils/s3Client";
import { sqsClient } from "./utils/sqsClient";

const exec = promisify(rawExec);
const outBucket = process.env.OUT_BUCKET || "out";

const sendToQueueInChunks =
  (client: SQSClient) =>
  (input: ProbeChapter[], meta?: object): Promise<void> => {
    const entries: SendMessageBatchRequestEntry[] = input.map((chap) => ({
      MessageBody: JSON.stringify({ chapter: chap, ...meta }),
      Id: v4(),
    }));
    return chunk(entries, 8)
      .map(
        (entry) =>
          new SendMessageBatchCommand({
            QueueUrl: process.env.SPLIT_QUEUE,
            Entries: entry,
          })
      )
      .reduce(async (acc, com) => {
        await acc;
        console.log(JSON.stringify(com.input.Entries, null, 2));

        await client.send(com);
      }, Promise.resolve());
  };

const execFfProbe = async (inPath: string) =>
  exec(
    `/opt/ffprobe -i ${inPath} -print_format json -show_chapters -show_format`
  ).then(({ stdout, stderr }) => {
    const json = JSON.parse(stdout) as unknown as ProbeOut;

    return { stderr, chapters: json.chapters, format: json.format };
  });

const execFfmpeg = async (inPath: string, outPath: string) => {
  const { stderr, stdout } = await exec(
    `/opt/ffmpeg -y -activation_bytes ${process.env.MAGIC_STRING} -i ${inPath} -vn -c:a copy ${outPath}.mp4`
  ).catch(async (e) => {
    const destparams: PutObjectCommandInput = {
      Bucket: outBucket,
      Key: "error-log.json",
      Body: JSON.stringify(e, null, 2),
      ContentType: "json",
    };

    await s3.putObject(destparams);
    return { stderr: e, stdout: "" };
  });

  return { stdout, stderr };
};

export const handler: SQSHandler = async (event) => {
  const userP = ddbDocClient.send(
    new ScanCommand({
      TableName: process.env.USER_DYNAMO,
    })
  );
  const records = event.Records;
  if (records.length > 1) throw new Error("Too many Records");

  const record = records[0];

  const body = JSON.parse(record.body) as S3CreateEvent;
  const { Records } = body;
  console.log("Reading options from event:\n", inspect(Records, { depth: 8 }));

  const srcBucket = Records[0].s3.bucket.name;
  //     // Object key may have spaces or unicode non-ASCII characters.
  const srcKeyFull = decodeURIComponent(
    Records[0].s3.object.key.replace(/\+/g, " ")
  );

  const user = srcKeyFull.split("/")[0];
  const userT = (await userP).Items?.map((itm) => itm.user);
  console.log(userT);
  if (!userT?.includes(user)) throw new Error("input s3 dir name error");
  const srcKey = srcKeyFull.replace(`${user}/`, "");
  const params = {
    Bucket: srcBucket,
    Key: srcKeyFull,
  };

  console.log(params);
  const origimage = await s3.getObject(params);
  console.log("got s3 obj");

  if (origimage.Body === undefined) throw new Error("No File");

  await writeFile(
    "/tmp/infile.aax",
    await origimage.Body.transformToByteArray()
  );
  console.log("written local");

  await execFfmpeg("/tmp/infile.aax", "/tmp/outFile");
  console.log("finished ffmpeg");

  const { chapters, format } = await execFfProbe("/tmp/outFile.mp4");
  console.log("finished probe");

  const outSrcKey = srcKey.replace(/\s+/g, "_").replace(/[\(\)]/g, "__");
  const outDirS3 =
    format?.tags?.title
      ?.replace(/\s+/g, "_")
      .replace(/[\(\)]/g, "__")
      .replace(/'/g, "") || outSrcKey;

  const outKey = `${encodeURI(outDirS3)}/${outSrcKey}.mp4`;

  await ddbDocClient.send(
    new PutCommand({
      TableName: process.env.DYNAMO_NAME,
      Item: {
        s3Key: encodeURI(outDirS3),
        chapters,
        format,
        infile: { bucket: srcBucket, key: srcKey },
        outFile: { bucket: outBucket, key: outKey },
      },
    })
  );
  console.log("put dynamo");

  await ddbDocClient.send(
    new UpdateCommand({
      TableName: process.env.USER_DYNAMO,
      UpdateExpression: "ADD Books :b",
      ExpressionAttributeValues: { ":b": new Set([encodeURI(outDirS3)]) },
      Key: { user },
    })
  );
  console.log("update dynamo");
  const destparams: PutObjectCommandInput = {
    Bucket: outBucket,
    Key: outKey,
    Body: await readFile("/tmp/outFile.mp4"),
    ContentType: "image",
  };
  await s3.putObject(destparams);
  console.log("put S3");
  await sendToQueueInChunks(sqsClient)(chapters, {
    outFile: { bucket: outBucket, key: outKey },
  });
  console.log("queue");
};

export default handler;
