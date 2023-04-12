import { CfnOutput, Duration, RemovalPolicy, Size, Stack } from "aws-cdk-lib";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { BucketDeployment, Source } from "aws-cdk-lib/aws-s3-deployment";
import { ARecord, HostedZone, RecordTarget } from "aws-cdk-lib/aws-route53";
import {
  Certificate,
  CertificateValidation,
} from "aws-cdk-lib/aws-certificatemanager";
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
import { Role } from "aws-cdk-lib/aws-iam";
import {
  CfnApi,
  CfnApiMapping,
  CfnAuthorizer,
  CfnDomainName,
  CfnIntegration,
  CfnRoute,
  CfnStage,
} from "aws-cdk-lib/aws-apigatewayv2";
import { IUserPool, UserPoolClient } from "aws-cdk-lib/aws-cognito";

const SiteData = {
  domainName: process.env.DOMAIN_NAME || "aax-rss.net",
  siteSubDomain: process.env.SUB_DOMAIN || "client",
  apiSubDomain: process.env.API_DOMAIN || "api",
};

export function staticWeb(
  stack: Stack,
  lambdaRole: Role,
  {
    inBucket,
    userPool,
    cogClient,
  }: {
    inBucket: Bucket;
    userPool: IUserPool;
    cogClient: UserPoolClient;
  }
) {
  const zone = HostedZone.fromLookup(stack, "zone", {
    domainName: SiteData.domainName,
  });

  const siteDomain = SiteData.siteSubDomain + "." + SiteData.domainName;
  new CfnOutput(stack, "Site", { value: "https://" + siteDomain });

  const webS3 = new Bucket(stack, "web", {
    bucketName: `${stack.stackName}-web`.toLowerCase(),
    websiteErrorDocument: "index.html",
    websiteIndexDocument: "index.html",
    publicReadAccess: true,
    removalPolicy: RemovalPolicy.DESTROY,
  });
  new CfnOutput(stack, "WebBucket", { value: webS3.bucketName });

  // TLS certificate
  const certificate = new Certificate(stack, "SiteCertificate", {
    domainName: siteDomain,
    validation: CertificateValidation.fromDns(zone),
  });
  // TLS certificate
  const wild = new Certificate(stack, "WildCertificate", {
    domainName: "*." + SiteData.domainName,
    validation: CertificateValidation.fromDns(zone),
  });

  new CfnOutput(stack, "Certificate", { value: certificate.certificateArn });
  // CloudFront distribution that provides HTTPS
  const distribution = new CloudFrontWebDistribution(
    stack,
    "SiteDistribution",
    {
      viewerCertificate: ViewerCertificate.fromAcmCertificate(certificate, {
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
  new CfnOutput(stack, "DistributionId", {
    value: distribution.distributionId,
  });

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
    distributionPaths: ["/*"],
  });

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
  const dom = new CfnDomainName(stack, "custom-dom", {
    domainName: `${SiteData.apiSubDomain}.${SiteData.domainName}`,
    domainNameConfigurations: [{ certificateArn: wild.certificateArn }],
  });

  const httpApi = new CfnApi(stack, "HttpApi", {
    name: "clientApi",
    protocolType: "HTTP",
  });

  const stage = new CfnStage(stack, "deploy-stage", {
    stageName: "deploy",
    apiId: httpApi.attrApiId,
    autoDeploy: true,
  });
  const mapping = new CfnApiMapping(stack, "dom-mapping", {
    domainName: dom.domainName,
    apiId: httpApi.attrApiId,
    stage: stage.stageName,
  });

  mapping.addDependency(dom);

  // Route53 alias record for the CloudFront distribution
  const rec = new ARecord(stack, "ApiAliasRecord", {
    recordName: SiteData.apiSubDomain,
    target: RecordTarget.fromAlias(
      new ApiGatewayv2DomainProperties(
        dom.attrRegionalDomainName,
        dom.attrRegionalHostedZoneId
      )
    ),
    zone,
  });

  rec.node.addDependency(mapping);

  const auth = new CfnAuthorizer(stack, "cog-auth", {
    apiId: httpApi.attrApiId,
    authorizerType: "JWT",
    name: "cog-auth",
    identitySource: ["$request.header.Authorization"],
    jwtConfiguration: {
      audience: [cogClient.userPoolClientId],
      issuer: `https://cognito-idp.${stack.region}.amazonaws.com/${userPool.userPoolId}`,
    },
  });

  const splitInt = new CfnIntegration(stack, "split-api-gw", {
    apiId: httpApi.attrApiId,
    integrationType: "AWS_PROXY",
    payloadFormatVersion: "2.0",
    integrationMethod: "POST",
    integrationUri: preSigned.functionArn,
    timeoutInMillis: 4000,
  });
  const route = new CfnRoute(stack, "split-api-route", {
    apiId: httpApi.attrApiId,
    routeKey: "GET /get-signed",
    authorizerId: auth.attrAuthorizerId,
    authorizationType: "JWT",
    target: `integrations/${splitInt.ref}`,
  });
}
