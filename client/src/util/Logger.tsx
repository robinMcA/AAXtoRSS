import { useLoaderData } from "react-router-dom";

const Logger = () => {
  const data = useLoaderData();

  console.log(data);
  return <>{`${JSON.stringify(data, null, 2)}`}</>;
};

export default Logger;
