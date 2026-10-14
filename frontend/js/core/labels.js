export const ROLE_LABEL = { member: '멤버', admin: '어드민', manager: '관리자', owner: '제작자', guest: '익명' };
export const isStaffRole = (role) => ['admin', 'manager', 'owner'].includes(role);
export const GRADE_LETTERS = ['F', 'E', 'D', 'C', 'B', 'A', 'S'];
