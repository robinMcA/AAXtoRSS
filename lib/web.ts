import { CfnOutput, RemovalPolicy, Stack } from "aws-cdk-lib";
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
  ViewerCertificate,
  ViewerProtocolPolicy,
} from "aws-cdk-lib/aws-cloudfront";
import { CloudFrontTarget } from "aws-cdk-lib/aws-route53-targets";

const SiteData = {
  domainName: process.env.DOMAIN_NAME || "aax-rss.net",
  siteSubDomain: process.env.SUB_DOMAIN || "client",
};

export function staticWeb(stack: Stack) {
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

  new CfnOutput(stack, "Certificate", { value: certificate.certificateArn });
  // CloudFront distribution that provides HTTPS
  const distribution = new CloudFrontWebDistribution(
    stack,
    "SiteDistribution",
    {
      viewerCertificate: ViewerCertificate.fromAcmCertificate(certificate),
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
}
