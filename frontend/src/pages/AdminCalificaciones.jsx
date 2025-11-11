// src/pages/AdminCalificaciones.jsx
import React, { useEffect, useMemo, useState } from "react";
import { http } from "../config/client";
import AdminHeader from "../components/AdminHeader";

/** Catálogo de opciones (mismas que usa el cliente) */
const POS = new Set([
  "Sabor excelente","Presentación atractiva","Excelente relación calidad/precio",
  "Puntual en la entrega","Trato amable","Comunicación clara","Cuidado del pedido",
  "Amable","Rápida atención","Orden correcta",
]);
const NEG = new Set([
  "Sabor no muy bueno","Presentación descuidada","Calidad no acorde al precio",
  "Trato poco amable","Retraso en la entrega","Pedido mal manejado / derramado",
  "No avisó al llegar","Atención lenta","Errores en el pedido entregado",
]);

const fmt = (d) => new Date(d).toLocaleString("es-GT",{dateStyle:"short",timeStyle:"short"});
const pill = { display:"inline-block", background:"#e2e8f0", color:"#0f172a", padding:"4px 10px", borderRadius:999, fontSize:12, marginRight:6, marginBottom:6, fontWeight:600 };
const td = { padding:"10px 12px", verticalAlign:"top", color:"#0f172a" };

