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

export class AaxMp3RssStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

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
    staticWeb(this, lambdaRole, { inBucket: aaxBucket, userPool, cogClient });
  }
}
