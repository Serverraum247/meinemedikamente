export function getLocalDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function dateFromLocalDateKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function msUntilNextLocalDay(date: Date = new Date()): number {
  const nextDay = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 0, 2);
  return Math.max(1000, nextDay.getTime() - date.getTime());
}
