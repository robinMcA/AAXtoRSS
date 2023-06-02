import { Link, useLoaderData } from "react-router-dom";
import { List } from "antd";
import { useState } from "react";
import Item = List.Item;

const UserBooks = () => {
  const data = useLoaderData() as { books: string[] };

  const [pageSize, setPageSize] = useState(30);

  // noinspection JSUnusedGlobalSymbols
  return (
    <List
      size={"small"}
      bordered
      pagination={{
        pageSize,
        onShowSizeChange: (_, size) => setPageSize(size),
      }}
      dataSource={data.books}
      renderItem={(item) => (
        <Item key={item}>
          <Link to={item}>{item}</Link>
        </Item>
      )}
    />
  );
};
export default UserBooks;
