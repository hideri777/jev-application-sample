import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import { Layout } from "./Layout";
import { Battle } from "./pages/Battle";
import { Form } from "./pages/Form";
import { Home } from "./pages/Home";
import { Interview } from "./pages/Interview";
import { Playground } from "./pages/Playground";
import { SandboxProvider } from "./sandbox/SandboxContext";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SandboxProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="playground" element={<Playground />} />
            <Route path="battle" element={<Battle />} />
            <Route path="form" element={<Form />} />
            <Route path="interview" element={<Interview />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </SandboxProvider>
  </StrictMode>,
);
