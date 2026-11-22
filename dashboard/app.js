// Token Radar's dashboard: a sortable, filterable board of pre-token protocols, a detail view
// for each one, and the calibration the value model is built on.
//
// The data comes from data.js (window.RADAR), written by main.ts from the same board as
// board.json. Rows are compact arrays; the layout is:
//
//   [rank, slug, name, catIdx, chainIdxs, tvl, change7d, ageDays, implied,
//    multiple, growthMult, ageMult, chainMult, groupIdx, variant]
//
// Farm plans render here from the same templates main.ts uses (RADAR.steps and RADAR.actions),
// so the plan a reader sees is the plan the board carries, string for string. State lives in
// the URL hash, so a board, a detail view and a filtered view each have an address.
(function () {
  'use strict';
  var D = window.RADAR;
  if (!D) {
    document.getElementById('radar').innerHTML = '<div class="wrap"><p class="empty">No radar data: data.js did not load.</p></div>';
    return;
  }

  var WATCHLIST = {};
  D.watchlist.forEach(function (s) { WATCHLIST[s] = true; });

  /* ---------- formatting ---------- */
  function fmtUsd(n) {
    if (n === null || n === undefined) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined) return '—';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return '—';
    if (days < 365) return days + 'd';
    return (days / 365).toFixed(1) + 'y';
  }
  function fmtMult(n) { return '×' + n.toFixed(2); }
  function fmtInt(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ---------- farm plans: the same templates and rules as lib/model.ts ---------- */
  function capitalFor(tvl) {
    if (tvl >= 2e9) return 200;
    if (tvl >= 5e8) return 120;
    if (tvl >= 1e8) return 75;
    return 40;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 45;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function gasFor(chain) {
    if (chain === 'Ethereum') return '$6 of gas';
    if (chain === 'Solana') return '$0.10 in fees';
    if (chain === 'Base' || chain === 'Arbitrum' || chain === 'Optimism' || chain === 'Polygon' || chain === 'Binance' || chain === 'Avalanche') return '$0.50 of gas';
    return '$2 of gas';
  }
  function fill(template, values) {
    var out = template;
    Object.keys(values).forEach(function (k) { out = out.split('{' + k + '}').join(values[k]); });
    return out;
  }
  function farmSteps(row) {
    var group = D.groups[row[13]];
    var action = D.actions[group] || D.actions.other;
    var chain = row[4].length > 0 ? D.chains[row[4][0]] : 'its main chain';
    var capital = '$' + capitalFor(row[5]);
    var values = {
      action: fill(action.action, { name: row[2], chain: chain, capital: capital }),
      weekly: action.weekly,
      name: row[2],
      chain: chain,
      capital: capital,
      hold: String(holdDaysFor(row[7])),
      gas: gasFor(chain),
      tvl: fmtUsd(row[5]),
      growth: row[6] === null ? 'an unreported amount' : fmtPct(row[6]),
      age: row[7] === null ? 'an unreported time' : fmtAge(row[7]),
      implied: fmtUsd(row[8]),
    };
    return [
      fill(D.steps[7], values),
      fill(D.steps[0], values),
      fill(D.steps[1], values),
      fill(D.steps[2 + row[14]], values),
      fill(D.steps[4], values),
      fill(D.steps[5], values),
      fill(D.steps[6], values),
      fill(D.steps[8], values),
    ];
  }

  /* ---------- state ---------- */
  function readHash() {
    var p = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    var sort = p.get('sort') || 'rank';
    // Rank and name read best ascending; the value columns read best descending.
    var dir = p.get('dir') ? (p.get('dir') === 'asc' ? 1 : -1) : (sort === 'rank' || sort === 'name' ? 1 : -1);
    return {
      q: p.get('q') || '',
      cat: p.get('cat') || 'all',
      chain: p.get('chain') || 'all',
      min: p.get('min') || '0',
      sort: sort,
      dir: dir,
      detail: p.get('detail') || '',
      tab: p.get('tab') === 'live' ? 'live' : 'board',
      wl: p.get('wl') === '1',
    };
  }
  function writeHash(state) {
    var p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.cat !== 'all') p.set('cat', state.cat);
    if (state.chain !== 'all') p.set('chain', state.chain);
    if (state.min !== '0') p.set('min', state.min);
    if (state.sort !== 'rank') p.set('sort', state.sort);
    if (state.dir === 1) p.set('dir', 'asc');
    if (state.detail) p.set('detail', state.detail);
    if (state.tab === 'live') p.set('tab', 'live');
    if (state.wl) p.set('wl', '1');
    var h = p.toString();
    history.replaceState(null, '', h ? '#' + h : '#');
  }
  var state = readHash();

  /* ---------- filtering and sorting ---------- */
  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    var list = D.rows.filter(function (r) {
      if (state.wl && !WATCHLIST[r[1]]) return false;
      if (state.cat !== 'all' && D.categories[r[3]] !== state.cat) return false;
      if (state.chain !== 'all' && r[4].map(function (i) { return D.chains[i]; }).indexOf(state.chain) === -1) return false;
      if (state.min !== '0' && r[5] < Number(state.min)) return false;
      if (q && r[2].toLowerCase().indexOf(q) === -1 && r[1].toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    var key = state.sort;
    var dir = state.dir;
    var get = {
      rank: function (r) { return r[0]; },
      implied: function (r) { return r[8]; },
      tvl: function (r) { return r[5]; },
      change: function (r) { return r[6] === null ? -Infinity : r[6]; },
      age: function (r) { return r[7] === null ? -1 : r[7]; },
      name: function (r) { return r[2].toLowerCase(); },
    }[key] || function (r) { return r[0]; };
    list.sort(function (a, b) {
      var va = get(a), vb = get(b);
      if (va < vb) return -dir;
      if (va > vb) return dir;
      return a[1] < b[1] ? -1 : 1;
    });
    return list;
  }

  /* ---------- pieces ---------- */
  function el(html) {
    var t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstChild;
  }
  function sortHeader(key, label, numeric) {
    var arrow = state.sort === key ? (state.dir === 1 ? ' ▲' : ' ▼') : '';
    return '<th class="' + (numeric ? 'num' : '') + '"><button type="button" data-sort="' + key + '">' + esc(label) + arrow + '</button></th>';
  }
  function chainList(row) {
    return row[4].map(function (i) { return esc(D.chains[i]); }).join(', ');
  }
  function rowHtml(r) {
    var chg = r[6];
    var chgCls = chg === null ? 'muted' : chg >= 0 ? 'pos' : 'neg';
    return '<tr data-slug="' + esc(r[1]) + '" data-selected="' + (state.detail === r[1]) + '">' +
      '<td class="num">' + r[0] + '</td>' +
      '<td class="name"><b>' + esc(r[2]) + '</b><span>' + esc(r[1]) + '</span>' + (WATCHLIST[r[1]] ? '<span class="tag wl">Watchlist</span>' : '') + '</td>' +
      '<td>' + esc(D.categories[r[3]]) + '</td>' +
      '<td class="muted">' + chainList(r) + '</td>' +
      '<td class="num">' + fmtUsd(r[5]) + '</td>' +
      '<td class="num ' + chgCls + '">' + fmtPct(chg) + '</td>' +
      '<td class="num">' + fmtAge(r[7]) + '</td>' +
      '<td class="num"><b>' + fmtUsd(r[8]) + '</b></td>' +
      '</tr>';
  }
  function detailHtml(r) {
    var steps = farmSteps(r);
    var inCalibration = D.calibration.some(function (c) { return c[0] === D.categories[r[3]]; });
    var multText = inCalibration
      ? 'The multiple is the ' + esc(D.categories[r[3]]) + ' geometric-mean market-cap-to-TVL ratio among its launched peers'
      : 'The multiple is the global geometric-mean market-cap-to-TVL ratio among launched protocols (' + esc(D.categories[r[3]]) + ' has too few launched peers to calibrate its own)';
    return '<section class="panel detail" id="detail">' +
      '<div class="head"><h2>' + esc(r[2]) + '</h2><span class="slug">' + esc(r[1]) + '</span>' +
      (WATCHLIST[r[1]] ? '<span class="tag wl">Watchlist</span>' : '') +
      '<button type="button" data-close-detail>Close</button></div>' +
      '<div class="grid">' +
      '<div class="kv"><span>Implied value</span><b>' + fmtUsd(r[8]) + '</b></div>' +
      '<div class="kv"><span>TVL</span><b>' + fmtUsd(r[5]) + '</b></div>' +
      '<div class="kv"><span>7-day change</span><b>' + fmtPct(r[6]) + '</b></div>' +
      '<div class="kv"><span>Age</span><b>' + fmtAge(r[7]) + '</b></div>' +
      '<div class="kv"><span>Category</span><b>' + esc(D.categories[r[3]]) + '</b></div>' +
      '<div class="kv"><span>Chains</span><b>' + chainList(r) + '</b></div>' +
      '<div class="kv"><span>Token status</span><b>Records no token</b></div>' +
      '<div class="kv"><span>Rank</span><b>#' + r[0] + ' of ' + D.rows.length + '</b></div>' +
      '</div>' +
      '<div class="model"><h3>How the value is modelled</h3>' +
      '<p><code>' + fmtInt(r[5]) + ' TVL × ' + r[9].toFixed(4) + ' multiple × ' + r[10].toFixed(4) + ' growth × ' + r[11].toFixed(4) + ' age × ' + r[12].toFixed(4) + ' chains = ' + fmtInt(r[8]) + '</code></p>' +
      '<p>' + multText + '; growth follows the 7-day TVL change, age follows how long the protocol has run with no token, and chains follow how many chains it runs on. The value is this radar\u2019s own claim, not a prediction that a token is issued.</p>' +
      '</div>' +
      '<div class="steps"><h3>Farm plan: eight steps</h3><ol>' +
      steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') +
      '</ol></div>' +
      '</section>';
  }

  /* ---------- render ---------- */
  function render() {
    var root = document.getElementById('radar');
    var cats = Array.from(new Set(D.rows.map(function (r) { return D.categories[r[3]]; }))).sort();
    var chains = Array.from(new Set(D.rows.flatMap(function (r) { return r[4].map(function (i) { return D.chains[i]; }); }))).sort();
    var list = state.tab === 'board' ? filteredRows() : [];
    var detailRow = state.detail ? D.rows.find(function (r) { return r[1] === state.detail; }) : null;

    var html = '<div class="wrap">' +
      '<header class="topbar"><div class="brand"><span class="mark"></span><h1>TOKEN <span>RADAR</span></h1></div>' +
      '<div class="top-meta">Snapshot ' + esc(D.as_of) + ' · Floor ' + fmtUsd(D.floor_usd) + ' · Model ' + esc(D.model_version) + '</div></header>' +
      '<p class="lede">Every protocol DefiLlama tracks, read once: which ones <b>record no token</b> yet, what a launch would be worth if their record stayed as it is, and <b>how to farm each one</b>. The board covers all ' + D.watchlist_size + ' protocols on the snapshot\u2019s watchlist, then the early ones below the floor. Implied value is this radar\u2019s own claim, never a prediction that a token is issued.</p>' +
      '<div class="facts">' +
      '<div class="fact"><b>' + D.board_size + '</b><span>protocols ranked</span></div>' +
      '<div class="fact"><b>' + D.watchlist_size + '</b><span>on the watchlist</span></div>' +
      '<div class="fact"><b>' + D.early_size + '</b><span>early finds below the floor</span></div>' +
      '<div class="fact"><b>' + fmtMult(D.global_multiple) + ' <em>geometric mean</em></b><span>global mcap / TVL of launched peers</span></div>' +
      '</div>' +
      '<div class="controls">' +
      '<div class="field"><label for="q">Search</label><input id="q" type="search" placeholder="Name or slug" value="' + esc(state.q) + '"></div>' +
      '<div class="field"><label for="cat">Category</label><select id="cat"><option value="all">All categories</option>' +
      cats.map(function (c) { return '<option value="' + esc(c) + '"' + (state.cat === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label for="chain">Chain</label><select id="chain"><option value="all">All chains</option>' +
      chains.map(function (c) { return '<option value="' + esc(c) + '"' + (state.chain === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label for="min">Min TVL</label><select id="min">' +
      [['0', 'Any TVL'], ['100000000', '≥ $100M'], ['500000000', '≥ $500M'], ['1000000000', '≥ $1B']].map(function (o) { return '<option value="' + o[0] + '"' + (state.min === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></div>' +
      '<label class="check"><input id="wl" type="checkbox"' + (state.wl ? ' checked' : '') + '> Watchlist only</label>' +
      '<div class="tabs" role="group" aria-label="Board or launched peers">' +
      '<button type="button" data-tab="board" aria-pressed="' + (state.tab === 'board') + '">Ranked board</button>' +
      '<button type="button" data-tab="live" aria-pressed="' + (state.tab === 'live') + '">Launched peers</button>' +
      '</div>' +
      '<span class="count">' + (state.tab === 'board' ? list.length + ' of ' + D.rows.length + ' protocols' : D.live.length + ' launched peers') + '</span>' +
      '</div>';

    if (detailRow && state.tab === 'board') html += detailHtml(detailRow);

    if (state.tab === 'board') {
      html += '<div class="panel" id="board-table"><table><thead><tr>' +
        sortHeader('rank', '#') + sortHeader('name', 'Protocol') + '<th>Category</th>' +
        '<th>Chains</th>' +
        sortHeader('tvl', 'TVL', true) + sortHeader('change', '7d', true) + sortHeader('age', 'Age', true) + sortHeader('implied', 'Implied value', true) +
        '</tr></thead><tbody>';
      html += list.length === 0
        ? '<tr><td colspan="8"><div class="empty"><h2>No protocol matches that filter</h2><button type="button" data-clear-filters>Clear filters</button></div></td></tr>'
        : list.map(rowHtml).join('');
      html += '</tbody></table></div>';
    } else {
      html += '<div class="panel" id="board-table"><table><thead><tr><th>Protocol</th><th>Category</th><th>Chains</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">mcap / TVL</th><th class="num">7d</th></tr></thead><tbody>' +
        D.live.map(function (r) {
          var ratio = r[5] !== null && r[5] > 0 ? (r[5] / r[4]).toFixed(2) : '—';
          var chg = r[6];
          var chgCls = chg === null ? 'muted' : chg >= 0 ? 'pos' : 'neg';
          return '<tr><td class="name"><b>' + esc(r[1]) + '</b><span>' + esc(r[0]) + '</span></td>' +
            '<td>' + esc(D.categories[r[2]]) + '</td>' +
            '<td class="muted">' + r[3].map(function (i) { return esc(D.chains[i]); }).join(', ') + '</td>' +
            '<td class="num">' + fmtUsd(r[4]) + '</td>' +
            '<td class="num">' + fmtUsd(r[5]) + '</td>' +
            '<td class="num">' + ratio + '</td>' +
            '<td class="num ' + chgCls + '">' + fmtPct(chg) + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        '<p class="muted" style="margin:10px 2px 0">These are the launched peers: protocols whose token already trades, shown at the market\u2019s own values. Their market-cap-to-TVL ratios calibrate every category\u2019s multiple below; they are never ranked as launches.</p>';
    }

    html += '<section class="section calibration"><h2>Calibration: where the multiples come from</h2>' +
      '<p>Each category\u2019s multiple is the geometric-mean market-cap-to-TVL ratio of its launched protocols: ratios are log-normal, so the geometric mean is the right centre. A category with fewer than ' + D.model.min_peers + ' launched peers falls back to the global geometric mean, ' + fmtMult(D.global_multiple) + '. Backtested on the snapshot\u2019s ' + D.calibration_peers + ' launched protocols, this model predicts their actual market cap within 2x for about 27% of them, and within 3x for about 34%.</p>' +
      '<div class="panel"><table><thead><tr><th>Category</th><th class="num">Launched peers</th><th class="num">Median mcap / TVL</th><th class="num">Multiple used</th></tr></thead><tbody>' +
      D.calibration.map(function (c) {
        return '<tr><td>' + esc(c[0]) + '</td><td class="num">' + c[1] + '</td><td class="num">' + fmtMult(c[2]) + '</td><td class="num">' + fmtMult(c[2]) + '</td></tr>';
      }).join('') +
      '<tr><td>All launched protocols <span class="muted">(global fallback)</span></td><td class="num">' + D.calibration_peers + '</td><td class="num">' + fmtMult(D.global_multiple) + '</td><td class="num">' + fmtMult(D.global_multiple) + '</td></tr>' +
      '</tbody></table></div></section>' +

      '<section class="section method"><h2>Method, in one paragraph</h2>' +
      '<p>Implied value = TVL × multiple × growth × age × chains. The multiple is the category\u2019s calibrated geometric mean above. Growth is 1 + 0.40 × the 7-day TVL change, clamped to −50%…+100%. Age is 1 + 0.08 × years since listing, capped at 4 years; a protocol with no listing date counts as 1.00. Chains is 1 + 0.04 per extra chain, capped at 5. A protocol ranks when its record carries no token (no market cap, no CoinGecko id, no symbol) and it is not a wrapped, staked or bridged product, not an exchange and not a versioned pool. Above the $50M floor the house watchlist is the authority, because the snapshot carries no parent-protocol field; below it the radar finds the early ones the watchlist does not name.</p></section>' +

      '<div class="note"><b>Read the board honestly.</b> \u201CRecords no token\u201D means the snapshot\u2019s DefiLlama record carries none: a protocol on this board may still have a token its record does not carry. Implied value is what a launch would be worth if the protocol\u2019s record stayed as it is; it does not predict whether or when a token is issued, and farming never pays to claim: never pay a fee to claim a reward.</div>' +

      '<footer><p>Data: ' + esc(D.source) + ' · Snapshot as of ' + esc(D.as_of) + ' · Watchlist floor ' + fmtUsd(D.floor_usd) + '.</p>' +
      '<p>Token Radar, model ' + esc(D.model_version) + ' · ' + D.board_size + ' rows · Built from the sealed snapshot alone; the page makes no network request.</p></footer>' +
      '</div>';

    root.innerHTML = html;
    root.setAttribute('aria-busy', 'false');
    bind();
  }

  /* ---------- events ---------- */
  function bind() {
    var root = document.getElementById('radar');
    var q = document.getElementById('q');
    if (q) q.addEventListener('input', function () {
      state.q = q.value; state.detail = ''; writeHash(state); render();
      // render() rebuilds the controls: put the caret back where the reader was typing.
      var nq = document.getElementById('q');
      nq.focus();
      nq.setSelectionRange(nq.value.length, nq.value.length);
    });
    var cat = document.getElementById('cat');
    if (cat) cat.addEventListener('change', function () { state.cat = cat.value; writeHash(state); render(); });
    var chain = document.getElementById('chain');
    if (chain) chain.addEventListener('change', function () { state.chain = chain.value; writeHash(state); render(); });
    var min = document.getElementById('min');
    if (min) min.addEventListener('change', function () { state.min = min.value; writeHash(state); render(); });
    var wl = document.getElementById('wl');
    if (wl) wl.addEventListener('change', function () { state.wl = wl.checked; writeHash(state); render(); });
    root.querySelectorAll('[data-tab]').forEach(function (b) {
      b.addEventListener('click', function () { state.tab = b.getAttribute('data-tab'); state.detail = ''; writeHash(state); render(); });
    });
    root.querySelectorAll('[data-sort]').forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.getAttribute('data-sort');
        if (state.sort === k) state.dir = -state.dir; else { state.sort = k; state.dir = (k === 'name' || k === 'rank') ? 1 : -1; }
        writeHash(state); render();
      });
    });
    root.querySelectorAll('tbody tr[data-slug]').forEach(function (tr) {
      tr.addEventListener('click', function () {
        state.detail = state.detail === tr.getAttribute('data-slug') ? '' : tr.getAttribute('data-slug');
        writeHash(state); render();
        var d = document.getElementById('detail');
        if (d) d.scrollIntoView({ block: 'start' });
      });
    });
    var close = root.querySelector('[data-close-detail]');
    if (close) close.addEventListener('click', function () { state.detail = ''; writeHash(state); render(); });
    var clear = root.querySelector('[data-clear-filters]');
    if (clear) clear.addEventListener('click', function () {
      state.q = ''; state.cat = 'all'; state.chain = 'all'; state.min = '0'; state.wl = false;
      writeHash(state); render();
    });
  }

  window.addEventListener('hashchange', function () { state = readHash(); render(); });
  render();
})();
