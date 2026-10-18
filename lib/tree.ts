export type Person = { id: string; name: string; gender: "male" | "female"; birthYear?: number; deathYear?: number };
export type Family = { id: string; left: string; right?: string; children: string[]; manual?: boolean };
export type TreeData = { version: 1; title: string; focus: string; people: Person[]; families: Family[] };
export const initialData: TreeData = {
  version: 1, title: "Т.Болормаагийн ургийн мод", focus: "P003",
  people: [
    { id: "P001", name: "Н.Тэшигсүрэн", gender: "male" },
    { id: "P002", name: "Даваасүрэн", gender: "female" },
    { id: "P003", name: "Т.Болормаа", gender: "female", birthYear: 1983 },
    { id: "P004", name: "Цагаанбаатар", gender: "male" },
    { id: "P005", name: "Ц.Цэрэнтогтох", gender: "male", birthYear: 2007 },
    { id: "P006", name: "Ц.Тогтохбаяр", gender: "male", birthYear: 2011 },
    { id: "P007", name: "Ц.Буянтогтох", gender: "female", birthYear: 2018 },
  ],
  families: [ { id: "F001", left: "P001", right: "P002", children: ["P003"] }, { id: "F002", left: "P003", right: "P004", children: ["P005", "P006", "P007"] } ],
};
export function uid(prefix = "P") { return `${prefix}${crypto.randomUUID().slice(0, 8).toUpperCase()}`; }
export function ordered(f: Family, people: Person[]) {
  return f.manual ? [...f.children] : [...f.children].sort((a, b) => (people.find(p => p.id === a)?.birthYear ?? Infinity) - (people.find(p => p.id === b)?.birthYear ?? Infinity));
}
export function validate(data: TreeData) {
  if (!data || data.version !== 1 || !Array.isArray(data.people) || !Array.isArray(data.families) || typeof data.title !== "string") throw new Error("Өгөгдлийн бүтэц буруу байна.");
  const ids = new Set<string>();
  for (const p of data.people) {
    if (typeof p.id !== "string" || !p.id.trim() || ids.has(p.id)) throw new Error("Хүний ID хоосон эсвэл давхардсан байна.");
    ids.add(p.id);
    if (typeof p.name !== "string" || !p.name.trim() || !["male", "female"].includes(p.gender)) throw new Error(`${p.id}: нэр, хүйсийг бүрэн оруулна уу.`);
    for (const year of [p.birthYear, p.deathYear]) if (year !== undefined && (!Number.isInteger(year) || year < 1 || year > 9999)) throw new Error(`${p.id}: он 1–9999 хооронд байна.`);
    if (p.birthYear && p.deathYear && p.deathYear < p.birthYear) throw new Error("Нас барсан он төрсөн оноос өмнө байж болохгүй.");
  }
  if (data.people.length && !ids.has(data.focus)) throw new Error("Үндсэн хүн олдсонгүй.");
  const familyIds = new Set<string>(); const parents = new Map<string, string[]>();
  for (const f of data.families) {
    if (!f.id || familyIds.has(f.id) || !Array.isArray(f.children)) throw new Error("Гэр бүлийн ID эсвэл хүүхдийн жагсаалт буруу.");
    familyIds.add(f.id);
    const members = [f.left, ...(f.right ? [f.right] : []), ...f.children];
    if (members.some(id => !ids.has(id))) throw new Error("Холбоос дахь хүний ID бүртгэлд байхгүй байна.");
    if (new Set(members).size !== members.length) throw new Error("Хүн өөрийнхөө хань, эцэг эх эсвэл хүүхэд байж болохгүй.");
    for (const child of f.children) {
      if (parents.has(child)) throw new Error("Хүүхдийг хоёр өөр эцэг эхийн гэр бүлд давхар бүртгэх боломжгүй.");
      parents.set(child, [f.left, ...(f.right ? [f.right] : [])]);
    }
  }
  const ancestors = (id: string, path: Set<string>): void => {
    if (path.has(id)) throw new Error("Удам угсааны тойрог холбоос үүсэх тул хадгалах боломжгүй.");
    for (const parent of parents.get(id) ?? []) ancestors(parent, new Set([...path, id]));
  };
  for (const p of data.people) ancestors(p.id, new Set());
  const isAncestor = (a: string, b: string): boolean => (parents.get(b) ?? []).some(p => p === a || isAncestor(a, p));
  for (const f of data.families) if (f.right && (isAncestor(f.left, f.right) || isAncestor(f.right, f.left))) throw new Error("Өвөг дээдэс ба үр удмыг хосоор холбож болохгүй.");
  return data;
}
export type Box = { key: string; person: Person; x: number; y: number; w: number; h: number; level: number };
export type Line = { points: [number, number][]; arrow?: boolean };
export type Layout = { boxes: Box[]; lines: Line[]; width: number; height: number; levels: number };
const GAP = 36, COUPLE = 80, ROW = 190, H = 70;
const size = (p: Person) => Math.max(152, [...p.name].reduce((n, c) => n + (/[MWШЩЮЖФ]/.test(c) ? 13 : 10), 0) + 38);
type Branch = { width: number; anchor: number; draw: (x: number, level: number) => void };
export function layoutTree(data: TreeData): Layout {
  const boxes: Box[] = [], lines: Line[] = []; const people = new Map(data.people.map(p => [p.id, p]));
  if (!people.size) return { boxes, lines, width: 800, height: 540, levels: 0 };
  let sequence = 0;
  function branch(id: string, path: string[], forcedFirst?: string): Branch {
    const p = people.get(id)!; const w = size(p);
    const families = path.includes(id) ? [] : data.families.filter(f => f.left === id || f.right === id);
    if (!families.length) return { width: w, anchor: w / 2, draw(x, level) { boxes.push({ key: `${id}-${sequence++}`, person: p, x, y: 55 + level * ROW, w, h: H, level }); } };
    const groups = families.map(f => {
      // The focal descendant stays on the left regardless of gender or stored partner order.
      const leftId = forcedFirst && (f.left === forcedFirst || f.right === forcedFirst) ? forcedFirst : id;
      const left = people.get(leftId)!; const partnerId = f.left === leftId ? f.right : f.left;
      const partner = partnerId ? people.get(partnerId) : undefined;
      const lw = size(left), rw = partner ? size(partner) : 0;
      const children = ordered(f, data.people).map(c => branch(c, [...path, id], c));
      const childWidth = children.reduce((n, c) => n + c.width, 0) + Math.max(0, children.length - 1) * GAP;
      const pairWidth = lw + (partner ? COUPLE + rw : 0);
      return { f, left, partner, lw, rw, children, childWidth, pairWidth, width: Math.max(pairWidth, childWidth) };
    });
    const width = groups.reduce((n, g) => n + g.width, 0) + (groups.length - 1) * 65;
    const anchor = (groups[0].width - groups[0].pairWidth) / 2 + groups[0].lw / 2;
    return { width, anchor, draw(x, level) {
      let gx = x;
      for (const g of groups) {
        const px = gx + (g.width - g.pairWidth) / 2, y = 55 + level * ROW;
        boxes.push({ key: `${g.left.id}-${sequence++}`, person: g.left, x: px, y, w: g.lw, h: H, level });
        let junction = px + g.lw / 2;
        if (g.partner) {
          const sx = px + g.lw + COUPLE;
          boxes.push({ key: `${g.partner.id}-${sequence++}`, person: g.partner, x: sx, y, w: g.rw, h: H, level });
          lines.push({ points: [[px + g.lw, y + H / 2], [sx, y + H / 2]], arrow: true });
          junction = px + g.lw + COUPLE / 2;
        }
        let cx = gx + (g.width - g.childWidth) / 2;
        const anchors: number[] = [];
        for (const c of g.children) { anchors.push(cx + c.anchor); c.draw(cx, level + 1); cx += c.width + GAP; }
        if (anchors.length) {
          const start = y + (g.partner ? H / 2 : H), bar = y + 128;
          if (anchors.length === 1) lines.push({ points: [[junction, start], [junction, bar], [anchors[0], bar], [anchors[0], y + ROW]], arrow: true });
          else {
            lines.push({ points: [[junction, start], [junction, bar]] });
            lines.push({ points: [[Math.min(junction, anchors[0]), bar], [Math.max(junction, anchors.at(-1)!), bar]] });
            for (const a of anchors) lines.push({ points: [[a, bar], [a, y + ROW]], arrow: true });
          }
        }
        gx += g.width + 65;
      }
    } };
  }
  let root = data.focus || data.people[0].id; const seen = new Set<string>();
  while (!seen.has(root)) { seen.add(root); const f = data.families.find(f => f.children.includes(root)); if (!f) break; root = f.left; }
  const tree = branch(root, [], root); tree.draw(55, 0);
  const levels = Math.max(0, ...boxes.map(b => b.level)) + 1;
  return { boxes, lines, width: tree.width + 110, height: levels * ROW + 10, levels };
}
