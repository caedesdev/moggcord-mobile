import { origin } from "./community.js";

export const catalogSources = [
  ["moggcord", "Moggcord"], ["vencord", "Vencord"], ["equicord", "Equicord"], ["all", "All"]
];
const sourceIds = new Set(catalogSources.map(([source]) => source));
const pageSize = 30;

export async function loadPluginCatalog(source, query, offset = 0, { signal, request = fetch } = {}) {
  if (!sourceIds.has(source) || !Number.isInteger(offset) || offset < 0 || offset > 10000) {
    throw new Error("Invalid plugin catalog filter");
  }
  const search = query.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 100);
  const url = origin + "/api/plugins?source=" + source + "&limit=" + pageSize
    + "&offset=" + offset + "&q=" + encodeURIComponent(search);
  const response = await request(url, { headers: { Accept: "application/json" }, credentials: "omit", signal });
  if (!response.ok) throw new Error("The desktop catalog is unavailable");
  const payload = await response.json();
  if (!Array.isArray(payload?.data) || payload.data.length > pageSize || !Number.isSafeInteger(payload.total)
      || payload.total < 0 || payload.total > 10000 || payload.offset !== offset) {
    throw new Error("The desktop catalog returned an invalid response");
  }

  const entries = [];
  const seen = new Set();
  for (const item of payload.data) {
    if (typeof item?.id !== "string" || !item.id.trim() || item.id.length > 120 || /[\u0000-\u001f\u007f/\\]/.test(item.id)
      || typeof item.name !== "string" || !item.name.trim() || seen.has(item.id)) continue;
    seen.add(item.id);
    entries.push({
      id: item.id, title: item.name.trim().slice(0, 100),
      description: typeof item.description === "string" ? item.description.slice(0, 450) : "",
      source: sourceIds.has(item.source) ? item.source : source
    });
  }
  return { entries, total: payload.total, next: offset + payload.data.length };
}
