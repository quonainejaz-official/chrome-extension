/**
 * content.js
 * Content script injected into the attendance page.
 * Parses the DOM and sends results back to the popup.
 */

(function () {
  'use strict';

  if (window.__attendanceTrackerListenerAttached) return;
  window.__attendanceTrackerListenerAttached = true;

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'parseAttendance') {
      try {
        if (!window.AttendanceParser) {
          sendResponse({
            error: 'Parser not loaded. Please reload the page and try again.'
          });
          return true;
        }

        const parsed = window.AttendanceParser.parseAttendancePage();

        if (parsed.error) {
          sendResponse({ error: parsed.error });
          return true;
        }

        const stats = window.AttendanceCalculator.calculate(parsed.rows, request.settings);

        sendResponse({
          stats,
          rows: parsed.rows,
          timestamp: new Date().toISOString()
        });
      } catch (err) {
        sendResponse({
          error: `Parsing failed: ${err.message}`
        });
      }
      return true;
    }

    if (request.action === 'ping') {
      sendResponse({ status: 'ok' });
      return true;
    }
  });
})();
