import { CfnOutput, Duration, RemovalPolicy, Size, Stack } from "aws-cdk-lib";
import { BlockPublicAccess, Bucket } from "aws-cdk-lib/aws-s3";
import { BucketDeployment, Source } from "aws-cdk-lib/aws-s3-deployment";
import { ARecord, IHostedZone, RecordTarget } from "aws-cdk-lib/aws-route53";
import { Certificate } from "aws-cdk-lib/aws-certificatemanager";
import {
  CloudFrontWebDistribution,
  HttpVersion,
  OriginProtocolPolicy,
  SecurityPolicyProtocol,
  ViewerCertificate,
  ViewerProtocolPolicy,
} from "aws-cdk-lib/aws-cloudfront";
import {
  ApiGatewayv2DomainProperties,
  CloudFrontTarget,
} from "aws-cdk-lib/aws-route53-targets";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import path from "path";
import {
  Effect,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { IUserPool, UserPoolClient } from "aws-cdk-lib/aws-cognito";
import {
  CorsHttpMethod,
  DomainName,
  HttpApi,
  HttpMethod,
  PayloadFormatVersion,
} from "@aws-cdk/aws-apigatewayv2-alpha";
import { HttpJwtAuthorizer } from "@aws-cdk/aws-apigatewayv2-authorizers-alpha";
import { HttpLambdaIntegration } from "@aws-cdk/aws-apigatewayv2-integrations-alpha";
import { Table } from "aws-cdk-lib/aws-dynamodb";
import { SiteData, siteDomain } from "./aax-mp3-rss-stack";
import { AnyPrincipal } from "aws-cdk-lib/aws-iam";

export function staticWeb(
  stack: Stack,
  lambdaRole: Role,
  {
    inBucket,
    userPool,
    cogClient,
    usersTable,
    booksTable,
    zone,
    wild,
  }: {
    inBucket: Bucket;
    userPool: IUserPool;
    cogClient: UserPoolClient;
    usersTable: Table;
    booksTable: Table;
    zone: IHostedZone;
    wild: Certificate;
  }
) {
  new CfnOutput(stack, "Site", { value: "https://" + siteDomain });

  const webS3 = new Bucket(stack, "web", {
    bucketName: `${stack.stackName}-web`.toLowerCase(),
    websiteErrorDocument: "index.html",
    websiteIndexDocument: "index.html",
    blockPublicAccess: new BlockPublicAccess({
      ignorePublicAcls: false,
      blockPublicAcls: false,
      blockPublicPolicy: false,
      restrictPublicBuckets: false,
    }),
    publicReadAccess: true,
    removalPolicy: RemovalPolicy.DESTROY,
  });

  // TLS certificate

  // CloudFront distribution that provides HTTPS
  const distribution = new CloudFrontWebDistribution(
    stack,
    "SiteDistribution",
    {
      viewerCertificate: ViewerCertificate.fromAcmCertificate(wild, {
        securityPolicy: SecurityPolicyProtocol.TLS_V1_2_2021,
        aliases: [siteDomain],
      }),
      httpVersion: HttpVersion.HTTP2_AND_3,
      viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      originConfigs: [
        {
          customOriginSource: {
            domainName: webS3.bucketWebsiteDomainName,
            originProtocolPolicy: OriginProtocolPolicy.HTTP_ONLY,
          },
          behaviors: [{ isDefaultBehavior: true }],
        },
      ],
    }
  );

  // Route53 alias record for the CloudFront distribution
  new ARecord(stack, "SiteAliasRecord", {
    recordName: siteDomain,
    target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)),
    zone,
  });

  // Deploy site contents to S3 bucket
  new BucketDeployment(stack, "DeployWithInvalidation", {
    sources: [Source.asset("./client/build")],
    destinationBucket: webS3,
    distribution,
    distributionPaths: ["/*", "/**/*"],
  });
  webS3.addToResourcePolicy(
    new PolicyStatement({
      sid: "AllowCloudFrontServicedddPrincipalReadOnly",
      effect: Effect.ALLOW,
      principals: [new ServicePrincipal("cloudfront.amazonaws.com")],
      actions: ["s3:GetObject"],
      resources: [webS3.bucketArn + "/*"],
    })
  );
  const dom = new DomainName(stack, "custom-dom", {
    domainName: `${SiteData.apiSubDomain}.${SiteData.domainName}`,
    certificate: wild,
  });

  const httpApi = new HttpApi(stack, "HttpApi", {
    apiName: "clientApi",
    description: "api for client",
    defaultDomainMapping: { domainName: dom },
    corsPreflight: {
      allowOrigins: ["http://localhost:3000", "https://client.aax-rss.net"],
      allowHeaders: ["Authorization"],
      allowMethods: [CorsHttpMethod.GET],
    },
  });

  // Route53 alias record for the CloudFront distribution
  new ARecord(stack, "ApiAliasRecord", {
    recordName: SiteData.apiSubDomain,
    target: RecordTarget.fromAlias(
      new ApiGatewayv2DomainProperties(
        dom.regionalDomainName,
        dom.regionalHostedZoneId
      )
    ),
    zone,
  });

  const auth = new HttpJwtAuthorizer(
    "cog-auth",
    `https://cognito-idp.${stack.region}.amazonaws.com/${userPool.userPoolId}`,
    {
      jwtAudience: [cogClient.userPoolClientId],
    }
  );

  const preSigned = new NodejsFunction(stack, "get-signed-url", {
    memorySize: Size.mebibytes(256).toMebibytes(),
    timeout: Duration.seconds(15),
    role: lambdaRole,
    reservedConcurrentExecutions: 1,
    runtime: lambda.Runtime.NODEJS_18_X,
    handler: "handler",
    entry: path.join(__dirname, `/../src/get-signed-url.ts`),
    bundling: {
      minify: true,
      externalModules: ["aws-sdk"],
    },
    environment: {
      S3_BUCKET: inBucket.bucketName,
    },
  });

  const splitInt = new HttpLambdaIntegration("split-api-gw", preSigned, {
    payloadFormatVersion: PayloadFormatVersion.VERSION_2_0,
  });

  httpApi.addRoutes({
    path: "/get-signed",
    integration: splitInt,
    authorizer: auth,
    methods: [HttpMethod.GET],
  });

  const getUserBooks = new NodejsFunction(stack, "get-user-files", {
    memorySize: Size.mebibytes(256).toMebibytes(),
    timeout: Duration.seconds(15),
    role: lambdaRole,
    reservedConcurrentExecutions: 1,
    runtime: lambda.Runtime.NODEJS_18_X,
    handler: "handler",
    entry: path.join(__dirname, `/../src/get-user-books.ts`),
    bundling: {
      minify: true,
      externalModules: ["aws-sdk"],
    },
    environment: {
      USER_DYNAMO: usersTable.tableName,
    },
  });

  const getUserBooksInt = new HttpLambdaIntegration(
    "get-user-files",
    getUserBooks,
    {
      payloadFormatVersion: PayloadFormatVersion.VERSION_2_0,
    }
  );

  httpApi.addRoutes({
    path: "/{user}/books",
    integration: getUserBooksInt,
    authorizer: auth,
    methods: [HttpMethod.GET],
  });
  const getFiles = new NodejsFunction(stack, "get-files", {
    memorySize: Size.mebibytes(256).toMebibytes(),
    timeout: Duration.seconds(15),
    role: lambdaRole,
    reservedConcurrentExecutions: 1,
    runtime: lambda.Runtime.NODEJS_18_X,
    handler: "handler",
    entry: path.join(__dirname, `/../src/get-files.ts`),
    bundling: {
      minify: true,
      externalModules: ["aws-sdk"],
    },
    environment: {
      DYNAMO_NAME: booksTable.tableName,
    },
  });

  const filesInt = new HttpLambdaIntegration("get-file", getFiles, {
    payloadFormatVersion: PayloadFormatVersion.VERSION_2_0,
  });

  httpApi.addRoutes({
    path: "/files",
    integration: filesInt,
    authorizer: auth,
    methods: [HttpMethod.GET],
  });

  const getFile = new NodejsFunction(stack, "get-file", {
    memorySize: Size.mebibytes(256).toMebibytes(),
    timeout: Duration.seconds(15),
    role: lambdaRole,
    reservedConcurrentExecutions: 1,
    runtime: lambda.Runtime.NODEJS_18_X,
    handler: "handler",
    entry: path.join(__dirname, `/../src/get-file.ts`),
    bundling: {
      minify: true,
      externalModules: ["aws-sdk"],
    },
    environment: {
      DYNAMO_NAME: booksTable.tableName,
    },
  });

  const fileInt = new HttpLambdaIntegration("get-file", getFile, {
    payloadFormatVersion: PayloadFormatVersion.VERSION_2_0,
  });

  httpApi.addRoutes({
    path: "/file/{dir}/{file}",
    integration: fileInt,
    authorizer: auth,
    methods: [HttpMethod.GET],
  });
  httpApi.addRoutes({
    path: "/file/{dir}",
    integration: fileInt,
    authorizer: auth,
    methods: [HttpMethod.GET],
  });

  return { httpApi };
}
