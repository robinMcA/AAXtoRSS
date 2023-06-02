import { Duration, Size, Stack } from "aws-cdk-lib";
import { Queue } from "aws-cdk-lib/aws-sqs";
import { SqsSubscription } from "aws-cdk-lib/aws-sns-subscriptions";
import { Topic } from "aws-cdk-lib/aws-sns";
import { Bucket, EventType } from "aws-cdk-lib/aws-s3";
import { SnsDestination } from "aws-cdk-lib/aws-s3-notifications";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import path from "path";
import { Role } from "aws-cdk-lib/aws-iam";
import { LayerVersion } from "aws-cdk-lib/aws-lambda";
import { Table } from "aws-cdk-lib/aws-dynamodb";

export function transcodeSub(
  stack: Stack,
  lambdaRole: Role,
  layers: LayerVersion[],
  {
    aaxBucket,
    splitQueue,
    outBucket,
    table,
    usersTable,
  }: {
    aaxBucket: Bucket;
    splitQueue: Queue;
    outBucket: Bucket;
    table: Table;
    usersTable: Table;
  }
) {
  const transcodeQueueDlq = new Queue(stack, "AaxMp3RssQueueDQL", {
    visibilityTimeout: Duration.minutes(300),
  });

  const transcodeQueue = new Queue(stack, "AaxMp3RssQueue", {
    visibilityTimeout: Duration.minutes(17),
    deadLetterQueue: { queue: transcodeQueueDlq, maxReceiveCount: 2 },
  });

  const transcodeSub = new SqsSubscription(transcodeQueue, {
    rawMessageDelivery: true,
  });

  const newAax = new Topic(stack, "new-aax");
  newAax.addSubscription(transcodeSub);

  aaxBucket.addEventNotification(
    EventType.OBJECT_CREATED,
    new SnsDestination(newAax),
    { suffix: ".aax" }
  );
  aaxBucket.addEventNotification(
    EventType.OBJECT_CREATED,
    new SnsDestination(newAax),
    { suffix: ".AAX" }
  );

  const transcode = new NodejsFunction(stack, "transcode", {
    memorySize: Size.gibibytes(5).toMebibytes(),
    timeout: Duration.minutes(3),
    role: lambdaRole,
    reservedConcurrentExecutions: 1,
    ephemeralStorageSize: Size.gibibytes(6),
    runtime: lambda.Runtime.NODEJS_18_X,
    handler: "handler",
    entry: path.join(__dirname, `/../src/decode-ffmpeg.ts`),
    bundling: {
      minify: true,
      externalModules: ["aws-sdk"],
    },
    environment: {
      SPLIT_QUEUE: splitQueue.queueUrl,
      SPLIT_QUEUE_ARN: splitQueue.queueArn,
      OUT_BUCKET: outBucket.bucketName,
      DYNAMO_ARN: table.tableArn,
      DYNAMO_NAME: table.tableName,
      USER_DYNAMO: usersTable.tableName,
      MAGIC_STRING: process.env.MAGIC_STRING || "",
    },
    layers,
  });

  const source = new SqsEventSource(transcodeQueue, { batchSize: 1 });
  transcode.addEventSource(source);
}
