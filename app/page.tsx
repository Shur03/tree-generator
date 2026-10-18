"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent } from "react";
import { ArrowDownToLine, ArrowLeft, ArrowRight, Check, ChevronDown, ChevronRight, CircleHelp, Download, FileJson, FileSpreadsheet, FolderOpen, GitFork, GripVertical, Hand, History, Info, Maximize, Minus, MoreHorizontal, MousePointer2, Plus, Search, Settings2, Trash2, Upload, Users, X } from "lucide-react";
import { initialData, layoutTree, ordered, uid, validate, type Family, type Person, type TreeData } from "@/lib/tree";
import { download, excelTemplate, exportTree, readFile } from "@/lib/files";

type Relation = "standalone" | "child" | "spouse" | "father" | "mother";
const STORAGE = "udam-tree-v1";
const genderName = (p: Person) => p.gender === "female" ? "Эмэгтэй" : "Эрэгтэй";

export default function Home() {
  const [data, setData] = useState<TreeData>(initialData);
  const [ready, setReady] = useState(false), [saved, setSaved] = useState(true);
  const [selected, setSelected] = useState("P003"), [tab, setTab] = useState("tree");
  const [query, setQuery] = useState(""), [toast, setToast] = useState(""), [error, setError] = useState("");
  const [modal, setModal] = useState<Relation | null>(null), [help, setHelp] = useState(false), [exportOpen, setExportOpen] = useState(false), [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(.92), [pan, setPan] = useState({ x: 0, y: 0 }), [hand, setHand] = useState(false);
  const [undo, setUndo] = useState<TreeData[]>([]), [redo, setRedo] = useState<TreeData[]>([]);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null), canvasRef = useRef<HTMLDivElement>(null);
  const layout = useMemo(() => layoutTree(data), [data]);
  const person = data.people.find(p => p.id === selected);
  const visible = new Set(layout.boxes.map(b => b.person.id));
  const filtered = data.people.filter(p => `${p.name} ${p.id} ${p.birthYear ?? ""}`.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const observer = new ResizeObserver(() => { const r = canvas.getBoundingClientRect(); setZoom(Math.max(.15, Math.min(.92, (r.width - 35) / layout.width, (r.height - 50) / layout.height))); setPan({ x: 0, y: 0 }); });
    observer.observe(canvas); return () => observer.disconnect();
  }, [layout.width, layout.height, tab]);

  useEffect(() => {
    try { const local = localStorage.getItem(STORAGE); if (local) { const parsed = validate(JSON.parse(local)); setData(parsed); setSelected(parsed.focus); } } catch { setError("Хадгалсан өгөгдлийг уншиж чадсангүй. Файлаас нээх боломжтой."); }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(STORAGE, JSON.stringify(data)); setSaved(true); } catch { setSaved(false); setError("Хөтчид хадгалах зай хүрэлцэхгүй байна. JSON файлаар хадгална уу."); }
  }, [data, ready]);
  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(""), 3500); return () => clearTimeout(timer); } }, [toast]);
  function change(next: TreeData) {
    try { validate(next); setUndo(h => [...h.slice(-29), data]); setRedo([]); setData(next); setError(""); return true; }
    catch (e) { setError((e as Error).message); return false; }
  }
  function undoChange() { const last = undo.at(-1); if (last) { setRedo(r => [...r, data]); setData(last); setUndo(u => u.slice(0, -1)); setToast("Өмнөх үйлдлийг буцаалаа"); } }
  function redoChange() { const last = redo.at(-1); if (last) { setUndo(u => [...u, data]); setData(last); setRedo(r => r.slice(0, -1)); } }
  function fit() { if (canvasRef.current) { const r = canvasRef.current.getBoundingClientRect(); setZoom(Math.min(1.25, (r.width - 100) / layout.width, (r.height - 65) / layout.height)); setPan({ x: 0, y: 0 }); } }
  function pointerDown(e: PointerEvent<HTMLDivElement>) { if ((e.target as Element).closest("[data-person]")) return; drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }; e.currentTarget.setPointerCapture(e.pointerId); }
  function pointerMove(e: PointerEvent<HTMLDivElement>) { if (drag.current) setPan({ x: drag.current.px + e.clientX - drag.current.x, y: drag.current.py + e.clientY - drag.current.y }); }
  async function loadFile(file?: File) {
    if (!file) return; setBusy(true);
    try { const next = await readFile(file); if (change(next)) { setSelected(next.focus); setPan({ x: 0, y: 0 }); setToast(`${next.people.length} хүний мэдээлэл импортоллоо`); } } catch (e) { setError((e as Error).message); } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  }
  async function doExport(format: string) {
    setExportOpen(false); setBusy(true);
    try { await exportTree(format, data, layout); setToast("Файлыг татаж авлаа"); } catch (e) { setError(`Экспорт амжилтгүй: ${(e as Error).message}`); } finally { setBusy(false); }
  }
  function removePerson(id: string) {
    const people = data.people.filter(p => p.id !== id);
    const families = data.families.map(f => ({ ...f, left: f.left === id ? (f.right ?? "") : f.left, right: f.left === id || f.right === id ? undefined : f.right, children: f.children.filter(c => c !== id) })).filter(f => f.left);
    if (change({ ...data, people, families, focus: data.focus === id ? people[0]?.id ?? "" : data.focus })) { setSelected(people[0]?.id ?? ""); setToast("Хүний бүртгэл болон холбогдох холбоосыг устгалаа"); }
  }
  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="/" aria-label="Удам нүүр"><span className="brand-symbol"><GitFork size={24}/></span><span>удам<span className="brand-dot">.</span></span></a>
      <div className="workspace-label">ГЭР БҮЛИЙН ОРОН ЗАЙ</div>
      <button className={`nav-item ${tab === "tree" ? "active" : ""}`} onClick={() => setTab("tree")}><GitFork size={18}/> Ургийн мод <span className="nav-count">1</span></button>
      <button className={`nav-item ${tab === "people" ? "active" : ""}`} onClick={() => setTab("people")}><Users size={18}/> Хүмүүс <span className="nav-count">{data.people.length}</span></button>
      <button className="nav-item" onClick={() => fileRef.current?.click()}><FolderOpen size={18}/> Файлаас нээх</button>
      <div className="sidebar-divider"/>
      <div className="section-label">МИНИЙ МОД <button title="Шинэ мод" onClick={() => { if (change({ version: 1, title: "Миний ургийн мод", focus: "", people: [], families: [] })) { setSelected(""); setModal("standalone"); } }}><Plus size={15}/></button></div>
      <button className="tree-file" onClick={() => setTab("tree")}><span className="file-icon"><GitFork size={18}/></span><span><strong>{data.title}</strong><small>{data.people.length} хүн · {layout.levels} үе</small></span><MoreHorizontal size={15}/></button>
      <div className="sidebar-bottom"><div className="local-note"><span className="status-dot"/><span>Таны түүх, таны төхөөрөмжид<small>Мэдээлэл энэ хөтөч дээр хадгалагдана.</small></span></div><button className="nav-item" onClick={() => setHelp(true)}><CircleHelp size={18}/> Хэрэглэх заавар <ChevronRight size={15}/></button><div className="sidebar-footer"><span className="mini-logo">у.</span><div>Удам холбоогоо хадгалъя<small>Үеэс үед</small></div></div></div>
    </aside>
    <main className="workspace">
      <header className="topbar"><div className="breadcrumb">Миний орон зай <ChevronRight size={14}/><span>{tab === "tree" ? "Ургийн мод" : "Хүмүүсийн бүртгэл"}</span></div><div className="topbar-right"><span className="saved"><Check size={14}/>{saved ? "Автоматаар хадгалагдсан" : "Хадгалаагүй"}</span><span className="avatar">ТБ</span></div></header>
      <section className="page-heading"><div><div className="eyebrow">ГЭР БҮЛИЙН ТҮҮХ</div><input className="title-input" aria-label="Модны нэр" value={data.title} onChange={e => change({ ...data, title: e.target.value })}/><p>Өнгөрснөө холбож, ирээдүйдээ өвлүүлье.</p></div><div className="heading-actions"><button className="button" onClick={() => fileRef.current?.click()}><Upload size={16}/> Импортлох</button><div className="export-wrap"><button className="button dark" onClick={() => setExportOpen(!exportOpen)}><ArrowDownToLine size={16}/> Экспортлох <ChevronDown size={14}/></button>{exportOpen && <><button className="menu-backdrop" aria-label="Цэс хаах" onClick={() => setExportOpen(false)}/><div className="export-menu"><div className="menu-label">МОД ТАТАЖ АВАХ</div>{[["pdf", "PDF баримт", "Хэвлэхэд тохиромжтой"], ["svg", "SVG вектор", "Хэмжээнээс үл хамаарах"], ["png", "PNG зураг", "Өндөр нягтралтай"], ["docx", "Word баримт", "Засварлах дүрс ба текст"], ["json", "JSON өгөгдөл", "Дахин нээж засварлах"]].map(([f, t, d]) => <button key={f} onClick={() => doExport(f)}><Download size={16}/><span>{t}<small>{d}</small></span></button>)}<button onClick={() => { setExportOpen(false); excelTemplate(data).catch(e => setError(e.message)); }}><FileSpreadsheet size={16}/><span>Excel өгөгдөл<small>Хүмүүс ба гэр бүлийн холбоос</small></span></button></div></>}</div></div></section>
      <div className="overview"><div><Users size={17}/><strong>{data.people.length}</strong><span>гэр бүлийн гишүүн</span></div><i/><div><GitFork size={17}/><strong>{layout.levels}</strong><span>үеийн холбоо</span></div><i/><div><span className="couple-icon">♡</span><strong>{data.families.length}</strong><span>гэр бүл</span></div><span className="overview-end">Нэг түүх. Олон үе.</span></div>
      <section className="editor">
        <div className="editor-header"><div className="tabs"><button className={tab === "tree" ? "selected" : ""} onClick={() => setTab("tree")}><GitFork size={16}/> Модны харагдац</button><button className={tab === "people" ? "selected" : ""} onClick={() => setTab("people")}><Users size={16}/> Хүмүүсийн жагсаалт <span>{data.people.length}</span></button></div><button className="button add-button" onClick={() => setModal("standalone")}><Plus size={16}/> Хүн нэмэх</button></div>
        <div className="editor-body">
          <div className="canvas-column">
          {tab === "tree" ? <>
            <div className="canvas-toolbar"><div className="tool-group"><button className={!hand ? "tool active-tool" : "tool"} title="Хүн сонгох" onClick={() => setHand(false)}><MousePointer2 size={16}/></button><button className={hand ? "tool active-tool" : "tool"} title="Модыг чирэх" onClick={() => setHand(true)}><Hand size={16}/></button><span className="tool-divider"/><button className="tool" title="Буцаах" disabled={!undo.length} onClick={undoChange}><History size={16}/></button><button className="tool" title="Дахин хийх" disabled={!redo.length} onClick={redoChange}><History size={16} style={{ transform: "scaleX(-1)" }}/></button></div><div className="canvas-label"><span className="status-dot"/> Автомат байршуулалт</div><button className="tool" title="Дэлгэцэд багтаах" onClick={fit}><Maximize size={16}/></button></div>
            <div ref={canvasRef} className={`tree-canvas ${hand ? "hand-mode" : ""}`} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={() => drag.current = null} onPointerCancel={() => drag.current = null} onWheel={e => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); setZoom(z => Math.max(.15, Math.min(2.5, z - e.deltaY * .002))); } }}>
              {data.people.length ? <svg className="tree-svg" role="img" aria-label={`${data.title}, ${visible.size} хүн, ${layout.levels} үе`} width={layout.width * zoom} height={layout.height * zoom} viewBox={`0 0 ${layout.width} ${layout.height}`} style={{ transform: `translate(${pan.x}px, ${pan.y}px)`, flexShrink: 0 }}>
                <defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="8" refY="4" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 L8 4 L0 8 Z" fill="#555b60"/></marker></defs>
                {layout.lines.map((line, i) => <polyline key={i} points={line.points.map(p => p.join(",")).join(" ")} fill="none" stroke="#555b60" strokeWidth="1.25" markerEnd={line.arrow ? "url(#arrow)" : undefined}/>)}
                {layout.boxes.map(b => <g key={b.key} data-person={b.person.id} className="person-node" role="button" tabIndex={0} aria-label={`${b.person.name}, ${b.person.id}, ${genderName(b.person)}`} onClick={() => { if (!hand) setSelected(b.person.id); }} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(b.person.id); } }}><rect x={b.x} y={b.y} width={b.w} height={b.h} rx={b.person.gender === "male" ? 35 : 5} fill="white" stroke="#41474d" strokeWidth="1.5"/><text x={b.x + b.w / 2} y={b.y + (b.person.birthYear ? 29 : 42)} textAnchor="middle" fontSize="18" fill="#343a40" fontFamily="Arial, sans-serif">{b.person.name}{b.person.birthYear && <tspan x={b.x + b.w / 2} dy="24">{b.person.birthYear}</tspan>}</text></g>)}
              </svg> : <div className="empty-state"><GitFork size={44} strokeWidth={1}/><h3>Таны түүх эндээс эхэлнэ</h3><p>Эхний хүнээ нэмээд ургийн модоо бүтээгээрэй.</p><button className="button dark" onClick={() => setModal("standalone")}><Plus size={16}/> Хүн нэмэх</button></div>}
              {data.people.length > 0 && <span className="generation-label">{layout.levels} ҮЕИЙН МОД</span>}
            </div>
            <div className="canvas-footer"><div className="legend"><span className="male-shape"/> Эрэгтэй <span className="female-shape"/> Эмэгтэй</div><div className="zoom-controls"><button title="Жижигрүүлэх" onClick={() => setZoom(z => Math.max(.15, z - .1))}><Minus size={15}/></button><span>{Math.round(zoom * 100)}%</span><button title="Томруулах" onClick={() => setZoom(z => Math.min(2.5, z + .1))}><Plus size={15}/></button><span className="tool-divider"/><button title="Дэлгэцэд багтаах" onClick={fit}><Maximize size={14}/></button></div></div>
          </> : <div className="people-panel"><label className="search-box"><Search size={16}/><input placeholder="Нэр, ID эсвэл оноор хайх…" value={query} onChange={e => setQuery(e.target.value)}/></label><div className="table-scroll"><table><thead><tr><th>Нэр / ID</th><th>Хүйс</th><th>Төрсөн он</th><th>Модонд</th></tr></thead><tbody>{filtered.map(p => <tr key={p.id} className={selected === p.id ? "selected-row" : ""} onClick={() => setSelected(p.id)}><td><button className="person-link" onClick={() => setSelected(p.id)}>{p.name}<small>{p.id}</small></button></td><td>{genderName(p)}</td><td>{p.birthYear ?? "—"}</td><td>{visible.has(p.id) ? <Check size={15}/> : <button className="text-button" onClick={e => { e.stopPropagation(); change({ ...data, focus: p.id }); setSelected(p.id); setTab("tree"); setPan({ x: 0, y: 0 }); }}>Үндсэн болгох</button>}</td></tr>)}</tbody></table>{!filtered.length && <p className="no-results">Хүн олдсонгүй.</p>}</div></div>}
          </div>
          <aside className="properties"><div className="properties-title"><span><Settings2 size={16}/> Хүний мэдээлэл</span><span className="subtle-count">{person ? "СОНГОСОН" : ""}</span></div>{person ? <PersonEditor key={`${person.id}-${person.name}-${person.birthYear}-${person.gender}-${person.deathYear}`} person={person} data={data} onSave={p => { if (change({ ...data, people: data.people.map(x => x.id === p.id ? p : x) })) setToast("Мэдээллийг шинэчиллээ"); }} onAdd={setModal} onSelect={setSelected} onDelete={() => removePerson(person.id)} onFocus={() => { if (change({ ...data, focus: person.id })) { setTab("tree"); setPan({ x: 0, y: 0 }); setToast("Үндсэн хүнийг сольлоо"); } }} onChange={change}/> : <div className="no-person"><MousePointer2 size={24}/><p>Модон дээрээс хүн сонгох эсвэл шинээр нэмнэ үү.</p><button className="button" onClick={() => setModal("standalone")}><Plus size={15}/> Хүн нэмэх</button></div>}</aside>
        </div>
      </section>
      <div className="workspace-foot"><span><Info size={14}/> Хүн дээр дарж мэдээллийг засна. Хоосон хэсгээс чирж модыг шилжүүлнэ.</span><button onClick={() => doExport("json")}><FileJson size={14}/> Өгөгдөл хадгалах</button></div>
    </main>
    <input ref={fileRef} type="file" accept=".json,.csv,.xlsx" hidden onChange={e => loadFile(e.target.files?.[0])}/>
    {error && <div className="error-banner" role="alert"><Info size={17}/><span>{error}</span><button title="Хаах" onClick={() => setError("")}><X size={16}/></button></div>}
    {toast && <div className="toast" role="status"><Check size={17}/>{toast}</div>}
    {busy && <div className="busy-indicator" role="status">Файлыг боловсруулж байна…</div>}
    {modal && <PersonDialog relation={modal} selected={person} data={data} onClose={() => setModal(null)} onSubmit={(next, id) => { if (change(next)) { setSelected(id); setModal(null); setToast("Бүртгэлийг хадгаллаа"); return true; } return false; }}/ >}
    {help && <div className="modal-backdrop" onClick={() => setHelp(false)}><section className="modal help-modal" role="dialog" aria-modal="true" aria-label="Хэрэглэх заавар" onClick={e => e.stopPropagation()}><div className="modal-heading"><h2>Ургийн модоо бүтээгээрэй</h2><button title="Хаах" onClick={() => setHelp(false)}><X size={20}/></button></div><p>Хүн дээр дарж нэр, хүйс, оныг засна. Баруун самбараас хань, хүүхэд, эцэг эх нэмнэ. Олон гэрлэлт тусдаа гэр бүл болон бүртгэгдэнэ.</p><h3>Хүүхдийн дараалал</h3><p>Анх төрсөн оноор эрэмбэлнэ. Гэр бүлийн хүүхдийн жагсаалтын сумуудаар гараар сольж болно. «Оноор» товч автомат дарааллыг сэргээнэ.</p><h3>Хадгалах ба нээх</h3><p>Өөрчлөлт энэ хөтчид автоматаар хадгалагдана. Төхөөрөмж хооронд зөөхийн тулд JSON экспортлоод «Файлаас нээх» үйлдлээр нээнэ. Шинэ импорт одоогийн модыг солино; буцаах товчоор сэргээж болно.</p><h3>Excel / CSV импорт</h3><p>Excel загварын people хуудсанд id, name, gender (male / female), birthYear, deathYear; families хуудсанд id, left, right, children (ID-уудыг | тэмдэгтээр тусгаарлах), manual багана байна. CSV-д fatherId, motherId, spouseId баганаар холбоно. Он болон холбоосыг хоосон үлдээж болно.</p><button className="button" onClick={() => excelTemplate(initialData).catch(e => setError(e.message))}><FileSpreadsheet size={16}/> Excel загвар татах</button><h3>Экспорт</h3><p>PDF, SVG, PNG форматаар зургаа хадгална. Word файл нь засварлах боломжтой нэр, хүрээ, холбоос бүхий native DrawingML дүрсүүдтэй. Word 2010 болон түүнээс шинэ хувилбарт нээнэ.</p></section></div>}
  </div>;
}

