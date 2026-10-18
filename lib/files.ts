import { zipSync, strToU8 } from "fflate";
import { type TreeData, type Layout, validate, uid } from "./tree";

export function download(content: BlobPart, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const xml = (v: string) => v.replace(/[<>&"']/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]!));
export function svgMarkup(layout: Layout) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}"><defs><marker id="arrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L9,4.5 L0,9 Z" fill="#3f454b"/></marker></defs><rect width="100%" height="100%" fill="white"/>${layout.lines.map(l => `<polyline points="${l.points.map(p => p.join(",")).join(" ")}" fill="none" stroke="#3f454b" stroke-width="1.3" ${l.arrow ? 'marker-end="url(#arrow)"' : ""}/>`).join("")}${layout.boxes.map(b => `<g><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${b.person.gender === "male" ? b.h / 2 : 5}" fill="white" stroke="#3f454b" stroke-width="1.6"/><text text-anchor="middle" font-family="Arial, sans-serif" font-size="18" fill="#30363c"><tspan x="${b.x + b.w / 2}" y="${b.y + (b.person.birthYear ? 29 : 42)}">${xml(b.person.name)}</tspan>${b.person.birthYear ? `<tspan x="${b.x + b.w / 2}" dy="24">${b.person.birthYear}</tspan>` : ""}</text></g>`).join("")}</svg>`;
}
export async function raster(layout: Layout) {
  const scale = Math.min(2, 10000 / Math.max(layout.width, layout.height));
  const canvas = document.createElement("canvas"); canvas.width = Math.ceil(layout.width * scale); canvas.height = Math.ceil(layout.height * scale);
  const ctx = canvas.getContext("2d")!; const img = new Image();
  const url = URL.createObjectURL(new Blob([svgMarkup(layout)], { type: "image/svg+xml;charset=utf-8" }));
  try { await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = reject; img.src = url; }); ctx.drawImage(img, 0, 0, canvas.width, canvas.height); return canvas; } finally { URL.revokeObjectURL(url); }
}
export async function exportTree(format: string, data: TreeData, layout: Layout) {
  const filename = data.title.replace(/[<>:"/\\|?*]/g, "_") || "Ургийн мод";
  if (format === "json") return download(JSON.stringify(data, null, 2), `${filename}.json`, "application/json");
  if (format === "svg") return download(svgMarkup(layout), `${filename}.svg`, "image/svg+xml;charset=utf-8");
  if (format === "docx") return download(makeDocx(layout).buffer as ArrayBuffer, `${filename}.docx`, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  const canvas = await raster(layout);
  if (format === "png") { const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, "image/png")); if (blob) download(blob, `${filename}.png`, "image/png"); return; }
  if (format === "pdf") {
    const { jsPDF } = await import("jspdf");
    const ratio = Math.min(1, 1300 / Math.max(layout.width, layout.height));
    const width = layout.width * ratio, height = layout.height * ratio;
    const pdf = new jsPDF({ unit: "pt", format: [width, height], orientation: width > height ? "landscape" : "portrait" });
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, width, height); pdf.save(`${filename}.pdf`);
  }
}

// Word 2010+ native DrawingML shapes and text boxes. No embedded diagram image.
export function makeDocx(layout: Layout) {
  const s = Math.min(.75, 1400 / Math.max(layout.width, layout.height)); const emu = (v: number) => Math.round(v * s * 12700);
  let index = 1;
  function anchor(x: number, y: number, w: number, h: number, content: string) {
    const id = index++;
    return `<w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="${id}" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:posOffset>${emu(x) + 457200}</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>${emu(y) + 457200}</wp:posOffset></wp:positionV><wp:extent cx="${emu(Math.max(1, w))}" cy="${emu(Math.max(1, h))}"/><wp:wrapNone/><wp:docPr id="${id}" name="Дүрс ${id}"/><wp:cNvGraphicFramePr/><a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp><wps:cNvSpPr txBox="1"/>${content}</wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>`;
  }
  const lineShapes = layout.lines.map(l => {
    const xs = l.points.map(p => p[0]), ys = l.points.map(p => p[1]); const x = Math.min(...xs), y = Math.min(...ys), w = Math.max(...xs) - x, h = Math.max(...ys) - y;
    const path = l.points.map((p, i) => `<a:${i ? "lnTo" : "moveTo"}><a:pt x="${emu(p[0] - x)}" y="${emu(p[1] - y)}"/></a:${i ? "lnTo" : "moveTo"}>`).join("");
    return anchor(x, y, w, h, `<wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${emu(Math.max(w, 1))}" cy="${emu(Math.max(h, 1))}"/></a:xfrm><a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst><a:path w="${emu(Math.max(w, 1))}" h="${emu(Math.max(h, 1))}" fill="none">${path}</a:path></a:pathLst></a:custGeom><a:noFill/><a:ln w="12700"><a:solidFill><a:srgbClr val="3F454B"/></a:solidFill>${l.arrow ? '<a:tailEnd type="triangle" w="sm" len="sm"/>' : ""}</a:ln></wps:spPr><wps:bodyPr/>`);
  }).join("");
  const boxShapes = layout.boxes.map(b => {
    const paragraphs = [b.person.name, ...(b.person.birthYear ? [String(b.person.birthYear)] : [])].map(t => `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="0" w:after="0"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/><w:color w:val="30363C"/><w:sz w:val="${Math.round(36 * s)}"/></w:rPr><w:t>${xml(t)}</w:t></w:r></w:p>`).join("");
    return anchor(b.x, b.y, b.w, b.h, `<wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${emu(b.w)}" cy="${emu(b.h)}"/></a:xfrm><a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${b.person.gender === "male" ? 50000 : 7000}"/></a:avLst></a:prstGeom><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="15240"><a:solidFill><a:srgbClr val="3F454B"/></a:solidFill></a:ln></wps:spPr><wps:txbx><w:txbxContent>${paragraphs}</w:txbxContent></wps:txbx><wps:bodyPr anchor="ctr" lIns="0" rIns="0" tIns="0" bIns="0"><a:noAutofit/></wps:bodyPr>`);
  }).join("");
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><w:body><w:p>${lineShapes}${boxShapes}</w:p><w:sectPr><w:pgSz w:w="${Math.ceil(layout.width * s * 20 + 1440)}" w:h="${Math.ceil(layout.height * s * 20 + 1440)}"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  return zipSync({ "[Content_Types].xml": strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'), "_rels/.rels": strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'), "word/document.xml": strToU8(documentXml) });
}