export default function AdminCalificaciones(){
  const [data,setData] = useState([]);
  const [loading,setLoading] = useState(true);
  const [err,setErr] = useState("");

  // filtros
  const [tipo,setTipo] = useState("todos"); // todos | LOCAL | DOMICILIO
  const [q,setQ] = useState("");
  const [desde,setDesde] = useState("");
  const [hasta,setHasta] = useState("");

  const load = async ()=>{
    try{
      setLoading(true); setErr("");
      // Este endpoint debe devolver repartidorNombre y cajeroNombre
      const { data: pedidos } = await http.get("/cliente/pedidos");
      const rows = (pedidos||[])
        .filter(p => !!p.calificacion)
        .map(p => {
          const tipoEntrega = String(p.tipoEntrega||"").toUpperCase();
          const comida = Number(p.calificacion?.comida||0);
          const repartidor = Number(p.calificacion?.repartidor||0);
          const atencion = Number(p.calificacion?.atencionCliente||0);
          const comidaOpciones = Array.isArray(p.calificacion?.comidaOpciones)?p.calificacion.comidaOpciones:[];
          const repartidorOpciones = Array.isArray(p.calificacion?.repartidorOpciones)?p.calificacion.repartidorOpciones:[];
          const atencionOpciones = Array.isArray(p.calificacion?.atencionOpciones)?p.calificacion.atencionOpciones:[];
          
          // ✅ usar nombres que ya vienen del backend
          const atendidoPor = tipoEntrega==="DOMICILIO"
            ? `Repartidor: ${p.repartidorNombre || "—"}`
            : `Cajero: ${p.cajeroNombre || "—"}`;

          return {
            id: p.id,
            codigo: p.codigo,
            fecha: p.creadoEn || p.actualizadoEn || p.pagadoEn || p.createdAt,
            tipoEntrega,
            comida, repartidor, atencion,
            comidaOpciones, repartidorOpciones, atencionOpciones,
            comentario: p.calificacion?.comentario || "",
            total: Number(p.total||0),
            atendidoPor,
          };
        });
      setData(rows);
    }catch(e){
      console.error("GET /cliente/pedidos fallo:", e);
      const msg = e?.response?.data?.error || e?.message || "Error desconocido";
      setErr(`No se pudieron cargar las calificaciones (${msg}).`);
    }finally{ setLoading(false); }
  };

  useEffect(()=>{ load(); }, []);

  const filtradas = useMemo(()=>{
    const d1 = desde ? new Date(desde+"T00:00:00") : null;
    const d2 = hasta ? new Date(hasta+"T23:59:59") : null;
    const query = q.trim().toLowerCase();
    return [...data]
      .filter(r => (tipo==="todos" ? true : r.tipoEntrega===tipo))
      .filter(r => {
        const f = new Date(r.fecha);
        if (d1 && f < d1) return false;
        if (d2 && f > d2) return false;
        return true;
      })
      .filter(r => {
        if(!query) return true;
        return String(r.codigo||"").toLowerCase().includes(query)
            || String(r.comentario||"").toLowerCase().includes(query);
      })
      .sort((a,b)=> new Date(b.fecha)-new Date(a.fecha));
  },[data,tipo,q,desde,hasta]);

  // KPIs (cliente)
  const kpis = useMemo(()=>{
    const n = filtradas.length;
    let sumComida=0,nComida=0, sumRepa=0,nRepa=0, sumAten=0,nAten=0;
    const dist = { comida:[0,0,0,0,0], repartidor:[0,0,0,0,0], atencion:[0,0,0,0,0] };
    const posCounts = new Map(), negCounts = new Map();
    const inc = (m,k)=>m.set(k,(m.get(k)||0)+1);

    for(const r of filtradas){
      if(r.comida>=1){ sumComida+=r.comida; nComida++; dist.comida[r.comida-1]++; }
      if(r.tipoEntrega==="DOMICILIO" && r.repartidor>=1){ sumRepa+=r.repartidor; nRepa++; dist.repartidor[r.repartidor-1]++; }
      if(r.tipoEntrega==="LOCAL" && r.atencion>=1){ sumAten+=r.atencion; nAten++; dist.atencion[r.atencion-1]++; }

      for(const o of r.comidaOpciones){ if(POS.has(o)) inc(posCounts,o); if(NEG.has(o)) inc(negCounts,o); }
      for(const o of r.repartidorOpciones){ if(POS.has(o)) inc(posCounts,o); if(NEG.has(o)) inc(negCounts,o); }
      for(const o of r.atencionOpciones){ if(POS.has(o)) inc(posCounts,o); if(NEG.has(o)) inc(negCounts,o); }
    }

    const avg = (s,c)=> (c? (s/c).toFixed(2) : "-");
    const top = (m,k)=> [...m.entries()].sort((a,b)=>b[1]-a[1]).slice(0,k);

    return {
      total:n,
      comidaAvg: avg(sumComida,nComida),
      repartidorAvg: avg(sumRepa,nRepa),
      atencionAvg: avg(sumAten,nAten),
      dist,
      topPos: top(posCounts,11),
      topNeg: top(negCounts,11),
    };
  },[filtradas]);

  // ========= estilos base =========
  const panel = { background:"#fff", border:"1px solid #e5e7eb", borderRadius:12, padding:14 };
  const h4 = { margin:"0 0 8px", color:"#0f172a" };
  const control = { width:"100%", border:"1px solid #e2e8f0", borderRadius:10, padding:"10px 12px", background:"#fff" };
  const btn = (bg="#111827", fg="#fff") => ({ background:bg, color:fg, border:"none", padding:"10px 14px", borderRadius:12, fontWeight:800, cursor:"pointer" });

  return (
    <div style={{ background:"#f8fafc", minHeight:"100vh" }}>
      <AdminHeader titulo="⭐ Calificaciones" />
      <div style={{ maxWidth:1180, margin:"16px auto", padding:"0 16px" }}>
        {/* Filtros */}
        <div style={{
          display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))", gap:12,
          background:"#fff", border:"1px solid #e2e8f0", borderRadius:12, padding:12, marginBottom:12
        }}>
          <div>
            <label style={{ display:"block", fontSize:12, color:"#475569" }}>Tipo de entrega</label>
            <select value={tipo} onChange={(e)=>setTipo(e.target.value)} style={control}>
              <option value="todos">Todos</option>
              <option value="LOCAL">Local</option>
              <option value="DOMICILIO">Domicilio</option>
            </select>
          </div>
          <div>
            <label style={{ display:"block", fontSize:12, color:"#475569" }}>Desde</label>
            <input type="date" value={desde} onChange={(e)=>setDesde(e.target.value)} style={control}/>
          </div>
          <div>
            <label style={{ display:"block", fontSize:12, color:"#475569" }}>Hasta</label>
            <input type="date" value={hasta} onChange={(e)=>setHasta(e.target.value)} style={control}/>
          </div>
          <div>
            <label style={{ display:"block", fontSize:12, color:"#475569" }}>Buscar (código / comentario)</label>
            <input type="text" placeholder="Ej. 8A59A" value={q} onChange={(e)=>setQ(e.target.value)} style={control}/>
          </div>
          <div style={{ display:"flex", alignItems:"flex-end", gap:8 }}>
            <button onClick={load} style={btn("#e2e8f0","#111827")}>Recargar</button>
          </div>
        </div>

        {/* KPIs */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))", gap:12, marginBottom:12 }}>
          <KPI label="Total calificaciones" value={kpis.total}/>
          <KPI label="Promedio comida" value={kpis.comidaAvg}/>
          <KPI label="Promedio repartidor (domicilio)" value={kpis.repartidorAvg}/>
          <KPI label="Promedio atención (local)" value={kpis.atencionAvg}/>
        </div>

        {/* Distribuciones */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))", gap:12, marginBottom:12 }}>
          <Distribution title="Distribución comida" data={kpis.dist.comida}/>
          <Distribution title="Distribución repartidor" data={kpis.dist.repartidor}/>
          <Distribution title="Distribución atención" data={kpis.dist.atencion}/>
        </div>

        {/* Top menciones */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 }}>
          <div style={panel}>
            <h4 style={h4}>Menciones positivas</h4>
            <div>
              {kpis.topPos.length===0 && <span style={{ color:"#64748b" }}>—</span>}
              {kpis.topPos.map(([texto,n])=>(
                <span key={texto} style={{ ...pill, background:"#e2fbe8", color:"#14532d" }}>{texto} · {n}</span>
              ))}
            </div>
          </div>
          <div style={panel}>
            <h4 style={h4}>Menciones negativas</h4>
            <div>
              {kpis.topNeg.length===0 && <span style={{ color:"#64748b" }}>—</span>}
              {kpis.topNeg.map(([texto,n])=>(
                <span key={texto} style={{ ...pill, background:"#fee2e2", color:"#7f1d1d" }}>{texto} · {n}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Detalle */}
        <div style={panel}>
          <h4 style={{ margin:"0 0 12px", color:"#0f172a" }}>Detalle</h4>
          {loading ? (
            <p style={{ color:"#475569", margin:0 }}>Cargando…</p>
          ) : err ? (
            <p style={{ color:"#b91c1c", margin:0 }}>{err}</p>
          ) : filtradas.length===0 ? (
            <p style={{ color:"#64748b", margin:0 }}>No hay calificaciones con los filtros actuales.</p>
          ) : (
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"separate", borderSpacing:"0 8px" }}>
                <thead>
                  <tr>
                    {["Código","Fecha","Entrega","Comida","Secundaria","Opciones","Atendido por","Comentario","Total"].map(h=>(
                      <th key={h} style={{ textAlign:"left", background:"#111827", color:"#fff", padding:"10px 12px", position:"sticky", top:0, zIndex:1 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtradas.slice(0,500).map(r=>{
                    const sec = r.tipoEntrega==="DOMICILIO" ? `Repartidor: ${r.repartidor||"-"}/5` : `Atención: ${r.atencion||"-"}/5`;
                    const opts = r.tipoEntrega==="DOMICILIO" ? [...r.comidaOpciones, ...r.repartidorOpciones] : [...r.comidaOpciones, ...r.atencionOpciones];
                    return (
                      <tr key={r.id} style={{ background:"#fff", boxShadow:"0 1px 0 #e5e7eb, 0 -1px 0 #e5e7eb" }}>
                        <td style={td}>{r.codigo}</td>
                        <td style={td}>{fmt(r.fecha)}</td>
                        <td style={td}>{r.tipoEntrega}</td>
                        <td style={td}>{r.comida||"-"}/5</td>
                        <td style={td}>{sec}</td>
                        <td style={{ ...td, maxWidth:320 }}>
                          {opts.map(o=>(
                            <span key={r.id+o} style={{
                              ...pill,
                              background: POS.has(o) ? "#e2fbe8" : NEG.has(o) ? "#fee2e2" : "#e2e8f0",
                              color: POS.has(o) ? "#14532d" : NEG.has(o) ? "#7f1d1d" : "#0f172a",
                            }}>{o}</span>
                          ))}
                        </td>
                        <td style={{ ...td, whiteSpace:"nowrap" }}>{r.atendidoPor}</td>
                        <td style={{ ...td, maxWidth:280 }}>
                          <span title={r.comentario}>
                            {r.comentario?.length>120 ? r.comentario.slice(0,120)+"…" : r.comentario || "—"}
                          </span>
                        </td>
                        <td style={{ ...td, textAlign:"right", fontWeight:800 }}>Q{r.total.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function KPI({label,value}) {
  return (
    <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:12, padding:12 }}>
      <div style={{ fontSize:12, color:"#64748b" }}>{label}</div>
      <div style={{ fontSize:26, fontWeight:900, marginTop:4 }}>{value}</div>
    </div>
  );
}

function Distribution({ title, data=[] }){
  const total = (data||[]).reduce((a,b)=>a+b,0) || 1;
  return (
    <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:12, padding:12 }}>
      <h4 style={{ margin:"0 0 8px", color:"#0f172a" }}>{title}</h4>
      {[1,2,3,4,5].map((n,i)=>{
        const v = data?.[i]||0; const pct = Math.round((v*100)/total);
        return (
          <div key={n} style={{ marginBottom:8 }}>
            <div style={{ fontSize:12, marginBottom:4, color:"#334155" }}>{n} ⭐ — {v}</div>
            <div style={{ height:10, background:"#e5e7eb", borderRadius:6 }}>
              <div style={{ width:`${pct}%`, height:"100%", background:"#111827", borderRadius:6 }} title={`${pct}%`} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