function PersonEditor({ person, data, onSave, onAdd, onSelect, onDelete, onFocus, onChange }: { person: Person; data: TreeData; onSave: (p: Person) => void; onAdd: (r: Relation) => void; onSelect: (id: string) => void; onDelete: () => void; onFocus: () => void; onChange: (d: TreeData) => boolean }) {
  const [draft, setDraft] = useState(person), [deleting, setDeleting] = useState(false);
  const families = data.families.filter(f => f.left === person.id || f.right === person.id);
  const parents = data.families.find(f => f.children.includes(person.id));
  const lookup = (id: string) => data.people.find(p => p.id === id)!;
  function move(f: Family, id: string, direction: number) { const children = ordered(f, data.people); const i = children.indexOf(id); const j = i + direction; if (j < 0 || j >= children.length) return; [children[i], children[j]] = [children[j], children[i]]; onChange({ ...data, families: data.families.map(x => x.id === f.id ? { ...x, children, manual: true } : x) }); }
  return <><div className="person-summary"><span className={`person-avatar ${person.gender}`}><Users size={21} strokeWidth={1.4}/></span><div><strong>{person.name}</strong><small>{person.id} <span>· {data.focus === person.id ? "Үндсэн хүн" : genderName(person)}</span></small></div></div><form className="person-form" onSubmit={e => { e.preventDefault(); onSave(draft); }}><label>Овог, нэр <span>*</span><input required maxLength={160} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })}/></label><label>Хүйс <span>*</span><select value={draft.gender} onChange={e => setDraft({ ...draft, gender: e.target.value as Person["gender"] })}><option value="female">Эмэгтэй</option><option value="male">Эрэгтэй</option></select></label><div className="year-fields"><label>Төрсөн он<input type="number" min="1" max="9999" placeholder="Оруулна уу" value={draft.birthYear ?? ""} onChange={e => setDraft({ ...draft, birthYear: e.target.value ? Number(e.target.value) : undefined })}/></label><label>Нас барсан он<input type="number" min={draft.birthYear || 1} max="9999" placeholder="Оруулна уу" value={draft.deathYear ?? ""} onChange={e => setDraft({ ...draft, deathYear: e.target.value ? Number(e.target.value) : undefined })}/></label></div><button className="button save-person" type="submit"><Check size={15}/> Өөрчлөлт хадгалах</button></form><div className="relations-section"><div className="relation-title">ГЭР БҮЛИЙН ХОЛБОО</div><div className="relation-section-label">Эцэг, эх <button title="Эцэг эх нэмэх" onClick={() => onAdd("father")}><Plus size={14}/></button></div>{parents ? <div className="parent-list">{[parents.left, parents.right].filter(Boolean).map(id => <button key={id} onClick={() => onSelect(id!)}><span className={lookup(id!).gender === "male" ? "male-shape" : "female-shape"}/><span>{lookup(id!).name}<small>{id}</small></span><ChevronRight size={13}/></button>)}</div> : <div className="parent-add"><button onClick={() => onAdd("father")}><Plus size={13}/> Аав</button><button onClick={() => onAdd("mother")}><Plus size={13}/> Ээж</button></div>}
    {families.map((f, fi) => { const spouseId = f.left === person.id ? f.right : f.left; const children = ordered(f, data.people); return <div className="family-group" key={f.id}><div className="relation-section-label">{families.length > 1 ? `Гэр бүл ${fi + 1}` : "Хань"}<span className="family-id">{f.id}</span></div>{spouseId ? <div className="spouse-row"><button onClick={() => onSelect(spouseId)}><span className={lookup(spouseId).gender === "male" ? "male-shape" : "female-shape"}/><span>{lookup(spouseId).name}<small>{spouseId}</small></span><ChevronRight size={13}/></button><button className="unlink" title="Ханий холбоосыг салгах" onClick={() => onChange({ ...data, families: data.families.map(x => x.id === f.id ? { ...x, right: undefined, left: person.id } : x) })}><X size={12}/></button></div> : <span className="empty-relation">Хань бүртгээгүй</span>}<div className="relation-section-label children-label">Хүүхдүүд <span>{children.length}</span><button className="sort-button" onClick={() => onChange({ ...data, families: data.families.map(x => x.id === f.id ? { ...x, manual: false } : x) })}>{f.manual ? "Оноор" : "Он ↑"}</button></div><div className="children-list">{children.map((id, i) => <div className="child-row" key={id}><GripVertical size={12}/><button onClick={() => onSelect(id)}>{lookup(id).name}<small>{lookup(id).birthYear ?? "Он оруулаагүй"} · {id}</small></button><div className="order-buttons"><button title="Урагшлуулах" disabled={!i} onClick={() => move(f, id, -1)}><ArrowLeft size={11}/></button><button title="Хойшлуулах" disabled={i === children.length - 1} onClick={() => move(f, id, 1)}><ArrowRight size={11}/></button><button title="Хүүхдийн холбоосыг салгах" onClick={() => onChange({ ...data, families: data.families.map(x => x.id === f.id ? { ...x, children: x.children.filter(c => c !== id) } : x) })}><X size={11}/></button></div></div>)}</div></div>; })}
    <div className="add-relations"><button onClick={() => onAdd("child")}><Plus size={14}/> Хүүхэд нэмэх</button><button onClick={() => onAdd("spouse")}><Plus size={14}/> Хань нэмэх</button></div></div><div className="person-actions">{data.focus !== person.id && <button onClick={onFocus}><GitFork size={14}/> Үндсэн хүн болгох</button>}{deleting ? <div className="delete-confirm"><p>Энэ хүн болон холбоосуудыг устгах уу?</p><button onClick={onDelete}>Тийм, устгах</button><button onClick={() => setDeleting(false)}>Болих</button></div> : <button className="delete-button" onClick={() => setDeleting(true)}><Trash2 size={14}/> Бүртгэл устгах</button>}</div></>;
}

