// frontend/src/components/SensorLanding.js
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchSensors } from "../services/api";

export default function SensorLanding() {
  const [sensors, setSensors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        setErr("");
        const data = await fetchSensors();
        setSensors(data);
      } catch (e) {
        setErr(String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div style={{ padding: 24, color: "#e7e7e7" }}>Loading sensors…</div>;
  if (err) return <div style={{ padding: 24, color: "tomato" }}>{err}</div>;
  if (!sensors.length) return <div style={{ padding: 24, color: "#e7e7e7" }}>No sensors found.</div>;

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ color: "#fff", marginBottom: 16 }}>Available Sensors</h1>
      <div style={{ marginBottom: 16 }}>
        <button
          onClick={() => navigate('/map')}
          style={{
            border: 'none',
            borderRadius: 12,
            padding: '10px 14px',
            background: '#1976d2',
            color: '#fff',
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
          }}
        >
          Open Sensor Map
        </button>
        <button
          onClick={() => navigate('/plan?map=map')}
          style={{
            border: 'none',
            borderRadius: 12,
            padding: '10px 14px',
            background: '#00a152',
            color: '#fff',
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            marginLeft: 12
          }}
        >
          Open Metro Plan
        </button>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          gap: 16,
        }}
      >
        {sensors.map((s) => (
          <button
            key={s.table}
            onClick={() => navigate(`/sensor/${encodeURIComponent(s.table)}`)}
            style={{
              textAlign: "left",
              border: "none",
              borderRadius: 14,
              padding: 16,
              background: "#2f3437",
              color: "#e7e7e7",
              boxShadow: "0 2px 10px rgba(0,0,0,0.25)",
              cursor: "pointer",
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 700 }}>{s.name}</div>
            <div style={{ opacity: 0.85, marginTop: 6 }}>
              DB: <code>{s.table}</code>
            </div>
            <div style={{ marginTop: 8, fontSize: 13, opacity: 0.9 }}>
              Rows (approx): {s.approx_rows ?? 0}
            </div>
            <div style={{ marginTop: 4, fontSize: 13, opacity: 0.9 }}>
              Latest: {s.latest ? new Date(s.latest).toLocaleString() : "—"}
            </div>
            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
              {s.notes || "Click to open"}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
