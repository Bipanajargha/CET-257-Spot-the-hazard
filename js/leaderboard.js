/* leaderboard.js — renders the leaderboard list from Storage data */

const Leaderboard = {
  currentTab: 'week',

  render() {
    const listEl = document.getElementById('leaderboard-list');
    const all = Storage.getLeaderboard();
    const player = Storage.getPlayerName();

    let entries = all;
    if (this.currentTab === 'week') {
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      entries = all.filter((e) => new Date(e.date).getTime() >= weekAgo);
    }

    entries = [...entries].sort((a, b) => b.score - a.score).slice(0, 10);

    listEl.innerHTML = '';
    if (entries.length === 0) {
      listEl.innerHTML = '<div class="lb-empty">No scores yet — play a level to be the first on the board!</div>';
      return;
    }

    entries.forEach((entry, i) => {
      const row = document.createElement('div');
      row.className = 'lb-row' + (entry.name === player ? ' me' : '');
      row.innerHTML = `
        <div class="lb-rank">${i + 1}</div>
        <div class="lb-name">${escapeHtml(entry.name)}</div>
        <div class="lb-score">${entry.score}</div>
      `;
      listEl.appendChild(row);
    });
  },

  setTab(tab) {
    this.currentTab = tab;
    document.querySelectorAll('.tab-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
    this.render();
  }
};

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
