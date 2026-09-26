'use strict';
(() => {
  const storageKey = 'travel_guangxi_2026_preferences_v1';
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(storageKey) || '{}') || {}; } catch {}
  const checks = [...document.querySelectorAll('[data-check]')];
  const days = [...document.querySelectorAll('.day')];
  const filter = document.getElementById('day-filter');
  const fontButton = document.getElementById('font-button');
  const status = document.getElementById('check-status');
  const storageStatus = document.getElementById('storage-status');

  function persist() {
    const state = {
      checks: Object.fromEntries(checks.map(input => [input.dataset.check, input.checked])),
      largeText: document.body.classList.contains('large-text')
    };
    try { localStorage.setItem(storageKey, JSON.stringify(state)); }
    catch { storageStatus.textContent = '当前浏览器无法保存勾选记录，关闭页面后可能丢失。'; }
  }
  function updateProgress() {
    status.textContent = `已完成 ${checks.filter(input => input.checked).length} / ${checks.length}`;
  }
  checks.forEach(input => {
    input.checked = saved.checks?.[input.dataset.check] === true;
    input.addEventListener('change', () => { updateProgress(); persist(); });
  });
  updateProgress();

  function setLargeText(enabled) {
    document.body.classList.toggle('large-text', enabled);
    fontButton.setAttribute('aria-pressed', String(enabled));
    fontButton.textContent = enabled ? '标准字号' : '放大字号';
  }
  setLargeText(saved.largeText === true);
  fontButton.addEventListener('click', () => {
    setLargeText(!document.body.classList.contains('large-text'));
    persist();
  });

  filter.addEventListener('change', () => {
    days.forEach(day => {
      day.hidden = filter.value !== 'all' && day.id !== filter.value;
      if (!day.hidden && filter.value !== 'all') day.open = true;
    });
  });
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  days.forEach(day => day.classList.toggle('today', day.dataset.date === today));

  let printState;
  window.addEventListener('beforeprint', () => {
    if (printState) return;
    printState = days.map(day => ({ open: day.open, hidden: day.hidden }));
    days.forEach(day => { day.open = true; day.hidden = false; });
  });
  window.addEventListener('afterprint', () => {
    if (!printState) return;
    days.forEach((day, index) => Object.assign(day, printState[index]));
    printState = undefined;
  });
  document.getElementById('print-button').addEventListener('click', () => window.print());
})();
