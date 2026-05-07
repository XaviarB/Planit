import "@/App.css";
import { useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Landing from "./pages/Landing";
import GroupPage from "./pages/Group";
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
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
