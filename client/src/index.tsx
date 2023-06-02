import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import reportWebVitals from "./reportWebVitals";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { Authenticator } from "@aws-amplify/ui-react";
import { Amplify, Auth } from "aws-amplify";
import awsExports from "./aws-exports";
import { User } from "./contexts";
import Upload from "./Componenets/Upload";
import Root from "./Pages/Root";
import ErrorBoundary from "./Componenets/ErrorBoundary";
import UserBooks from "./Componenets/UserBooks";
import Files from "./Componenets/Files";
import File from "./Componenets/File";

Amplify.configure(awsExports);

const router = createBrowserRouter([
  {
    path: "/",
    element: <Root />,
    children: [
      {
        errorElement: <ErrorBoundary />,
        path: "upload",
        element: <Upload />,
      },
      {
        path: ":user/books",
        errorElement: <ErrorBoundary />,
        element: <UserBooks />,
        loader: async ({ params }) => {
          return fetch(`https://api.aax-rss.net/${params.user}/books`, {
            headers: {
              Authorization: `Bearer ${(await Auth.currentSession())
                .getAccessToken()
                .getJwtToken()}`,
            },
          });
        },
      },
      {
        path: "files",
        errorElement: <ErrorBoundary />,
        element: <Files />,
        loader: async () => {
          return fetch("https://api.aax-rss.net/files", {
            headers: {
              Authorization: `Bearer ${(await Auth.currentSession())
                .getAccessToken()
                .getJwtToken()}`,
            },
          });
        },
      },
      {
        path: "files/:dirKey/:fileKey",
        errorElement: <ErrorBoundary />,
        element: <File />,
        loader: async ({ params: { fileKey, dirKey } }) => {
          return fetch(`https://api.aax-rss.net/file/${dirKey}/${fileKey}`, {
            headers: {
              Authorization: `Bearer ${(await Auth.currentSession())
                .getAccessToken()
                .getJwtToken()}`,
            },
          });
        },
      },
    ],
  },
]);
const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);
root.render(
  <React.StrictMode>
    <Authenticator>
      {(props) => (
        <User.Provider value={props}>
          <RouterProvider router={router} fallbackElement={<Root />} />
        </User.Provider>
      )}
    </Authenticator>
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
