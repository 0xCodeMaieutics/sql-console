import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { DetailPage } from "./pages/DetailPage";
import { HomePage } from "./pages/HomePage";
import { PgConnectPage } from "./pages/PgConnectPage";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/pg/:port" element={<PgConnectPage />} />
        <Route path="/pg/:port/:database" element={<DetailPage />} />
        <Route path="/sqlite" element={<DetailPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
