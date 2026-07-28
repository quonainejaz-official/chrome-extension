/**
 * popup.js
 * Popup UI controller — orchestrates parsing, rendering, export, copy, and theme toggle.
 */

(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  let currentStats = null;
  let currentRows = null;
  const DEFAULT_SETTINGS = { officeStartTime: '11:15', graceMinutes: 60 };
  let currentSettings = { ...DEFAULT_SETTINGS };

  const elements = {
    spinner: $('spinner'),
    errorState: $('errorState'),
    errorMessage: $('errorMessage'),
    results: $('results'),
    pageStatus: $('pageStatus'),
    statOfficeShort: $('statOfficeShort'),
    statOfficeShortRemaining: $('statOfficeShortRemaining'),
    statGraceUsed: $('statGraceUsed'),
    statGraceRemaining: $('statGraceRemaining'),
    statInformedLate: $('statInformedLate'),
    statUninformedLate: $('statUninformedLate'),
    statLateDeduction: $('statLateDeduction'),
    statShortLeaveDays: $('statShortLeaveDays'),
    statShortLeaves: $('statShortLeaves'),
    statHalfLeaves: $('statHalfLeaves'),
    statFullLeaves: $('statFullLeaves'),
    statLeaveDeduction: $('statLeaveDeduction'),
    statTotalDeduction: $('statTotalDeduction'),
    metaWorkingDays: $('metaWorkingDays'),
    metaExcluded: $('metaExcluded'),
    timestamp: $('timestamp'),
    refreshBtn: $('refreshBtn'),
    copyBtn: $('copyBtn'),
    exportBtn: $('exportBtn'),
    themeToggle: $('themeToggle'),
    settingsToggle: $('settingsToggle'),
    settingsPanel: $('settingsPanel'),
    officeStartTime: $('officeStartTime'),
    graceMinutes: $('graceMinutes'),
    thresholdPreview: $('thresholdPreview'),
    saveSettingsBtn: $('saveSettingsBtn'),
    settingsRequiredHint: $('settingsRequiredHint'),
    detailsToggle: $('detailsToggle'),
    detailsPanel: $('detailsPanel'),
    lateTableBody: $('lateTableBody'),
    lateEmpty: $('lateEmpty'),
    leaveTableBody: $('leaveTableBody'),
    leaveEmpty: $('leaveEmpty'),
    toast: $('toast'),
    toastMessage: $('toastMessage'),
    sunIcon: $('sunIcon'),
    moonIcon: $('moonIcon')
  };

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function showView(view) {
    elements.spinner.classList.add('hidden');
    elements.errorState.classList.add('hidden');
    elements.results.classList.add('hidden');

    if (view === 'loading') elements.spinner.classList.remove('hidden');
    if (view === 'error') elements.errorState.classList.remove('hidden');
    if (view === 'results') elements.results.classList.remove('hidden');
  }

  function showToast(message) {
    elements.toastMessage.textContent = message;
    elements.toast.classList.remove('hidden');
    requestAnimationFrame(() => {
      elements.toast.classList.add('show');
    });
    setTimeout(() => {
      elements.toast.classList.remove('show');
      setTimeout(() => elements.toast.classList.add('hidden'), 300);
    }, 2000);
  }

  function renderStats(stats) {
    elements.statOfficeShort.textContent = stats.totalOfficeShort;
    elements.statOfficeShortRemaining.textContent = stats.officeShortRemaining;
    elements.statGraceUsed.textContent = stats.graceUsed;
    elements.statGraceRemaining.textContent = stats.graceRemaining;
    elements.statInformedLate.textContent = stats.informedLateDays;
    elements.statUninformedLate.textContent = stats.uninformedLateDays;
    elements.statLateDeduction.textContent = stats.lateDeduction;
    elements.statShortLeaveDays.textContent = stats.shortLeaveDays;
    elements.statShortLeaves.textContent = stats.shortLeaveCount;
    elements.statHalfLeaves.textContent = stats.halfLeaves;
    elements.statFullLeaves.textContent = stats.fullLeaves;
    elements.statLeaveDeduction.textContent = stats.leaveDeduction;
    elements.statTotalDeduction.textContent = stats.totalDeduction;
    elements.metaWorkingDays.textContent = `Working Days: ${stats.workingDays}`;
    elements.metaExcluded.textContent = `Excluded: ${stats.excludedRows}`;

    renderLateBreakdown(stats.lateBreakdown || []);
    renderLeaveBreakdown(stats.leaveBreakdown || []);
  }

  function renderLateBreakdown(rows) {
    elements.lateTableBody.innerHTML = '';
    elements.lateEmpty.classList.toggle('hidden', rows.length > 0);

    for (const row of rows) {
      const pillClass = row.status === 'Informed Late' ? 'informed' : 'uninformed';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(row.date)}</td>
        <td>${escapeHtml(row.checkIn)}</td>
        <td><span class="status-pill ${pillClass}">${escapeHtml(row.status)}</span></td>
        <td>${row.deduction || 0}</td>
      `;
      elements.lateTableBody.appendChild(tr);
    }
  }

  function renderLeaveBreakdown(rows) {
    elements.leaveTableBody.innerHTML = '';
    elements.leaveEmpty.classList.toggle('hidden', rows.length > 0);

    for (const row of rows) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(row.date)}</td>
        <td><span class="leave-pill">${escapeHtml(row.type)}</span></td>
        <td>${escapeHtml(row.reason)}</td>
        <td>${row.deduction || 0}</td>
      `;
      elements.leaveTableBody.appendChild(tr);
    }
  }

  function updateThresholdPreview() {
    const settings = {
      officeStartTime: elements.officeStartTime.value || '',
      graceMinutes: parseInt(elements.graceMinutes.value, 10) || 0
    };
    const label = window.AttendanceCalculator.getEffectiveThresholdLabel(settings);
    elements.thresholdPreview.textContent = label
      ? `Check-in after ${label} will be marked late (grace does not apply to lateness).`
      : 'Set a start time to enable check-in based late detection.';
  }

  function toggleDetailsPanel() {
    elements.detailsPanel.classList.toggle('hidden');
    elements.detailsToggle.classList.toggle('open');
  }

  async function loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(['officeStartTime', 'graceMinutes'], (data) => {
        currentSettings = {
          officeStartTime: data.officeStartTime || DEFAULT_SETTINGS.officeStartTime,
          graceMinutes: Number.isFinite(data.graceMinutes) ? data.graceMinutes : DEFAULT_SETTINGS.graceMinutes
        };
        elements.officeStartTime.value = currentSettings.officeStartTime;
        elements.graceMinutes.value = currentSettings.graceMinutes;
        updateThresholdPreview();
        resolve(currentSettings);
      });
    });
  }

  function saveSettings() {
    if (!elements.officeStartTime.value) {
      showToast('Please set an Office Start Time first.');
      return;
    }

    currentSettings = {
      officeStartTime: elements.officeStartTime.value || '',
      graceMinutes: parseInt(elements.graceMinutes.value, 10) || 0
    };
    chrome.storage.sync.set(currentSettings, () => {
      showToast('Settings saved!');
      elements.settingsRequiredHint.hidden = true;
      elements.settingsPanel.classList.add('hidden');
      parseAttendance();
    });
  }

  function toggleSettingsPanel() {
    elements.settingsPanel.classList.toggle('hidden');
  }

  function loadTheme() {
    const saved = localStorage.getItem('attendance-tracker-theme');
    if (saved === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      elements.sunIcon.classList.add('hidden');
      elements.moonIcon.classList.remove('hidden');
    }
  }

  function toggleTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (isDark) {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('attendance-tracker-theme', 'light');
      elements.sunIcon.classList.remove('hidden');
      elements.moonIcon.classList.add('hidden');
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('attendance-tracker-theme', 'dark');
      elements.sunIcon.classList.add('hidden');
      elements.moonIcon.classList.remove('hidden');
    }
  }

  async function parseAttendance() {
    showView('loading');
    elements.pageStatus.textContent = 'Analyzing attendance page...';

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab) {
        throw new Error('No active tab found.');
      }

      if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://'))) {
        throw new Error('Cannot access browser pages.');
      }

      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['attendanceParser.js', 'attendanceCalculator.js', 'content.js']
        });
      } catch (injectionErr) {
        // Scripts may already be injected — proceed anyway
      }

      const response = await new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tab.id, { action: 'parseAttendance', settings: currentSettings }, (resp) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(resp);
          }
        });
      });

      if (!response) {
        throw new Error('No response from page. Make sure you are on the attendance page.');
      }

      if (response.error) {
        throw new Error(response.error);
      }

      currentStats = response.stats;
      currentRows = response.rows;

      renderStats(currentStats);

      const ts = response.timestamp ? new Date(response.timestamp) : new Date();
      elements.timestamp.textContent = `Last updated: ${ts.toLocaleTimeString()}`;
      elements.pageStatus.textContent = `${response.rows.length} rows analyzed`;
      showView('results');

    } catch (err) {
      elements.errorMessage.textContent = err.message || 'An unexpected error occurred.';
      showView('error');
    }
  }

  function copySummary() {
    if (!currentStats) return;

    const text = window.AttendanceCalculator.toPlainText(currentStats);
    navigator.clipboard.writeText(text).then(() => {
      showToast('Summary copied to clipboard!');
    }).catch(() => {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      showToast('Summary copied to clipboard!');
    });
  }

  function exportPDF() {
    if (!currentStats) return;

    const html = window.AttendanceCalculator.toPrintableHTML(currentStats);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);

    // Open the printable summary in a new tab; its onload triggers the print
    // dialog where the user can choose "Save as PDF".
    chrome.tabs.create({ url }, () => {
      showToast('Opening print dialog — choose "Save as PDF".');
      // Revoke after the tab has had time to load the blob.
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    });
  }

  loadTheme();

  elements.themeToggle.addEventListener('click', toggleTheme);
  elements.settingsToggle.addEventListener('click', toggleSettingsPanel);
  elements.saveSettingsBtn.addEventListener('click', saveSettings);
  elements.detailsToggle.addEventListener('click', toggleDetailsPanel);
  elements.officeStartTime.addEventListener('input', updateThresholdPreview);
  elements.graceMinutes.addEventListener('input', updateThresholdPreview);
  elements.refreshBtn.addEventListener('click', parseAttendance);
  elements.copyBtn.addEventListener('click', copySummary);
  elements.exportBtn.addEventListener('click', exportPDF);

  (async () => {
    await loadSettings();
    if (!currentSettings.officeStartTime) {
      elements.settingsRequiredHint.hidden = false;
      elements.settingsPanel.classList.remove('hidden');
      showView('error');
      elements.errorMessage.textContent = 'Set your Office Start Time and Grace Minutes above, then Save & Recalculate.';
      return;
    }
    parseAttendance();
  })();
})();
