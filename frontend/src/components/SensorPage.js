import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import DashboardLayout from "../layout/DashboardLayout";
import FilterDrawerContent from "./FilterDrawerContent";
import SensorDataDashboard from "./SensorDataDashboard";
import { pivotSensorData } from "../utils/pivotSensorData";
import { fetchSensorDataByTable, fetchSensorRange } from "../services/api";

// Group rows by the trailing token in mt_name
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

// Simple heuristic: downsample for wide ranges
function shouldDownsample(startIso, endIso) {
  if (!startIso || !endIso) return false;
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  const spanMs = end - start;
  return spanMs > 3 * 24 * 60 * 60 * 1000; // > 3 days
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
  const [latest, setLatest] = useState(null);

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
        const rows = (ds || []).map((r) => ({
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
          order: "asc",
          limit: 1000,
        });
        const rows = Array.isArray(resp) ? resp : resp.rows || [];
        setData(rows);
        setNextAfter(Array.isArray(resp) ? null : resp.next_after || null);
      }
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      if (!table) return;
      try {
        // Fetch range to get latest time; default to last 24h
        const r = await fetchSensorRange(table);
        if (r && r.max_time) {
          setLatest(r.max_time);
          if (!startTime && !endTime) {
            const endIso = r.max_time.slice(0, 16); // YYYY-MM-DDTHH:mm
            const endMs = new Date(r.max_time).getTime();
            const startMs = endMs - 24 * 60 * 60 * 1000;
            const startIso = new Date(startMs).toISOString().slice(0, 16);
            setStartTime(startIso);
            setEndTime(endIso);
          }
        }
      } catch (_) {}
      load();
    };
    init();
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
        order: "asc",
        limit: 1000,
        after: nextAfter,
      });
      const rows = Array.isArray(resp) ? resp : resp.rows || [];
      setData((prev) => [...prev, ...rows]);
      setNextAfter(Array.isArray(resp) ? null : resp.next_after || null);
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  };

  const drawerContent = (
    <div>
      <div style={{ marginBottom: 12 }}>
        <Link to="/" style={{ color: "#ddd" }}>
          ← Back to sensors
        </Link>
      </div>
      <FilterDrawerContent
        startTime={startTime}
        setStartTime={setStartTime}
        endTime={endTime}
        setEndTime={setEndTime}
        sensorType={""} // not used on this page
        setSensorType={() => {}}
        onFetch={load}
        onQuickRange={(span) => {
          if (!latest) return;
          const end = new Date(latest).getTime();
          let deltaMs = 0;
          if (span.endsWith('h')) deltaMs = parseInt(span) * 60 * 60 * 1000;
          if (span.endsWith('d')) deltaMs = parseInt(span) * 24 * 60 * 60 * 1000;
          const start = end - deltaMs;
          const startIso = new Date(start).toISOString().slice(0, 16);
          const endIso = new Date(end).toISOString().slice(0, 16);
          setStartTime(startIso);
          setEndTime(endIso);
          // After setting, fetch
          setTimeout(load, 0);
        }}
      />
    </div>
  );

  const mainContent = (
    <>
      <h2 style={{ color: "#fff", margin: "8px 0 12px" }}>Sensor: {table}</h2>
      {(startTime && endTime) && (
        <div style={{ color: '#aaa', marginBottom: 8 }}>
          Showing: {new Date(startTime).toLocaleString()} → {new Date(endTime).toLocaleString()}
        </div>
      )}
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
            <div style={{ marginTop: 8, color: "#aaa" }}>
              Showing downsampled data (avg/min/max per bucket).
            </div>
          )}
        </>
      )}
    </>
  );

  return <DashboardLayout drawerContent={drawerContent} mainContent={mainContent} />;
}
