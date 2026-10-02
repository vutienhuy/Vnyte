/**
 * Shared utility functions for formatting data
 */

/**
 * Format date to Vietnamese locale (DD/MM/YYYY)
 */
export function formatDate(dateStr?: string): string {
    if (!dateStr) return "N/A";
    const date = new Date(dateStr);
    return date.toLocaleDateString("vi-VN");
}

/**
 * Format DOB from YYYYMMDD or YYYYMMDDHHMMSS to DD/MM/YYYY
 */
export function formatDOB(dob?: string | number): string {
    if (!dob) return "N/A";
    const dobStr = String(dob);
    if (dobStr.length < 8) return "N/A";
    const year = dobStr.substring(0, 4);
    const month = dobStr.substring(4, 6);
    const day = dobStr.substring(6, 8);
    return `${day}/${month}/${year}`;
}

/**
 * Format currency to Vietnamese Dong
 */
export function formatCurrency(amount?: number): string {
    if (!amount) return "Chưa cập nhật";
    return amount.toLocaleString("vi-VN") + " VNĐ";
}
