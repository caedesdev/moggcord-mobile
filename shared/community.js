export const origin = "https://moggcord.cc";
const idPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const usernamePattern = /^[A-Za-z0-9][A-Za-z0-9_.-]{2,31}$/;

export function libraryUrl(kind, query = "") {
  const path = kind === "theme" ? "/themes" : "/user-plugins";
  const search = query.trim().slice(0, 100);
  return origin + path + (search ? "?q=" + encodeURIComponent(search) : "");
}

export function normalizeEntry(value) {
  if (!value || typeof value.id !== "string" || !idPattern.test(value.id)
    || !["plugin", "theme"].includes(value.kind)
    || typeof value.name !== "string" || !value.name.trim()) return null;
  const username = typeof value.username === "string" && usernamePattern.test(value.username) ? value.username : "";
  return {
    id: value.id.toLowerCase(),
    kind: value.kind,
    name: value.name.trim().slice(0, 100),
    description: typeof value.description === "string" ? value.description.trim().slice(0, 500) : "",
    version: typeof value.version === "string" ? value.version.slice(0, 24) : "",
    author: typeof value.author_name === "string" ? value.author_name.slice(0, 64) : typeof value.author === "string" ? value.author.slice(0, 64) : "",
    username
  };
}

export async function loadLibrary(kind, query, { signal, request = fetch } = {}) {
  if (!["plugin", "theme"].includes(kind)) throw new Error("Choose plugins or themes");
  const url = origin + "/api/entries?kind=" + kind + "&sort=popular&limit=24&q=" + encodeURIComponent(query.trim().slice(0, 100));
  const response = await request(url, {
    headers: { Accept: "application/json" },
    credentials: "omit",
    signal
  });
  if (!response.ok) throw new Error("The community library is unavailable");
  const payload = await response.json();
  if (!Array.isArray(payload?.data)) throw new Error("The community library returned an invalid response");
  return payload.data.slice(0, 24).map(normalizeEntry).filter(entry => entry?.kind === kind);
}
