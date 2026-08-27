const FAMILY_STORES_URL = 'https://family.map.com.tw/famiport/api/dropdownlist/Select_StoreName';
const FAMILY_INVENTORY_URL = 'https://stamp.family.com.tw/api/maps/MapProductInfo';
const FAMILY_PRODUCTS_URL = 'https://www.family.com.tw/Marketing/zh/FreshFood/Product';
const ALLOWED_ORIGINS = new Set([
  'https://yue830219.github.io',
  'http://localhost:8765',
  'http://127.0.0.1:8765',
  'null'
]);

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : 'https://yue830219.github.io';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function json(request, data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      ...corsHeaders(request),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

function normalize(value) {
  return String(value || '').toLocaleLowerCase('zh-TW').replace(/\s+/g, '');
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/<[^>]*>/g, '')
    .trim();
}

async function readTextWithLimit(response, maximumBytes) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximumBytes) {
      await reader.cancel('response too large');
      throw new Error('FamilyMart product page exceeded size limit');
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

async function fetchFamilyPrices() {
  const cache = caches.default;
  const key = new Request('https://worker.internal/familymart-prices-v1');
  const cached = await cache.match(key);
  if (cached) return cached.json();
  const response = await fetch(FAMILY_PRODUCTS_URL, { headers: { 'Accept': 'text/html' } });
  if (!response.ok) throw new Error(`FamilyMart product page failed: ${response.status}`);
  const html = await readTextWithLimit(response, 2_000_000);
  const prices = [];
  for (const match of html.matchAll(/<div class="food__name">([\s\S]*?)<\/div>[\s\S]*?<span class="food__price">\s*原價\$([0-9]+)元<\/span>/gi)) {
    const name = decodeHtml(match[1]);
    const price = Number(match[2]);
    if (name && Number.isFinite(price)) prices.push({ name, normalizedName: normalize(name), price });
  }
  if (!prices.length) throw new Error('FamilyMart product prices returned no items');
  await cache.put(key, Response.json(prices, { headers: { 'Cache-Control': 'public, max-age=21600' } }));
  return prices;
}

function findFamilyPrice(productName, prices) {
  const target = normalize(productName).replace(/^[一二三四五六七八九十]配/, '');
  if (!target) return null;
  const matches = prices.filter((item) => target.includes(item.normalizedName) || item.normalizedName.includes(target));
  matches.sort((a, b) => b.normalizedName.length - a.normalizedName.length);
  return matches[0]?.price ?? null;
}

function addFamilyPrices(stores, prices) {
  return stores.map((store) => ({
    ...store,
    info: (store.info || []).map((group) => ({
      ...group,
      categories: (group.categories || []).map((category) => ({
        ...category,
        products: (category.products || []).map((product) => {
          const originalPrice = findFamilyPrice(product.name, prices);
          return {
            ...product,
            originalPrice,
            discountedPrice: originalPrice == null ? null : Math.ceil(originalPrice * 0.7)
          };
        })
      }))
    }))
  }));
}

async function fetchFamilyStores() {
  const cache = caches.default;
  const key = new Request('https://worker.internal/familymart-stores');
  const cached = await cache.match(key);
  if (cached) return cached.json();

  const upstream = await fetch(FAMILY_STORES_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: '{}'
  });
  if (!upstream.ok) throw new Error(`FamilyMart store list failed: ${upstream.status}`);
  const stores = await upstream.json();
  await cache.put(key, Response.json(stores, { headers: { 'Cache-Control': 'public, max-age=21600' } }));
  return stores;
}

async function searchFamilyStores(request, url) {
  const query = normalize(url.searchParams.get('q'));
  if (query.length < 2 || query.length > 40) return json(request, { error: '請輸入至少 2 個字元' }, 400);
  const stores = await fetchFamilyStores();
  const matches = stores
    .filter((store) => normalize(`${store.Name}${store.addr}`).includes(query))
    .slice(0, 20)
    .map((store) => ({
      id: store.pkeynew,
      name: store.Name,
      address: store.addr,
      telephone: store.Tel,
      latitude: Number(store.py_wgs84),
      longitude: Number(store.px_wgs84)
    }));
  return json(request, { stores: matches });
}

async function familyInventory(request) {
  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (contentLength > 2048) return json(request, { error: '請求內容過大' }, 413);
  const body = await request.json().catch(() => null);
  const latitude = Number(body?.latitude);
  const longitude = Number(body?.longitude);
  if (!Number.isFinite(latitude) || latitude < 20 || latitude > 27 ||
      !Number.isFinite(longitude) || longitude < 118 || longitude > 123) {
    return json(request, { error: '定位座標無效' }, 400);
  }

  const [upstream, prices] = await Promise.all([fetch(FAMILY_INVENTORY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      ProjectCode: '202106302',
      OldPKeys: [],
      PostInfo: '',
      Latitude: latitude,
      Longitude: longitude
    })
  }), fetchFamilyPrices().catch(() => [])]);
  if (!upstream.ok) throw new Error(`FamilyMart inventory failed: ${upstream.status}`);
  const payload = await upstream.json();
  const stores = Array.isArray(payload?.data) ? payload.data : [];
  return json(request, { stores: addFamilyPrices(stores, prices) });
}

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '';
    if (origin && !ALLOWED_ORIGINS.has(origin)) return new Response('Forbidden', { status: 403 });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });

    const url = new URL(request.url);
    try {
      if (request.method === 'GET' && url.pathname === '/health') return json(request, { ok: true });
      if (request.method === 'GET' && url.pathname === '/familymart/stores') return searchFamilyStores(request, url);
      if (request.method === 'POST' && url.pathname === '/familymart/inventory') return familyInventory(request);
      return json(request, { error: 'Not found' }, 404);
    } catch (error) {
      console.error(JSON.stringify({ event: 'food_hunter_error', path: url.pathname, message: error instanceof Error ? error.message : String(error) }));
      return json(request, { error: '即時庫存服務暫時無法使用' }, 502);
    }
  }
};
