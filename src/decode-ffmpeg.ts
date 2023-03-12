import { exec as rawExec } from "child_process";
import { S3CreateEvent, SQSHandler } from "aws-lambda";
import { S3 } from "@aws-sdk/client-s3";
import { inspect, promisify } from "util";
import { readFile, writeFile } from "fs/promises";
import { PutObjectCommandInput } from "@aws-sdk/client-s3/dist-types/commands/PutObjectCommand";
import { ProbeChapter, ProbeOut } from "./types";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  SendMessageBatchCommand,
  SendMessageBatchCommandOutput,
  SQSClient,
} from "@aws-sdk/client-sqs";
import chunk from "lodash.chunk";
import { SendMessageBatchRequestEntry } from "@aws-sdk/client-sqs/dist-types/models/models_0";

const exec = promisify(rawExec);
const outBucket = process.env.OUT_BUCKET || "out";

const s3 = new S3({ region: process.env.AWS_REGION });

const dynamo = new DynamoDBClient({ region: process.env.AWS_REGION });
const sqsClient = new SQSClient({ region: process.env.AWS_REGION });

const marshallOptions = {
  // Whether to automatically convert empty strings, blobs, and sets to `null`.
  convertEmptyValues: false, // false, by default.
  // Whether to remove undefined values while marshalling.
  removeUndefinedValues: true, // false, by default.
  // Whether to convert typeof object to map attribute.
  convertClassInstanceToMap: false, // false, by default.
};

const sendToQueueInChunks =
  (client: SQSClient) =>
  (
    input: ProbeChapter[],
    meta?: object
  ): Promise<Array<SendMessageBatchCommandOutput>> => {
    const entries: SendMessageBatchRequestEntry[] = input.map((chap) => ({
      MessageBody: JSON.stringify({ chapter: chap, ...meta }),
      Id: chap.id.toString(),
    }));
    return Promise.all(
      chunk(entries, 8)
        .map(
          (entry) =>
            new SendMessageBatchCommand({
              QueueUrl: process.env.SPLIT_QUEUE,
              Entries: entry,
            })
        )
        .map((com) => client.send(com))
    );
  };

const unmarshallOptions = {
  // Whether to return numbers as a string instead of converting them to native JavaScript numbers.
  wrapNumbers: false, // false, by default.
};

// Create the DynamoDB document client.
const ddbDocClient = DynamoDBDocumentClient.from(dynamo, {
  marshallOptions,
  unmarshallOptions,
});
const execFfProbe = async (inPath: string) =>
  exec(
    `/opt/ffprobe -i ${inPath} -print_format json -show_chapters -show_format`
  ).then(({ stdout, stderr }) => {
    const json = JSON.parse(stdout) as unknown as ProbeOut;

    return { stderr, chapters: json.chapters, format: json.format };
  });

const execFfmpeg = async (inPath: string, outPath: string) => {
  const { stderr, stdout } = await exec(
    `/opt/ffmpeg -activation_bytes ${process.env.MAGIC_STRING} -i ${inPath} -vn -c:a copy ${outPath}.mp4`
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
    Key: srcKey,
  };

  console.log(params);

  const origimage = await s3.getObject(params);

  if (origimage.Body === undefined) throw new Error("No File");

  await writeFile(
    "/tmp/infile.aax",
    await origimage.Body.transformToByteArray()
  );

  await execFfmpeg("/tmp/infile.aax", "/tmp/outFile");

  const { chapters, format } = await execFfProbe("/tmp/outFile.mp4");
  const outDirS3 = format?.tags?.title?.replace(/\s+/g, "_") || srcKey;
  const outKey = `${encodeURI(outDirS3)}/${srcKey}.mp4`;
  const sendToSqs = sendToQueueInChunks(sqsClient)(chapters, {
    outFile: { bucket: outBucket, key: outKey },
  });
  await ddbDocClient.send(
    new PutCommand({
      TableName: process.env.DYNAMO_NAME,
      Item: {
        s3Key: srcKey,
        chapters,
        format,
        infile: { bucket: srcBucket, key: srcKey },
        outFile: { bucket: outBucket, key: outKey },
      },
    })
  );
  await ddbDocClient.send(
    new UpdateCommand({
      TableName: process.env.USER_DYNAMO,
      UpdateExpression: "ADD Books :b",
      ExpressionAttributeValues: { ":b": new Set([srcKey]) },
      Key: { user },
    })
  );
  const destparams: PutObjectCommandInput = {
    Bucket: outBucket,
    Key: outKey,
    Body: await readFile("/tmp/outFile.mp4"),
    ContentType: "image",
  };
  await sendToSqs;
  await s3.putObject(destparams);
};

export default handler;
