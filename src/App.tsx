import React, { useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import * as pdfjsLib from "pdfjs-dist";
// ✅ Vite-friendly worker import for pdf.js v4
// This bundles the worker and gives us a Worker constructor:
import PDFWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker";
(pdfjsLib as any).GlobalWorkerOptions.workerPort = new PDFWorker();

import { Upload, FileUp, Download, Plus, Trash2 } from "lucide-react";

const COLS = ["Game","Date","Team","Player","No","MIN","PTS","FGM","FGA","3PM","3PA","FTM","FTA","OREB","DREB","REB","AST","STL","BLK","TOV","PF"] as const;
type Row = Record<typeof COLS[number], string | number>;

function toNumber(v:any){ const n=parseFloat(String(v).replace(",", ".")); return isNaN(n)?0:n }
function pct(m:number,a:number){ if(a<=0) return "-"; return ((m/a)*100).toFixed(1)+"%" }
function eFG(FGM:number,_FGA:number,TPM:number){ const FGA=Math.max(_FGA,1e-9); return ((FGM+0.5*TPM)/FGA)*100 }
function TS(PTS:number,FGA:number,FTA:number){ const d=2*(FGA+0.44*FTA); return d<=0?0:(PTS/d)*100 }
function groupBy<T,K extends string|number>(arr:T[], key:(x:T)=>K){ return arr.reduce((a:any,it:any)=>{ const k=key(it); (a[k] ||= []).push(it); return a; },{} as Record<K,T[]>) }

const SAMPLE_ROWS: Row[] = [
  { Game:"G1", Date:"2025-09-01", Team:"ROU", Player:"Dupont", No:7, MIN:28, PTS:16, FGM:6, FGA:12, "3PM":2, "3PA":5, FTM:2, FTA:3, OREB:2, DREB:5, REB:7, AST:4, STL:1, BLK:0, TOV:2, PF:3 },
  { Game:"G1", Date:"2025-09-01", Team:"ROU", Player:"Martin", No:11, MIN:22, PTS:9,  FGM:4, FGA:10, "3PM":1, "3PA":3, FTM:0, FTA:0, OREB:1, DREB:3, REB:4, AST:2, STL:2, BLK:1, TOV:1, PF:2 },
  { Game:"G2", Date:"2025-09-08", Team:"STV", Player:"Dupont", No:7, MIN:31, PTS:22, FGM:8, FGA:15, "3PM":3, "3PA":6, FTM:3, FTA:4, OREB:1, DREB:6, REB:7, AST:5, STL:0, BLK:1, TOV:3, PF:2 },
  { Game:"G2", Date:"2025-09-08", Team:"STV", Player:"Martin", No:11, MIN:19, PTS:6,  FGM:3, FGA:8,  "3PM":0, "3PA":2, FTM:0, FTA:0, OREB:0, DREB:4, REB:4, AST:1, STL:1, BLK:0, TOV:1, PF:1 },
];

export default function App(){
  const [rows,setRows]=useState<Row[]>(SAMPLE_ROWS);
  const [tab,setTab]=useState<"data"|"players"|"team">("data");
  const fileRef=useRef<HTMLInputElement>(null); const pdfRef=useRef<HTMLInputElement>(null);

  const byPlayer=useMemo(()=>groupBy(rows, r => `${(r as any).Team ?? ""} • ${String((r as any).Player)}`),[rows]);
  const byGame=useMemo(()=>groupBy(rows, r => String((r as any).Game)),[rows]);

  const playerAgg=useMemo(()=>Object.entries(byPlayer).map(([player,items]:any)=>{
    const games=new Set(items.map((i:any)=>i.Game)).size||1;
    const sum=(k: keyof Row)=>items.reduce((a:any,r:any)=>a+toNumber(r[k]),0);
    const FGM=sum("FGM"),FGA=sum("FGA"),TPM=sum("3PM"),TPA=sum("3PA"),FTM=sum("FTM"),FTA=sum("FTA");
    const PTS=sum("PTS"),MIN=sum("MIN"),REB=sum("REB"),AST=sum("AST"),STL=sum("STL"),BLK=sum("BLK"),TOV=sum("TOV"),PF=sum("PF");
    return { player,games,
      perGame:{MIN:MIN/games,PTS:PTS/games,REB:REB/games,AST:AST/games,STL:STL/games,BLK:BLK/games,TOV:TOV/games,PF:PF/games,FGM:FGM/games,FGA:FGA/games,TPM:TPM/games,TPA:TPA/games,FTM:FTM/games,FTA:FTA/games},
      rates:{ FG:pct(FGM,FGA), TP:pct(TPM,TPA), FT:pct(FTM,FTA), eFG:eFG(FGM,FGA,TPM).toFixed(1)+"%", TS:TS(PTS,FGA,FTA).toFixed(1)+"%" }
    };
  }).sort((a:any,b:any)=>a.player.localeCompare(b.player)),[byPlayer]);

  const teamAgg=useMemo(()=>{
    const items=rows as any[]; const games=new Set(items.map(i=>i.Game)).size||1;
    const sum=(k: keyof Row)=>items.reduce((a,r)=>a+toNumber(r[k]),0);
    const FGM=sum("FGM"),FGA=sum("FGA"),TPM=sum("3PM"),TPA=sum("3PA"),FTM=sum("FTM"),FTA=sum("FTA");
    const PTS=sum("PTS"),MIN=sum("MIN"),REB=sum("REB"),AST=sum("AST"),STL=sum("STL"),BLK=sum("BLK"),TOV=sum("TOV"),PF=sum("PF");
    return {games,
      perGame:{MIN:MIN/games,PTS:PTS/games,REB:REB/games,AST:AST/games,STL:STL/games,BLK:BLK/games,TOV:TOV/games,PF:PF/games,FGM:FGM/games,FGA:FGA/games,TPM:TPM/games,TPA:TPA/games,FTM:FTM/games,FTA:FTA/games},
      rates:{ FG:pct(FGM,FGA), TP:pct(TPM,TPA), FT:pct(FTM,FTA), eFG:eFG(FGM,FGA,TPM).toFixed(1)+"%", TS:TS(PTS,FGA,FTA).toFixed(1)+"%" }
    };
  },[rows]);

  function handleCSV(files: FileList|null){
    if(!files?.length) return; const f=files[0];
    Papa.parse(f,{header:true,skipEmptyLines:true,complete:(res:any)=>{
      const parsed:Row[]=[]; for(const raw of res.data as any[]){
        const row:any={}; for(const key of COLS){
          const k=Object.keys(raw).find(n=>n.trim().toLowerCase()===key.toLowerCase());
          row[key]=k? (["Player","Game","Date","Team"].includes(key)? String(raw[k]): toNumber(raw[k])) : (["Player","Game","Date","Team"].includes(key)? "": 0);
        } parsed.push(row as Row);
      } setRows(parsed); setTab("data");
    }, error:(e:any)=>alert("Erreur d'import: "+e.message)});
  }

  async function handlePDF(files: FileList|null){
    if(!files?.length) return; const f=files[0]; const ab=await f.arrayBuffer();
    const pdf=await (pdfjsLib as any).getDocument({data:ab}).promise; let all="";
    for(let i=1;i<=pdf.numPages;i++){ const page=await pdf.getPage(i); const tc=await page.getTextContent(); const text=(tc.items as any[]).map((it:any)=>it.str).join(" "); all+=" "+text; }
    const parsed=parseStatsPdfText(all);
    if(parsed.length===0){ alert("Extraction PDF non reconnue. Utilise le CSV pour ce match et envoie-moi le PDF pour ajuster."); return; }
    setRows(parsed); setTab("data");
  }

  function mmssToMin(s:string){ const m=/([0-9]{1,2}):([0-9]{2})/.exec(s); return m? (parseInt(m[1])+parseInt(m[2])/60):0 }
  function safeInt(x?:string){ return x? parseInt(x,10)||0:0 }

  function parseStatsPdfText(txt:string): Row[] {
    let s=txt.replace(/\s+/g," ").replace(/,/,".");
    const md=s.match(/(\d{1,2})\s+(janv\.|févr\.|mars|avr\.|mai|juin|juil\.|août|sept\.|oct\.|nov\.|déc\.)\s+(\d{4})/i);
    const mm:any={"janv.":"01","févr.":"02","mars":"03","avr.":"04","mai":"05","juin":"06","juil.":"07","août":"08","sept.":"09","oct.":"10","nov.":"11","déc.":"12"};
    const dateISO = md ? `${md[3]}-${mm[md[2].toLowerCase()]}-${String(md[1]).padStart(2,'0')}` : "";
    const splitA=s.split(/Ail de Rousset\s*\(ROU\)/i)[1]||""; const splitB=s.split(/Saint Vallier Basket Drome\s*\d*\s*\(STV\)/i)[1]||"";
    const rowRegex=/\*?(\d{1,2})\s+([A-Za-zÀ-ÖØ-ö-ÿ'’ .-]+?)\s+(\d{2}:\d{2})\s+(\d+)\/(\d+)\s+\d{1,3}\.?\d?\s+(\d+)\/(\d+)\s+\d{1,3}\.?\d?\s+(\d+)\/(\d+)\s+\d{1,3}\.?\d?\s+(\d+)\/(\d+)\s+\d{1,3}\.?\d?\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+[-−]?\d+\s+[-−]?\d+\s+(\d+)/g;
    const rows:Row[]=[];
    function parseBlock(bk:string, team:string){
      const b=bk.replace(/\s+/g," "); let m:RegExpExecArray|null; const r=new RegExp(rowRegex);
      while((m=r.exec(b))!==null){
        const [_,num,name,min,fgm,fga,twom,twoa,tpm,tpa,ftm,fta,oreb,dreb,reb,ast,tov,stl,blk,cs,pf,fp,pts]=m.map(String);
        rows.push({Game:"G1",Date:dateISO,Team:team,Player:name.trim(),No:safeInt(num),MIN:mmssToMin(min),PTS:safeInt(pts),FGM:safeInt(fgm),FGA:safeInt(fga),"3PM":safeInt(tpm),"3PA":safeInt(tpa),FTM:safeInt(ftm),FTA:safeInt(fta),OREB:safeInt(oreb),DREB:safeInt(dreb),REB:safeInt(reb),AST:safeInt(ast),STL:safeInt(stl),BLK:safeInt(blk),TOV:safeInt(tov),PF:safeInt(pf)} as Row);
      }
    }
    if(splitA) parseBlock(splitA,"ROU"); if(splitB) parseBlock(splitB,"STV"); return rows;
  }

  function addEmptyRow(){ const empty:Row=Object.fromEntries(COLS.map(c=>[c,(c==="Player"?"":c==="Game"?"G1":c==="Date"? new Date().toISOString().slice(0,10):c==="Team"?"":0)])) as Row; setRows(p=>[...p,empty])}
  function updateCell(i:number,key: keyof Row,v:string){ setRows(p=>p.map((r,idx)=>idx===i?{...r,[key]:(["Player","Game","Date","Team"].includes(key as string)? v: toNumber(v))}:r)) }
  function removeRow(i:number){ setRows(p=>p.filter((_,idx)=>idx!==i)) }
  function downloadTemplate(){ const csv=Papa.unparse([COLS]); const blob=new Blob([csv+"\n"],{type:"text/csv;charset=utf-8;"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url;a.download="template_stats_basket.csv";a.click();URL.revokeObjectURL(url) }
  function exportCSV(){ const csv=Papa.unparse(rows); const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url;a.download="stats_basket_export.csv";a.click();URL.revokeObjectURL(url) }

  return (
    <div className="min-h-screen p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">Feuilles de stats – Calcul auto (PDF/CSV)</h1>
          <div className="flex gap-2">
            <button className="inline-flex items-center rounded-md border px-3 py-2 text-sm" onClick={downloadTemplate}><Download className="mr-2 h-4 w-4" /> Modèle CSV</button>
            <button className="inline-flex items-center rounded-md border px-3 py-2 text-sm" onClick={exportCSV}><Download className="mr-2 h-4 w-4" /> Exporter CSV</button>
          </div>
        </header>

        <section className="rounded-xl bg-white p-4 shadow">
          <h2 className="mb-3 text-lg font-semibold">Importer / Saisir</h2>
          <div className="flex flex-wrap items-center gap-3">
            <input ref={fileRef} type="file" accept=".csv" onChange={(e)=>handleCSV(e.target.files)} className="max-w-sm" />
            <button className="inline-flex items-center rounded-md border px-3 py-2 text-sm" onClick={()=>fileRef.current?.click()}><Upload className="mr-2 h-4 w-4" /> Importer CSV</button>
            <input ref={pdfRef} type="file" accept="application/pdf" onChange={(e)=>handlePDF(e.target.files)} className="max-w-sm" />
            <button className="inline-flex items-center rounded-md border px-3 py-2 text-sm" onClick={()=>pdfRef.current?.click()}><FileUp className="mr-2 h-4 w-4" /> Importer PDF (beta)</button>
            <button className="inline-flex items-center rounded-md border px-3 py-2 text-sm" onClick={addEmptyRow}><Plus className="mr-2 h-4 w-4" /> Ajouter une ligne</button>
          </div>
          <p className="mt-2 text-sm text-gray-500">PDF pris en charge : maquette FFBB comme ton exemple. Si l'extraction échoue, passe par le CSV et envoie-moi le PDF pour adapter.</p>
        </section>

        <nav className="flex gap-2">
          <button onClick={()=>setTab("data")} className={`rounded-md border px-3 py-1 text-sm ${tab==="data"?"bg-gray-900 text-white":"bg-white"}`}>Feuilles</button>
          <button onClick={()=>setTab("players")} className={`rounded-md border px-3 py-1 text-sm ${tab==="players"?"bg-gray-900 text-white":"bg-white"}`}>Moyennes joueur</button>
          <button onClick={()=>setTab("team")} className={`rounded-md border px-3 py-1 text-sm ${tab==="team"?"bg-gray-900 text-white":"bg-white"}`}>Équipe</button>
        </nav>

        {tab==="data" && (
          <section className="rounded-xl bg-white p-0 shadow overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white shadow-sm">
                <tr>
                  {COLS.map(c => (<th key={c} className="px-3 py-2 text-left font-semibold border-b">{c}</th>))}
                  <th className="px-3 py-2 text-left font-semibold border-b">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="odd:bg-gray-50">
                    {COLS.map(c => (
                      <td key={c} className="px-3 py-2 border-b">
                        {["Player","Game","Date","Team"].includes(c as string) ? (
                          <input className="w-40 rounded border px-2 py-1" value={String(r[c] ?? "")} onChange={e=>updateCell(i, c, e.target.value)} />
                        ) : (
                          <input className="w-24 rounded border px-2 py-1" inputMode="decimal" value={String(r[c] ?? 0)} onChange={e=>updateCell(i, c, e.target.value)} />
                        )}
                      </td>
                    ))}
                    <td className="px-3 py-2 border-b">
                      <button className="inline-flex items-center rounded-md border px-2 py-1 text-xs" onClick={()=>removeRow(i)}><Trash2 className="mr-1 h-3 w-3" /> Suppr</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {tab==="players" && (
          <section className="rounded-xl bg-white p-0 shadow overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white shadow-sm">
                <tr>
                  <th className="px-3 py-2 text-left border-b">Joueur</th>
                  <th className="px-3 py-2 text-left border-b">MJ</th>
                  <th className="px-3 py-2 text-left border-b">MIN</th>
                  <th className="px-3 py-2 text-left border-b">PTS</th>
                  <th className="px-3 py-2 text-left border-b">REB</th>
                  <th className="px-3 py-2 text-left border-b">AST</th>
                  <th className="px-3 py-2 text-left border-b">STL</th>
                  <th className="px-3 py-2 text-left border-b">BLK</th>
                  <th className="px-3 py-2 text-left border-b">TOV</th>
                  <th className="px-3 py-2 text-left border-b">FG%</th>
                  <th className="px-3 py-2 text-left border-b">3P%</th>
                  <th className="px-3 py-2 text-left border-b">FT%</th>
                  <th className="px-3 py-2 text-left border-b">eFG%</th>
                  <th className="px-3 py-2 text-left border-b">TS%</th>
                </tr>
              </thead>
              <tbody>
                {Object.values(playerAgg).map((p: any) => (
                  <tr key={p.player} className="odd:bg-gray-50">
                    <td className="px-3 py-2 border-b font-medium">{p.player}</td>
                    <td className="px-3 py-2 border-b">{p.games}</td>
                    <td className="px-3 py-2 border-b">{p.perGame.MIN.toFixed(1)}</td>
                    <td className="px-3 py-2 border-b">{p.perGame.PTS.toFixed(1)}</td>
                    <td className="px-3 py-2 border-b">{p.perGame.REB.toFixed(1)}</td>
                    <td className="px-3 py-2 border-b">{p.perGame.AST.toFixed(1)}</td>
                    <td className="px-3 py-2 border-b">{p.perGame.STL.toFixed(1)}</td>
                    <td className="px-3 py-2 border-b">{p.perGame.BLK.toFixed(1)}</td>
                    <td className="px-3 py-2 border-b">{p.perGame.TOV.toFixed(1)}</td>
                    <td className="px-3 py-2 border-b">{p.rates.FG}</td>
                    <td className="px-3 py-2 border-b">{p.rates.TP}</td>
                    <td className="px-3 py-2 border-b">{p.rates.FT}</td>
                    <td className="px-3 py-2 border-b">{p.rates.eFG}</td>
                    <td className="px-3 py-2 border-b">{p.rates.TS}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {tab==="team" && (
          <section className="rounded-xl bg-white p-4 shadow">
            <h3 className="mb-2 text-base font-semibold">Moyennes par match</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 text-sm">
              {Object.entries((teamAgg as any).perGame).map(([k,v]) => (
                <div key={k} className="flex items-center justify-between rounded border p-2"><span className="font-medium">{k}</span><span>{Number(v as any).toFixed(1)}</span></div>
              ))}
            </div>
            <h3 className="mt-4 mb-2 text-base font-semibold">Ratios</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
              {Object.entries((teamAgg as any).rates).map(([k,v]) => (
                <div key={k} className="flex items-center justify-between rounded border p-2"><span className="font-medium">{k}</span><span>{v as any}</span></div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
