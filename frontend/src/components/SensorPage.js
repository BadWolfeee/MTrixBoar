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
import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import DashboardLayout from "../layout/DashboardLayout";
import FilterDrawerContent from "./FilterDrawerContent";
import SensorDataDashboard from "./SensorDataDashboard";
import { pivotSensorData } from "../utils/pivotSensorData";
import { fetchSensorDataByTable } from "../services/api";

// helper copied from your DashboardPage
function groupDataBySensorType(rows) {
  const groups = {};
  if (!rows) return groups;
  rows.forEach((item) => {
    const parts = (item.mt_name || "").split(".");
    const sensorType = parts[parts.length - 1] || "";
    if (!groups[sensorType]) groups[sensorType] = [];
    groups[sensorType].push(item);
  });
  return groups;
}

// Decide whether to downsample based on range length (simple heuristic)
function shouldDownsample(startIso, endIso) {
  if (!startIso || !endIso) return false;
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  const spanMs = end - start;
  // Downsample if range > 3 days
  return spanMs > 3 * 24 * 60 * 60 * 1000;
}

export default function SensorPage() {
  const { table } = useParams(); // e.g. "sens01"
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [nextAfter, setNextAfter] = useState(null);
  const [usingDownsample, setUsingDownsample] = useState(false);

  const load = async () => {
    if (!table) return;
    setLoading(true);
    setErr("");
    try {
      const doDownsample = shouldDownsample(startTime, endTime);
      setUsingDownsample(doDownsample);
      if (doDownsample) {
        const ds = await fetchSensorDataByTable(table, {
          start: startTime,
          end: endTime,
          downsample: true,
          target_points: 2000,
        });
        // Transform to raw-like rows for graphs
        const rows = (ds || []).map(r => ({
          mt_time: r.bucket_start,
          mt_name: r.mt_name,
          mt_value: r.avg,
          mt_quality: null,
        }));
        setData(rows);
        setNextAfter(null);
      } else {
        const resp = await fetchSensorDataByTable(table, {
          start: startTime,
          end: endTime,
          order: 'asc',
          limit: 1000,
        });
        const rows = Array.isArray(resp) ? resp : (resp.rows || []);
        setData(rows);
        setNextAfter(Array.isArray(resp) ? null : (resp.next_after || null));
      }
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

  const loadMore = async () => {
    if (usingDownsample || !nextAfter) return;
    setLoading(true);
    setErr("");
    try {
      const resp = await fetchSensorDataByTable(table, {
        start: startTime,
        end: endTime,
        order: 'asc',
        limit: 1000,
        after: nextAfter,
      });
      const rows = Array.isArray(resp) ? resp : (resp.rows || []);
      setData(prev => [...prev, ...rows]);
      setNextAfter(Array.isArray(resp) ? null : (resp.next_after || null));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  };

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
        <>
          <SensorDataDashboard groupedData={groupedData} pivotedData={pivotedData} />
          {!usingDownsample && nextAfter && (
            <div style={{ marginTop: 8 }}>
              <button onClick={loadMore}>Load more</button>
            </div>
          )}
          {usingDownsample && (
            <div style={{ marginTop: 8, color: '#aaa' }}>
              Showing downsampled data (avg/min/max per bucket).
            </div>
          )}
        </>
      )}
    </>
  );

  return <DashboardLayout drawerContent={drawerContent} mainContent={mainContent} />;
}
