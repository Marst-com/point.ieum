export const fmtNum = (n) => Number(n || 0).toLocaleString('ko-KR');

const pad = (n) => String(n).padStart(2, '0');

export function fmtTime(ts) {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 오늘이면 시각, 아니면 날짜
export function fmtWhen(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return fmtTime(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function fmtDateTime(ts) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${fmtTime(ts)}`;
}
