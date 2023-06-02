const awsExports = {
  Auth: {
    // REQUIRED - Amazon Cognito Region
    region: "us-east-1",

    // OPTIONAL - Amazon Cognito User Pool ID
    userPoolId: "us-east-1_yLv2iqLH1",
    userPoolWebClientId: "5hh2etra1ttume4k97e7reoem9",
    // OPTIONAL - Enforce user authentication prior to accessing AWS resources or not
    mandatorySignIn: true,

    signUpVerificationMethod: "code", // 'code' | 'link'
  },
};

export default awsExports;
