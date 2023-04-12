import { CfnOutput, Stack } from "aws-cdk-lib";
import { Mfa, UserPool } from "aws-cdk-lib/aws-cognito";

export function cognito(stack: Stack) {
  const cognito = new UserPool(stack, `${stack.stackName}-client-pool`, {
    userPoolName: "client-pool",
    selfSignUpEnabled: false,
    enableSmsRole: false,
    signInAliases: { username: true },
    standardAttributes: {
      preferredUsername: { mutable: true, required: false },
    },
    mfa: Mfa.OFF,
  });

  const client = cognito.addClient("web-site");

  new CfnOutput(stack, "userPoolId", { value: cognito.userPoolId });
  new CfnOutput(stack, "userPoolProviderUrl", {
    value: cognito.userPoolProviderUrl,
  });
  new CfnOutput(stack, "userPoolProviderName", {
    value: cognito.userPoolProviderName,
  });

  return { cognito, client };
}
