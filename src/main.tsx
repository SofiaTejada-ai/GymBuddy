import React from "react";
import ReactDOM from "react-dom/client";
import GymBuddy from "./components/GymBuddy";
import "../index.css"; // <-- important
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <GymBuddy />
  </React.StrictMode>
);
