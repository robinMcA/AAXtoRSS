import { Breadcrumb, Layout, Menu, MenuProps, theme } from "antd";
import { Content, Header } from "antd/es/layout/layout";
import React, { useContext } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { title } from "../util";
import { User } from "../contexts";
import { AmplifyUser } from "@aws-amplify/ui";

const menuItems = (user?: AmplifyUser) => [
  { name: "home", path: "/" },
  "upload",
  "files",
  { name: "Your books", path: `${user?.username}/books` },
];

const topNav: (user?: AmplifyUser) => MenuProps["items"] = (
  user?: AmplifyUser
) =>
  menuItems(user).map((key) =>
    typeof key === "string"
      ? {
          key,
          label: <NavLink to={`/${key}`}>{title(key)}</NavLink>,
        }
      : {
          key: key.name,
          label: <NavLink to={key.path}>{title(key.name)}</NavLink>,
        }
  );

// const items2: MenuProps["items"] = [
//   UserOutlined,
//   LaptopOutlined,
//   NotificationOutlined,
// ].map((icon, index) => {
//   const key = String(index + 1);
//
//   return {
//     key: `sub${key}`,
//     icon: React.createElement(icon),
//     label: `subnav ${key}`,
//
//     children: new Array(4).fill(null).map((_, j) => {
//       const subKey = index * 4 + j + 1;
//       return {
//         key: subKey,
//         label: `option${subKey}`,
//       };
//     }),
//   };
// });

const DefaultLayout = ({ children }: React.PropsWithChildren) => {
  const { pathname } = useLocation();

  const pathParts = pathname.split("/");

  const {
    token: { colorBgContainer },
  } = theme.useToken();
  const { signOut, user } = useContext(User);

  return (
    <Layout>
      <Header className="header">
        <div className="logo" />
        <Menu
          theme="dark"
          mode="horizontal"
          defaultSelectedKeys={["2"]}
          items={topNav(user)}
        />
      </Header>
      <Layout>
        {/*<Layout.Sider width={200} style={{ background: colorBgContainer }}>*/}
        {/*  <Menu*/}
        {/*    mode="inline"*/}
        {/*    defaultSelectedKeys={["1"]}*/}
        {/*    defaultOpenKeys={["sub1"]}*/}
        {/*    style={{ height: "100%", borderRight: 0 }}*/}
        {/*    items={items2}*/}
        {/*  />*/}
        {/*</Layout.Sider>*/}
        <Layout style={{ padding: "0 24px 24px" }}>
          <Breadcrumb
            style={{ margin: "16px 0" }}
            items={[
              { title: "Home" },
              ...pathParts.slice(1).map((path) => ({
                title: title(path),
              })),
            ]}
          />

          <Content
            style={{
              padding: 24,
              margin: 0,
              minHeight: 280,
              background: colorBgContainer,
            }}
          >
            {children}
          </Content>
        </Layout>
      </Layout>
    </Layout>
  );
};
export default DefaultLayout;
