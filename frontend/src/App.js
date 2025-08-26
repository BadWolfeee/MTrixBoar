import { Routes, Route, Navigate } from "react-router-dom";
import SensorLanding from "./components/SensorLanding";
import SensorPage from "./components/SensorPage";
import DashboardPage from "./components/DashboardPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<SensorLanding />} />
      <Route path="/sensor/:table" element={<SensorPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      {/* Optional: redirect unknown routes to home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
