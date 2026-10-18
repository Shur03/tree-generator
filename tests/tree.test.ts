import { test } from "node:test";
import assert from "node:assert/strict";
import { unzipSync, strFromU8 } from "fflate";
import { initialData, layoutTree, ordered, validate, type TreeData } from "../lib/tree";
import { makeDocx, parseCsv, readFile, svgMarkup } from "../lib/files";

const clone = () => structuredClone(initialData);
function checkGeometry(data: TreeData) {
  const layout = layoutTree(validate(data));
  for (const a of layout.boxes) for (const b of layout.boxes) {
    if (a === b) continue;
    assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, `Overlapping boxes: ${a.key}, ${b.key}`);
  }
  for (const line of layout.lines) for (let i = 1; i < line.points.length; i++) {
    const [a, b] = [line.points[i - 1], line.points[i]];
    assert.ok(a[0] === b[0] || a[1] === b[1], "All segments must be orthogonal");
    for (const box of layout.boxes) {
      const hit = a[0] === b[0] ? a[0] > box.x && a[0] < box.x + box.w && Math.max(a[1], b[1]) > box.y && Math.min(a[1], b[1]) < box.y + box.h : a[1] > box.y && a[1] < box.y + box.h && Math.max(a[0], b[0]) > box.x && Math.min(a[0], b[0]) < box.x + box.w;
      assert.ok(!hit, `Line intersects ${box.person.name}`);
    }
  }
  return layout;
}
test("sample has three generations, seven people and focal person on the left", () => {
  const l = checkGeometry(clone()); assert.equal(l.levels, 3); assert.equal(l.boxes.length, 7);
  assert.ok(l.boxes.find(b => b.person.id === "P003")!.x < l.boxes.find(b => b.person.id === "P004")!.x);
  const children = l.boxes.filter(b => b.level === 2).sort((a, b) => a.x - b.x);
  assert.deepEqual(children.map(b => b.person.birthYear), [2007, 2011, 2018]);
});
test("gender controls geometry independently of name and no year means no second line", () => {
  const d = clone(); d.people[2].gender = "male"; delete d.people[2].birthYear;
  const svg = svgMarkup(checkGeometry(d)); assert.match(svg, /Т.Болормаа/); assert.doesNotMatch(svg, /1983/);
  const b = layoutTree(d).boxes.find(b => b.person.id === "P003")!;
  assert.ok(svg.includes(`x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="35"`));
});
test("long names, multiple marriages and descendants expand without overlap", () => {
  const d = clone();
  d.people.push({ id: "P008", name: "Маш урт нэртэй гэр бүлийн шинэ гишүүн", gender: "female", birthYear: 2008 }, { id: "P009", name: "Ижил нэр", gender: "male", birthYear: 2030 }, { id: "P010", name: "Ижил нэр", gender: "female", birthYear: 2010 }, { id: "P011", name: "Өөр гэр бүлийн хүүхэд", gender: "female", birthYear: 2032 });
  d.families.push({ id: "F003", left: "P005", right: "P008", children: ["P009"] }, { id: "F004", left: "P005", right: "P010", children: ["P011"] });
  const l = checkGeometry(d); assert.equal(l.levels, 4); assert.equal(l.boxes.filter(b => b.person.id === "P005").length, 2);
  assert.ok(l.boxes.find(b => b.person.id === "P008")!.w > 300);
});
test("manual order overrides birth order and survives JSON persistence", () => {
  const d = clone(); const f = d.families[1]; f.children.reverse(); f.manual = true;
  const reloaded = validate(JSON.parse(JSON.stringify(d)));
  assert.deepEqual(ordered(reloaded.families[1], reloaded.people), ["P007", "P006", "P005"]);
  reloaded.families[1].manual = false; assert.deepEqual(ordered(reloaded.families[1], reloaded.people), ["P005", "P006", "P007"]);
});
test("self parenting, ancestor cycles, duplicate IDs and conflicting parentage are rejected", () => {
  const self = clone(); self.families[1].children.push("P003"); assert.throws(() => validate(self));
  const cycle = clone(); cycle.families.push({ id: "F003", left: "P005", children: ["P001"] }); assert.throws(() => validate(cycle));
  const duplicate = clone(); duplicate.people.push(duplicate.people[0]); assert.throws(() => validate(duplicate));
  const parentage = clone(); parentage.families[0].children.push("P005"); assert.throws(() => validate(parentage));
  const spouse = clone(); spouse.families.push({ id: "F003", left: "P003", right: "P005", children: [] }); assert.throws(() => validate(spouse));
});
test("empty trees and single-parent trees remain valid", () => {
  const d: TreeData = { version: 1, title: "Шинэ", focus: "", people: [], families: [] }; assert.equal(checkGeometry(d).boxes.length, 0);
  const single = clone(); single.families[1].right = undefined; checkGeometry(single);
});
test("CSV preserves Cyrillic, quoted names, missing years and relationships", async () => {
  assert.deepEqual(parseCsv('\uFEFFid;name;gender\r\nP1;"Бат, Болд";male')[0], { id: "P1", name: "Бат, Болд", gender: "male" });
  const file = new File(['id,name,gender,birthYear,fatherId,motherId\nA,Аав,male,,,\nB,Ээж,female,,,\nC,Хүүхэд,female,2007,A,B'], "test.csv");
  const d = await readFile(file); assert.equal(d.people[0].birthYear, undefined); assert.equal(d.families[0].children[0], "C"); checkGeometry(d);
});
test("Excel imports families and people without losing IDs or Unicode", async () => {
  const { Workbook } = (await import("exceljs")).default; const book = new Workbook();
  const people = book.addWorksheet("people"); people.addRow(["id", "name", "gender", "birthYear", "deathYear"]);
  initialData.people.forEach(p => people.addRow([p.id, p.name, p.gender, p.birthYear, p.deathYear]));
  const families = book.addWorksheet("families"); families.addRow(["id", "left", "right", "children", "manual"]);
  initialData.families.forEach(f => families.addRow([f.id, f.left, f.right, f.children.join("|"), false]));
  const buffer = await book.xlsx.writeBuffer(); const data = await readFile(new File([buffer], "sample.xlsx"));
  assert.deepEqual(JSON.parse(JSON.stringify(data.people)), initialData.people); assert.equal(data.families.length, 2); checkGeometry(data);
});
test("Word contains native editable DrawingML text and shapes, with no embedded image", () => {
  const zip = unzipSync(makeDocx(layoutTree(initialData))); const document = strFromU8(zip["word/document.xml"]);
  assert.equal(Object.keys(zip).some(p => p.startsWith("word/media")), false);
  assert.equal((document.match(/<wps:txbx>/g) ?? []).length, 7);
  assert.match(document, /<w:t>Т.Болормаа<\/w:t>/); assert.match(document, /<a:custGeom>/); assert.match(document, /<a:tailEnd type="triangle"/);
  assert.doesNotMatch(document, /<a:blip/);
});

