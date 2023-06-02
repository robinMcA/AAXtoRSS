import React, { useCallback, useContext, useReducer, useState } from "react";
import "./Root.css";
import "@aws-amplify/ui-react/styles.css";
import { User } from "../contexts";
import DefaultLayout from "../Componenets/DefaultLayout";
import { Outlet } from "react-router-dom";

function Root() {
  const { signOut, user } = useContext(User);

  return (
    <DefaultLayout>
      <div className="App">
        <header className="App-header">
          <h1>{user?.username} - aax MP3</h1>
        </header>
      </div>
      <div id="detail">
        <Outlet />
      </div>
    </DefaultLayout>
  );
}

export default Root;
