(() => {
  'use strict';

  const data = window.EtfData;
  const byId = (id) => document.getElementById(id);
  const pageSize = 12;
  const pollInterval = 60_000;
  const number = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 });
  const short = new Intl.NumberFormat('ko-KR', { notation: 'compact', maximumFractionDigits: 1 });
  const time = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  const dimensions = { manager: '운용사', market: '시장', product: '상품' };
  const metrics = { volume: ['합산 거래량', '주'], count: ['종목 수', '개'], tradingValue: ['합산 거래대금', '원'] };
  const dimensionButtons = [...document.querySelectorAll('.segmented [data-dimension]')];
  const navLinks = [...document.querySelectorAll('.side-nav a')];
  const filters = Object.fromEntries(Object.keys(dimensions).map((key) => [key, byId('filter-' + key)]));
  const sourceDialog = byId('source-dialog');
  let snapshot = data.sample;
  let mode = 'sample';
  let dimension = 'manager';
  let page = 1;
  let feed = null;
  let inputVersion = 0;

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
  }

  function button(className, label, action) {
    const element = node('button', className, label);
    element.type = 'button';
    element.addEventListener('click', action);
    return element;
  }

  function formatValue(value, unit = '') {
    return value == null ? '—' : number.format(value) + unit;
  }

  function rateText(value) {
    return value == null ? '—' : (value > 0 ? '+' : '') + value.toFixed(2) + '%';
  }

  function rateTone(value) {
    return value > 0 ? 'rise' : value < 0 ? 'fall' : 'flat';
  }

  function searchable(text) {
    return text.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
  }

  function filteredRows() {
    const query = searchable(byId('search').value);
    return snapshot.rows.filter((row) =>
      (!query || searchable(row.name).includes(query) || row.code.toLowerCase().includes(query)) &&
      Object.entries(filters).every(([key, field]) => !field.value || row[key] === field.value)
    );
  }

  function descending(a, b) {
    if (a == null) return b == null ? 0 : 1;
    return b == null ? -1 : b - a;
  }

  function sortRows(rows, sort) {
    return [...rows].sort((a, b) => {
      let difference;
      switch (sort) {
        case 'name': difference = a.name.localeCompare(b.name, 'ko'); break;
        case 'changeDesc': difference = b.change - a.change; break;
        case 'changeAsc': difference = a.change - b.change; break;
        default: difference = descending(a[sort], b[sort]);
      }
      return difference || a.code.localeCompare(b.code);
    });
  }

  function populateFilters(reset) {
    for (const [key, field] of Object.entries(filters)) {
      const values = [...new Set(snapshot.rows.map((row) => row[key]))].sort((a, b) => a.localeCompare(b, 'ko'));
      const selected = !reset && values.includes(field.value) ? field.value : '';
      const all = node('option', '', '전체');
      all.value = '';
      field.replaceChildren(all, ...values.map((value) => {
        const option = node('option', '', value);
        option.value = value;
        return option;
      }));
      field.value = selected;
    }
  }

  function renderSummary(rows) {
    const total = rows.length;
    const risingCount = rows.filter((row) => row.change > 0).length;
    const fallingCount = rows.filter((row) => row.change < 0).length;
    const volume = rows.reduce((sum, row) => sum + row.volume, 0);
    const mean = total ? rows.reduce((sum, row) => sum + row.change / total, 0) : null;
    byId('kpi-count').textContent = formatValue(total, '개');
    byId('kpi-count-note').textContent = '전체 ' + formatValue(snapshot.rows.length, '개') + ' 중';
    byId('kpi-volume').textContent = formatValue(volume, '주');
    byId('kpi-rising').textContent = formatValue(risingCount, '개');
    byId('kpi-rising-note').textContent = '하락 ' + number.format(fallingCount) + ' · 보합 ' +
      number.format(total - risingCount - fallingCount);
    const change = byId('kpi-change');
    change.textContent = rateText(mean);
    change.className = rateTone(mean);
  }

  function renderChart(rows) {
    const chart = byId('breakdown-chart');
    const metric = byId('chart-metric').value;
    const [label, unit] = metrics[metric];
    byId('breakdown-title').textContent = dimensions[dimension] + '별 비교';
    byId('breakdown-subtitle').textContent = '분류별 ' + label + (metric === 'count' ? '가' : '이') + ' 많은 순서입니다.';
    dimensionButtons.forEach((item) => item.setAttribute('aria-pressed', String(item.dataset.dimension === dimension)));
    chart.replaceChildren();

    const groups = new Map();
    let missing = 0;
    for (const row of rows) {
      const value = metric === 'count' ? 1 : row[metric];
      if (value == null) {
        missing += 1;
        continue;
      }
      const key = row[dimension];
      groups.set(key, (groups.get(key) ?? 0) + value);
    }
    const ranked = [...groups].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'));
    if (!ranked.length) {
      chart.append(node('p', 'empty', rows.length ? '거래대금을 제공하는 종목이 없습니다.' : '조회 조건에 맞는 종목이 없습니다.'));
      return;
    }
    const top = ranked[0][1];
    for (const [name, value] of ranked) {
      const field = filters[dimension];
      const selected = field.value === name;
      const item = button('chart-row', null, () => {
        field.value = selected ? '' : name;
        page = 1;
        render();
        [...chart.querySelectorAll('button')].find((target) => target.dataset.group === name)?.focus();
      });
      item.dataset.group = name;
      item.setAttribute('aria-pressed', String(selected));
      item.setAttribute('aria-label', name + ' ' + formatValue(value, unit) + ' 필터');
      const track = node('span', 'chart-track');
      track.setAttribute('aria-hidden', 'true');
      const fill = node('span', 'chart-fill');
      fill.style.setProperty('--bar-width', (top > 0 ? (value / top) * 100 : 0) + '%');
      track.append(fill);
      const total = node('span', 'chart-value', short.format(value) + unit);
      total.title = formatValue(value, unit);
      item.append(node('span', 'chart-label', name), track, total);
      chart.append(item);
    }
    if (missing) {
      chart.append(node('p', 'chart-coverage', '거래대금이 없는 ' + number.format(missing) + '개 종목은 합산에서 제외했습니다.'));
    }
  }

  function showDetail(row) {
    byId('detail-code').textContent = row.code;
    byId('detail-title').textContent = row.name;
    const values = [
      ['운용사', row.manager], ['시장', row.market], ['상품', row.product], ['가격', formatValue(row.price, '원')],
      ['등락률', rateText(row.change), rateTone(row.change)], ['거래량', formatValue(row.volume, '주')],
      ['거래대금', formatValue(row.tradingValue, '원')], ['NAV', formatValue(row.nav, '원')],
    ];
    byId('detail-values').replaceChildren(...values.map(([key, value, tone]) => {
      const field = node('div');
      field.append(node('dt', '', key), node('dd', tone, value));
      return field;
    }));
    byId('detail-asof').textContent = snapshot.source + ' · ' + time.format(new Date(snapshot.asOf)) + ' KST';
    byId('detail-dialog').showModal();
  }

  function renderLeaders(rows) {
    const list = byId('leaders');
    const leaders = sortRows(rows, 'volume').slice(0, 5);
    if (!leaders.length) {
      list.replaceChildren(node('li', 'empty', '조회 조건에 맞는 종목이 없습니다.'));
      return;
    }
    list.replaceChildren(...leaders.map((row, index) => {
      const item = node('li');
      const action = button('leader', null, () => showDetail(row));
      const caption = node('span');
      caption.append(node('span', 'leader-name', row.name), node('span', 'leader-detail', formatValue(row.volume, '주')));
      action.append(
        node('span', 'leader-rank', index + 1), caption,
        node('span', 'leader-rate ' + rateTone(row.change), rateText(row.change)),
      );
      item.append(action);
      return item;
    }));
  }

  function renderTable(rows) {
    const body = byId('etf-rows');
    const sorted = sortRows(rows, byId('sort').value);
    const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
    page = Math.min(page, pages);
    const offset = (page - 1) * pageSize;
    byId('match-count').textContent = '조회 종목 ' + formatValue(sorted.length, '개') + ' / 전체 ' + formatValue(snapshot.rows.length, '개');
    byId('page-label').textContent = sorted.length
      ? number.format(offset + 1) + '–' + number.format(Math.min(sorted.length, offset + pageSize)) + ' / ' + number.format(sorted.length)
      : '조회 결과 없음';
    byId('prev-page').disabled = page <= 1;
    byId('next-page').disabled = page >= pages;
    if (!sorted.length) {
      const row = node('tr');
      const cell = node('td', 'empty', '조회 조건에 맞는 종목이 없습니다.');
      cell.colSpan = 8;
      row.append(cell);
      body.replaceChildren(row);
      return;
    }
    body.replaceChildren(...sorted.slice(offset, offset + pageSize).map((row) => {
      const tr = node('tr');
      const title = node('td');
      const symbol = button('symbol', row.name, () => showDetail(row));
      symbol.setAttribute('aria-label', row.name + ' ' + row.code + ' 상세');
      symbol.append(node('span', 'ticker', row.code));
      title.append(symbol);
      const market = node('td');
      market.append(node('span', 'tag', row.market));
      tr.append(
        title, node('td', '', row.manager), market, node('td', '', row.product),
        node('td', 'number', formatValue(row.price)), node('td', 'number ' + rateTone(row.change), rateText(row.change)),
        node('td', 'number', formatValue(row.volume)), node('td', 'number', formatValue(row.tradingValue)),
      );
      return tr;
    }));
  }

  function render() {
    const rows = filteredRows();
    renderSummary(rows);
    renderChart(rows);
    renderLeaders(rows);
    renderTable(rows);
  }

  function renderSource() {
    const badge = byId('source-mode');
    const retained = feed?.failed && mode !== 'sample' && mode !== 'file';
    const displayedMode = retained ? 'retained' : mode;
    const labels = { sample: '예제 데이터', file: '파일 데이터', feed: 'API 연결됨', paused: '마지막 API 데이터', retained: '갱신 실패' };
    const modeNotes = {
      sample: '합성 데이터 · 실제 시세가 아닙니다.',
      file: '파일의 기준 시각입니다.',
      feed: '60초마다 조회',
      paused: 'API 연결이 종료됐습니다.',
    };
    const note = feed?.failed ? '연결 오류 · 표시 중인 데이터 유지'
      : feed?.controller && mode !== 'feed' ? 'API 연결 확인 중' : modeNotes[mode];
    badge.dataset.mode = displayedMode;
    const marker = node('i');
    marker.setAttribute('aria-hidden', 'true');
    badge.replaceChildren(marker, document.createTextNode(labels[displayedMode]));
    byId('source-note').textContent = note;
    byId('source-name').textContent = snapshot.source;
    const clock = byId('data-time');
    clock.dateTime = snapshot.asOf;
    clock.textContent = time.format(new Date(snapshot.asOf)) + ' KST';
    byId('refresh-feed').disabled = !feed || Boolean(feed.controller) || Date.now() < feed.notBefore;
    byId('stop-feed').disabled = !feed;
    byId('connect-feed').disabled = Boolean(feed?.controller);
  }

  function useSnapshot(next, nextMode, reset = true) {
    snapshot = next;
    mode = nextMode;
    if (reset) {
      page = 1;
      byId('search').value = '';
    }
    populateFilters(reset);
    render();
    renderSource();
  }

  function feedback(message, error = false) {
    const element = byId('source-feedback');
    element.textContent = message;
    element.dataset.error = String(error);
  }

  function stopFeed() {
    if (feed) {
      const previous = feed;
      feed = null;
      clearTimeout(previous.timer);
      previous.controller?.abort();
    }
    if (mode === 'feed') mode = 'paused';
    renderSource();
  }

  function schedule(connection, delay = pollInterval) {
    clearTimeout(connection.timer);
    connection.timer = setTimeout(() => {
      if (feed !== connection) return;
      if (document.hidden || Date.now() < connection.notBefore) schedule(connection);
      else void refresh(connection);
    }, Math.min(delay, 2_147_000_000));
  }

  async function refresh(connection) {
    if (!connection || connection !== feed || connection.controller || Date.now() < connection.notBefore) return;
    clearTimeout(connection.timer);
    const controller = new AbortController();
    connection.controller = controller;
    const timeout = setTimeout(() => controller.abort(), 12_000);
    feedback('데이터를 확인하는 중입니다.');
    renderSource();
    let nextDelay = pollInterval;
    try {
      const next = await data.fetchSnapshot(connection.url, { signal: controller.signal });
      if (feed !== connection) return;
      connection.failed = false;
      connection.notBefore = 0;
      const firstUpdate = mode !== 'feed';
      useSnapshot(next, 'feed', firstUpdate);
      feedback('연결했습니다. 60초마다 새 데이터를 확인합니다.');
    } catch (error) {
      if (feed !== connection) return;
      const message = controller.signal.aborted ? '12초 안에 응답을 받지 못했습니다.' : error.message;
      if (error.status === 401 || error.status === 403) {
        stopFeed();
        feedback(message + ' 접근 권한을 확인한 뒤 다시 연결하세요.', true);
        return;
      }
      if (mode !== 'feed' && error.status !== 429) {
        stopFeed();
        feedback(message, true);
        return;
      }
      connection.failed = true;
      if (error.status === 429) {
        nextDelay = Math.max(2 * pollInterval, error.retryAfterMs ?? 0);
        connection.notBefore = Date.now() + nextDelay;
      }
      feedback(message, true);
    } finally {
      clearTimeout(timeout);
      if (feed === connection) {
        connection.controller = null;
        schedule(connection, nextDelay);
        renderSource();
      }
    }
  }

  const resetPage = () => { page = 1; render(); };
  const setDimension = (next) => { dimension = next; render(); };
  dimensionButtons.forEach((item) => item.addEventListener('click', () => setDimension(item.dataset.dimension)));
  navLinks.forEach((item) => item.addEventListener('click', () => {
    navLinks.forEach((link) => link.removeAttribute('aria-current'));
    item.setAttribute('aria-current', 'location');
    if (item.dataset.dimension) setDimension(item.dataset.dimension);
  }));
  byId('chart-metric').addEventListener('change', render);
  byId('search').addEventListener('input', resetPage);
  byId('sort').addEventListener('change', resetPage);
  Object.values(filters).forEach((field) => field.addEventListener('change', resetPage));
  byId('reset-filters').addEventListener('click', () => {
    byId('search').value = '';
    for (const field of Object.values(filters)) field.value = '';
    byId('sort').value = 'volume';
    resetPage();
  });
  byId('prev-page').addEventListener('click', () => { page -= 1; renderTable(filteredRows()); });
  byId('next-page').addEventListener('click', () => { page += 1; renderTable(filteredRows()); });
  byId('open-source').addEventListener('click', () => sourceDialog.showModal());
  byId('feed-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const url = byId('feed-url').value.trim();
    if (!url) return;
    inputVersion += 1;
    stopFeed();
    feed = { url, timer: null, controller: null, failed: false, notBefore: 0 };
    void refresh(feed);
  });
  byId('refresh-feed').addEventListener('click', () => void refresh(feed));
  byId('stop-feed').addEventListener('click', () => {
    inputVersion += 1;
    stopFeed();
    feedback('연결을 해제했습니다.');
  });
  byId('import-file').addEventListener('change', async (event) => {
    const field = event.target;
    const file = field.files[0];
    const version = ++inputVersion;
    if (!file) return;
    field.value = '';
    try {
      if (file.size > 5_000_000) throw new Error('데이터는 5MB 이하의 JSON으로 준비하세요.');
      const next = data.parseSnapshot(await file.text());
      if (version !== inputVersion) return;
      stopFeed();
      useSnapshot(next, 'file');
      feedback('파일에서 ' + formatValue(next.rows.length, '개') + ' 종목을 불러왔습니다.');
    } catch (error) {
      if (version === inputVersion) feedback(error.message, true);
    }
  });
  byId('download-example').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data.sample, null, 2)], { type: 'application/json' }));
    const link = node('a');
    link.href = url;
    link.download = 'etf-example.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  byId('restore-demo').addEventListener('click', () => {
    inputVersion += 1;
    stopFeed();
    useSnapshot(data.sample, 'sample');
    feedback('예제 데이터를 표시합니다.');
  });

  useSnapshot(data.sample, 'sample');
})();
