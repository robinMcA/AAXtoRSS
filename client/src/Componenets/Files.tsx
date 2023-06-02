import { useLoaderData, useNavigate } from "react-router-dom";
import { Table } from "antd";
import { AudioFile } from "../util/types";
import { ColumnsType } from "antd/es/table";
import { Typography } from "antd";

type AllFilesType = {
  title: string;
  toConvert: string;
  allConverted: boolean;
  s3Key: string;
};

const Cols: ColumnsType<AllFilesType> = [
  {
    title: "Book Title",
    dataIndex: "title",
  },
  {
    title: "All Chapters Converted",
    dataIndex: "allConverted",
    render: (convert) => (convert ? "done" : "some left"),
  },
  {
    title: "Number of chapters left to convert",
    dataIndex: "toConvert",
    ellipsis: true,
    render: (list) => (list.length === 2 ? "none" : list),
    width: 200,
  },
];

export const Files = () => {
  const { files: data } = useLoaderData() as { files: AudioFile[] };
  const nav = useNavigate();
  const tableData: AllFilesType[] = data.map((file) => ({
    title: file.format.tags.title,
    toConvert: JSON.stringify(
      file.chapters
        .filter((chap) => !file.doneCaps?.includes(chap.id))
        .map((chaps) => chaps.id + 1)
    ),
    allConverted: !file.chapters.some(
      (chap) => !file.doneCaps?.includes(chap.id)
    ),
    s3Key: file.outFile.key,
  }));

  return (
    <Table
      dataSource={tableData}
      columns={Cols}
      onRow={(record, rowIndex) => {
        return {
          onClick: () => nav(record.s3Key),
        };
      }}
    ></Table>
  );
};

export default Files;
