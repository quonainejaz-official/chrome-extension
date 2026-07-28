/**
 * attendanceCalculator.js
 * Computes all attendance statistics from parsed rows.
 * Keeps logic separate for testability and future customization.
 */

(function () {
  'use strict';

  const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

  const AttendanceCalculator = {

    /**
     * Determine if a row should be excluded from leave/shortage/late calculations.
     */
    isExcluded(row) {
      return row.isWeekend || row.isHoliday;
    },

    /**
     * Parse "DD-Mon-YYYY", "DD/MM/YYYY" or "YYYY-MM-DD" into a sortable {year, month} key.
     * Returns null if the format isn't recognized (row is then excluded from monthly grouping).
     */
    parseMonthKey(dateStr) {
      if (!dateStr) return null;
      const s = dateStr.trim();

      let m = s.match(/^(\d{1,2})[-\/](\w{3,})[-\/](\d{4})$/);
      if (m) {
        const monthIdx = MONTH_NAMES.indexOf(m[2].slice(0, 3).toLowerCase());
        if (monthIdx === -1) return null;
        return `${m[3]}-${String(monthIdx + 1).padStart(2, '0')}`;
      }

      m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (m) {
        return `${m[1]}-${String(parseInt(m[2], 10)).padStart(2, '0')}`;
      }

      m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
      if (m) {
        return `${m[3]}-${String(parseInt(m[2], 10)).padStart(2, '0')}`;
      }

      return null;
    },

    /**
     * Determine per-row lateness against a configured office start time (HH:MM).
     * NOTE: Grace minutes are NOT applied here — grace is a monthly office-hours
     * shortage budget, not a per-day late-arrival allowance. Any check-in strictly
     * after the office start time counts as late. Falls back to reason-keyword
     * detection when no start time is configured or the check-in couldn't be parsed.
     */
    classifyLateness(row, settings) {
      const thresholdMin = settings && settings.officeStartTime
        ? window.AttendanceParser.parseTimeToMinutes(settings.officeStartTime)
        : null;

      let isLateArrival;
      if (thresholdMin !== null && row.checkInMin !== null && row.checkInMin !== undefined) {
        isLateArrival = row.checkInMin > thresholdMin;
      } else {
        isLateArrival = row.isLate;
      }

      if (!isLateArrival) return { isLateArrival: false, isInformed: false };

      // Informed = the Reason column has any note (e.g. "Will be late").
      // Uninformed = late arrival with no reason given.
      const isInformed = !!(row.reason && row.reason.trim());
      return { isLateArrival: true, isInformed };
    },

    /**
     * Applies the monthly deduction policy.
     *
     * LATE POLICY (per calendar month):
     *   - The first 2 lates in a month are free (whether informed or uninformed).
     *   - Every late from the 3rd onward costs 0.25 (even if informed).
     *   - Every UNINFORMED late additionally costs a flat 0.25, always, with no
     *     relaxation and independent of the 2-late quota.
     *   - These two charges stack: a 3rd late that is also uninformed costs
     *     0.25 (over-quota) + 0.25 (uninformed) = 0.5.
     *
     * GRACE POLICY (per calendar month):
     *   - "Grace minutes" is a monthly office-hours shortage budget, NOT a late
     *     allowance. A month's total office-time shortfall up to the grace budget
     *     is forgiven. Any shortfall beyond the budget is charged as short
     *     leave(s) at 0.25 each — one short leave per grace-sized block of excess.
     *
     * Plain leave deductions (full/half/short-from-reason) are flat.
     */
    computeAll(rows, settings) {
      const graceBudget = (settings && Number.isFinite(settings.graceMinutes)) ? settings.graceMinutes : 0;

      const byMonth = new Map();
      for (const row of rows) {
        if (this.isExcluded(row)) continue;
        const key = this.parseMonthKey(row.date) || '__unknown__';
        if (!byMonth.has(key)) byMonth.set(key, []);
        byMonth.get(key).push(row);
      }

      let informedLateDays = 0;
      let uninformedLateDays = 0;
      let lateDeduction = 0;
      let shortLeaveDays = 0;
      let shortLeaveCount = 0;
      let halfLeaves = 0;
      let fullLeaves = 0;
      let leaveDeduction = 0;
      let totalOfficeShortMin = 0;
      let totalGraceUsedMin = 0;
      let totalGraceRemainingMin = 0;
      let officeShortRemainingMin = 0;
      let graceShortLeaves = 0;
      const lateBreakdown = [];
      const leaveBreakdown = [];

      for (const monthRows of byMonth.values()) {
        let lateSeq = 0;            // running count of lates this month (2 free quota)
        let monthOfficeShortMin = 0;

        for (const row of monthRows) {
          // Accumulate this month's office-time shortfall (present days only).
          if (!row.isAbsent && row.officeHoursMin > 0 && row.hoursWorkedMin > 0
            && row.hoursWorkedMin < row.officeHoursMin) {
            monthOfficeShortMin += (row.officeHoursMin - row.hoursWorkedMin);
          }

          const isHalf = window.AttendanceParser.isHalfLeave(row.reason, row.hoursWorkedMin, row.officeHoursMin);
          const isFull = row.isAbsent && !isHalf && !row.isShortLeave;

          if (row.isShortLeave) {
            shortLeaveDays++;
            shortLeaveCount++;
            leaveDeduction += 0.25;
            leaveBreakdown.push({ date: row.date, day: row.day, type: 'Short Leave', reason: row.reason, deduction: 0.25 });
            continue;
          }

          if (isHalf) {
            halfLeaves++;
            leaveDeduction += 0.5;
            leaveBreakdown.push({ date: row.date, day: row.day, type: 'Half Leave', reason: row.reason, deduction: 0.5 });
            continue;
          }

          if (isFull) {
            fullLeaves++;
            leaveDeduction += 1;
            leaveBreakdown.push({ date: row.date, day: row.day, type: 'Full Leave', reason: row.reason || row.remarks, deduction: 1 });
            continue;
          }

          const { isLateArrival, isInformed } = this.classifyLateness(row, settings);
          if (!isLateArrival) continue;

          lateSeq++;
          // Over-quota charge: 3rd late onward costs 0.25, regardless of informed/uninformed.
          const overQuota = lateSeq > 2 ? 0.25 : 0;
          // Uninformed charge: flat 0.25 on every uninformed late, always, no relaxation.
          const uninformedCharge = isInformed ? 0 : 0.25;
          const deduction = overQuota + uninformedCharge;

          let status;
          if (isInformed) {
            status = 'Informed Late';
            informedLateDays++;
          } else {
            status = 'Uninformed Late';
            uninformedLateDays++;
          }

          lateDeduction += deduction;
          lateBreakdown.push({ date: row.date, day: row.day, checkIn: row.checkIn, reason: row.reason, status, deduction });
        }

        // Apply the monthly grace budget to this month's office-time shortfall.
        totalOfficeShortMin += monthOfficeShortMin;
        const graceUsed = Math.min(monthOfficeShortMin, graceBudget);
        totalGraceUsedMin += graceUsed;
        totalGraceRemainingMin += Math.max(0, graceBudget - monthOfficeShortMin);

        const excess = Math.max(0, monthOfficeShortMin - graceBudget);
        officeShortRemainingMin += excess;

        // Beyond the grace budget, charge short leave(s) — one per grace-sized block.
        if (excess > 0 && graceBudget > 0) {
          const extra = Math.ceil(excess / graceBudget);
          graceShortLeaves += extra;
          shortLeaveCount += extra;
          shortLeaveDays += extra;
          leaveDeduction += extra * 0.25;
          leaveBreakdown.push({
            date: '(monthly)',
            day: '',
            type: 'Short Leave (Office Short)',
            reason: `Office short ${window.AttendanceParser.minutesToHM(monthOfficeShortMin)} exceeded ${graceBudget}m grace`,
            deduction: extra * 0.25
          });
        }
      }

      return {
        informedLateDays, uninformedLateDays, lateDeduction, lateBreakdown,
        shortLeaveDays, shortLeaveCount, halfLeaves, fullLeaves, leaveDeduction, leaveBreakdown,
        totalOfficeShortMin, totalGraceUsedMin, totalGraceRemainingMin, officeShortRemainingMin, graceShortLeaves,
        totalDeduction: lateDeduction + leaveDeduction
      };
    },

    /**
     * Human-readable label of the effective late-arrival cutoff, e.g. "12:20".
     * Since grace no longer applies to lateness, this is just the office start time.
     */
    getEffectiveThresholdLabel(settings) {
      if (!settings || !settings.officeStartTime) return null;
      const total = window.AttendanceParser.parseTimeToMinutes(settings.officeStartTime);
      const h = Math.floor(total / 60) % 24;
      const m = total % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    },

    /**
     * Compute all statistics from parsed rows.
     * @param {Array} parsedRows
     * @param {Object} [settings] - { officeStartTime: 'HH:MM', graceMinutes: number }
     */
    calculate(parsedRows, settings) {
      if (!parsedRows || parsedRows.length === 0) {
        return this.emptyResult();
      }

      const excludedRows = [];
      for (const row of parsedRows) {
        if (this.isExcluded(row)) excludedRows.push(row);
      }

      const c = this.computeAll(parsedRows, settings);

      return {
        totalOfficeShort: window.AttendanceParser.minutesToHM(c.totalOfficeShortMin),
        totalOfficeShortMin: c.totalOfficeShortMin,
        graceUsed: window.AttendanceParser.minutesToHM(c.totalGraceUsedMin),
        graceUsedMin: c.totalGraceUsedMin,
        graceRemaining: window.AttendanceParser.minutesToHM(c.totalGraceRemainingMin),
        graceRemainingMin: c.totalGraceRemainingMin,
        officeShortRemaining: window.AttendanceParser.minutesToHM(c.officeShortRemainingMin),
        officeShortRemainingMin: c.officeShortRemainingMin,
        graceShortLeaves: c.graceShortLeaves,
        lateDays: c.informedLateDays + c.uninformedLateDays,
        informedLateDays: c.informedLateDays,
        uninformedLateDays: c.uninformedLateDays,
        lateDeduction: c.lateDeduction,
        lateBreakdown: c.lateBreakdown,
        shortLeaveDays: c.shortLeaveDays,
        shortLeaveCount: c.shortLeaveCount,
        halfLeaves: c.halfLeaves,
        fullLeaves: c.fullLeaves,
        leaveDeduction: c.leaveDeduction,
        leaveBreakdown: c.leaveBreakdown,
        totalDeduction: c.totalDeduction,
        totalRows: parsedRows.length,
        excludedRows: excludedRows.length,
        workingDays: parsedRows.length - excludedRows.length
      };
    },

    emptyResult() {
      return {
        totalOfficeShort: '0m',
        totalOfficeShortMin: 0,
        graceUsed: '0m',
        graceUsedMin: 0,
        graceRemaining: '0m',
        graceRemainingMin: 0,
        officeShortRemaining: '0m',
        officeShortRemainingMin: 0,
        graceShortLeaves: 0,
        lateDays: 0,
        informedLateDays: 0,
        uninformedLateDays: 0,
        lateDeduction: 0,
        lateBreakdown: [],
        shortLeaveDays: 0,
        shortLeaveCount: 0,
        halfLeaves: 0,
        fullLeaves: 0,
        leaveDeduction: 0,
        leaveBreakdown: [],
        totalDeduction: 0,
        totalRows: 0,
        excludedRows: 0,
        workingDays: 0
      };
    },

    /**
     * Build CSV content from parsed rows and stats.
     */
    toCSV(parsedRows, stats) {
      const headers = [
        'Date', 'Day', 'Check In', 'Check Out', 'Break Out', 'Break In',
        'Total Break Time', 'Hours Worked', 'Office Hours', 'Reason', 'Remarks'
      ];

      const lines = [headers.join(',')];

      for (const row of parsedRows) {
        const vals = [
          row.date, row.day, row.checkIn, row.checkOut, row.breakOut,
          row.breakIn, row.totalBreakTime, row.hoursWorked, row.officeHours,
          row.reason, row.remarks
        ].map(v => `"${(v || '').replace(/"/g, '""')}"`);
        lines.push(vals.join(','));
      }

      lines.push('');
      lines.push('--- Summary ---');
      lines.push(`Office Time Short,${stats.totalOfficeShort}`);
      lines.push(`Grace Time Used,${stats.graceUsed}`);
      lines.push(`Grace Time Remaining,${stats.graceRemaining}`);
      lines.push(`Office Time Short (After Grace),${stats.officeShortRemaining}`);
      lines.push(`Late Days,${stats.lateDays}`);
      lines.push(`Informed Late,${stats.informedLateDays}`);
      lines.push(`Uninformed Late,${stats.uninformedLateDays}`);
      lines.push(`Late Deduction (days),${stats.lateDeduction}`);
      lines.push(`Short Leave Days,${stats.shortLeaveDays}`);
      lines.push(`Short Leaves Count,${stats.shortLeaveCount}`);
      lines.push(`Short Leaves (Office Short),${stats.graceShortLeaves}`);
      lines.push(`Half Leaves,${stats.halfLeaves}`);
      lines.push(`Full Leaves,${stats.fullLeaves}`);
      lines.push(`Leave Deduction (days),${stats.leaveDeduction}`);
      lines.push(`Total Deduction (days),${stats.totalDeduction}`);
      lines.push(`Total Rows,${stats.totalRows}`);
      lines.push(`Excluded (Weekend/Holiday),${stats.excludedRows}`);
      lines.push(`Working Days,${stats.workingDays}`);

      return lines.join('\n');
    },

    /**
     * Build a self-contained printable HTML document for PDF export.
     * Opened in a new tab where the browser's print dialog lets the user
     * "Save as PDF" — no external libraries or CSV tooling required.
     */
    toPrintableHTML(stats) {
      const esc = (v) => String(v == null ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

      const summaryRows = [
        ['Office Time Short', stats.totalOfficeShort],
        ['Grace Time Used', stats.graceUsed],
        ['Grace Time Remaining', stats.graceRemaining],
        ['Office Short (After Grace)', stats.officeShortRemaining],
        ['Late Days', `${stats.lateDays} (Informed: ${stats.informedLateDays}, Uninformed: ${stats.uninformedLateDays})`],
        ['Late Deduction (days)', stats.lateDeduction],
        ['Short Leave Days', stats.shortLeaveDays],
        ['Short Leaves', stats.shortLeaveCount],
        ['Half Leaves', stats.halfLeaves],
        ['Full Leaves', stats.fullLeaves],
        ['Leave Deduction (days)', stats.leaveDeduction],
        ['Total Deduction (days)', stats.totalDeduction],
        ['Working Days', stats.workingDays],
        ['Excluded (Weekend/Holiday)', stats.excludedRows],
        ['Total Rows', stats.totalRows]
      ].map(([k, v]) => `<tr><td class="k">${esc(k)}</td><td class="v">${esc(v)}</td></tr>`).join('');

      const lateRows = (stats.lateBreakdown || []).map(r =>
        `<tr><td>${esc(r.date)}</td><td>${esc(r.checkIn)}</td><td>${esc(r.status)}</td><td>${esc(r.reason)}</td><td class="num">${esc(r.deduction || 0)}</td></tr>`
      ).join('') || '<tr><td colspan="5" class="empty">No late days.</td></tr>';

      const leaveRows = (stats.leaveBreakdown || []).map(r =>
        `<tr><td>${esc(r.date)}</td><td>${esc(r.type)}</td><td>${esc(r.reason)}</td><td class="num">${esc(r.deduction || 0)}</td></tr>`
      ).join('') || '<tr><td colspan="4" class="empty">No leaves.</td></tr>';

      return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>Attendance Summary</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #1f2937; margin: 32px; }
  h1 { font-size: 22px; margin: 0 0 2px; }
  .sub { color: #6b7280; font-size: 13px; margin: 0 0 20px; }
  h2 { font-size: 15px; margin: 24px 0 8px; border-bottom: 2px solid #2563eb; padding-bottom: 4px; color: #2563eb; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid #e5e7eb; }
  th { background: #f3f4f6; font-weight: 600; }
  td.k { color: #6b7280; width: 55%; }
  td.v { font-weight: 600; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  td.empty { color: #9ca3af; text-align: center; font-style: italic; }
  .total { margin-top: 16px; padding: 12px 16px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; font-size: 16px; }
  .total b { color: #dc2626; }
  @media print { body { margin: 0; } h2 { break-after: avoid; } tr { break-inside: avoid; } }
</style></head>
<body onload="window.print()">
  <h1>Attendance Summary</h1>
  <p class="sub">${esc(stats.workingDays)} working days &middot; ${esc(stats.excludedRows)} excluded</p>

  <div class="total">Total Deduction: <b>${esc(stats.totalDeduction)} day(s)</b></div>

  <h2>Summary</h2>
  <table><tbody>${summaryRows}</tbody></table>

  <h2>Late Days</h2>
  <table>
    <thead><tr><th>Date</th><th>Check In</th><th>Status</th><th>Reason</th><th class="num">Deduction</th></tr></thead>
    <tbody>${lateRows}</tbody>
  </table>

  <h2>Leaves</h2>
  <table>
    <thead><tr><th>Date</th><th>Type</th><th>Reason</th><th class="num">Deduction</th></tr></thead>
    <tbody>${leaveRows}</tbody>
  </table>
</body></html>`;
    },

    /**
     * Build plain-text summary for clipboard copy.
     */
    toPlainText(stats) {
      return [
        '--- Attendance Summary ---',
        '',
        `Office Time Short  : ${stats.totalOfficeShort}`,
        `Grace Time Used    : ${stats.graceUsed}`,
        `Grace Remaining    : ${stats.graceRemaining}`,
        `Short (After Grace): ${stats.officeShortRemaining}`,
        `Late Days          : ${stats.lateDays} (Informed: ${stats.informedLateDays}, Uninformed: ${stats.uninformedLateDays})`,
        `Late Deduction     : ${stats.lateDeduction} day(s)`,
        `Short Leave Days   : ${stats.shortLeaveDays}`,
        `Short Leaves       : ${stats.shortLeaveCount}`,
        `Half Leaves        : ${stats.halfLeaves}`,
        `Full Leaves        : ${stats.fullLeaves}`,
        `Leave Deduction    : ${stats.leaveDeduction} day(s)`,
        `Total Deduction    : ${stats.totalDeduction} day(s)`,
        '',
        `Working Days       : ${stats.workingDays}`,
        `Excluded           : ${stats.excludedRows}`,
        `Total Rows         : ${stats.totalRows}`
      ].join('\n');
    }
  };

  window.AttendanceCalculator = AttendanceCalculator;
})();
