(() => {
  'use strict';

  const MAX_ROWS = 10_000;
  const MAX_JSON_SIZE = 5_000_000;
  const ISO_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
  const CREDENTIAL_QUERY = /(?:token|secret|password|passphrase|authorization|api[-_]?key|signature|(?:^|[-_])(?:key|sig|auth|credential|credentials)(?:$|[-_]))/i;

  function readText(value, field, context = '') {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > 160 || /[\x00-\x1f\x7f]/.test(value)) {
      throw new Error(`${context}${field} 값을 160자 이하의 텍스트로 입력하세요.`);
    }
    return value.trim();
  }

  function readNumber(value, field, context, { nonnegative = false, integer = false, optional = false } = {}) {
    if (optional && value == null) return null;
    const valid = integer ? Number.isSafeInteger(value) : Number.isFinite(value);
    if (!valid || (nonnegative && value < 0)) {
      throw new Error(`${context}${field} 값이 올바르지 않습니다.`);
    }
    return value;
  }

  function parseDate(value) {
    const match = typeof value === 'string' && ISO_DATE_TIME.exec(value);
    if (match) {
      const [year, month, day] = match.slice(1, 4).map(Number);
      const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
      const daysPerMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      if (month >= 1 && month <= 12 && day >= 1 && day <= daysPerMonth[month - 1]) {
        return new Date(value).toISOString();
      }
    }
    throw new Error('asOf는 시간대가 포함된 ISO 날짜와 시간이어야 합니다.');
  }

  function parseSnapshot(input) {
    let value = input;
    if (typeof value === 'string') {
      if (value.length > MAX_JSON_SIZE) throw new Error('데이터는 5MB 이하의 JSON으로 준비하세요.');
      try {
        value = JSON.parse(value.replace(/^\uFEFF/, ''));
      } catch {
        throw new Error('올바른 JSON 파일 또는 JSON 응답을 사용하세요.');
      }
    }
    if (!value || typeof value !== 'object' || !Array.isArray(value.rows)) {
      throw new Error('데이터에 asOf, source, rows가 필요합니다.');
    }
    if (value.rows.length > MAX_ROWS) throw new Error('한 번에 최대 10,000종목까지 불러올 수 있습니다.');

    const asOf = parseDate(value.asOf);
    const source = readText(value.source, 'source');
    const codes = new Set();
    const rows = Array.from(value.rows, (row, index) => {
      const context = `${index + 1}번째 종목의 `;
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        throw new Error(`${index + 1}번째 종목은 JSON 객체여야 합니다.`);
      }
      const code = readText(row.code, 'code', context).toUpperCase();
      if (!/^[A-Z0-9]{6}$/.test(code)) throw new Error(`${context}code는 영문과 숫자 6자리여야 합니다.`);
      if (codes.has(code)) throw new Error(`종목 코드 ${code}가 중복되었습니다.`);
      codes.add(code);

      return {
        code,
        name: readText(row.name, 'name', context),
        manager: readText(row.manager, 'manager', context),
        market: readText(row.market, 'market', context),
        product: readText(row.product, 'product', context),
        price: readNumber(row.price, 'price', context, { nonnegative: true }),
        change: readNumber(row.change, 'change', context),
        volume: readNumber(row.volume, 'volume', context, { nonnegative: true, integer: true }),
        tradingValue: readNumber(row.tradingValue, 'tradingValue', context, { nonnegative: true, integer: true, optional: true }),
        nav: readNumber(row.nav, 'nav', context, { nonnegative: true, optional: true }),
      };
    });

    return { asOf, source, rows };
  }

  function feedUrl(address) {
    let url;
    try {
      url = new URL(address);
    } catch {
      throw new Error('데이터 주소 전체를 입력하세요.');
    }
    const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    const localHttp = url.protocol === 'http:' && localHost && url.origin === window.location.origin;
    if (url.protocol !== 'https:' && !localHttp) throw new Error('HTTPS 데이터 주소를 사용하세요.');
    if (url.username || url.password || [...url.searchParams.keys()].some((key) => CREDENTIAL_QUERY.test(key))) {
      throw new Error('주소에서 계정 정보와 인증 키를 제거하세요.');
    }
    if (url.hostname.replace(/\.$/, '') === 'finance.naver.com' && /^\/api\/sise\/etfItemList\.nhn\/?$/i.test(url.pathname)) {
      throw new Error('네이버페이 증권 주소는 직접 연결할 수 없습니다. 사용이 허용된 JSON 주소를 입력하세요.');
    }
    url.hash = '';
    return url;
  }

  async function fetchSnapshot(address, { signal } = {}) {
    const url = feedUrl(address);
    let response;
    try {
      response = await fetch(url, {
        signal,
        headers: { Accept: 'application/json' },
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new Error('데이터 주소에 연결하지 못했습니다. 주소와 서버의 브라우저 접근 허용 설정(CORS)을 확인하세요.');
    }
    if (!response.ok) {
      const error = new Error(`데이터를 가져오지 못했습니다 (HTTP ${response.status}).`);
      error.status = response.status;
      const retryAfter = response.headers.get('retry-after')?.trim();
      if (retryAfter) {
        const delay = /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - Date.now();
        if (Number.isSafeInteger(delay)) error.retryAfterMs = Math.max(0, delay);
      }
      throw error;
    }
    const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
    if (type && type !== 'application/json' && !type.endsWith('+json') && type !== 'text/plain') {
      throw new Error('데이터 주소는 JSON을 반환해야 합니다.');
    }
    if (Number(response.headers.get('content-length')) > MAX_JSON_SIZE) {
      throw new Error('데이터는 5MB 이하의 JSON으로 준비하세요.');
    }
    return parseSnapshot(await response.text());
  }

  const sampleRows = [
    ['솔빛 국내 200', '솔빛자산운용', '국내주식', '대표지수', 32650, 1.84, 1520000],
    ['새결 미국 S&P 500', '새결자산운용', '해외주식', '대표지수', 21430, 0.98, 1780000],
    ['푸름 단기 국채', '푸름자산운용', '채권', '국채', 105360, 0.04, 82100],
    ['한길 금 현물', '한길자산운용', '원자재', '귀금속', 19170, -0.62, 724000],
    ['솔빛 반도체', '솔빛자산운용', '국내주식', '섹터·테마', 24780, 2.58, 970000],
    ['새결 미국 기술주', '새결자산운용', '해외주식', '섹터·테마', 18690, -1.34, 1050000],
    ['푸름 국채 10년', '푸름자산운용', '채권', '국채', 97290, -0.23, 30500],
    ['한길 원유 선물', '한길자산운용', '원자재', '에너지', 14220, 1.02, 186000],
    ['솔빛 국내 200 레버리지', '솔빛자산운용', '국내주식', '레버리지', 15345, 3.72, 2160000],
    ['푸름 국내 200 인버스', '푸름자산운용', '국내주식', '인버스', 4725, -1.87, 3560000],
    ['새결 미국 배당 커버드콜', '새결자산운용', '해외주식', '커버드콜', 11860, 0.00, 625000],
    ['푸름 종합 회사채', '푸름자산운용', '채권', '회사채', 103465, 0.05, 11900],
    ['한길 미국달러 선물', '한길자산운용', '통화', '통화선물', 12710, -0.24, 193000],
    ['솔빛 국내 배당주', '솔빛자산운용', '국내주식', '배당주', 13540, 0.43, 321000],
    ['새결 일본 대표주', '새결자산운용', '해외주식', '대표지수', 16075, 0.71, 84700],
    ['한길 글로벌 리츠', '한길자산운용', '부동산', '리츠', 9560, -0.37, 76000],
  ];

  const sample = parseSnapshot({
    asOf: '2026-11-16T15:30:00+09:00',
    source: '가상 ETF 데이터',
    rows: sampleRows.map(([name, manager, market, product, price, change, volume], index) => ({
      code: `DE${String(index + 1).padStart(4, '0')}`,
      name,
      manager,
      market,
      product,
      price,
      change,
      volume,
      tradingValue: Math.round(price * volume * (0.985 + (index % 6) * 0.006) / 1000) * 1000,
      nav: Math.round(price * (0.997 + (index % 7) * 0.001)),
    })),
  });

  window.EtfData = Object.freeze({ sample, parseSnapshot, fetchSnapshot });
})();
