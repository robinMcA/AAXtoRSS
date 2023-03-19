import { Stack } from "aws-cdk-lib";
import {
  Effect,
  PolicyDocument,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";

export function roles(stack: Stack) {
  const lambdaRole = new Role(stack, "aax-mp3", {
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
  return { lambdaRole };
}
