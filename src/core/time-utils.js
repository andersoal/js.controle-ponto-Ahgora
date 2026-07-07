/**
 * Time Utilities
 * Funções puras de conversão e formatação de tempo.
 * Zero dependência de DOM/storage.
 */

export function pad2(n) {
    return String(n).padStart(2, '0');
}

export function toMin(s) {
    if (s === null || s === undefined) return null;
    s = String(s).trim();
    if (!s) return null;
    const neg = s.startsWith('-');
    const cleaned = s.replace(/[^0-9:]/g, '');
    const parts = cleaned.split(':');
    if (parts.length !== 2) return null;
    const [h, m] = parts.map(Number);
    if (isNaN(h) || isNaN(m)) return null;
    const value = h * 60 + m;
    return neg ? -value : value;
}

export function fmtMin(m) {
    if (m === null || m === undefined) return '--:--';
    const neg = m < 0;
    const abs = Math.abs(Math.round(m));
    return `${neg ? '-' : ''}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
}

export function fmtHour(m) {
    if (m === null || m === undefined) return '--:--';
    const n = ((Math.round(m) % 1440) + 1440) % 1440;
    return `${pad2(Math.floor(n / 60))}:${pad2(n % 60)}`;
}

export function nowMin() {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
}

export function formatDateKey(date = new Date()) {
    const d = new Date(date);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function formatDayMonth(date) {
    if (!(date instanceof Date)) return '--/--';
    return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}`;
}

export function sameWeek(a, b) {
    const startOfWeek = (d) => {
        const date = new Date(d);
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1);
        return new Date(date.setDate(diff));
    };
    const wa = startOfWeek(a);
    const wb = startOfWeek(b);
    return (
        wa.getFullYear() === wb.getFullYear() &&
        wa.getMonth() === wb.getMonth() &&
        wa.getDate() === wb.getDate()
    );
}

export function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

export function calcularTrabalhado(batidas, now = nowMin()) {
    let total = 0;
    for (let i = 0; i < batidas.length; i += 2) {
        const entrada = toMin(batidas[i]);
        const saida = batidas[i + 1] ? toMin(batidas[i + 1]) : now;
        if (entrada !== null && saida !== null) total += saida - entrada;
    }
    return total;
}

export function normalizePunchTime(value) {
    const text = String(value || '').trim();
    if (!text) return null;
    const match = text.match(/(\d{1,2}):(\d{2})/);
    if (!match) return null;
    const hh = Number(match[1]);
    const mm = Number(match[2]);
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    return `${pad2(hh)}:${pad2(mm)}`;
}

export function shiftPunchTime(time, deltaMinutes) {
    const base = toMin(time);
    if (base === null || deltaMinutes === null || isNaN(deltaMinutes)) return null;
    const shifted = base + deltaMinutes;
    return fmtHour(shifted);
}

export function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export function fmtCountdown(ms) {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}m ${pad2(sec)}s`;
}

export function roundUpQuarterHour(m) {
    if (m === null || m === undefined) return null;
    return Math.ceil(m / 15) * 15;
}

export function fmtQuarterDecimal(m) {
    if (m === null || m === undefined) return '--';
    const decimal = roundUpQuarterHour(m) / 60;
    return Number.isInteger(decimal)
        ? String(decimal)
        : decimal.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

export function minuteToDate(baseDate, minute) {
    if (minute === null || minute === undefined) return null;
    const date = new Date(baseDate || new Date());
    const n = ((Math.round(minute) % 1440) + 1440) % 1440;
    date.setHours(Math.floor(n / 60), n % 60, 0, 0);
    return date;
}

export function fmtGoogleCalendarDate(date) {
    const yyyy = date.getFullYear();
    const mm = pad2(date.getMonth() + 1);
    const dd = pad2(date.getDate());
    const hh = pad2(date.getHours());
    const min = pad2(date.getMinutes());
    const ss = pad2(date.getSeconds());
    return `${yyyy}${mm}${dd}T${hh}${min}${ss}`;
}

export function isWeekend(date) {
    return date.getDay() === 0 || date.getDay() === 6;
}

export function getWorkingDaysInMonth(year, month) {
    let count = 0;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
        if (!isWeekend(new Date(year, month, d))) count++;
    }
    return count;
}
