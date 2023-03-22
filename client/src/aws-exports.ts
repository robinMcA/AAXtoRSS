const awsExports = {
  Auth: {
    // REQUIRED - Amazon Cognito Region
    region: "us-east-1",

    // OPTIONAL - Amazon Cognito User Pool ID
    userPoolId: "XX-XXXX-X_abcd1234",

    // OPTIONAL - Enforce user authentication prior to accessing AWS resources or not
    mandatorySignIn: true,

    signUpVerificationMethod: "code", // 'code' | 'link'
  },
};

export default awsExports;
