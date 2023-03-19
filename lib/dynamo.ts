import { Stack } from "aws-cdk-lib";
import {
  AttributeType,
  BillingMode,
  Table,
  TableClass,
} from "aws-cdk-lib/aws-dynamodb";

export function dynamoSub(stack: Stack) {
  const table = new Table(stack, "books", {
    partitionKey: { name: "s3Key", type: AttributeType.STRING },
    tableName: "booksTable",
    tableClass: TableClass.STANDARD_INFREQUENT_ACCESS,
    billingMode: BillingMode.PAY_PER_REQUEST,
  });

  const usersTable = new Table(stack, "users", {
    partitionKey: { name: "user", type: AttributeType.STRING },
    tableName: "ussrsTable",
    tableClass: TableClass.STANDARD_INFREQUENT_ACCESS,
    billingMode: BillingMode.PAY_PER_REQUEST,
  });

  return { table, usersTable };
}
