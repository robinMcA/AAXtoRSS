import { createContext } from "react";
import { AmplifyUser } from "@aws-amplify/ui";
import { UseAuthenticator } from "@aws-amplify/ui-react-core";

export type UserContext = {
  signOut?: UseAuthenticator["signOut"];
  user?: AmplifyUser;
};
export const User = createContext<UserContext>({});
