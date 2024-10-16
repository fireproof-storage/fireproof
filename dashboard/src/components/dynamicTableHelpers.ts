export function headersForDocs(docs: object[]) {
  const headers = new Map();
  for (const doc of docs) {
    if (!doc) continue;
    for (const key of Object.keys(doc)) {
      if (headers.has(key)) {
        headers.set(key, headers.get(key) + 1);
      } else {
        headers.set(key, 1);
      }
    }
  }
  headers.delete("_id");
  return [
    "_id",
    ...Array.from(headers.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([key]) => key),
  ];
}
