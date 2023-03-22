import React from "react";
import logo from "./logo.svg";
import "./App.css";
import { Amplify } from "aws-amplify";
import { withAuthenticator } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";
import awsExports from "./aws-exports";
import { WithAuthenticatorProps } from "@aws-amplify/ui-react/dist/types/components/Authenticator/withAuthenticator";

Amplify.configure(awsExports);

function App({ signOut, user }: WithAuthenticatorProps) {
  return (
    <div className="App">
      <header className="App-header">
        <h1>Hello {user?.username}</h1>
        <button onClick={signOut}>Sign out</button>
        <img src={logo} className="App-logo" alt="logo" />
        <p>
          Edit <code>src/App.tsx</code> and save to reload.
        </p>
        <a
          className="App-link"
          href="https://reactjs.org"
          target="_blank"
          rel="noopener noreferrer"
        >
          Learn React
        </a>
      </header>
    </div>
  );
}

export default withAuthenticator(App);
