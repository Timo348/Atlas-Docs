export function insertAt(ids: string[], movedId: string, position: number) {
  const remaining = ids.filter((id) => id !== movedId);
  const target = Math.max(0, Math.min(Math.trunc(position), remaining.length));
  remaining.splice(target, 0, movedId);
  return remaining;
}