export async function readFile(file: File): Promise<TreeData> {
  if (file.size > 10 * 1024 * 1024) throw new Error("Файлын хэмжээ 10 МБ-аас ихгүй байна.");
  if (file.name.toLowerCase().endsWith(".json")) return validate(JSON.parse(await file.text()));
  let rows: Record<string, string | number>[];
  let familyRows: Record<string, string | number>[] | undefined;
  if (file.name.toLowerCase().endsWith(".csv")) rows = parseCsv(await file.text());
  else {
    const { Workbook } = (await import("exceljs")).default; const book = new Workbook();
    await book.xlsx.load(await file.arrayBuffer());
    const readSheet = (sheet: import("exceljs").Worksheet) => {
      const headers: string[] = []; sheet.getRow(1).eachCell((c, n) => headers[n] = c.text.trim());
      const result: Record<string, string | number>[] = [];
      sheet.eachRow((row, index) => { if (index === 1) return; const r: Record<string, string | number> = {}; headers.forEach((h, n) => { if (h) r[h] = row.getCell(n).text; }); result.push(r); }); return result;
    };
    const sheet = book.getWorksheet("people") ?? book.worksheets[0]; if (!sheet) throw new Error("Excel файлд мэдээлэл олдсонгүй.");
    rows = readSheet(sheet); const familiesSheet = book.getWorksheet("families"); if (familiesSheet) familyRows = readSheet(familiesSheet);
  }
  const people = rows.map(r => ({ id: String(r.id ?? "").trim(), name: String(r.name ?? "").trim(), gender: ({ male: "male", female: "female", "эрэгтэй": "male", "эмэгтэй": "female" } as const)[String(r.gender).toLowerCase() as "male"] ?? "", birthYear: r.birthYear === "" || r.birthYear === undefined ? undefined : Number(r.birthYear), deathYear: r.deathYear === "" || r.deathYear === undefined ? undefined : Number(r.deathYear) }));
  const families: TreeData["families"] = [];
  if (familyRows) {
    for (const r of familyRows) families.push({ id: String(r.id), left: String(r.left), right: r.right ? String(r.right) : undefined, children: String(r.children || "").split("|").map(s => s.trim()).filter(Boolean), manual: String(r.manual).toLowerCase() === "true" });
  } else {
    for (const r of rows) {
      const father = String(r.fatherId || ""), mother = String(r.motherId || "");
      if (father || mother) {
        let f = families.find(f => f.left === (father || mother) && (f.right ?? "") === (father ? mother : ""));
        if (!f) { f = { id: uid("F"), left: father || mother, right: father ? mother || undefined : undefined, children: [] }; families.push(f); }
        f.children.push(String(r.id));
      }
    }
    for (const r of rows) if (r.spouseId && !families.some(f => (f.left === String(r.id) && f.right === String(r.spouseId)) || (f.right === String(r.id) && f.left === String(r.spouseId)))) families.push({ id: uid("F"), left: String(r.id), right: String(r.spouseId), children: [] });
  }
  return validate({ version: 1, title: file.name.replace(/\.[^.]+$/, ""), people: people as TreeData["people"], families, focus: people[0]?.id || "" });
}
export async function excelTemplate(data: TreeData) {
  const { Workbook } = (await import("exceljs")).default; const book = new Workbook();
  const people = book.addWorksheet("people"); people.columns = ["id", "name", "gender", "birthYear", "deathYear"].map(key => ({ header: key, key, width: key === "name" ? 30 : 18 }));
  data.people.forEach(p => people.addRow(p));
  const families = book.addWorksheet("families"); families.columns = ["id", "left", "right", "children", "manual"].map(key => ({ header: key, key, width: key === "children" ? 40 : 18 }));
  data.families.forEach(f => families.addRow({ ...f, children: f.children.join("|"), manual: !!f.manual }));
  const buffer = await book.xlsx.writeBuffer(); download(buffer as BlobPart, "urgiin-mod.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}

export function parseCsv(source: string) {
  const text = source.replace(/^\uFEFF/, ""); const first = text.split(/\r?\n/)[0];
  const delimiter = first.includes("\t") ? "\t" : first.includes(";") && !first.includes(",") ? ";" : ",";
  const records: string[][] = []; let row: string[] = [], value = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted; }
    else if (!quoted && (c === delimiter || c === "\n" || c === "\r")) {
      row.push(value.trim()); value = "";
      if (c !== delimiter) { if (row.some(Boolean)) records.push(row); row = []; if (c === "\r" && text[i + 1] === "\n") i++; }
    } else value += c;
  }
  if (quoted) throw new Error("CSV файлын хашилт хаагдаагүй байна.");
  row.push(value.trim()); if (row.some(Boolean)) records.push(row);
  const headers = records.shift() ?? [];
  return records.map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])));
}

