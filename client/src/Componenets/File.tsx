import { useLoaderData, useNavigate, useParams } from "react-router-dom";
import type { ColumnsType } from "antd/es/table";
import { Table } from "antd";
import { AudioFile, Chapter } from "../util/types";

type ColType = { done: boolean; length: number } & Chapter;

const columns: ColumnsType<ColType> = [
  {
    title: "Chapter",
    dataIndex: ["tags", "title"],
  },
  {
    title: "Converted",
    dataIndex: "done",
    render: (done) => <em>{`${done ? "converted" : "todo"}`}</em>,
  },
  {
    title: "Chapter Length",
    dataIndex: "length",
    render: (done) => <em>{`${Math.floor(done / 60000)} min`}</em>,
  },
];

export const File = () => {
  const { fileKey } = useParams();

  const data = useLoaderData() as AudioFile;

  const tableData = data.chapters.map((chap) => ({
    ...chap,
    done: data?.doneCaps?.includes(chap.id) ?? false,
    length: chap.end - chap.start,
  }));

  const someToConvert = tableData.filter((t) => !t.done).map((t) => t.id + 1);
  return (
    <>
      <div>some to convert: {`${someToConvert}`}</div>
      <Table dataSource={tableData} columns={columns}></Table>
    </>
  );
};

export default File;
