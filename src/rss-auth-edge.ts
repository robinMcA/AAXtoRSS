import { CloudFrontRequestHandler } from "aws-lambda";
import { parse } from "querystring";

export const handler: CloudFrontRequestHandler = async (event) => {
  const {
    request: { querystring },
  } = event.Records[0].cf;
  try {
    const qS = parse(querystring)["auth"];

    const authQuery =
      qS !== undefined && typeof qS === "string" ? qS : undefined;
    console.log(qS, querystring);
    if (authQuery === undefined || authQuery !== "AUTH_VALUE") {
      return { status: "401" };
    }

    return event.Records[0].cf.request;
  } catch (e: unknown) {
    console.error(e);
    return { status: "503" };
  }
};

export default handler;
