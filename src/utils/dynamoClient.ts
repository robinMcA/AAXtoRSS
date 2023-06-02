import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const dynamo = new DynamoDBClient({ region: process.env.AWS_REGION });
const marshallOptions = {
  convertEmptyValues: false, // false, by default.
  removeUndefinedValues: true, // false, by default.
  convertClassInstanceToMap: false, // false, by default.
};
const unmarshallOptions = {
  wrapNumbers: false, // false, by default.
};
// Create the DynamoDB document client.
export const ddbDocClient = DynamoDBDocumentClient.from(dynamo, {
  marshallOptions,
  unmarshallOptions,
});
export const unmarshalDdObj = (input: object) =>
  JSON.parse(
    JSON.stringify(input, (_, value) =>
      value instanceof Set ? Array.from(value) : value
    )
  );
