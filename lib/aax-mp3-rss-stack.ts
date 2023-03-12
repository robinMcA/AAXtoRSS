import { Construct } from "constructs";
import { Duration, Size, Stack, StackProps } from "aws-cdk-lib";
import { Queue } from "aws-cdk-lib/aws-sqs";
import { Bucket, EventType } from "aws-cdk-lib/aws-s3";
import { Topic } from "aws-cdk-lib/aws-sns";
import { SqsSubscription } from "aws-cdk-lib/aws-sns-subscriptions";
import { SnsDestination } from "aws-cdk-lib/aws-s3-notifications";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as path from "path";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import {
  Effect,
  PolicyDocument,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import {
  AttributeType,
  BillingMode,
  Table,
  TableClass,
} from "aws-cdk-lib/aws-dynamodb";

export class AaxMp3RssStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const newAax = new Topic(this, "new-aax");

    /**
     * Queues
     */

    const transcodeQueueDlq = new Queue(this, "AaxMp3RssQueueDQL", {
      visibilityTimeout: Duration.minutes(300),
    });

    const transcodeQueue = new Queue(this, "AaxMp3RssQueue", {
      visibilityTimeout: Duration.minutes(17),
      deadLetterQueue: { queue: transcodeQueueDlq, maxReceiveCount: 2 },
    });

    const transcodeSub = new SqsSubscription(transcodeQueue, {
      rawMessageDelivery: true,
    });

    const splitDlq = new Queue(this, "SplitDlq", {
      visibilityTimeout: Duration.minutes(300),
    });

    const splitQueue = new Queue(this, "Split", {
      visibilityTimeout: Duration.minutes(17),
      deadLetterQueue: { queue: splitDlq, maxReceiveCount: 2 },
    });

    const splitSub = new SqsSubscription(splitQueue, {
      rawMessageDelivery: true,
    });

    newAax.addSubscription(transcodeSub);

    const aaxBucket = new Bucket(this, `AAX`, {
      bucketName: `${this.stackName}-aax`.toLowerCase(),
    });

    const outBucket = new Bucket(this, `OUT`, {
      bucketName: `${this.stackName}-out`.toLowerCase(),
    });

    const table = new Table(this, "books", {
      partitionKey: { name: "s3Key", type: AttributeType.STRING },
      tableName: "booksTable",
      tableClass: TableClass.STANDARD_INFREQUENT_ACCESS,
      billingMode: BillingMode.PAY_PER_REQUEST,
    });

    const usersTable = new Table(this, "users", {
      partitionKey: { name: "user", type: AttributeType.STRING },
      tableName: "ussrsTable",
      tableClass: TableClass.STANDARD_INFREQUENT_ACCESS,
      billingMode: BillingMode.PAY_PER_REQUEST,
    });

    aaxBucket.addEventNotification(
      EventType.OBJECT_CREATED_COMPLETE_MULTIPART_UPLOAD,
      new SnsDestination(newAax),
      { suffix: ".aax" }
    );

    const ffmpegLayer = new lambda.LayerVersion(this, `ffmpeg`, {
      code: lambda.Code.fromAsset(path.join(__dirname, "/../ffmpeg")),
    });

    const lambdaRole = new Role(this, "aax-mp3", {
      assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
      inlinePolicies: {
        logs: new PolicyDocument({
          statements: [
            new PolicyStatement({
              actions: ["logs:*"],
              effect: Effect.ALLOW,
              resources: ["*"],
            }),
          ],
        }),
        Dynamo: new PolicyDocument({
          statements: [
            new PolicyStatement({
              actions: ["dynamodb:*"],
              effect: Effect.ALLOW,
              resources: ["*"],
            }),
          ],
        }),
        LambdaInvoke: new PolicyDocument({
          statements: [
            new PolicyStatement({
              actions: ["s3:*", "sqs:*"],
              effect: Effect.ALLOW,
              resources: ["*"],
            }),
          ],
        }),
      },
    });

    const transcode = new NodejsFunction(this, "transcode", {
      memorySize: Size.gibibytes(6).toMebibytes(),
      timeout: Duration.minutes(15),
      role: lambdaRole,
      ephemeralStorageSize: Size.gibibytes(3),
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
      layers: [ffmpegLayer],
    });
    const source = new SqsEventSource(transcodeQueue, { batchSize: 1 });
    transcode.addEventSource(source);

    const split = new NodejsFunction(this, "split", {
      memorySize: Size.gibibytes(6).toMebibytes(),
      timeout: Duration.minutes(15),
      role: lambdaRole,
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
      layers: [ffmpegLayer],
    });
    const splitSource = new SqsEventSource(splitQueue, { batchSize: 2 });
    split.addEventSource(splitSource);
  }
}
