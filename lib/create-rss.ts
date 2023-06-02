import { Queue } from "aws-cdk-lib/aws-sqs";
import { Duration, RemovalPolicy, Size, Stack } from "aws-cdk-lib";
import { SqsSubscription } from "aws-cdk-lib/aws-sns-subscriptions";
import { Topic } from "aws-cdk-lib/aws-sns";
import { ARecord, IHostedZone, RecordTarget } from "aws-cdk-lib/aws-route53";
import { BlockPublicAccess, Bucket } from "aws-cdk-lib/aws-s3";
import { Certificate } from "aws-cdk-lib/aws-certificatemanager";
import {
  CloudFrontWebDistribution,
  experimental,
  HttpVersion,
  LambdaEdgeEventType,
  OriginProtocolPolicy,
  SecurityPolicyProtocol,
  ViewerCertificate,
  ViewerProtocolPolicy,
} from "aws-cdk-lib/aws-cloudfront";
import { rssDomain, SiteData } from "./aax-mp3-rss-stack";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { Code, Runtime } from "aws-cdk-lib/aws-lambda";
import path from "path";
import { readFileSync } from "fs";
import { BucketDeployment, Source } from "aws-cdk-lib/aws-s3-deployment";
import {
  AnyPrincipal,
  Effect,
  PolicyStatement,
  Role,
} from "aws-cdk-lib/aws-iam";
import { CloudFrontTarget } from "aws-cdk-lib/aws-route53-targets";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { HttpLambdaIntegration } from "@aws-cdk/aws-apigatewayv2-integrations-alpha";
import {
  HttpApi,
  HttpMethod,
  PayloadFormatVersion,
} from "@aws-cdk/aws-apigatewayv2-alpha";
import { Table } from "aws-cdk-lib/aws-dynamodb";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";

export function createRss(
  stack: Stack,
  {
    zone,
    wild,
    role,
    httpApi,
    booksTable,
    outBucket,
  }: {
    booksTable: Table;
    httpApi: HttpApi;
    zone: IHostedZone;
    wild: Certificate;
    role: Role;
    outBucket: Bucket;
  }
) {
  const rssQueueDlq = new Queue(stack, "createRssDlq", {
    visibilityTimeout: Duration.minutes(300),
  });

  const rssQueue = new Queue(stack, "createRssQueue", {
    visibilityTimeout: Duration.minutes(1),
    deadLetterQueue: { queue: rssQueueDlq, maxReceiveCount: 1 },
  });

  const rssSub = new SqsSubscription(rssQueue, {
    rawMessageDelivery: true,
  });

  const createRssTopic = new Topic(stack, "createRss");

  createRssTopic.addSubscription(rssSub);

  const rssS3 = new Bucket(stack, "rss-data", {
    websiteErrorDocument: "index.html",
    websiteIndexDocument: "index.html",
    blockPublicAccess: new BlockPublicAccess({
      ignorePublicAcls: false,
      blockPublicAcls: false,
      blockPublicPolicy: false,
      restrictPublicBuckets: false,
    }),
    removalPolicy: RemovalPolicy.DESTROY,
  });

  const authCheck = new experimental.EdgeFunction(stack, "checkAuth", {
    code: Code.fromInline(
      readFileSync(path.join(__dirname, `/../src/rss-auth-edge.js`))
        .toString()
        .replace("AUTH_VALUE", process.env.AUTH_VALUE || "youshouldchangethis")
    ),
    role: role,
    handler: "index.handler",
    runtime: Runtime.NODEJS_18_X,
  });

  // CloudFront distribution that provides HTTPS
  const distribution = new CloudFrontWebDistribution(stack, "RssDistribution", {
    viewerCertificate: ViewerCertificate.fromAcmCertificate(wild, {
      securityPolicy: SecurityPolicyProtocol.TLS_V1_2_2021,
      aliases: [rssDomain],
    }),
    httpVersion: HttpVersion.HTTP2_AND_3,
    viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
    originConfigs: [
      {
        customOriginSource: {
          domainName: rssS3.bucketWebsiteDomainName,
          originProtocolPolicy: OriginProtocolPolicy.HTTP_ONLY,
        },
        behaviors: [
          {
            isDefaultBehavior: true,
            lambdaFunctionAssociations: [
              {
                eventType: LambdaEdgeEventType.VIEWER_REQUEST,
                lambdaFunction: authCheck,
              },
            ],
          },
        ],
      },
    ],
  });

  rssS3.addToResourcePolicy(
    new PolicyStatement({
      sid: "AllowCloudFrontServicePrincipalReadOndddly",
      effect: Effect.ALLOW,
      principals: [new AnyPrincipal()],
      actions: ["s3:GetObject"],
      resources: [rssS3.bucketArn + "/*"],
    })
  );

  new BucketDeployment(stack, "DeployRssWithInvalidation", {
    sources: [Source.asset("./rss-index")],
    destinationBucket: rssS3,
    distribution,
    distributionPaths: ["/*"],
  });
  // Route53 alias record for the CloudFront distribution
  new ARecord(stack, "RssAliasRecord", {
    recordName: `${SiteData.rssSubDomain}.${SiteData.domainName}`,
    target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)),
    zone,
  });

  const putFileRss = new NodejsFunction(stack, "get-rss", {
    memorySize: Size.mebibytes(256).toMebibytes(),
    timeout: Duration.seconds(15),
    role: role,
    reservedConcurrentExecutions: 1,
    runtime: lambda.Runtime.NODEJS_18_X,
    handler: "handler",
    entry: path.join(__dirname, `/../src/put-file-rss.ts`),
    bundling: {
      minify: true,
      externalModules: ["aws-sdk"],
    },
    environment: {
      DYNAMO_NAME: booksTable.tableName,
      CREATE_RRS_TOPIC: createRssTopic.topicArn,
    },
  });

  const rssInt = new HttpLambdaIntegration("get-file", putFileRss, {
    payloadFormatVersion: PayloadFormatVersion.VERSION_2_0,
  });

  httpApi.addRoutes({
    path: "/file/{dir}/{file}/rss",
    integration: rssInt,
    methods: [HttpMethod.PUT],
  });

  const makeRssFile = new NodejsFunction(stack, "make-rss-from-queue", {
    memorySize: Size.mebibytes(256).toMebibytes(),
    timeout: Duration.seconds(15),
    role: role,
    reservedConcurrentExecutions: 1,
    runtime: lambda.Runtime.NODEJS_18_X,
    handler: "handler",
    entry: path.join(__dirname, `/../src/make-rss-from-queue.ts`),
    bundling: {
      minify: true,
      externalModules: ["aws-sdk"],
    },
    environment: {
      DYNAMO_NAME: booksTable.tableName,
      CREATE_RRS_TOPIC: createRssTopic.topicArn,
      RSS_ROOT: `https://${SiteData.rssSubDomain}.${SiteData.domainName}`,
      FILES_BUCKET: outBucket.bucketName,
      RSS_BUCKET: rssS3.bucketName,
    },
  });

  const source = new SqsEventSource(rssQueue, { batchSize: 1 });
  makeRssFile.addEventSource(source);

  return { createRssTopic };
}
