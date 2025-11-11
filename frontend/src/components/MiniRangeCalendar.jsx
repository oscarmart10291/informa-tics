import React, { useMemo, useState } from "react";

const pad = (v) => String(v).padStart(2, "0");
const toYMD = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromYMD = (s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ""))) return null;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const sameDay = (a, b) =>
  a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const isBetween = (d, start, end) =>
  start && end && d >= new Date(start.getFullYear(), start.getMonth(), start.getDate()) &&
  d <= new Date(end.getFullYear(), end.getMonth(), end.getDate());

export default function MiniRangeCalendar({
  valueDesde,
  valueHasta,
  onChange, // (desdeYMD, hastaYMD) => void
  inline = true,
}) {
  const init = fromYMD(valueDesde) || new Date();
  const [viewYear, setViewYear] = useState(init.getFullYear());
  const [viewMonth, setViewMonth] = useState(init.getMonth());
  const startDate = fromYMD(valueDesde);
  const endDate = fromYMD(valueHasta);
  const [tempStart, setTempStart] = useState(startDate);
  const [tempEnd, setTempEnd] = useState(endDate);

  const firstOfMonth = useMemo(() => new Date(viewYear, viewMonth, 1), [viewYear, viewMonth]);
  const startWeekday = (firstOfMonth.getDay() + 6) % 7; // Lunes=0 ... Domingo=6
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const cells = useMemo(() => {
    const arr = [];
    // rellenar huecos previos
    for (let i = 0; i < startWeekday; i++) arr.push(null);
    // días del mes
    for (let d = 1; d <= daysInMonth; d++) arr.push(new Date(viewYear, viewMonth, d));
    // completar a múltiplo de 7
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [daysInMonth, startWeekday, viewMonth, viewYear]);

  const goPrev = () => {
    const m = viewMonth - 1;
    if (m < 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(m);
  };
  const goNext = () => {
    const m = viewMonth + 1;
    if (m > 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(m);
  };

  const handleDayClick = (d) => {
    if (!d) return;
    // si no hay inicio temporal o ya hay ambos, reinicia y fija inicio
    if (!tempStart || (tempStart && tempEnd)) {
      setTempStart(d);
      setTempEnd(null);
      onChange && onChange(toYMD(d), undefined);
      return;
    }
    // si hay inicio y no hay fin
    if (tempStart && !tempEnd) {
      let a = tempStart, b = d;
      if (b < a) [a, b] = [b, a]; // invierte si el segundo es anterior
      setTempStart(a);
      setTempEnd(b);
      onChange && onChange(toYMD(a), toYMD(b));
    }
  };

  const monthNames = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  const weekNames = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];

  return (
    <div style={{ display: inline ? "block" : "inline-block" }}>
      <div style={styles.header}>
        <button onClick={goPrev} style={styles.navBtn} aria-label="Mes anterior">←</button>
        <div style={styles.title}>{monthNames[viewMonth]} {viewYear}</div>
        <button onClick={goNext} style={styles.navBtn} aria-label="Mes siguiente">→</button>
      </div>

      <div style={styles.grid}>
        {weekNames.map((w) => (
          <div key={w} style={{ ...styles.cell, ...styles.weekHead }}>{w}</div>
        ))}
        {cells.map((d, idx) => {
          const isStart = d && (sameDay(d, tempStart));
          const isEnd = d && (sameDay(d, tempEnd));
          const inRange = d && tempStart && tempEnd && isBetween(d, tempStart, tempEnd);

          let bg = "#fff", color = "#111";
          if (inRange) { bg = "#dbeafe"; }            // dentro del rango
          if (isStart || isEnd) { bg = "#2563eb"; color = "#fff"; } // extremos

          return (
            <button
              key={idx}
              disabled={!d}
              onClick={() => handleDayClick(d)}
              style={{
                ...styles.cell,
                ...styles.day,
                cursor: d ? "pointer" : "default",
                background: d ? bg : "transparent",
                color: d ? color : "transparent",
                border: isStart || isEnd ? "1px solid #1d4ed8" : "1px solid #e5e7eb",
              }}
            >
              {d ? d.getDate() : "•"}
            </button>
          );
        })}
      </div>

      <div style={styles.footer}>
        <span>Desde: <b>{tempStart ? toYMD(tempStart) : "—"}</b></span>
        <span style={{ marginLeft: 12 }}>Hasta: <b>{tempEnd ? toYMD(tempEnd) : "—"}</b></span>
        <button
          style={styles.clearBtn}
          onClick={() => { setTempStart(null); setTempEnd(null); onChange && onChange(undefined, undefined); }}
        >
          Limpiar
        </button>
      </div>
    </div>
  );
}

const styles = {
  header: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "6px 8px", border: "1px solid #e5e7eb", borderRadius: 8, marginBottom: 6, background: "#f8fafc"
  },
  navBtn: {
    padding: "6px 10px", border: "1px solid #cbd5e1", borderRadius: 6, background: "#fff", cursor: "pointer"
  },
  title: { fontWeight: 700, color: "#0f172a" },
  grid: {
    display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4,
    border: "1px solid #e5e7eb", borderRadius: 8, padding: 6, background: "#fff"
  },
  cell: { padding: "8px 0", textAlign: "center", borderRadius: 6, fontSize: 13 },
  weekHead: { fontWeight: 700, color: "#475569", background: "#f1f5f9", border: "1px solid #e2e8f0" },
  day: { background: "#fff" },
  footer: { marginTop: 8, display: "flex", alignItems: "center", justifyContent: "space-between" },
  clearBtn: { marginLeft: "auto", padding: "6px 10px", borderRadius: 6, border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer" },
};
