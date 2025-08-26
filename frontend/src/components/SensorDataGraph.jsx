// frontend/src/components/SensorDataGraph.js
import React, { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart, Line,
  XAxis, YAxis, Tooltip, CartesianGrid
} from "recharts";

function thinSeries(arr, maxPoints = 400) {
  if (!arr || arr.length <= maxPoints) return arr ?? [];
  const step = Math.ceil(arr.length / maxPoints);
  const out = [];
  for (let i = 0; i < arr.length; i += step) out.push(arr[i]);
  return out;
}

function fmtTick(ts, long = false) {
  const d = new Date(ts);
  return long
    ? d.toLocaleString([], { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function SensorDataGraph({
  data = [],
  color = undefined,
  valueKey = "mt_value",
  timeKey = "mt_time",
  maxPoints = 400,
}) {
  const prepared = useMemo(() => {
    const mapped = (data ?? [])
      .filter(d => d && d[timeKey] != null && d[valueKey] != null)
      .map(d => ({
        t: new Date(d[timeKey]).getTime(),
        v: typeof d[valueKey] === "number" ? d[valueKey] : Number(d[valueKey]),
      }))
      .sort((a, b) => a.t - b.t);
    return thinSeries(mapped, maxPoints);
  }, [data, timeKey, valueKey, maxPoints]);

  const spanMs = prepared.length ? prepared[prepared.length - 1].t - prepared[0].t : 0;
  const longFormat = spanMs > 24 * 60 * 60 * 1000;

  return (
    <ResponsiveContainer width="100%" height={250}>
      <LineChart data={prepared} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
        <CartesianGrid strokeOpacity={0.2} />
        <XAxis
          dataKey="t"
          type="number"
          domain={["auto", "auto"]}
          scale="time"
          tickFormatter={(ts) => fmtTick(ts, longFormat)}
          interval="preserveStartEnd"
          minTickGap={40}
        />
        <YAxis width={48} tickMargin={6} />
        <Tooltip
          labelFormatter={(ts) => new Date(ts).toLocaleString()}
          formatter={(value) => [value, "value"]}
        />
        <Line
          type="monotone"
          dataKey="v"
          dot={false}
          isAnimationActive={false}
          stroke={color}
          strokeWidth={2}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
