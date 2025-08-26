import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import DashboardLayout from "../layout/DashboardLayout";
import FilterDrawerContent from "./FilterDrawerContent";
import SensorDataDashboard from "./SensorDataDashboard";
import { pivotSensorData } from "../utils/pivotSensorData";

// helper copied from your DashboardPage
function groupDataBySensorType(rows) {
  const groups = {};
  if (!rows) return groups;
  rows.forEach((item) => {
    const parts = item.mt_name.split(".");
    const sensorType = parts[parts.length - 1];
    if (!groups[sensorType]) groups[sensorType] = [];
    groups[sensorType].push(item);
  });
  return groups;
}

// NOTE: we call the new endpoint that takes ?sensor=<table>
async function fetchByTable(table, { start, end, limit = 1000 } = {}) {
  const params = new URLSearchParams({ sensor: table, limit });
  if (start) params.set("start", start);
  if (end) params.set("end", end);
  const res = await fetch(`/api/sensor-data/by-table?` + params.toString());
  if (!res.ok) throw new Error("Failed to fetch sensor data");
  return res.json();
}

export default function SensorPage() {
  const { table } = useParams(); // e.g. "sens01"
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const load = async () => {
    if (!table) return;
    setLoading(true);
    setErr("");
    try {
      const rows = await fetchByTable(table, { start: startTime, end: endTime, limit: 1000 });
      setData(rows);
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // initial fetch when navigating to a different table
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table]);

  const groupedData = groupDataBySensorType(data);
  const pivotedData = pivotSensorData(data);

  const drawerContent = (
    <div>
      <div style={{ marginBottom: 12 }}>
        <Link to="/" style={{ color: "#ddd" }}>← Back to sensors</Link>
      </div>
      <FilterDrawerContent
        startTime={startTime}
        setStartTime={setStartTime}
        endTime={endTime}
        setEndTime={setEndTime}
        sensorType={""}        // not used on this page
        setSensorType={() => {}}
        onFetch={load}
      />
    </div>
  );

  const mainContent = (
    <>
      <h2 style={{ color: "#fff", margin: "8px 0 12px" }}>Sensor: {table}</h2>
      {err && <div style={{ color: "tomato", marginBottom: 8 }}>{err}</div>}
      {loading ? (
        <div style={{ color: "#e7e7e7" }}>Loading…</div>
      ) : (
        <SensorDataDashboard groupedData={groupedData} pivotedData={pivotedData} />
      )}
    </>
  );

  return <DashboardLayout drawerContent={drawerContent} mainContent={mainContent} />;
}
