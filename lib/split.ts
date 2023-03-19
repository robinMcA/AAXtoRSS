import { Duration, Size, Stack } from "aws-cdk-lib";
import { Queue } from "aws-cdk-lib/aws-sqs";
import { LayerVersion } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import path from "path";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { Role } from "aws-cdk-lib/aws-iam";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { Table } from "aws-cdk-lib/aws-dynamodb";

export function splitSub(
  stack: Stack,
  lambdaRole: Role,
  layers: LayerVersion[],
  {
    outBucket,
    table,
    usersTable,
  }: {
    outBucket: Bucket;
    table: Table;
    usersTable: Table;
  }
) {
  const splitDlq = new Queue(stack, "SplitDlq", {
    visibilityTimeout: Duration.minutes(300),
  });

  const splitQueue = new Queue(stack, "Split", {
    visibilityTimeout: Duration.minutes(17),
    deadLetterQueue: { queue: splitDlq, maxReceiveCount: 3 },
    deliveryDelay: Duration.minutes(1),
  });

  const split = new NodejsFunction(stack, "split", {
    memorySize: Size.gibibytes(5).toMebibytes(),
    timeout: Duration.minutes(15),
    role: lambdaRole,
    reservedConcurrentExecutions: 5,
    ephemeralStorageSize: Size.gibibytes(3),
    runtime: lambda.Runtime.NODEJS_18_X,
    handler: "handler",
    entry: path.join(__dirname, `/../src/split-chapters.ts`),
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
  const splitSource = new SqsEventSource(splitQueue, { batchSize: 4 });
  split.addEventSource(splitSource);

  return { splitQueue };
}
