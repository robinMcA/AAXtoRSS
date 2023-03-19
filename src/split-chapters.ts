import { exec as rawExec } from "child_process";
import { SQSHandler } from "aws-lambda";
import * as AWS from "@aws-sdk/client-s3";
import { promisify } from "util";
import { mkdir, readFile, rm, writeFile, readdir } from "fs/promises";
import { existsSync } from "fs";
import { PutObjectCommandInput } from "@aws-sdk/client-s3/dist-types/commands/PutObjectCommand";
import { SplitMessage } from "./types";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

const exec = promisify(rawExec);
const outBucket = process.env.OUT_BUCKET || "out";

const s3 = new AWS.S3({ region: process.env.AWS_REGION });

const dynamo = new DynamoDBClient({ region: process.env.AWS_REGION });

const marshallOptions = {
  convertEmptyValues: false, // false, by default.
  removeUndefinedValues: true, // false, by default.
  convertClassInstanceToMap: false, // false, by default.
};

const unmarshallOptions = {
  wrapNumbers: false, // false, by default.
};

// Create the DynamoDB document client.
const ddbDocClient = DynamoDBDocumentClient.from(dynamo, {
  marshallOptions,
  unmarshallOptions,
});

const execFfmpecClip = (
  infile: string,
  start: string,
  end: string,
  outDir: string,
  chapter: string
) =>
  exec(
    `/opt/ffmpeg -ss ${start} -i ${infile} -to ${end} -c copy -copyts ${outDir}/${chapter}.mp4`
  ).catch(async (e) => {
    await rm(infile);
    await rm(`${outDir}/${chapter}.mp4`);
    throw new Error(e);
  });

export const handler: SQSHandler = async (event) => {
  const dirList = await readdir("/tmp");
  await Promise.all(dirList.map((it) => rm(`/tmp/${it}`, { recursive: true })));

  const records = event.Records.map(
    (chap) => JSON.parse(chap.body) as unknown as SplitMessage
  );

  const s3FilesNeeded = Array.from(
    new Set(records.map((rec) => rec.outFile.key))
  );
  const s3NumBuckets = Array.from(
    new Set(records.map((rec) => rec.outFile.bucket))
  );

  if (s3NumBuckets.length > 1)
    throw new Error(
      "This is getting events for multiple buckets, this should never happen"
    );

  const Bucket = s3NumBuckets[0];

  const tempFilePointers = s3FilesNeeded.map((Key, index) => ({
    s3: {
      Bucket,
      Key,
    },
    local: `/tmp/file${index}`,
  }));

  await tempFilePointers.reduce(async (acc, file) => {
    await acc;
    const audio = await s3.getObject(file.s3);
    if (audio.Body === undefined) throw new Error("No File");

    await writeFile(file.local, await audio.Body.transformToByteArray());
  }, Promise.resolve());

  await records.reduce(async (acc, curr) => {
    await acc;
    const localInfile = tempFilePointers.find(
      (temp) => temp.s3.Key === curr.outFile.key
    );
    console.log(`curr: ${JSON.stringify(curr, null, 2)}`);
    console.log(`localInfile: ${JSON.stringify(localInfile, null, 2)}`);
    const localDir = `/tmp/${localInfile!.s3.Key.replace(".aax.mp4", "")}`;
    const dirExists = existsSync(localDir);
    if (!dirExists) {
      await mkdir(localDir, { recursive: true });
    }

    const fileName = curr.chapter.tags.title.replace(/\s+/g, "_");

    await execFfmpecClip(
      localInfile!.local,
      curr.chapter.start_time,
      curr.chapter.end_time,
      localDir,
      fileName
    );
    const file = await readFile(`${localDir}/${fileName}.mp4`);
    const destparams: PutObjectCommandInput = {
      Bucket: outBucket,
      Key: `${localInfile!.s3.Key.replace(".aax.mp4", "")}/${fileName}.mp4`,
      Body: file,
      ContentType: "audio",
    };
    console.log(
      `done: [${localInfile!.s3.Key.replace(".aax.mp4", "")}/${fileName}.mp4}]`
    );
    await s3.putObject(destparams);
    await rm(`${localDir}/${fileName}.mp4`);

    await ddbDocClient.send(
      new UpdateCommand({
        TableName: process.env.DYNAMO_NAME,
        UpdateExpression: "ADD doneCaps :b",
        ExpressionAttributeValues: { ":b": new Set([curr.chapter.id]) },
        Key: { s3Key: curr.outFile.key },
      })
    );
  }, Promise.resolve());

  await Promise.all(tempFilePointers.map((file) => rm(file.local)));
};

export default handler;
