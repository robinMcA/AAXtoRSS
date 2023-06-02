import { Construct } from "constructs";
import { Stack, StackProps } from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as path from "path";
import { transcodeSub } from "./transcode";
import { splitSub } from "./split";
import { roles } from "./roles";
import { s3Sub } from "./s3";
import { dynamoSub } from "./dynamo";
import { staticWeb } from "./web";
import { cognito } from "./cognito";
import { HostedZone } from "aws-cdk-lib/aws-route53";
import {
  Certificate,
  CertificateValidation,
} from "aws-cdk-lib/aws-certificatemanager";
import { createRss } from "./create-rss";

export const SiteData = {
  domainName: process.env.DOMAIN_NAME || "aax-rss.net",
  siteSubDomain: process.env.SUB_DOMAIN || "client",
  apiSubDomain: process.env.API_DOMAIN || "api",
  rssSubDomain: process.env.RSS_DOMAIN || "rss",
};
export const siteDomain = SiteData.siteSubDomain + "." + SiteData.domainName;
export const rssDomain = SiteData.rssSubDomain + "." + SiteData.domainName;

export class AaxMp3RssStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    // const zone = HostedZone.fromLookup(this, "zone", {
    //   domainName: SiteData.domainName,
    // });
    const zone = HostedZone.fromHostedZoneAttributes(this, "zoneid", {
      zoneName: "aax-rss.net",
      hostedZoneId: "Z0734245FFQJ3ASTK3JO",
    });
    // TLS certificate
    const wild = new Certificate(this, "WildCertificate", {
      domainName: "*." + SiteData.domainName,
      validation: CertificateValidation.fromDns(zone),
    });

    const { aaxBucket, outBucket } = s3Sub(this);

    const { table, usersTable } = dynamoSub(this);

    const ffmpegLayer = new lambda.LayerVersion(this, `ffmpeg`, {
      code: lambda.Code.fromAsset(path.join(__dirname, "/../ffmpeg")),
    });
    const { lambdaRole } = roles(this);
    const { splitQueue } = splitSub(this, lambdaRole, [ffmpegLayer], {
      outBucket,
      table,
      usersTable,
    });
    transcodeSub(this, lambdaRole, [ffmpegLayer], {
      aaxBucket,
      usersTable,
      splitQueue,
      table,
      outBucket,
    });
    const { cognito: userPool, client: cogClient } = cognito(this);
    const { httpApi } = staticWeb(this, lambdaRole, {
      inBucket: aaxBucket,
      userPool,
      cogClient,
      usersTable,
      booksTable: table,
      zone,
      wild,
    });

    createRss(this, {
      booksTable: table,
      zone,
      wild,
      role: lambdaRole,
      httpApi,
      outBucket,
    });
  }
}
