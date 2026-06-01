import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installAntiInspect } from "./lib/antiInspect";

installAntiInspect();

createRoot(document.getElementById("root")!).render(<App />);
