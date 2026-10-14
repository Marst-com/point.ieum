// 백엔드 주소. 비어 있으면 같은 주소(/api, /socket.io)를 쓴다.
export const API_BASE = String((window.IEUM_CONFIG && window.IEUM_CONFIG.API_BASE) || '').trim().replace(/\/+$/, '');
export const apiUrl = (path) => `${API_BASE}/api${path}`;
