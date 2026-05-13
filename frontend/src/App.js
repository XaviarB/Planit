import "@/App.css";
import { useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Landing from "./pages/Landing";
import GroupPage from "./pages/Group";
import CustomizePage from "./pages/Customize";
import PreviewAuthA from "./pages/_PreviewAuthA";
import PreviewAuthB from "./pages/_PreviewAuthB";
import { Toaster } from "sonner";
import { getInitialTheme } from "./components/ThemeToggle";

function App() {
  useEffect(() => {
    const t = getInitialTheme();
    if (t === "dark") document.documentElement.classList.add("dark");
  }, []);
  return (
    <div className="App">
      <Toaster position="top-center" richColors />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/g/:code" element={<GroupPage />} />
          <Route path="/g/:code/customize" element={<CustomizePage />} />
          <Route path="/preview/auth-a" element={<PreviewAuthA />} />
          <Route path="/preview/auth-b" element={<PreviewAuthB />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
