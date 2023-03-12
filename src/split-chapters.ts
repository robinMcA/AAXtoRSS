import { exec as rawExec } from "child_process";
import { SQSHandler } from "aws-lambda";
import * as AWS from "@aws-sdk/client-s3";
import { promisify } from "util";
import { mkdir, readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { PutObjectCommandInput } from "@aws-sdk/client-s3/dist-types/commands/PutObjectCommand";
import { SplitMessage } from "./types";

const exec = promisify(rawExec);
const outBucket = process.env.OUT_BUCKET || "out";

const s3 = new AWS.S3({ region: process.env.AWS_REGION });

const execFfmpecClip = (
  infile: string,
  start: string,
  end: string,
  outDir: string,
  chapter: string
) =>
  exec(
    `/opt/ffmpeg -i ${infile} -ss ${start} -to ${end} ${outDir}/${chapter}.mp4`
  );

export const handler: SQSHandler = async (event) => {
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
    const localInfile = tempFilePointers.find(
      (temp) => temp.s3.Key === curr.outFile.key
    );

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

    const destparams: PutObjectCommandInput = {
      Bucket: outBucket,
      Key: `${localInfile!.s3.Key.replace(".aax.mp4", "")}/${fileName}.mp4`,
      Body: await readFile(`${localDir}/${fileName}.mp4`),
      ContentType: "audio",
    };

    await s3.putObject(destparams);
  }, Promise.resolve());
};

export default handler;
