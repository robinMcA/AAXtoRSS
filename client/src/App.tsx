import React, { useCallback, useContext, useEffect, useState } from "react";
import logo from "./logo.svg";
import "./App.css";
import "@aws-amplify/ui-react/styles.css";
import { User } from "./contexts";
import axios from "axios";
import { useDropzone } from "react-dropzone";
import { Auth } from "aws-amplify";

const onUploadProgress =
  (setter: (input: number) => void) => (progressEvent: any) =>
    setter(Math.round((progressEvent.loaded * 100) / progressEvent.total));

function App() {
  const { signOut, user } = useContext(User);
  const [progress, setProgress] = useState(0);
  const [idToken, setIdToken] = useState(0);

  useEffect(() => {
    const effect = async () => {
      (await Auth.currentSession()).getIdToken().getJwtToken();
    };
  }, [user]);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    const presignedUrl = await axios.get("https://your-api.com/presigned-url", {
      params: { filename: file.name },
    });

    await axios.put(presignedUrl.data.url, file, {
      onUploadProgress: onUploadProgress(setProgress),
    });
  }, []);

  const { getRootProps, getInputProps } = useDropzone({ onDrop });

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
      <div>
        <div {...getRootProps()}>
          <input {...getInputProps()} />
          <p>Drag and drop your files here or click to select files</p>
          <progress value={progress} max="100" />
        </div>
      </div>
    </div>
  );
}

export default App;
