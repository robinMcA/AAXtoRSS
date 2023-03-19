import { Stack } from "aws-cdk-lib";
import { Bucket } from "aws-cdk-lib/aws-s3";

export function s3Sub(stack: Stack) {
  const aaxBucket = new Bucket(stack, `AAX`, {
    bucketName: `${stack.stackName}-aax`.toLowerCase(),
  });

  const outBucket = new Bucket(stack, `OUT`, {
    bucketName: `${stack.stackName}-out`.toLowerCase(),
  });

  return { aaxBucket, outBucket };
}
