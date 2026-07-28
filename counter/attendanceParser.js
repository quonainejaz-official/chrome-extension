/**
 * attendanceParser.js
 * Dynamically detects columns from table headers and parses attendance rows.
 * No hardcoded column indices — works even if column order changes.
 */

(function () {
  'use strict';

  const AttendanceParser = {

    COLUMN_ALIASES: {
      date: ['date', 'attendance date', 'day date'],
      day: ['day', 'day name', 'weekday', 'day of week'],
      checkIn: ['check in', 'checkin', 'check-in', 'in time', 'intime', 'arrival'],
      checkOut: ['check out', 'checkout', 'check-out', 'out time', 'outtime', 'departure'],
      breakOut: ['break out', 'breakout', 'break-out', 'break out time'],
      breakIn: ['break in', 'breakin', 'break-in', 'break in time'],
      totalBreakTime: ['total break time', 'total break', 'break duration', 'break time'],
      hoursWorked: ['hours worked', 'worked hours', 'work hours', 'total hours', 'hours'],
      officeHours: ['office hours', 'required hours', 'min hours', 'minimum hours', 'expected hours'],
      reason: ['reason', 'remarks/reason', 'leave reason', 'status reason'],
      remarks: ['remarks', 'note', 'notes', 'comment', 'comments']
    },

    HOLIDAY_KEYWORDS: ['holiday', 'public holiday', 'gazetted holiday', 'office closed', 'restricted holiday'],
    LEAVE_KEYWORDS: ['leave', 'full leave', 'casual leave', 'earned leave', 'sick leave', 'planned leave'],
    SHORT_LEAVE_KEYWORD: 'short leave',
    HALF_LEAVE_KEYWORD: 'half leave',
    LATE_KEYWORDS: ['late', 'will be late'],
    NOT_MARKED_KEYWORDS: ['not marked', 'n/a', '-', '', 'other'],

    detectColumns(headerRow) {
      if (!headerRow) return null;

      // Normalize whitespace so headers split across lines (e.g. "Total Break<br>Time")
      // still match aliases like "total break time".
      const headers = Array.from(headerRow.querySelectorAll('th, td')).map((cell, idx) => ({
        index: idx,
        text: cell.textContent.replace(/\s+/g, ' ').trim().toLowerCase()
      }));

      const mapping = {};

      for (const [key, aliases] of Object.entries(this.COLUMN_ALIASES)) {
        for (const alias of aliases) {
          const match = headers.find(h => h.text === alias || h.text.includes(alias));
          if (match) {
            mapping[key] = match.index;
            break;
          }
        }
      }

      return mapping;
    },

    /**
     * Scans candidate header rows and returns the mapping with the most matched columns.
     * Some tables have a title/caption row (e.g. "Attendance From X To Y") before the
     * real header row, so we can't assume the header is always the first <tr>.
     */
    findAttendanceTable() {
      const tables = document.querySelectorAll('table');
      let best = null;
      let bestScore = 0;

      for (const table of tables) {
        const candidateRows = Array.from(
          table.querySelectorAll('thead tr, tbody tr, tr')
        ).slice(0, 5);

        for (const row of candidateRows) {
          const mapping = this.detectColumns(row);
          if (!mapping) continue;

          const score = Object.keys(mapping).length;
          if (score > bestScore && (mapping.hoursWorked !== undefined || mapping.date !== undefined)) {
            bestScore = score;
            best = { table, mapping, headerRow: row };
          }
        }
      }

      return best;
    },

    /**
     * Expands a row's cells according to colSpan so the effective column index
     * lines up with the header's column index. Rows with sparse data (e.g. a
     * "Not Marked" or "Other" day) often merge several trailing columns into a
     * single <td colspan="N">, which otherwise shifts every mapped index after it.
     */
    getEffectiveCells(row) {
      const expanded = [];
      Array.from(row.cells).forEach(cell => {
        const span = cell.colSpan || 1;
        for (let i = 0; i < span; i++) expanded.push(cell);
      });
      return expanded;
    },

    parseTimeToMinutes(timeStr) {
      if (!timeStr) return 0;
      const cleaned = timeStr.trim().replace(/[^\d:]/g, '');
      if (!cleaned) return 0;

      const parts = cleaned.split(':');
      if (parts.length === 2 || parts.length === 3) {
        const hours = parseInt(parts[0], 10) || 0;
        const mins = parseInt(parts[1], 10) || 0;
        return hours * 60 + mins;
      }
      return 0;
    },

    /** True if the string looks like an HH:MM / H:MM time value. */
    isTimeLike(str) {
      if (!str) return false;
      return /^\d{1,2}:\d{2}(:\d{2})?$/.test(str.trim());
    },

    minutesToHM(minutes) {
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      if (h === 0 && m === 0) return '0m';
      if (h === 0) return `${m}m`;
      if (m === 0) return `${h}h`;
      return `${h}h ${m}m`;
    },

    isWeekend(dayStr) {
      if (!dayStr) return false;
      const d = dayStr.trim().toLowerCase();
      return d === 'saturday' || d === 'sunday' || d === 'sat' || d === 'sun';
    },

    isHoliday(reasonStr, remarksStr) {
      const combined = `${reasonStr || ''} ${remarksStr || ''}`.toLowerCase();
      return this.HOLIDAY_KEYWORDS.some(kw => combined.includes(kw));
    },

    isFullLeave(reasonStr) {
      if (!reasonStr) return false;
      const r = reasonStr.trim().toLowerCase();
      if (r === 'not marked' || r === '') return false;
      return this.LEAVE_KEYWORDS.some(kw => r.includes(kw));
    },

    isShortLeave(reasonStr) {
      if (!reasonStr) return false;
      return reasonStr.trim().toLowerCase().includes(this.SHORT_LEAVE_KEYWORD);
    },

    isLate(reasonStr) {
      if (!reasonStr) return false;
      const r = reasonStr.trim().toLowerCase();
      return this.LATE_KEYWORDS.some(kw => r.includes(kw));
    },

    isHalfLeave(reasonStr, hoursWorkedMin, officeHoursMin) {
      if (reasonStr && reasonStr.trim().toLowerCase().includes(this.HALF_LEAVE_KEYWORD)) {
        return true;
      }
      if (officeHoursMin > 0 && hoursWorkedMin > 0) {
        const ratio = hoursWorkedMin / officeHoursMin;
        return ratio >= 0.4 && ratio <= 0.6;
      }
      return false;
    },

    /**
     * A row counts as "absent" (no actual attendance recorded) when there's no
     * parseable Hours Worked AND the Check In value isn't a real time
     * (e.g. blank, "Not Marked", "Other", "N/A", "-").
     */
    isAbsent(checkInStr, hoursWorkedMin) {
      if (hoursWorkedMin > 0) return false;
      if (this.isTimeLike(checkInStr)) return false;
      return true;
    },

    parseAttendancePage() {
      const result = this.findAttendanceTable();
      if (!result) {
        return { error: 'No attendance table found on this page.', rows: [] };
      }

      const { table, mapping, headerRow } = result;
      const tbody = table.querySelector('tbody') || table;
      const allRows = Array.from(tbody.querySelectorAll('tr'));

      const dataRows = allRows.filter(row => {
        if (row === headerRow) return false;
        if (row.closest('thead')) return false;
        if (row.querySelector('th')) return false;
        // Skip title/caption rows (e.g. "Attendance From X To Y") that span
        // the whole table as a single merged cell.
        if (row.cells && row.cells.length <= 1) return false;
        return true;
      });

      const parsedRows = [];

      for (const row of dataRows) {
        const cells = this.getEffectiveCells(row);

        const getText = (key) => {
          const idx = mapping[key];
          if (idx === undefined || !cells[idx]) return '';
          return cells[idx].textContent.trim();
        };

        const date = getText('date');
        const day = getText('day');
        const checkIn = getText('checkIn');
        const checkOut = getText('checkOut');
        const breakOut = getText('breakOut');
        const breakIn = getText('breakIn');
        const totalBreakTime = getText('totalBreakTime');
        const hoursWorked = getText('hoursWorked');
        const officeHours = getText('officeHours');
        const reason = getText('reason');
        const remarks = getText('remarks');

        if (!date && !day && !hoursWorked) continue;

        const hoursWorkedMin = this.parseTimeToMinutes(hoursWorked);

        parsedRows.push({
          date,
          day,
          checkIn,
          checkOut,
          breakOut,
          breakIn,
          totalBreakTime,
          hoursWorked,
          officeHours,
          reason,
          remarks,
          hoursWorkedMin,
          officeHoursMin: this.parseTimeToMinutes(officeHours),
          checkInMin: this.isTimeLike(checkIn) ? this.parseTimeToMinutes(checkIn) : null,
          isWeekend: this.isWeekend(day),
          isHoliday: this.isHoliday(reason, remarks),
          isLate: this.isLate(reason),
          isShortLeave: this.isShortLeave(reason),
          isNotMarked: this.isAbsent(checkIn, hoursWorkedMin),
          isAbsent: this.isAbsent(checkIn, hoursWorkedMin)
        });
      }

      return { rows: parsedRows, mapping };
    }
  };

  window.AttendanceParser = AttendanceParser;
})();