function PersonDialog({ relation, selected, data, onClose, onSubmit }: { relation: Relation; selected?: Person; data: TreeData; onClose: () => void; onSubmit: (data: TreeData, id: string) => boolean }) {
  const [rel, setRel] = useState<Relation>(selected ? relation : "standalone"), [existing, setExisting] = useState("");
  const [id, setId] = useState(() => uid()), [name, setName] = useState(""), [gender, setGender] = useState("");
  const [birth, setBirth] = useState(""), [death, setDeath] = useState(""), [issue, setIssue] = useState("");
  const families = selected ? data.families.filter(f => f.left === selected.id || f.right === selected.id) : [];
  const [familyId, setFamilyId] = useState((relation === "spouse" ? families.find(f => !f.right) : families[0])?.id ?? "new");
  useEffect(() => { const close = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; document.addEventListener("keydown", close); return () => document.removeEventListener("keydown", close); }, [onClose]);
  function submit(e: FormEvent) {
    e.preventDefault();
    try {
      const p: Person = existing ? data.people.find(p => p.id === existing)! : { id: id.trim(), name: name.trim(), gender: gender as Person["gender"], birthYear: birth ? Number(birth) : undefined, deathYear: death ? Number(death) : undefined };
      const next = structuredClone(data); if (!existing) next.people.push(p); if (!next.focus) next.focus = p.id;
      if (selected && rel !== "standalone") {
        if (rel === "spouse") {
          const single = next.families.find(f => f.id === familyId && !f.right && f.left === selected.id);
          if (single) single.right = p.id;
          else next.families.push({ id: uid("F"), left: selected.id, right: p.id, children: [] });
        }
        if (rel === "child") {
          let f = next.families.find(f => f.id === familyId);
          if (!f) { f = { id: uid("F"), left: selected.id, children: [] }; next.families.push(f); }
          f.children.push(p.id);
        }
        if (rel === "father" || rel === "mother") {
          const parentFamily = next.families.find(f => f.children.includes(selected.id));
          if (parentFamily) {
            if (parentFamily.right) throw new Error("Эцэг, эх хоёулаа бүртгэлтэй байна. Одоо байгаа хүнийг сонгож засна уу.");
            if (rel === "father") { parentFamily.right = parentFamily.left; parentFamily.left = p.id; } else parentFamily.right = p.id;
          } else next.families.push({ id: uid("F"), left: p.id, children: [selected.id] });
        }
      }
      validate(next); onSubmit(next, p.id);
    } catch (e) { setIssue((e as Error).message); }
  }
  return <div className="modal-backdrop" onClick={onClose}><section className="modal" role="dialog" aria-modal="true" aria-label="Хүн нэмэх" onClick={e => e.stopPropagation()}><div className="modal-heading"><div><div className="eyebrow">УРГИЙН ХОЛБОО</div><h2>Гэр бүлийн гишүүн нэмэх</h2></div><button title="Хаах" onClick={onClose}><X size={20}/></button></div><p className="modal-description">Шинэ хүн бүртгэх эсвэл бүртгэлтэй хүнтэй холбоно уу.</p><form onSubmit={submit}>{selected && <label>Холбоос<select value={rel} onChange={e => { setRel(e.target.value as Relation); setExisting(""); setFamilyId((e.target.value === "spouse" ? families.find(f => !f.right) : families[0])?.id ?? "new"); }}><option value="standalone">Бие даасан бүртгэл</option><option value="child">{selected.name} → хүүхэд</option><option value="spouse">{selected.name} → хань</option><option value="father">{selected.name} → аав</option><option value="mother">{selected.name} → ээж</option></select></label>}{rel !== "standalone" && <label>Бүртгэлээс сонгох<select value={existing} onChange={e => setExisting(e.target.value)}><option value="">+ Шинэ хүн бүртгэх</option>{data.people.filter(p => p.id !== selected?.id).map(p => <option key={p.id} value={p.id}>{p.name} · {p.id}{p.birthYear ? ` · ${p.birthYear}` : ""}</option>)}</select></label>}{!existing && <><div className="form-grid"><label>Давтагдашгүй ID<input required value={id} onChange={e => setId(e.target.value)} maxLength={80}/></label><label>Хүйс <span>*</span><select required value={gender} onChange={e => setGender(e.target.value)}><option value="" disabled>Сонгоно уу</option><option value="male">Эрэгтэй</option><option value="female">Эмэгтэй</option></select></label></div><label>Овог, нэр <span>*</span><input autoFocus required placeholder="Жишээ нь: Т.Болормаа" maxLength={160} value={name} onChange={e => setName(e.target.value)}/></label><div className="form-grid"><label>Төрсөн он<input type="number" min="1" max="9999" placeholder="Заавал биш" value={birth} onChange={e => setBirth(e.target.value)}/></label><label>Нас барсан он<input type="number" min={birth || 1} max="9999" placeholder="Заавал биш" value={death} onChange={e => setDeath(e.target.value)}/></label></div></>}{(rel === "child" || rel === "spouse") && <label>{rel === "child" ? "Хүүхдийн харьяалах гэр бүл" : "Гэр бүлийн холбоос"}<select value={familyId} onChange={e => setFamilyId(e.target.value)}>{families.filter(f => rel !== "spouse" || !f.right).map((f, i) => <option key={f.id} value={f.id}>{i + 1}. {data.people.find(p => p.id === f.left)?.name}{f.right ? ` — ${data.people.find(p => p.id === f.right)?.name}` : " (ганц эцэг/эх)"} · {f.id}</option>)}<option value="new">{rel === "spouse" ? "Шинэ гэр бүл" : "Шинэ гэр бүл (ганц эцэг/эх)"}</option></select></label>}{issue && <p className="form-error" role="alert">{issue}</p>}<div className="modal-note"><Info size={15}/><span>Хүйсийг зөвхөн сонгосон мэдээллээр дүрсэлнэ. Нэрээр таамаглахгүй.</span></div><div className="modal-actions"><button type="button" className="button" onClick={onClose}>Болих</button><button className="button dark" type="submit"><Plus size={16}/> Нэмж хадгалах</button></div></form></section></div>;
}
