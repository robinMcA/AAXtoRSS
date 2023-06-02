import React, { useCallback, useContext, useReducer, useState } from "react";
import "@aws-amplify/ui-react/styles.css";
import { User } from "../contexts";
import axios from "axios";
import { useDropzone } from "react-dropzone";
import { Auth } from "aws-amplify";
import { Col, Progress, Row } from "antd";
import { CloudFilled, CloudUploadOutlined } from "@ant-design/icons";
import DefaultLayout from "../Componenets/DefaultLayout";

type FileState = { files: { progress: number; file: File; done?: boolean }[] };
const FileActionsC = {
  updateProgress: "UPDATE_PROGRESS",
  doneFile: "DONE_FILE",
  addFile: "ADD_FILES",
} as const;
type FileActionsTypes = typeof FileActionsC;

type FileActionAddFiles = {
  type: FileActionsTypes["addFile"];
  payload: { file: File; progress: number }[];
};

type FileActionUpdateProgress = {
  type: FileActionsTypes["updateProgress"];
  payload: { index: number; progress: number };
};

type FileActionDone = {
  type: FileActionsTypes["doneFile"];
  payload: { index: number };
};

type FileActions =
  | FileActionAddFiles
  | FileActionUpdateProgress
  | FileActionDone;

const fileStateReducer = (state: FileState, acton: FileActions): FileState => {
  switch (acton.type) {
    case FileActionsC.updateProgress: {
      return {
        files: state.files.map((file, index) =>
          index === acton.payload.index
            ? { ...file, progress: acton.payload.progress }
            : file
        ),
      };
    }
    case FileActionsC.addFile: {
      return { files: acton.payload };
    }
    case FileActionsC.doneFile: {
      return {
        files: state.files.map((file, index) =>
          index === acton.payload.index
            ? { ...file, progress: 100, done: true }
            : file
        ),
      };
    }
    default:
      return state;
  }
};
const onUploadProgress =
  (dispatch: React.Dispatch<FileActionUpdateProgress>, index: number) =>
  (progressEvent: any) =>
    dispatch({
      type: FileActionsC.updateProgress,
      payload: {
        index,
        progress: Math.round(
          (progressEvent.loaded * 100) / progressEvent.total
        ),
      },
    });

function Upload() {
  const { user } = useContext(User);

  const [filesState, dispatch] = useReducer(fileStateReducer, { files: [] });

  const [uploading, setUploading] = useState(false);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    setUploading(true);
    const fileList = acceptedFiles
      .filter((r) => r.name.toLowerCase().endsWith(".aax"))
      .map((file) => ({ file, progress: 0 }));

    dispatch({ type: FileActionsC.addFile, payload: fileList });

    await fileList.reduce(async (promise, { file }, currentIndex) => {
      await promise;
      const token = (await Auth.currentSession())
        .getAccessToken()
        .getJwtToken();
      const {
        data: { url, fields },
      } = await axios.get<{ url: string; fields: Record<string, string> }>(
        "https://api.aax-rss.net/get-signed",
        {
          params: { filename: file.name },
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const form = new FormData();
      Object.entries(fields).forEach(([field, value]) => {
        form.append(field, value);
      });
      form.append("file", file);

      await axios({
        onUploadProgress: onUploadProgress(dispatch, currentIndex),
        method: "post",
        url,
        data: form,
        headers: { "Content-Type": "multipart/form-data" },
      });

      dispatch({
        type: FileActionsC.doneFile,
        payload: { index: currentIndex },
      });
    }, Promise.resolve());
    setUploading(false);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    disabled: uploading,
  });

  return (
    <Row
      style={{ display: "flex", height: "30vh", margin: "1rem" }}
      justify={"center"}
      id={"upload"}
    >
      <Col
        xs={16}
        sm={12}
        md={8}
        span={8}
        style={{
          border: "2px solid #3c6c3c",
          borderWidth: "2px",
          borderRadius: "2rem",
          borderColor: "green",
          background: isDragActive ? "green" : "#c7e3c7",
        }}
        {...getRootProps({ className: "dropzone" })}
      >
        <input {...getInputProps({ className: "dropzone" })} />
        <p style={{ padding: "1rem" }}>
          Drag and drop your files here or click to select files
        </p>
        <Row justify={"center"} style={{ marginBottom: "1rem" }}>
          <Col>
            {isDragActive ? (
              <CloudFilled style={{ fontSize: "3rem" }} />
            ) : (
              <CloudUploadOutlined style={{ fontSize: "3rem" }} />
            )}
          </Col>
        </Row>
        {filesState.files?.map(({ file, progress }) => (
          <>
            <Row justify={"center"}>
              <Col span={8}>{file.name}</Col>
            </Row>
            <Row justify={"center"}>
              <Col span={16}>
                <Progress percent={progress} />
              </Col>
            </Row>
          </>
        ))}
      </Col>
    </Row>
  );
}

export default Upload;
