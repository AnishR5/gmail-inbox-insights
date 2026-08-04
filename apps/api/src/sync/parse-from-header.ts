export function parseFromHeader(value: string | undefined | null): { email: string; name: string | null } {
  if (!value) {
    return { email: "unknown@unknown", name: null };
  }
  const match = value.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  if (match) {
    const name = match[1].trim();
    return { email: match[2].trim().toLowerCase(), name: name.length > 0 ? name : null };
  }
  return { email: value.trim().toLowerCase(), name: null };
}
