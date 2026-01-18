// docks.js - load docks.csv and render product grid

// Use Google Sheets published CSV output as default source
const DOCKS_CSV = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTqInhYvDAMMv-qaJgDJgQDV0pOqxj4LITLj6sOkjB3pL-r3X8n35TrQUibLBsXnoe5SJQ91h9FxtnY/pub?output=csv';
const THUMBNAIL_PER_ROW = 5;
const VISIBLE_ROWS = 3;
// local CSV support removed: no local CSV option
let serverHasCsv = false;
let currentProducts = [];
let lastCsvHeaders = [];
let brandLogoMap = {};
let isCompareMode = false;
let compareSelections = []; // array of globalIndices
let csvEditorViewSort = 'brand'; // 'brand' view by default; 'ranking' is view-only

function parseCsv(csvText) {
  // Robust CSV parser for semicolon separated text, supports quoted fields with newlines and escaped quotes.
  if (!csvText || !csvText.length) return [];
  // detect delimiter: prefer comma or semicolon, fallback to comma
  let delimiter = ',';
  try {
    const firstLine = csvText.split(/\r?\n/)[0] || '';
    // count occurrences
    const commas = (firstLine.match(/,/g) || []).length;
    const semis = (firstLine.match(/;/g) || []).length;
    delimiter = commas >= semis ? ',' : ';';
  } catch (e) { delimiter = ','; }
  const rows = [];
  let current = '';
  let row = [];
  let inQuotes = false;
  for (let i = 0; i < csvText.length; i++) {
    const ch = csvText[i];
    const next = i + 1 < csvText.length ? csvText[i + 1] : null;
    if (ch === '"') {
      if (inQuotes && next === '"') {
        // escaped quote
        current += '"';
        i++; continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === delimiter && !inQuotes) {
      row.push(current);
      current = '';
      continue;
    }
    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      // handle CRLF \'\r\n\'
      if (ch === '\r' && next === '\n') { i++; }
      row.push(current);
      rows.push(row);
      row = [];
      current = '';
      continue;
    }
    current += ch;
  }
  // flush last
  if (inQuotes) {
    // unclosed quote - attempt best-effort: push current
  }
  if (current !== '' || row.length > 0) {
    row.push(current);
    rows.push(row);
  }
  if (!rows.length) return [];
  const rawHeaders = rows[0].map(h => (h || '').trim());
  lastCsvHeaders = rawHeaders.slice();
  const objects = [];
  for (let r = 1; r < rows.length; r++) {
    const cols = rows[r];
    const obj = {};
    for (let c = 0; c < rawHeaders.length; c++) {
      let val = (cols[c] || '');
      const key = rawHeaders[c];
      // convert HTML <br> or &lt;br&gt; to newline characters
      val = val.replace(/&lt;br\s*\/?&gt;/gi, '\n');
      val = val.replace(/<br\s*\/?\s*>/gi, '\n');
      // trim but keep leading/trailing spaces inside field
      val = typeof val === 'string' ? val : String(val || '');
      if (!obj.hasOwnProperty(key)) {
        obj[key] = val;
      } else {
        // prefer first non-empty occurrence unless existing value is empty
        if ((obj[key] === '' || obj[key] == null) && val !== '') {
          obj[key] = val;
        }
      }
    }
    objects.push(obj);
  }
  return objects;
}

function serializeProductsToCsv(products, headers, options = {convertNewlinesToBr: true, delimiter: ','}) {
  headers = headers || lastCsvHeaders || [];
  function escapeField(v) {
    if (v == null) return '';
    const s = String(v);
    // Escape double quotes and wrap field in quotes if it contains semicolons or newlines or quotes
    let t = s;
    if (options.convertNewlinesToBr) {
      t = t.replace(/\r\n|\r|\n/g, '<br>');
    }
    const needsQuote = new RegExp(options.delimiter + '|"|\n').test(t);
    if (needsQuote) {
      const escaped = t.replace(/"/g, '""');
      return `"${escaped}"`;
    }
    return t;
  }
  const rows = [headers.map(h => escapeField(h)).join(options.delimiter)];
  products.forEach(p => {
    const cols = headers.map(h => escapeField(p[h] || ''));
    rows.push(cols.join(options.delimiter));
  });
  return rows.join('\n');
}

function chunkArray(arr, size) {
  const rows = [];
  for (let i = 0; i < arr.length; i += size) rows.push(arr.slice(i, i + size));
  return rows;
}

function getProductImages(product, maxCount = 4) {
  const keys = Object.keys(product);
  const images = [];
  // gather keys matching 'Product image', 'Product image N', or 'Product immage'
  for (const k of keys) {
    if ((/^product\s*(?:image|immage)\s*\d*$/i).test(k) || (/^product\s*(?:image|immage)$/i).test(k)) {
      const v = String(product[k] || '').trim();
      if (v) images.push(v);
    }
  }
  // fallback to older single fields
  if (!images.length) {
    if (product['Product immage'] && String(product['Product immage']).trim()) images.push(String(product['Product immage']).trim());
    else if (product['Product image'] && String(product['Product image']).trim()) images.push(String(product['Product image']).trim());
  }
  return images.slice(0, maxCount);
}

function createThumbCard(product, globalIndex) {
  const div = document.createElement('div');
  div.className = 'product-thumb';
  div.setAttribute('role','listitem');
  div.tabIndex = 0;

  const header = document.createElement('div');
  header.className = 'thumb-header';
  const storeSpan = document.createElement('div');
  storeSpan.className = 'thumb-store';
  storeSpan.textContent = product['Brand'] || product['Store'] || '';
  const nameSpan = document.createElement('div');
  nameSpan.className = 'thumb-name';
  nameSpan.textContent = product['Model'] || product['Product'] || '';
  header.appendChild(storeSpan);
  header.appendChild(nameSpan);
  div.appendChild(header);

  // ranking will be shown over the image (if present) — handled below

  const imgWrap = document.createElement('div');
  imgWrap.className = 'thumb-image-wrap';
  const img = document.createElement('img');
  img.className = 'thumb-image';
  img.alt = product['Model'] || '';
  // use the first available product image as thumbnail
  const thumbImages = getProductImages(product, 1);
  img.src = thumbImages.length ? thumbImages[0] : '';
  img.loading = 'lazy';
  imgWrap.appendChild(img);
  // ranking badge on top-right of image
  const rankingVal = (product['Ranking'] || '').toString().trim();
  const idx = typeof globalIndex === 'number' ? globalIndex : -1;
  if (rankingVal) {
    const rankEl = document.createElement('div');
    rankEl.className = 'thumb-ranking';
    const n = parseInt(rankingVal, 10);
    if (!isNaN(n)) {
      // Top 3 overrides (always gold/silver/bronze)
      if (idx === 0) {
        rankEl.classList.add('rank-first');
      } else if (idx === 1) {
        rankEl.classList.add('rank-second');
      } else if (idx === 2) {
        rankEl.classList.add('rank-third');
      } else {
        // mapping to explicit numeric ranges with new bands
        if (n <= 50) rankEl.classList.add('rank-0-50');
        else if (n <= 60) rankEl.classList.add('rank-51-60');
        else if (n <= 70) rankEl.classList.add('rank-61-70');
        else if (n <= 80) rankEl.classList.add('rank-71-80');
        else if (n <= 90) rankEl.classList.add('rank-81-90');
        else rankEl.classList.add('rank-91-100');
      }
    }
    rankEl.textContent = rankingVal;
    rankEl.title = rankingVal;
    rankEl.setAttribute('aria-label', `Rank ${rankingVal}`);
    // insert a spinning background svg under the ranking badge
    const bg = document.createElement('div');
    let bgClass = 'rank-bg-default';
    // decide class based on top 3 or precise numeric range
    if (idx === 0) bgClass = 'rank-bg-gold';
    else if (idx === 1) bgClass = 'rank-bg-silver';
    else if (idx === 2) bgClass = 'rank-bg-bronze';
    else if (!isNaN(n)) {
      if (n <= 50) bgClass = 'rank-bg-0-50';
      else if (n <= 60) bgClass = 'rank-bg-51-60';
      else if (n <= 70) bgClass = 'rank-bg-61-70';
      else if (n <= 80) bgClass = 'rank-bg-71-80';
      else if (n <= 90) bgClass = 'rank-bg-81-90';
      else bgClass = 'rank-bg-91-100';
    }
    // no fallback to low/mid/high; we use red/orange/green pastel classes
    bg.className = 'thumb-ranking-bg spin ' + bgClass;
    // set the background color via style color as fallback for inline SVG
    const computedColor = window.getComputedStyle ? window.getComputedStyle(bg).color : null;
    if (!computedColor) {
      const map = {
        'rank-bg-gold': '#D4AF37',
        'rank-bg-silver': '#C0C0C0',
        'rank-bg-bronze': '#CD7F32',
        'rank-bg-default': '#ffffffcc',
        'rank-bg-0-50': '#000000',
        'rank-bg-51-60': '#D83DFF',
        'rank-bg-61-70': '#FF3E3E',
        'rank-bg-71-80': '#FFF652',
        'rank-bg-81-90': '#C6FF53',
        'rank-bg-91-100': '#1AC955'
      };
      if (map[bgClass]) bg.style.color = map[bgClass];
    }
    bg.innerHTML = `<?xml version="1.0" ?>\n<svg viewBox="0 0 30 30" xmlns="http://www.w3.org/2000/svg">\n  <defs>\n    <style>.cls-1{fill:currentColor;stroke:none;}</style>\n  </defs>\n  <g id="interface-light-rating-star-3">\n    <path class="cls-1" d="M15.81.77l2.81,2.16a1.38,1.38,0,0,0,.88.28L23.1,3A1.31,1.31,0,0,1,24.41,4l.94,3.32A1.25,1.25,0,0,0,25.9,8l3,1.89a1.19,1.19,0,0,1,.5,1.47l-1.28,3.22a1.21,1.21,0,0,0,0,.88l1.28,3.22a1.19,1.19,0,0,1-.5,1.47L25.9,22a1.25,1.25,0,0,0-.55.71l-.94,3.32A1.31,1.31,0,0,1,23.1,27l-3.6-.18a1.38,1.38,0,0,0-.88.28l-2.81,2.16a1.35,1.35,0,0,1-1.62,0l-2.81-2.16a1.38,1.38,0,0,0-.88-.28L6.9,27a1.31,1.31,0,0,1-1.31-.92l-.94-3.32A1.25,1.25,0,0,0,4.1,22l-3-1.89a1.19,1.19,0,0,1-.5-1.47l1.28-3.22a1.21,1.21,0,0,0,0-.88L.59,11.34a1.19,1.19,0,0,1,.5-1.47L4.1,8a1.25,1.25,0,0,0,.55-.71L5.59,4A1.31,1.31,0,0,1,6.9,3l3.6.18a1.38,1.38,0,0,0,.88-.28L14.19.77A1.35,1.35,0,0,1,15.81.77Z"/>\n    <path class="cls-1" d="M15.68,8.49,17,12.12a.74.74,0,0,0,.65.5l3.69.15a.76.76,0,0,1,.42,1.35l-2.9,2.39a.78.78,0,0,0-.25.8l1,3.72a.73.73,0,0,1-1.09.84L15.4,19.72a.69.69,0,0,0-.8,0l-3.08,2.15A.73.73,0,0,1,10.43,21l1-3.72a.78.78,0,0,0-.25-.8l-2.9-2.39a.76.76,0,0,1,.42-1.35l3.69-.15a.74.74,0,0,0,.65-.5l1.28-3.63A.72.72,0,0,1,15.68,8.49Z"/>\n  </g>\n</svg>`;
    const rankWrap = document.createElement('div');
    rankWrap.className = 'thumb-rank-wrapper';
    rankWrap.appendChild(bg);
    // If rank is in the icon ranges (0-60) and not a top3, show the icon instead of number
    if (!isNaN(n) && n <= 60 && !(idx === 0 || idx === 1 || idx === 2)) {
      rankEl.dataset.rank = String(n);
      rankEl.classList.add('rank-icon');
      rankEl.innerHTML = `
        <div class="thumb-ranking-icon" aria-hidden="true">
          <!-- small whis icon; fill via currentColor -->
          <svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
            <defs><style>.cls-1{fill:currentColor;stroke:none;}</style></defs>
            <g>
              <path class="cls-1" d="M186.521,265.189v27.578c0,4.969,4.219,9.016,9.438,9.016h23.016c5.203,0,9.422-4.047,9.422-9.016v-23.094
                h7.859v23.094c0,4.969,4.219,9.016,9.422,9.016h23.031c5.203,0,9.438-4.047,9.438-9.016v-23.094h7.844v23.094
                c0,4.969,4.219,9.016,9.438,9.016h23.016c5.203,0,9.422-4.047,9.422-9.016v-27.578c23.984-6.969,64.031-23.141,77.656-55.828
                c9.891-23.766,6.016-55.047-8.797-115.344C381.88,33.689,338.755,0.001,257.177,0.001S132.489,33.689,117.661,94.017
                c-14.828,60.297-18.719,91.578-8.797,115.344C122.474,242.048,162.521,258.205,186.521,265.189z M314.114,108.83
                c21.688-3.547,42.844,13.547,47.25,38.156c4.391,24.625-9.625,47.453-31.297,51.016c-21.719,3.531-42.891-13.531-47.281-38.172
                C278.396,135.22,292.427,112.392,314.114,108.83z M287.724,221.314h-30.547h-30.516l30.516-36.5L287.724,221.314z M153.005,146.986
                c4.438-24.609,25.563-41.703,47.25-38.156c21.703,3.563,35.75,26.391,31.328,51c-4.391,24.641-25.531,41.703-47.234,38.172
                C162.63,194.439,148.614,171.611,153.005,146.986z"/>
              <path class="cls-1" d="M450.208,397.83c-16.391-7.25-35.656-1.156-44.484,13.516c-6.484,8.063-16.563,4.906-21.188,2.875
                c-3.438-1.516-39.281-17.36-81.844-36.157c36.578-16.75,66.781-30.578,72.828-33.344c16.703-7.641,28.703-11.813,39.719-2.781
                c9.609,12.813,27.703,17.609,43.078,10.578c17.266-7.891,24.563-27.688,16.297-44.203c-4.984-10-14.547-16.469-25.125-18.297
                c5.156-9.031,5.891-20.188,0.875-30.203c-8.25-16.516-28.938-23.484-46.203-15.594c-14.953,6.844-22.406,22.594-18.781,37.422
                c0.859,11.156-15.75,20.094-26.766,25.141c-7.688,3.516-55.188,25.672-105.969,49.172c-47.75-21.094-91.875-40.578-99.359-43.875
                c-16.828-7.438-27.844-13.609-27.609-27.469c4.188-15.25-3.484-31.641-18.969-38.5c-17.359-7.656-37.953-0.406-45.984,16.219
                c-4.859,10.063-3.969,21.219,1.328,30.203c-10.563,1.953-20.031,8.531-24.875,18.594c-8.016,16.641-0.438,36.328,16.938,44
                c15.047,6.641,32.484,2.078,42.094-10.047c8.453-7.766,26.234-1.234,37.297,3.688c5.781,2.547,34.063,14.813,69.359,30.172
                c-42.5,19.531-78.5,35.86-84.156,37.657c-3.359,1.078-6.375,1.203-9.031,0.813c-0.203-0.453-0.375-0.938-0.609-1.375
                c-8.234-16.516-28.938-23.5-46.203-15.594c-17.266,7.891-24.563,27.704-16.297,44.219c5,9.969,14.547,16.453,25.125,18.281
                c-5.141,9.031-5.875,20.203-0.891,30.203c8.281,16.516,28.953,23.5,46.219,15.609c16.313-7.484,23.703-25.531,17.531-41.406
                c-2.344-9.906,6.609-15.344,11.203-17.453c4.109-1.859,54.563-24.969,107.266-49.094c57.578,25.172,115.453,50.719,121.984,54.61
                c3,1.781,5.031,3.922,6.406,6.125c-0.25,0.438-0.5,0.859-0.719,1.313c-8.016,16.625-0.453,36.297,16.938,44
                c17.375,7.656,37.953,0.406,45.984-16.219c4.844-10.047,3.953-21.219-1.328-30.188c10.563-1.969,20.016-8.563,24.875-18.594
                C475.177,425.205,467.599,405.501,450.208,397.83z"/>
            </g>
          </svg>
        </div>`;
    }
    rankWrap.appendChild(rankEl);
    // If this is one of the top 3 (gold/silver/bronze), add a small label under the star in the thumbnail too
    if (idx === 0 || idx === 1 || idx === 2) {
      const labels = ['GOLD', 'SILVER', 'BRONZE'];
      const lbl = document.createElement('div');
      lbl.className = 'thumb-rank-label';
      lbl.textContent = labels[idx] || '';
      // mirror contrast classes
      if (idx === 0) lbl.classList.add('rank-first');
      else if (idx === 1) lbl.classList.add('rank-second');
      else if (idx === 2) lbl.classList.add('rank-third');
      rankWrap.appendChild(lbl);
    }
    imgWrap.appendChild(rankWrap);
  }
  div.appendChild(imgWrap);

  const brandWrap = document.createElement('div');
  brandWrap.className = 'thumb-brand-wrap';
  const brandLogo = document.createElement('img');
  brandLogo.className = 'thumb-brand-logo';
  brandLogo.alt = product['Brand'] || '';
  brandLogo.src = product['Brand logo link'] || '';
  brandLogo.loading = 'lazy';
  brandWrap.appendChild(brandLogo);
  div.appendChild(brandWrap);

  // open modal on click
  div.addEventListener('click', (e) => {
    if (isCompareMode) {
      toggleCompareSelection(globalIndex, div, product);
    } else {
      openProductModal(product);
    }
  });
  div.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') {
      if (isCompareMode) toggleCompareSelection(globalIndex, div, product); else openProductModal(product);
  }});

  // Note: brand logo and name should not be clickable — clicking the whole thumbnail opens the modal

  return div;
}

function enterCompareMode() {
  isCompareMode = true;
  compareSelections = [];
  document.body.classList.add('compare-mode');
  // add a subtle visual cue: enable a selectable state on all thumbnails
  Array.from(document.querySelectorAll('.product-thumb')).forEach(el => el.classList.add('compare-selectable'));
}

function exitCompareMode() {
  isCompareMode = false;
  compareSelections = [];
  document.body.classList.remove('compare-mode');
  // remove selectable and selected classes
  Array.from(document.querySelectorAll('.product-thumb')).forEach(el => { el.classList.remove('compare-selectable'); el.classList.remove('compare-selected'); });
  const compareBtn = document.getElementById('compareBtn'); if (compareBtn) compareBtn.textContent = 'Compare';
}

function toggleCompareSelection(globalIndex, el, product) {
  // find if selected
  const pos = compareSelections.indexOf(globalIndex);
  if (pos >= 0) {
    compareSelections.splice(pos, 1);
    el.classList.remove('compare-selected');
  } else {
    if (compareSelections.length >= 3) return; // max 3
    compareSelections.push(globalIndex);
    el.classList.add('compare-selected');
  }
  const compareBtn = document.getElementById('compareBtn');
  if (compareBtn) compareBtn.textContent = `Compare (${compareSelections.length}/3)`;
}

function openCompareModal() {
  // gather products from currentProducts via indices and build compare overlay
  const selectedProducts = compareSelections.map(idx => currentProducts[idx]).filter(Boolean);
  if (!selectedProducts.length) return;
  // create a compare modal dynamically
  let comp = document.getElementById('compareModal');
  if (!comp) {
    comp = document.createElement('div');
    comp.id = 'compareModal';
    comp.className = 'product-modal compare-modal';
    comp.setAttribute('aria-hidden', 'true');
    comp.innerHTML = `
      <div class="product-modal__backdrop"></div>
      <div class="product-modal__dialog compare-dialog" role="dialog" aria-modal="true"></div>
    `;
    document.body.appendChild(comp);
    // close onclick outside
    comp.querySelector('.product-modal__backdrop').addEventListener('click', () => { closeCompareModal(); });
  }
  const dialog = comp.querySelector('.product-modal__dialog');
  dialog.innerHTML = '';
  // Determine union of keys across all selected products (trimmed) to ensure each column shows the same rows
  const unionKeyMap = new Map(); // canonicalKeyLower -> canonicalLabel
  const bottomKeyNames = new Set(); // keys to push to bottom (description/notes/extra)
  selectedProducts.forEach(prod => {
    Object.keys(prod).forEach(k => {
      if (!k) return;
      const tk = String(k).trim();
      const lower = tk.toLowerCase();
      // skip image fields and brand logo link
      if ((/^product\s*(?:image|immage)/i).test(tk) || lower === 'brand logo link') return;
      // detect desc/notes/extra to move to bottom
      if (/description/i.test(tk) || /notes?$/i.test(tk) || /extra\s*notes|extra$/i.test(tk)) {
        bottomKeyNames.add(lower);
      } else {
        if (!unionKeyMap.has(lower)) unionKeyMap.set(lower, tk);
      }
    });
  });
  // Build ordered keys list: prioritized first, then remaining keys alphabetical, then bottom keys (desc/notes/extra)
  const prioritized = ['ranking','brand','model','product link','msrp','price segment'];
  const prioritizedSet = new Set(prioritized);
  const orderedKeys = [];
  // add prioritized terms as canonical if present
  prioritized.forEach(k => { if (unionKeyMap.has(k)) orderedKeys.push({key:k, label: unionKeyMap.get(k)}); });
  // add remainder keys
  const remainder = Array.from(unionKeyMap.keys()).filter(k => !prioritizedSet.has(k)).sort((a,b)=> a.localeCompare(b));
  remainder.forEach(k => orderedKeys.push({key:k, label: unionKeyMap.get(k)}));
  // bottom keys as list, preserve order of desc, notes, extra
  const bottomOrder = ['description','notes','extra'];
  const bottomKeys = [];
  bottomOrder.forEach(o => {
    if (bottomKeyNames.has(o)) {
      bottomKeys.push(o);
    }
  });
  // create 1..3 columns
  const columns = document.createElement('div');
  columns.className = 'compare-columns';
  // helper to find product key by canonical (case-insensitive trimmed)
  function findProductKey(prod, canonicalLower) {
    for (const kk of Object.keys(prod)) {
      if (String(kk).trim().toLowerCase() === canonicalLower) return kk;
    }
    return null;
  }
  selectedProducts.forEach(p => {
    const col = document.createElement('div');
    col.className = 'compare-col';
    // render minimal modal content for product
    // Do not show the link in the compare header; only show name + brand logo
    col.innerHTML = `<div class="compare-col-header"><img class="modal-brand-logo" src="${escapeHtml(p['Brand logo link']||'')}" alt="${escapeHtml(p['Brand']||'')}"><div class="modal-title">${escapeHtml(p['Model']||p['Product']||'')}</div></div>`;
    // Add ranking badge and star similar to product modal
    const nVal = (p['Ranking'] || p['ranking'] || '').toString().trim();
    if (nVal) {
      const badge = document.createElement('div');
      badge.className = 'modal-rank-badge';
      const n = parseInt(nVal, 10);
      if (!isNaN(n)) {
        if (n <= 50) badge.classList.add('rank-0-50');
        else if (n <= 60) badge.classList.add('rank-51-60');
        else if (n <= 70) badge.classList.add('rank-61-70');
        else if (n <= 80) badge.classList.add('rank-71-80');
        else if (n <= 90) badge.classList.add('rank-81-90');
        else badge.classList.add('rank-91-100');
      }
      const idx = currentProducts.findIndex(cp => (cp['Model']||cp['Product']||'') === (p['Model']||p['Product']||''));
      if (idx === 0) badge.classList.add('rank-first');
      else if (idx === 1) badge.classList.add('rank-second');
      else if (idx === 2) badge.classList.add('rank-third');
      // If range is <= 60 and not a top3, show whis icon instead of numeric text
      // always show the numeric rank, and for low ranks add a small icon prefix so number is visible
      badge.textContent = nVal;
      if (!isNaN(n) && n <= 60 && !(idx === 0 || idx === 1 || idx === 2)) {
        badge.classList.add('rank-icon');
        const icon = document.createElement('span');
        icon.className = 'modal-ranking-icon';
        icon.setAttribute('aria-hidden','true');
        icon.innerHTML = `<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><defs><style>.cls-1{fill:currentColor;stroke:none;}</style></defs><g><path class="cls-1" d="M186.521,265.189v27.578c0,4.969,4.219,9.016,9.438,9.016h23.016c5.203,0,9.422-4.047,9.422-9.016v-23.094 h7.859v23.094c0,4.969,4.219,9.016,9.422,9.016h23.031c5.203,0,9.438-4.047,9.438-9.016v-23.094h7.844v23.094 c0,4.969,4.219,9.016,9.438,9.016h23.016c5.203,0,9.422-4.047,9.422-9.016v-27.578c23.984-6.969,64.031-23.141,77.656-55.828 c9.891-23.766,6.016-55.047-8.797-115.344C381.88,33.689,338.755,0.001,257.177,0.001S132.489,33.689,117.661,94.017 c-14.828,60.297-18.719,91.578-8.797,115.344C122.474,242.048,162.521,258.205,186.521,265.189z"/></g></svg>`;
        // insert icon before text
        badge.insertBefore(icon, badge.firstChild);
      }
      const bg = document.createElement('div');
      let modalBgClass = 'rank-bg-default';
      if (idx === 0) modalBgClass = 'rank-bg-gold';
      else if (idx === 1) modalBgClass = 'rank-bg-silver';
      else if (idx === 2) modalBgClass = 'rank-bg-bronze';
      else if (!isNaN(n)) {
        if (n <= 50) modalBgClass = 'rank-bg-0-50';
        else if (n <= 60) modalBgClass = 'rank-bg-51-60';
        else if (n <= 70) modalBgClass = 'rank-bg-61-70';
        else if (n <= 80) modalBgClass = 'rank-bg-71-80';
        else if (n <= 90) modalBgClass = 'rank-bg-81-90';
        else modalBgClass = 'rank-bg-91-100';
      }
      bg.className = 'modal-ranking-bg spin ' + modalBgClass;
      bg.innerHTML = `<?xml version="1.0" ?>\n<svg viewBox="0 0 30 30" xmlns="http://www.w3.org/2000/svg">\n  <defs>\n    <style>.cls-1{fill:currentColor;stroke:none;}</style>\n  </defs>\n  <g id="interface-light-rating-star-3">\n    <path class="cls-1" d="M15.81.77l2.81,2.16a1.38,1.38,0,0,0,.88.28L23.1,3A1.31,1.31,0,0,1,24.41,4l.94,3.32A1.25,1.25,0,0,0,25.9,8l3,1.89a1.19,1.19,0,0,1,.5,1.47l-1.28,3.22a1.21,1.21,0,0,0,0,.88l1.28,3.22a1.19,1.19,0,0,1-.5,1.47L25.9,22a1.25,1.25,0,0,0-.55.71l-.94,3.32A1.31,1.31,0,0,1,23.1,27l-3.6-.18a1.38,1.38,0,0,0-.88.28l-2.81,2.16a1.35,1.35,0,0,1-1.62,0l-2.81-2.16a1.38,1.38,0,0,0-.88-.28L6.9,27a1.31,1.31,0,0,1-1.31-.92l-.94-3.32A1.25,1.25,0,0,0,4.1,22l-3-1.89a1.19,1.19,0,0,1-.5-1.47l1.28-3.22a1.21,1.21,0,0,0,0-.88L.59,11.34a1.19,1.19,0,0,1,.5-1.47L4.1,8a1.25,1.25,0,0,0,.55-.71L5.59,4A1.31,1.31,0,0,1,6.9,3l3.6.18a1.38,1.38,0,0,0,.88-.28L14.19.77A1.35,1.35,0,0,1,15.81.77Z"/>\n    <path class="cls-1" d="M15.68,8.49,17,12.12a.74.74,0,0,0,.65.5l3.69.15a.76.76,0,0,1,.42,1.35l-2.9,2.39a.78.78,0,0,0-.25.8l1,3.72a.73.73,0,0,1-1.09.84L15.4,19.72a.69.69,0,0,0-.8,0l-3.08,2.15A.73.73,0,0,1,10.43,21l1-3.72a.78.78,0,0,0-.25-.8l-2.9-2.39a.76.76,0,0,1,.42-1.35l3.69-.15a.74.74,0,0,0,.65-.5l1.28-3.63A.72.72,0,0,1,15.68,8.49Z"/>\n  </g>\n</svg>`;
      const rankWrap = document.createElement('div'); rankWrap.className = 'modal-rank-wrapper'; rankWrap.appendChild(bg); rankWrap.appendChild(badge);
      // Add to column root so it positions at top-right correctly
      col.appendChild(rankWrap);
    }
    // image
    const imageWrap = document.createElement('div'); imageWrap.className = 'compare-image-wrap';
    const imgs = getProductImages(p, 1);
    const img = document.createElement('img'); img.className = 'compare-image'; img.src = imgs.length ? imgs[0] : ''; img.alt = p['Model']||'';
    imageWrap.appendChild(img); col.appendChild(imageWrap);
    // specs: include all keys except image fields and brand logo
    const specs = document.createElement('div'); specs.className = 'compare-specs';
    // Render all orderedKeys for every product; do not skip if empty
    orderedKeys.forEach(keyObj => {
      const keyLower = keyObj.key; // canonical lower
      const keyLabel = keyObj.label || keyObj.key;
      const prodKey = findProductKey(p, keyLower);
      const v = prodKey ? p[prodKey] : '';
      const r = document.createElement('div'); r.className='spec-row';
      if (/product\s*link/i.test(keyLabel)) {
        const url = String(v || '').trim();
        const text = p['Model'] || p['Product'] || 'Visit';
        if (url) r.innerHTML = `<strong>${escapeHtml(keyLabel)}:</strong> <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(text)}</a>`;
        else r.innerHTML = `<strong>${escapeHtml(keyLabel)}:</strong> `;
      } else {
        r.innerHTML = `<strong>${escapeHtml(keyLabel)}:</strong> ${v ? escapeHtml(String(v)).replace(/\n/g,'<br>') : ''}`;
      }
      specs.appendChild(r);
    });
    // Append description, notes, extra notes to the bottom (big sections if present)
    const formatDetailText = (value) => {
      if (value == null) return '';
      return escapeHtml(String(value)).replace(/\n/g, '<br>');
    };
    const appendDetailRow = (keyName, label) => {
      const rawVal = keyName ? p[keyName] : '';
      const row = document.createElement('div');
      row.className = 'spec-row spec-row--detail';
      const detailHtml = formatDetailText(rawVal);
      row.innerHTML = `<strong>${escapeHtml(label)}</strong><div class="compare-detail-text">${detailHtml || '&nbsp;'}</div>`;
      specs.appendChild(row);
    };
    const descKey = Object.keys(p).find(k => /description/i.test(k));
    const notesKey = Object.keys(p).find(k => /notes?$/i.test(k));
    const extraNotesKey = Object.keys(p).find(k => /extra\s*notes|extra$/i.test(k));
    appendDetailRow(descKey, 'Product Description');
    appendDetailRow(notesKey, 'Notes');
    appendDetailRow(extraNotesKey, 'Extra notes');
    col.appendChild(specs);
    columns.appendChild(col);
  });
  dialog.appendChild(columns);
  // Make sure each column header truncates if title too long
  dialog.querySelectorAll('.compare-col .modal-title').forEach(el => { el.style.whiteSpace = 'nowrap'; el.style.overflow = 'hidden'; el.style.textOverflow = 'ellipsis'; });
  // set dialog width based on number of columns (fixed column width + gaps)
  const colWidth = 300; // px fixed column width (smaller popups)
  const gap = 12; // match css gap
  const totalWidth = selectedProducts.length * colWidth + ((selectedProducts.length - 1) * gap) + 40; // add some padding
  dialog.style.width = Math.min(totalWidth, window.innerWidth - 80) + 'px';
  const specsElements = Array.from(dialog.querySelectorAll('.compare-specs'));
  comp._compareSpecs = specsElements;
  const syncCompareRows = () => equalizeCompareSpecRows(specsElements);
  const handleCompareResize = () => {
    resetCompareSpecRowHeights(specsElements);
    window.requestAnimationFrame(syncCompareRows);
  };
  window.requestAnimationFrame(syncCompareRows);
  window.addEventListener('resize', handleCompareResize);
  comp._compareResizeHandler = handleCompareResize;
  // sync vertical scrolling across the specification panes
  try {
    let isSyncing = false;
    specsElements.forEach(el => {
      el.addEventListener('scroll', (e) => {
        if (isSyncing) return;
        isSyncing = true;
        const sTop = el.scrollTop;
        specsElements.forEach(s => { if (s !== el) s.scrollTop = sTop; });
        window.requestAnimationFrame(() => { isSyncing = false; });
      }, { passive: true });
      // handle wheel to propagate deltas to other columns (passive:false to allow preventDefault)
      el.addEventListener('wheel', (e) => {
        if (!e || Math.abs(e.deltaY) === 0) return;
        // keep the native scroll for the target, but also scroll siblings
        specsElements.forEach(s => { if (s !== el) s.scrollTop += e.deltaY; });
      }, { passive: false });
      // touch support: track finger movement and forward delta to siblings
      let lastTouchY = null;
      el.addEventListener('touchstart', (e) => {
        if (e.touches && e.touches.length) lastTouchY = e.touches[0].clientY;
      }, { passive: true });
      el.addEventListener('touchmove', (e) => {
        if (!e.touches || !e.touches.length) return;
        const y = e.touches[0].clientY;
        if (lastTouchY == null) { lastTouchY = y; return; }
        const dy = lastTouchY - y; // positive when swiping up
        lastTouchY = y;
        // apply delta to siblings
        specsElements.forEach(s => { if (s !== el) s.scrollTop += dy; });
      }, { passive: false });
      el.addEventListener('touchend', () => { lastTouchY = null; }, { passive: true });
    });
  } catch (e) {}
  comp.setAttribute('aria-hidden','false'); comp.classList.add('open'); document.body.classList.add('no-scroll');
}

function closeCompareModal() {
  const comp = document.getElementById('compareModal');
  if (!comp) return;
  comp.setAttribute('aria-hidden','true'); comp.classList.remove('open'); document.body.classList.remove('no-scroll');
  // clear selections and exit compare mode
  exitCompareMode();
  if (comp._compareResizeHandler) {
    window.removeEventListener('resize', comp._compareResizeHandler);
    comp._compareResizeHandler = null;
  }
  if (comp._compareSpecs) {
    resetCompareSpecRowHeights(comp._compareSpecs);
    comp._compareSpecs = null;
  }
}

function resetCompareSpecRowHeights(specElems = []) {
  specElems.forEach(col => {
    Array.from(col.children).forEach(row => row.style.removeProperty('min-height'));
  });
}

function equalizeCompareSpecRows(specElems = []) {
  if (!specElems.length) return;
  resetCompareSpecRowHeights(specElems);
  const maxRows = Math.max(...specElems.map(el => el.children.length));
  for (let rowIndex = 0; rowIndex < maxRows; rowIndex++) {
    let maxHeight = 0;
    specElems.forEach(col => {
      const row = col.children[rowIndex];
      if (!row) return;
      const { height } = row.getBoundingClientRect();
      if (height > maxHeight) maxHeight = height;
    });
    if (maxHeight > 0) {
      specElems.forEach(col => {
        const row = col.children[rowIndex];
        if (row) row.style.minHeight = `${maxHeight}px`;
      });
    }
  }
}

function openProductModal(product) {
  const modal = document.getElementById('productModal');
  if (!modal) return;
  modal.setAttribute('aria-hidden', 'false');
  modal.classList.add('open');
  document.body.classList.add('no-scroll');

  const titleEl = document.getElementById('modalTitle');
  const brandEl = document.getElementById('modalBrandLogo');
  const imgEl = document.getElementById('modalImage');
  const imgWrapper = document.getElementById('modalImageWrapper');
  const imageThumbs = document.getElementById('modalImageThumbs');
  // magnifier removed — don't query the element
  const specs = document.getElementById('modalSpecs');
  const leftDetails = document.getElementById('modalLeftDetails');

  // Title: product model only — do not show ranking in the header
  titleEl.textContent = `${product['Model'] || ''}`;
  brandEl.src = product['Brand logo link'] || '';
  brandEl.alt = product['Brand'] || '';
  // Add 'Visit' product button if Product link is present
  const header = document.querySelector('#productModal .product-modal__header');
  // do not add a product link button in the header; only show the name
  // collect up to 3 product images using helper which handles multiple header names/variations
  let images = getProductImages(product, 4);
  // populate main image and thumbnails
  let currentImageIndex = 0;
  function setMainImage(index) {
    currentImageIndex = index;
    const src = images[index] || '';
    imgEl.src = src;
    imgEl.alt = product['Model'] || '';
    // update active thumbnail
    Array.from(imageThumbs.querySelectorAll('img')).forEach((ti, i) => ti.classList.toggle('active', i === index));
    // prepare magnifier background
    // magnifier removed — no background to update
      // nothing to do related to magnifier
  }
  imageThumbs.innerHTML = '';
  // remove any existing nav buttons to avoid duplicates
  imgWrapper.querySelectorAll('.modal-image-nav-btn').forEach(el => el.remove());
  if (images.length > 1) {
    images.forEach((src, i) => {
      const thumb = document.createElement('img');
      thumb.src = src;
      thumb.alt = `${product['Model'] || ''} image ${i + 1}`;
      thumb.addEventListener('click', (e) => { setMainImage(i); });
      thumb.addEventListener('keydown', (e) => { if (e.key === 'Enter') setMainImage(i); });
      imageThumbs.appendChild(thumb);
    });
  }
  setMainImage(0);
  // Create prev/next buttons if more than 1 image
  let prevBtn = null;
  let nextBtn = null;
  if (images.length > 1) {
    prevBtn = document.createElement('button');
    prevBtn.className = 'modal-image-nav-btn prev';
    prevBtn.setAttribute('aria-label', 'Previous image');
    prevBtn.innerHTML = '&#8249;';
    nextBtn = document.createElement('button');
    nextBtn.className = 'modal-image-nav-btn next';
    nextBtn.setAttribute('aria-label', 'Next image');
    nextBtn.innerHTML = '&#8250;';
    imgWrapper.appendChild(prevBtn);
    imgWrapper.appendChild(nextBtn);
    prevBtn.addEventListener('click', (e) => { e.stopPropagation(); setMainImage((currentImageIndex - 1 + images.length) % images.length); });
    nextBtn.addEventListener('click', (e) => { e.stopPropagation(); setMainImage((currentImageIndex + 1) % images.length); });
    // keyboard support for arrows when the wrapper is focused
    imgWrapper.tabIndex = 0;
    imgWrapper.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); setMainImage((currentImageIndex - 1 + images.length) % images.length); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); setMainImage((currentImageIndex + 1) % images.length); }
    });
  }
  imgEl.alt = product['Model'] || '';
  // magnifier removed — no attachment

  // full-width details (description + lazy version + extra notes)
  leftDetails.innerHTML = '';
  const formatPerioText = (s) => {
    const str = String(s || '');
    if (!str.trim()) return '';
    // escape first, then format newlines and periods to <br>
    let html = escapeHtml(str).replace(/\n/g, '<br>');
    // Insert a <br> after any period followed by either space or end-of-string
    html = html.replace(/\.(\s|$)/g, '.<br>$1');
    return html;
  };
  const descKey = Object.keys(product).find(k => /description/i.test(k)) || 'Description';
  const desc = product[descKey] || '';
  if (desc && String(desc).trim()) {
    const tit = document.createElement('h3');
    tit.className = 'modal-section-title';
    tit.textContent = 'Product Description';
    leftDetails.appendChild(tit);
    const p = document.createElement('div');
    p.className = 'modal-description';
    p.innerHTML = formatPerioText(desc);
    leftDetails.appendChild(p);
  }
  const notesKey = Object.keys(product).find(k => /notes?$/i.test(k)) || 'Notes';
  const notes = product[notesKey] || '';
  if (notes && String(notes).trim()) {
    const h = document.createElement('h4');
    h.className = 'modal-section-subtitle';
    h.textContent = 'Lazy version';
    h.style.marginTop = '12px';
    h.style.marginBottom = '6px';
    leftDetails.appendChild(h);
    const n = document.createElement('div');
    n.className = 'modal-notes';
    n.innerHTML = formatPerioText(notes);
    leftDetails.appendChild(n);
  }
  const extraNotesKey = Object.keys(product).find(k => /extra/i.test(k)) || 'Extra notes';
  const extraNotes = product[extraNotesKey] || '';
  if (extraNotes && String(extraNotes).trim()) {
    const exTit = document.createElement('h4');
    exTit.className = 'modal-section-subtitle';
    exTit.textContent = 'Extra notes';
    exTit.style.marginTop = '10px';
    exTit.style.marginBottom = '6px';
    leftDetails.appendChild(exTit);
    const ex = document.createElement('div');
    ex.className = 'modal-extra-notes';
    ex.innerHTML = formatPerioText(extraNotes);
    leftDetails.appendChild(ex);
  }
  // show ranking badge in the modal (top-right of image)
  const existingBadge = document.querySelector('.modal-rank-badge');
  if (existingBadge) existingBadge.remove();
  const modalRankingVal = (product['Ranking'] || product['ranking'] || '').toString().trim();
  if (modalRankingVal) {
    const badge = document.createElement('div');
    badge.className = 'modal-rank-badge';
    badge.title = modalRankingVal;
    badge.setAttribute('aria-label', `Rank ${modalRankingVal}`);
    const n = parseInt(modalRankingVal, 10);
    if (!isNaN(n)) {
      if (n <= 50) badge.classList.add('rank-0-50');
      else if (n <= 60) badge.classList.add('rank-51-60');
      else if (n <= 70) badge.classList.add('rank-61-70');
      else if (n <= 80) badge.classList.add('rank-71-80');
      else if (n <= 90) badge.classList.add('rank-81-90');
      else badge.classList.add('rank-91-100');
    }
    // If this product is in currentProducts and within top 3, give it special badge classes
    const idx = currentProducts.findIndex(p => (p['Model'] || p['Product'] || '') === (product['Model'] || product['Product'] || ''));
    if (idx === 0) badge.classList.add('rank-first');
    else if (idx === 1) badge.classList.add('rank-second');
    else if (idx === 2) badge.classList.add('rank-third');
    // Add a spinning SVG background to modal as well (bigger)
    const modalBg = document.createElement('div');
    // determine modal background class
    let modalBgClass = 'rank-bg-default';
    if (idx === 0) modalBgClass = 'rank-bg-gold';
    else if (idx === 1) modalBgClass = 'rank-bg-silver';
    else if (idx === 2) modalBgClass = 'rank-bg-bronze';
    else if (!isNaN(n)) {
      if (n <= 50) modalBgClass = 'rank-bg-0-50';
      else if (n <= 60) modalBgClass = 'rank-bg-51-60';
      else if (n <= 70) modalBgClass = 'rank-bg-61-70';
      else if (n <= 80) modalBgClass = 'rank-bg-71-80';
      else if (n <= 90) modalBgClass = 'rank-bg-81-90';
      else modalBgClass = 'rank-bg-91-100';
    }
    modalBg.className = 'modal-ranking-bg spin ' + modalBgClass;
    modalBg.innerHTML = `<?xml version="1.0" ?>\n<svg viewBox="0 0 30 30" xmlns="http://www.w3.org/2000/svg">\n  <defs>\n    <style>.cls-1{fill:currentColor;stroke:none;}</style>\n  </defs>\n  <g id="interface-light-rating-star-3">\n    <path class="cls-1" d="M15.81.77l2.81,2.16a1.38,1.38,0,0,0,.88.28L23.1,3A1.31,1.31,0,0,1,24.41,4l.94,3.32A1.25,1.25,0,0,0,25.9,8l3,1.89a1.19,1.19,0,0,1,.5,1.47l-1.28,3.22a1.21,1.21,0,0,0,0,.88l1.28,3.22a1.19,1.19,0,0,1-.5,1.47L25.9,22a1.25,1.25,0,0,0-.55.71l-.94,3.32A1.31,1.31,0,0,1,23.1,27l-3.6-.18a1.38,1.38,0,0,0-.88.28l-2.81,2.16a1.35,1.35,0,0,1-1.62,0l-2.81-2.16a1.38,1.38,0,0,0-.88-.28L6.9,27a1.31,1.31,0,0,1-1.31-.92l-.94-3.32A1.25,1.25,0,0,0,4.1,22l-3-1.89a1.19,1.19,0,0,1-.5-1.47l1.28-3.22a1.21,1.21,0,0,0,0-.88L.59,11.34a1.19,1.19,0,0,1,.5-1.47L4.1,8a1.25,1.25,0,0,0,.55-.71L5.59,4A1.31,1.31,0,0,1,6.9,3l3.6.18a1.38,1.38,0,0,0,.88-.28L14.19.77A1.35,1.35,0,0,1,15.81.77Z"/>\n    <path class="cls-1" d="M15.68,8.49,17,12.12a.74.74,0,0,0,.65.5l3.69.15a.76.76,0,0,1,.42,1.35l-2.9,2.39a.78.78,0,0,0-.25.8l1,3.72a.73.73,0,0,1-1.09.84L15.4,19.72a.69.69,0,0,0-.8,0l-3.08,2.15A.73.73,0,0,1,10.43,21l1-3.72a.78.78,0,0,0-.25-.8l-2.9-2.39a.76.76,0,0,1,.42-1.35l3.69-.15a.74.74,0,0,0,.65-.5l1.28-3.63A.72.72,0,0,1,15.68,8.49Z"/>\n  </g>\n</svg>`;
    const modalLeftEl = document.querySelector('.modal-left');
    if (modalLeftEl) {
      // remove existing wrapper if any
      const existingWrap = modalLeftEl.querySelector('.modal-rank-wrapper');
      if (existingWrap) existingWrap.remove();
      const wrap = document.createElement('div');
      wrap.className = 'modal-rank-wrapper';
      wrap.appendChild(modalBg);
      wrap.appendChild(badge);
      // add textual label for top3 (Gold/Silver/Bronze) below the badge
      let labelText = '';
      if (idx === 0) labelText = 'GOLD';
      else if (idx === 1) labelText = 'SILVER';
      else if (idx === 2) labelText = 'BRONZE';
      if (labelText) {
        const lbl = document.createElement('div');
        lbl.className = 'modal-rank-label';
        lbl.textContent = labelText;
        // mirror the badge color class so label has proper contrast
        if (idx === 0) lbl.classList.add('rank-first');
        else if (idx === 1) lbl.classList.add('rank-second');
        else if (idx === 2) lbl.classList.add('rank-third');
        wrap.appendChild(lbl);
      }
      modalLeftEl.appendChild(wrap);
    }
    // replace numeric text with the whis icon for 0-60 if not top-3
    if (!isNaN(n) && n <= 60 && !(idx === 0 || idx === 1 || idx === 2)) {
      badge.dataset.rank = String(n);
      badge.setAttribute('title', `Rank ${n}`);
      badge.setAttribute('aria-label', `Rank ${n}`);
      badge.classList.add('rank-icon');
      badge.innerHTML = `
        <div class="modal-ranking-icon" aria-hidden="true">
          <svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
            <defs><style>.cls-1{fill:currentColor;stroke:none;}</style></defs>
            <g>
              <path class="cls-1" d="M186.521,265.189v27.578c0,4.969,4.219,9.016,9.438,9.016h23.016c5.203,0,9.422-4.047,9.422-9.016v-23.094
                h7.859v23.094c0,4.969,4.219,9.016,9.422,9.016h23.031c5.203,0,9.438-4.047,9.438-9.016v-23.094h7.844v23.094
                c0,4.969,4.219,9.016,9.438,9.016h23.016c5.203,0,9.422-4.047,9.422-9.016v-27.578c23.984-6.969,64.031-23.141,77.656-55.828
                c9.891-23.766,6.016-55.047-8.797-115.344C381.88,33.689,338.755,0.001,257.177,0.001S132.489,33.689,117.661,94.017
                c-14.828,60.297-18.719,91.578-8.797,115.344C122.474,242.048,162.521,258.205,186.521,265.189z M314.114,108.83
                c21.688-3.547,42.844,13.547,47.25,38.156c4.391,24.625-9.625,47.453-31.297,51.016c-21.719,3.531-42.891-13.531-47.281-38.172
                C278.396,135.22,292.427,112.392,314.114,108.83z M287.724,221.314h-30.547h-30.516l30.516-36.5L287.724,221.314z M153.005,146.986
                c4.438-24.609,25.563-41.703,47.25-38.156c21.703,3.563,35.75,26.391,31.328,51c-4.391,24.641-25.531,41.703-47.234,38.172
                C162.63,194.439,148.614,171.611,153.005,146.986z"/>
              <path class="cls-1" d="M450.208,397.83c-16.391-7.25-35.656-1.156-44.484,13.516c-6.484,8.063-16.563,4.906-21.188,2.875
                c-3.438-1.516-39.281-17.36-81.844-36.157c36.578-16.75,66.781-30.578,72.828-33.344c16.703-7.641,28.703-11.813,39.719-2.781
                c9.609,12.813,27.703,17.609,43.078,10.578c17.266-7.891,24.563-27.688,16.297-44.203c-4.984-10-14.547-16.469-25.125-18.297
                c5.156-9.031,5.891-20.188,0.875-30.203c-8.25-16.516-28.938-23.484-46.203-15.594c-14.953,6.844-22.406,22.594-18.781,37.422
                c0.859,11.156-15.75,20.094-26.766,25.141c-7.688,3.516-55.188,25.672-105.969,49.172c-47.75-21.094-91.875-40.578-99.359-43.875
                c-16.828-7.438-27.844-13.609-27.609-27.469c4.188-15.25-3.484-31.641-18.969-38.5c-17.359-7.656-37.953-0.406-45.984,16.219
                c-4.859,10.063-3.969,21.219,1.328,30.203c-10.563,1.953-20.031,8.531-24.875,18.594c-8.016,16.641-0.438,36.328,16.938,44
                c15.047,6.641,32.484,2.078,42.094-10.047c8.453-7.766,26.234-1.234,37.297,3.688c5.781,2.547,34.063,14.813,69.359,30.172
                c-42.5,19.531-78.5,35.86-84.156,37.657c-3.359,1.078-6.375,1.203-9.031,0.813c-0.203-0.453-0.375-0.938-0.609-1.375
                c-8.234-16.516-28.938-23.5-46.203-15.594c-17.266,7.891-24.563,27.704-16.297,44.219c5,9.969,14.547,16.453,25.125,18.281
                c-5.141,9.031-5.875,20.203-0.891,30.203c8.281,16.516,28.953,23.5,46.219,15.609c16.313-7.484,23.703-25.531,17.531-41.406
                c-2.344-9.906,6.609-15.344,11.203-17.453c4.109-1.859,54.563-24.969,107.266-49.094c57.578,25.172,115.453,50.719,121.984,54.61
                c3,1.781,5.031,3.922,6.406,6.125c-0.25,0.438-0.5,0.859-0.719,1.313c-8.016,16.625-0.453,36.297,16.938,44
                c17.375,7.656,37.953,0.406,45.984-16.219c4.844-10.047,3.953-21.219-1.328-30.188c10.563-1.969,20.016-8.563,24.875-18.594
                C475.177,425.205,467.599,405.501,450.208,397.83z"/>
            </g>
          </svg>
        </div>`;
    }
    // set computed color fallback for browsers without CSS loaded
    const computedModalColor = window.getComputedStyle ? window.getComputedStyle(modalBg).color : null;
    if (!computedModalColor) {
      const map = {
        'rank-bg-gold': '#D4AF37',
        'rank-bg-silver': '#C0C0C0',
        'rank-bg-bronze': '#CD7F32',
        'rank-bg-default': '#ffffffcc',
        'rank-bg-0-50': '#000000',
        'rank-bg-51-60': '#D83DFF',
        'rank-bg-61-70': '#FF3E3E',
        'rank-bg-71-80': '#FFF652',
        'rank-bg-81-90': '#C6FF53',
        'rank-bg-91-100': '#1AC955'
      };
      if (map[modalBgClass]) modalBg.style.color = map[modalBgClass];
    }
    if (!badge.classList.contains('rank-icon')) {
      badge.textContent = modalRankingVal;
    }
    const imageWrap = document.querySelector('.modal-left .modal-image') || document.getElementById('modalImage');
  }
  // remaining specs on the right column
  specs.innerHTML = '';
  // product link: will be added below Price segment if present (see loop below)
  // remaining specs
  const otherKeys = Object.keys(product).filter(k => {
    // exclude image fields (Product image, Product image N, Product immage)
    if ((/^product\s*(?:image|immage)/i).test(k)) return false;
    const exclude = ['Product immage','Brand logo link','Product link','Model','Brand','Ranking','Product image','Store','Description','description','Notes','notes','Extra notes','Extra','extra notes'];
    return !exclude.includes(k);
  });
  otherKeys.forEach(k => {
    const v = product[k];
    if (v && String(v).trim()) {
      const row = document.createElement('div');
      row.className = 'spec-row';
      row.innerHTML = `<strong>${escapeHtml(k)}:</strong> ${escapeHtml(String(v)).replace(/\n/g,'<br>')}`;
      specs.appendChild(row);

      // If this is the 'Price segment' spec, add a following 'Product Link' spec row
      if (k === 'Price segment' && product['Product link'] && String(product['Product link']).trim()) {
        const linkRow = document.createElement('div');
        linkRow.className = 'spec-row';
        const linkUrl = String(product['Product link']).trim();
        const linkText = escapeHtml(String(product['Model'] || product['Product'] || 'Product'));
        linkRow.innerHTML = `<strong>Product Link:</strong> <a href="${escapeHtml(linkUrl)}" target="_blank" rel="noopener noreferrer">${linkText}</a>`;
        specs.appendChild(linkRow);
        rankEl.setAttribute('title', `Rank ${n}`);
        rankEl.setAttribute('data-rank', String(n));
        rankEl.setAttribute('aria-label', `Rank ${n}`);
      }
    }
  });
  // If a Product Link exists but we haven't added it (e.g., no Price segment), add it at the end of specs
  try {
    const hasProductLinkRow = Array.from(specs.querySelectorAll('.spec-row')).some(r => /product\s*link/i.test(r.textContent || ''));
    if (!hasProductLinkRow && product['Product link'] && String(product['Product link']).trim()) {
      const linkUrl = String(product['Product link']).trim();
      const linkText = escapeHtml(String(product['Model'] || product['Product'] || 'Product'));
      const linkRow = document.createElement('div');
      linkRow.className = 'spec-row';
      linkRow.innerHTML = `<strong>Product Link:</strong> <a href="${escapeHtml(linkUrl)}" target="_blank" rel="noopener noreferrer">${linkText}</a>`;
      specs.appendChild(linkRow);
    }
  } catch (e) {}

  // If any of the above sections were empty, create an empty clickable placeholder
  function addPlaceholder(titleText, keyName, shortClass) {
    const curVal = product[keyName] || '';
    if (!curVal || !String(curVal).trim()) {
      const tit = document.createElement('h3');
      tit.className = 'modal-section-title';
      tit.textContent = titleText;
      leftDetails.appendChild(tit);
      const placeholder = document.createElement('div');
      placeholder.className = 'modal-empty-placeholder ' + (shortClass || '');
      // Show just the label; CSS pseudo element will display "Click to add..." before it
      placeholder.textContent = titleText;
      // Do not make modal placeholders interactive; editing is restricted to the CSV editor only
      placeholder.tabIndex = -1;
      placeholder.setAttribute('role', 'presentation');
      leftDetails.appendChild(placeholder);
    }
  }
  addPlaceholder('Product Description', descKey, 'desc-placeholder');
  addPlaceholder('Lazy version', notesKey, 'notes-placeholder');
  addPlaceholder('Extra notes', extraNotesKey, 'extra-placeholder');
  // accessories / assesories
  const assKey = Object.keys(product).find(k => /assesories|accessorie|accessories/i.test(k)) || 'Assesories';
  addPlaceholder('Assesories', assKey, 'ass-placeholder');

  // Modal header logo/title should not be clickable — keep them non-interactive
  // Ensure they are not focusable as links and look like regular header items
  brandEl.style.cursor = '';
  titleEl.style.cursor = '';
  brandEl.tabIndex = -1;
  titleEl.tabIndex = -1;

  const closeBtn = document.getElementById('modalCloseBtn');
  if (closeBtn) closeBtn.onclick = closeProductModal;
}

function closeProductModal() {
  const modal = document.getElementById('productModal');
  if (!modal) return;
  modal.setAttribute('aria-hidden', 'true');
  modal.classList.remove('open');
  document.body.classList.remove('no-scroll');
  stopAttemptCountdown();
}

// magnifier removed

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function openCsvEditor() {
  const modal = document.getElementById('csvEditorModal');
  const container = document.getElementById('csvEditorContainer');
  if (!modal || !container) return;
  container.innerHTML = '';
  const sortBtn = document.getElementById('csvEditorViewSortBtn');
  if (sortBtn) sortBtn.textContent = `View: ${csvEditorViewSort === 'brand' ? 'Brand' : 'Ranking'}`;
  const headers = lastCsvHeaders && lastCsvHeaders.length ? lastCsvHeaders.slice() : Object.keys(currentProducts[0] || {});
  // build table
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const tr = document.createElement('tr');
  headers.forEach(h => {
    const th = document.createElement('th');
    th.textContent = h;
    tr.appendChild(th);
  });
  // add action column for delete
  const actionTh = document.createElement('th');
  actionTh.textContent = '';
  tr.appendChild(actionTh);
  thead.appendChild(tr);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  // Build a view order (view-only sort). We preserve the original index in currentProducts via dataset.originalIndex
  const viewItems = currentProducts.map((p, idx) => ({ p, idx }));
  if (csvEditorViewSort === 'ranking') {
    viewItems.sort((a, b) => {
      const ra = parseInt((a.p['Ranking'] || a.p['ranking'] || '').toString().trim().replace(/[^0-9-]/g, ''), 10);
      const rb = parseInt((b.p['Ranking'] || b.p['ranking'] || '').toString().trim().replace(/[^0-9-]/g, ''), 10);
      const na = isNaN(ra) ? -Infinity : ra;
      const nb = isNaN(rb) ? -Infinity : rb;
      return nb - na;
    });
  } else {
    // default: brand (ascending) then ranking (descending within brand)
    viewItems.sort((a, b) => {
      const ba = String(a.p['Brand'] || a.p['Store'] || '').trim().toLowerCase();
      const bb = String(b.p['Brand'] || b.p['Store'] || '').trim().toLowerCase();
      if (ba !== bb) return ba.localeCompare(bb);
      const ra = parseInt((a.p['Ranking'] || a.p['ranking'] || '').toString().trim().replace(/[^0-9-]/g, ''), 10);
      const rb = parseInt((b.p['Ranking'] || b.p['ranking'] || '').toString().trim().replace(/[^0-9-]/g, ''), 10);
      const na = isNaN(ra) ? -Infinity : ra;
      const nb = isNaN(rb) ? -Infinity : rb;
      return nb - na;
    });
  }
  viewItems.forEach(({p, idx}, rIdx) => {
    const row = buildCsvEditorRow(headers, p, rIdx, idx);
    tbody.appendChild(row);
  });
  table.appendChild(tbody);
  container.appendChild(table);
  // gather any brand logo links set in the editor and update the global map
  collectBrandLogoMapFromEditor();
  // a little accessibility: focus first input
  const firstInput = container.querySelector('input');
  if (firstInput) firstInput.focus();
  modal.setAttribute('aria-hidden', 'false');
  modal.classList.add('open');
  document.body.classList.add('no-scroll');
}

function collectBrandLogoMapFromEditor() {
  const container = document.getElementById('csvEditorContainer');
  if (!container) return;
  const rows = Array.from(container.querySelectorAll('table tbody tr'));
  for (const r of rows) {
    const brandTd = Array.from(r.querySelectorAll('td')).find(td => td.dataset && td.dataset.header && isBrandField(td.dataset.header));
      const logoTd = Array.from(r.querySelectorAll('td')).find(td => td.dataset && td.dataset.header && isBrandLogoField(td.dataset.header));
    const brandInput = brandTd ? brandTd.querySelector('input') : null;
    const logoInput = logoTd ? logoTd.querySelector('input') : null;
    if (brandInput && logoInput && brandInput.value && logoInput.value) {
      const key = brandInput.value.trim().toLowerCase();
      brandLogoMap[key] = logoInput.value.trim();
    }
  }
}

function buildCsvEditorRow(headers, prod, rowIndex, originalIndex) {
  const tr = document.createElement('tr');
  if (typeof originalIndex === 'number') tr.dataset.originalIndex = String(originalIndex);
  headers.forEach((h) => {
    const td = document.createElement('td'); 
    td.dataset.header = h; 
    const value = prod[h] || ''; 
    if (isImageValue(value)) { 
      const img = document.createElement('img');
      img.className = 'img-preview';
      img.src = value;
      img.alt = h;
      img.addEventListener('click', (e) => {
        e.stopPropagation();
        td.innerHTML = '';
        const input = createEditorInput(h, value);
        td.appendChild(input);
        input.focus();
      });
      td.appendChild(img);
    } else if (isMultilineField(h)) {
      // show simple text preview (truncated), clicking opens field editor modal for large editing
      const preview = document.createElement('div');
      preview.className = 'field-preview';
      if (value && String(value).trim()) preview.textContent = String(value).slice(0,200);
      else { preview.textContent = h; preview.classList.add('placeholder'); }
      preview.style.cursor = 'pointer';
      preview.addEventListener('click', () => openFieldEditor(td, h, rowIndex, prod));
      td.appendChild(preview);
    } else if (isLinkField(h)) {
      const input = createEditorInput(h, value);
      // clicking input expands using editor modal to view long link
      input.addEventListener('focus', () => input.select());
      input.addEventListener('dblclick', () => openFieldEditor(td, h, rowIndex, prod));
      td.appendChild(input);
    } else {
      const input = createEditorInput(h, value);
      td.appendChild(input);
    }
    tr.appendChild(td);
  });
  // action column: delete row
  const actionTd = document.createElement('td');
  const delBtn = document.createElement('button');
  delBtn.className = 'copy-btn';
  delBtn.textContent = 'Delete';
  delBtn.addEventListener('click', (e) => { e.stopPropagation(); tr.remove(); });
  actionTd.appendChild(delBtn);
  tr.appendChild(actionTd);
  return tr;
}

function addCsvEditorRow() {
  const container = document.getElementById('csvEditorContainer');
  const table = container.querySelector('table');
  const tbody = table.querySelector('tbody');
  const headers = lastCsvHeaders && lastCsvHeaders.length ? lastCsvHeaders.slice() : [];
  const newProd = {};
  headers.forEach(h => { newProd[h] = ''; });
  currentProducts.push(newProd);
  const row = buildCsvEditorRow(headers, newProd, currentProducts.length - 1, currentProducts.length - 1);
  tbody.appendChild(row);
  // scroll to bottom
  container.scrollTop = container.scrollHeight;
}

function isImageValue(v) {
  if (!v) return false;
  const s = String(v).trim();
  if (!s) return false;
  if (s.startsWith('data:image/')) return true;
  if ((/\.(jpe?g|png|gif|svg)$/i).test(s)) return true;
  try {
    const u = new URL(s);
    if ((/\.(jpe?g|png|gif|svg)(\?.*)?$/i).test(u.pathname)) return true;
  } catch (e) {}
  return false;
}

function isMultilineField(h) {
  if (!h) return false;
  const s = String(h).toLowerCase();
  return /assesories|description|notes|extra notes/i.test(s);
}

function isLinkField(h) {
  if (!h) return false;
  const s = String(h).toLowerCase();
  return /product link|product image\s*\d*/i.test(s);
}

function isBrandField(h) {
  if (!h) return false;
  return (/(?:^|\b)(?:brand|store|vendor)(?:$|\b)/i).test(String(h).trim());
}

function isBrandLogoField(h) {
  if (!h) return false;
  const s = String(h).toLowerCase();
  return s.includes('brand logo') || s.includes('brandlogo') || s.includes('logo link') || s.includes('brand logo link');
}

function propagateBrandLogo(brandName, link) {
  if (!brandName || !link) return;
  const key = String(brandName).trim().toLowerCase();
  brandLogoMap[key] = link;
  const container = document.getElementById('csvEditorContainer');
  if (!container) return;
  const rows = Array.from(container.querySelectorAll('table tbody tr'));
  rows.forEach(r => {
    const brandTd = r.querySelector('td[data-header]');
    // find the brand cell
    const brandTdCell = Array.from(r.querySelectorAll('td')).find(td => (td.dataset && td.dataset.header && isBrandField(td.dataset.header)));
    const prom = brandTdCell ? brandTdCell.querySelector('input') : null;
    const rowBrand = prom ? prom.value.trim().toLowerCase() : '';
    if (rowBrand === key) {
      const logoTd = Array.from(r.querySelectorAll('td')).find(td => td.dataset && td.dataset.header && td.dataset.header.toLowerCase() === 'brand logo link');
      if (logoTd) {
        const logoInput = logoTd.querySelector('input');
        const logoImg = logoTd.querySelector('img');
        if (logoInput && !logoInput.value.trim()) {
          logoInput.value = link;
          logoInput.dispatchEvent(new Event('blur'));
        } else if (logoImg && !logoImg.src) {
          // set img src if present
          logoImg.src = link;
        }
        // also update the in-memory product if present
        const tbody = r.closest('tbody');
        const idx = tbody ? Array.from(tbody.children).indexOf(r) : -1;
        if (idx >= 0 && currentProducts[idx]) currentProducts[idx]['Brand logo link'] = link;
      }
    }
  });
}

function createEditorInput(field, value) {
  const input = document.createElement('input');
    input.value = value || ''; 
    input.dataset.field = field; 
  input.dataset.field = field;
  // paste handler to detect image files or links
  input.addEventListener('paste', async (e) => {
    // if clipboard contains files (image), read it as dataURL
    const clipboard = e.clipboardData || window.clipboardData;
    if (!clipboard) return;
    // handle files
    if (clipboard.files && clipboard.files.length) {
      const f = clipboard.files[0];
      if (f.type && f.type.startsWith('image/')) {
        e.preventDefault();
        const dataUrl = await readFileAsDataURL(f);
        // replace input with preview
        const td = input.closest('td');
        td.innerHTML = '';
        const img = document.createElement('img');
        img.className = 'img-preview';
        img.src = dataUrl;
        img.alt = field;
        img.addEventListener('click', (ev) => {
          ev.stopPropagation();
          td.innerHTML = '';
          const newInput = createEditorInput(field, dataUrl);
          td.appendChild(newInput);
          newInput.focus();
        });
        td.appendChild(img);
        return;
      }
    }
    // handle text being pasted; if it looks like an image URL, convert to preview
    if (clipboard.types && clipboard.types.includes('text/plain')) {
      const text = (e.clipboardData || window.clipboardData).getData('text/plain');
      if (isImageValue(text)) {
        e.preventDefault();
        const td = input.closest('td');
        td.innerHTML = '';
        const img = document.createElement('img');
        img.className = 'img-preview';
        img.src = text;
        img.alt = field;
        img.addEventListener('click', (ev) => {
          ev.stopPropagation();
          td.innerHTML = '';
          const newInput = createEditorInput(field, text);
          td.appendChild(newInput);
          newInput.focus();
        });
        td.appendChild(img);
        return;
      }
    }
  });
  // clicking large links or double-click on input opens field editor for convenience
  if (isLinkField(field)) {
    input.addEventListener('click', () => openFieldEditor(input.closest('td'), field, findRowIndexFromInput(input)));
  } else {
    input.addEventListener('dblclick', () => openFieldEditor(input.closest('td'), field, findRowIndexFromInput(input)));
  }
  // if user leaves the input and it's an image value, show preview
  input.addEventListener('blur', () => {
    try {
      const td = input.closest('td');
      const val = input.value || '';
      if (isImageValue(val)) {
        td.innerHTML = '';
        const img = document.createElement('img');
        img.className = 'img-preview';
        img.src = val;
        img.alt = field;
        img.addEventListener('click', (ev) => {
          ev.stopPropagation();
          td.innerHTML = '';
          const inpt = createEditorInput(field, val);
          td.appendChild(inpt);
          inpt.focus();
        });
        td.appendChild(img);
      }
    } catch (e) {}
  });

  // additional brand / brand logo auto-fill behavior in CSV editor
  try {
    const header = String(field || '').trim();
    if (isBrandField(header)) {
      input.addEventListener('blur', (e) => {
        const brandName = (input.value || '').trim();
        if (!brandName) return;
        const row = input.closest('tr');
        const logoTd = row ? Array.from(row.querySelectorAll('td')).find(td => td.dataset && td.dataset.header && td.dataset.header.toLowerCase() === 'brand logo link') : null;
        const logoInput = logoTd ? logoTd.querySelector('input') : null;
        const existingLogo = logoInput ? logoInput.value.trim() : '';
        // If a logo link exists for this brand globally, and logo is empty, fill it
        const key = brandName.toLowerCase();
        let candidate = brandLogoMap[key];
        // fallback: try to find in the CSV editor rows a Brand logo link for this brand
        if (!candidate) {
          const container = document.getElementById('csvEditorContainer');
          if (container) {
            const rows = Array.from(container.querySelectorAll('table tbody tr'));
            for (const r of rows) {
              const bTd = Array.from(r.querySelectorAll('td')).find(td => td.dataset && td.dataset.header && isBrandField(td.dataset.header));
              const lTd = Array.from(r.querySelectorAll('td')).find(td => td.dataset && td.dataset.header && td.dataset.header.toLowerCase() === 'brand logo link');
              const bInput = bTd ? bTd.querySelector('input') : null;
              const lInput = lTd ? lTd.querySelector('input') : null;
              if (bInput && lInput && (bInput.value || '').trim().toLowerCase() === key && (lInput.value || '').trim()) { candidate = (lInput.value || '').trim(); break; }
            }
          }
        }
        if (!existingLogo && candidate) {
          if (logoInput) { logoInput.value = candidate; logoInput.dispatchEvent(new Event('blur')); }
        }
        // if this row has both brand and logo, set mapping and propagate
        if (existingLogo) {
          propagateBrandLogo(brandName, existingLogo);
        }
      });
    }
    if ((/^brand\s*logo\s*link$/i).test(header)) {
      input.addEventListener('focus', (e) => {
        const row = input.closest('tr');
        const brandTd = row ? Array.from(row.querySelectorAll('td')).find(td => td.dataset && td.dataset.header && isBrandField(td.dataset.header)) : null;
        const brandInput = brandTd ? brandTd.querySelector('input') : null;
        const brandVal = brandInput ? (brandInput.value || '').trim() : '';
        const key = (brandVal || '').toLowerCase();
        if (brandVal && brandLogoMap[key] && !input.value.trim()) {
          input.value = brandLogoMap[key];
          // trigger blur logic to convert to preview if needed
          input.dispatchEvent(new Event('blur'));
        }
      });
      input.addEventListener('blur', () => {
        const row = input.closest('tr');
        const brandTd = row ? Array.from(row.querySelectorAll('td')).find(td => td.dataset && td.dataset.header && isBrandField(td.dataset.header)) : null;
        const brandInput = brandTd ? brandTd.querySelector('input') : null;
        const brandVal = brandInput ? (brandInput.value || '').trim() : '';
        if (brandVal && input.value && input.value.trim()) {
          propagateBrandLogo(brandVal, input.value.trim());
        }
      });
    }
  } catch (e) {}
  return input;
}

function findRowIndexFromInput(input) {
  const tr = input.closest('tr');
  if (!tr) return -1;
  const tbody = tr.parentElement;
  return Array.from(tbody.children).indexOf(tr);
}

// Field editor functions
function openFieldEditor(td, field, rowIndex, product = null) {
  const modal = document.getElementById('fieldEditorModal');
  const title = document.getElementById('fieldEditorTitle');
  const label = document.getElementById('fieldEditorLabel');
  const input = document.getElementById('fieldEditorInput');
  const textarea = document.getElementById('fieldEditorTextarea');
  if (!modal || !input || !textarea) return;
  title.textContent = `${field}`;
  label.textContent = `${field}`;
  let curVal = td.querySelector('input') ? td.querySelector('input').value : (td.querySelector('img') ? td.querySelector('img').src : td.textContent || '');
  // If product was not passed, try to deduce it from the row's data-original-index (if present)
  if (!product) {
    try {
      const tr = td.closest('tr');
      if (tr && tr.dataset && tr.dataset.originalIndex) {
        const o = parseInt(tr.dataset.originalIndex, 10);
        if (!isNaN(o) && currentProducts[o]) product = currentProducts[o];
      }
    } catch (e) {}
  }
  if (product && typeof product === 'object') {
    const key = Object.keys(product).find(k => k.toLowerCase() === field.toLowerCase()) || field;
    curVal = product[key] || '';
  }
  modal._editingCell = td;
  modal._editingField = field;
  modal._editingRowIndex = rowIndex;
  if (product && typeof product === 'object') {
    // ensure we update the product reference inside currentProducts when possible
    const indexMatch = currentProducts.findIndex(p => (p['Model'] || p['Product'] || '') === (product['Model'] || product['Product'] || ''));
    if (indexMatch >= 0) modal._editingProduct = currentProducts[indexMatch];
    else modal._editingProduct = product;
  } else {
    modal._editingProduct = null;
  }
  if (isMultilineField(field)) {
    textarea.style.display = 'block';
    input.style.display = 'none';
    textarea.value = String(curVal || '');
    textarea.focus();
  } else {
    textarea.style.display = 'none';
    input.style.display = 'block';
    input.value = String(curVal || '');
    input.focus();
  }
  modal.setAttribute('aria-hidden', 'false');
  modal.classList.add('open');
  document.body.classList.add('no-scroll');
}

function closeFieldEditor() {
  const modal = document.getElementById('fieldEditorModal');
  if (!modal) return;
  modal.setAttribute('aria-hidden', 'true');
  modal.classList.remove('open');
  document.body.classList.remove('no-scroll');
  modal._editingCell = null;
}

function saveFieldEditor() {
  const modal = document.getElementById('fieldEditorModal');
  const input = document.getElementById('fieldEditorInput');
  const textarea = document.getElementById('fieldEditorTextarea');
  if (!modal) return;
  const td = modal._editingCell;
  const field = modal._editingField;
  const rowIndex = modal._editingRowIndex;
  if (!td) { closeFieldEditor(); return; }
  const newVal = (isMultilineField(field)) ? textarea.value : input.value;
  td.innerHTML = '';
  if (isImageValue(newVal)) {
    const img = document.createElement('img');
    img.className = 'img-preview';
    img.src = newVal;
    img.alt = field;
    img.addEventListener('click', (ev) => {
      ev.stopPropagation();
      td.innerHTML = '';
      const inpt = createEditorInput(field, newVal);
      td.appendChild(inpt);
      inpt.focus();
    });
    td.appendChild(img);
  } else if (isMultilineField(field)) {
    const preview = document.createElement('div');
    preview.className = 'field-preview';
    preview.textContent = String(newVal || '').slice(0,200);
    preview.style.cursor = 'pointer';
    preview.addEventListener('click', () => openFieldEditor(td, field, rowIndex));
    td.appendChild(preview);
  } else {
    const inpt = createEditorInput(field, newVal);
    td.appendChild(inpt);
  }
  // If editing from the CSV editor, update currentProducts by row index
  if (typeof rowIndex === 'number' && rowIndex >= 0) {
    const idx = rowIndex;
    if (currentProducts[idx]) currentProducts[idx][field] = newVal;
  }
  // If editing from product modal or external context, update the product object directly
  if (modal._editingProduct) {
    modal._editingProduct[field] = newVal;
  } else {
    // fallback: try to find index based on the table row
    const tr = td.closest('tr');
    if (tr) {
      const tbody = tr.closest('tbody');
      const index = Array.from(tbody.children).indexOf(tr);
      if (currentProducts[index]) currentProducts[index][field] = newVal;
    }
  }
  // If we changed a product via the modal, re-render the open modal to show changes
  if (modal._editingProduct) {
    try { renderProducts(currentProducts); openProductModal(modal._editingProduct); } catch (e) {}
  }
  closeFieldEditor();
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function applyCsvEditorChanges() {
  const container = document.getElementById('csvEditorContainer');
  const table = container.querySelector('table');
  const headers = lastCsvHeaders && lastCsvHeaders.length ? lastCsvHeaders.slice() : [];
  const rows = Array.from(table.querySelectorAll('tbody tr'));
  const newProducts = [];
  rows.forEach(r => {
    const origIndex = r.dataset && r.dataset.originalIndex ? parseInt(r.dataset.originalIndex, 10) : NaN;
    const obj = {};
    const tds = Array.from(r.querySelectorAll('td'));
    headers.forEach((h, i) => {
      const td = tds[i];
      if (!td) { obj[h] = ''; return; }
      const input = td.querySelector('input');
      const img = td.querySelector('img');
      if (input) obj[h] = input.value;
      else if (img) obj[h] = img.src;
      else obj[h] = '';
    });
    if (!isNaN(origIndex) && currentProducts[origIndex]) {
      // merge updated fields into original object to preserve other fields not shown in headers
      const merged = Object.assign({}, currentProducts[origIndex], obj);
      newProducts.push(merged);
    } else {
      newProducts.push(obj);
    }
  });
  // update currentProducts and re-render grid
  currentProducts = newProducts;
  renderProducts(currentProducts);
  // close modal
  const modal = document.getElementById('csvEditorModal');
  if (modal) { modal.setAttribute('aria-hidden', 'true'); modal.classList.remove('open'); document.body.classList.remove('no-scroll'); }
}

function downloadEditedCsv() {
  const container = document.getElementById('csvEditorContainer');
  const table = container.querySelector('table');
  const headers = lastCsvHeaders && lastCsvHeaders.length ? lastCsvHeaders.slice() : [];
  // ensure we read the current table values first (so unsaved changes are downloaded too)
  const rows = Array.from(table.querySelectorAll('tbody tr'));
  const updated = rows.map(r => {
    const obj = {};
    const tds = Array.from(r.querySelectorAll('td'));
    headers.forEach((h, i) => {
      const td = tds[i];
      if (!td) { obj[h] = ''; return; }
      const input = td.querySelector('input');
      const img = td.querySelector('img');
      if (input) obj[h] = input.value;
      else if (img) obj[h] = img.src;
      else obj[h] = '';
    });
    return obj;
  });
  // Sort download output by Brand name (ascending) and within brand by Ranking (descending).
  function brandThenRankingSort(arr) {
    const groups = {};
    arr.forEach(p => {
      const brand = String(p['Brand'] || p['Store'] || '').trim();
      const key = brand.toLowerCase();
      if (!groups[key]) groups[key] = { brand, items: [] };
      groups[key].items.push(p);
    });
    // sort groups by brand name (empty brand pushed last)
    const keys = Object.keys(groups).sort((a, b) => {
      const A = (groups[a].brand || '').toLowerCase();
      const B = (groups[b].brand || '').toLowerCase();
      if (!A && !B) return 0;
      if (!A) return 1;
      if (!B) return -1;
      return A.localeCompare(B);
    });
    const out = [];
    keys.forEach(k => {
      const itms = groups[k].items;
      itms.sort((a, b) => {
        const ra = parseInt((a['Ranking'] || a['ranking'] || '').toString().trim().replace(/[^0-9-]/g, ''), 10);
        const rb = parseInt((b['Ranking'] || b['ranking'] || '').toString().trim().replace(/[^0-9-]/g, ''), 10);
        const na = isNaN(ra) ? -Infinity : ra;
        const nb = isNaN(rb) ? -Infinity : rb;
        return nb - na;
      });
      itms.forEach(it => out.push(it));
    });
    return out;
  }
  const finalSorted = brandThenRankingSort(updated);
  const csvText = serializeProductsToCsv(finalSorted, headers, { convertNewlinesToBr: true, delimiter: ',' });
  const blob = new Blob([csvText], {type: 'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'exported_products.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function renderProducts(products) {
  const grid = document.getElementById('productGrid');
  grid.setAttribute('role','list');
  grid.innerHTML = '';
  // We'll set currentProducts to the sorted product list below so the index in `currentProducts` matches the UI order
  // Sort products by numeric Ranking descending (higher ranking first). Missing rankings go to the end.
  products.sort((a, b) => {
    const ra = parseInt((a['Ranking'] || a['ranking'] || '').toString().trim().replace(/[^0-9-]/g, ''), 10);
    const rb = parseInt((b['Ranking'] || b['ranking'] || '').toString().trim().replace(/[^0-9-]/g, ''), 10);
    const na = isNaN(ra) ? -Infinity : ra;
    const nb = isNaN(rb) ? -Infinity : rb;
    return nb - na; // descending
  });
  // After sorting, update currentProducts (preserve the sorted ordering for modal indices)
  currentProducts = products.map(p => Object.assign({}, p));
  // Propagate the first seen Brand logo link to all products of the same brand to reuse image assets and avoid duplicate downloads.
  brandLogoMap = {};
  for (const p of currentProducts) {
    const brand = String(p['Brand'] || p['Store'] || '').trim();
    if (!brand) continue;
    const key = brand.toLowerCase();
    const link = String(p['Brand logo link'] || '').trim();
    if (link && !brandLogoMap[key]) brandLogoMap[key] = link;
  }
  for (const p of currentProducts) {
    const brand = String(p['Brand'] || p['Store'] || '').trim();
    if (!brand) continue;
    const key = brand.toLowerCase();
    if ((!p['Brand logo link'] || !String(p['Brand logo link']).trim()) && brandLogoMap[key]) {
      p['Brand logo link'] = brandLogoMap[key];
    }
  }

  // Render top 3 in their own row (3 across) and then the rest in 5-per-row
  if (products.length > 0) {
    const topThree = products.slice(0, 3);
    if (topThree.length) {
      const tRow = document.createElement('div');
      tRow.setAttribute('role', 'group');
      tRow.className = 'product-row top-three-row';
      tRow.setAttribute('data-row-index', 0);
      topThree.forEach((p, idx) => {
        const thumb = createThumbCard(p, idx); // globalIndex 0..2
        tRow.appendChild(thumb);
      });
      grid.appendChild(tRow);
    }
    // Remaining items
    const rest = products.slice(3);
    if (rest.length) {
      const rows = chunkArray(rest, THUMBNAIL_PER_ROW);
      rows.forEach((rowItems, rIdx) => {
        const row = document.createElement('div');
        row.setAttribute('role','group');
        row.className = 'product-row';
        // data-row-index maps after top-three row (so adds 1)
        row.setAttribute('data-row-index', rIdx + 1);
        rowItems.forEach((p, localIndex) => {
          const globalIndex = 3 + (rIdx * THUMBNAIL_PER_ROW + localIndex);
          const thumb = createThumbCard(p, globalIndex);
          row.appendChild(thumb);
        });
        grid.appendChild(row);
      });
    }
  }

  // setup scroll snapping observer and fade
  const rowsEl = Array.from(document.querySelectorAll('.product-row'));
  const options = { root: document.querySelector('.docks-grid-container'), threshold: 0.5 };
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      const el = e.target;
      if (e.intersectionRatio >= 0.8) {
        el.classList.remove('faded');
      } else {
        el.classList.add('faded');
      }
    });
  }, options);
  rowsEl.forEach(r => observer.observe(r));
}

async function init() {
  console.debug('init: starting');
  // Wire up loading modal manual Try again button early so it's available while loadCsvData runs
  const loadingTryAgainBtn = document.getElementById('loadingTryAgainBtn');
  if (loadingTryAgainBtn) loadingTryAgainBtn.addEventListener('click', async () => {
    // Clear retry timer and attempt count
    if (csvRetryTimer) clearTimeout(csvRetryTimer);
    csvRetryTimer = null;
    csvRetryCount = 0;
    setLoadingTryAgainVisible(false);
    setLoadingAttemptCount(0, CSV_MAX_RETRIES);
    // Clear stored data (local/session storage and caches) before reloading
    try { localStorage.clear(); } catch (e) {}
    try { sessionStorage.clear(); } catch (e) {}
    try {
      if (window.caches && caches.keys) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
    } catch (e) {}
    // Clear IndexedDB databases if supported
    try {
      if (indexedDB && indexedDB.databases) {
        const dbs = await indexedDB.databases();
        for (const dbInfo of dbs) {
          try { await new Promise((res, rej) => { const req = indexedDB.deleteDatabase(dbInfo.name); req.onsuccess = () => res(); req.onerror = () => res(); req.onblocked = () => res(); }); } catch(e) {}
        }
      }
    } catch (e) {}
    // Reload with cache busted timestamp to force fresh fetch
    window.location.href = window.location.pathname + '?t=' + Date.now();
  });
  // Ensure the loading modal is shown early so users know the app is fetching data
  showLoadingModal('Preparing to fetch data from server…');
  console.debug('init: loading modal shown');
  // Try loading CSV data via a dedicated loader that handles retries and shows the loading indicator
  // Do not await here to avoid blocking UI update (attempt counter) and allow loadCsvData
  // to run in background and update UI as it proceeds.
  loadCsvData();

  // modal close shortcuts (attach to product modal backdrop only; loading modal not closable via backdrop)
  const productModalBackdrop = document.querySelector('#productModal .product-modal__backdrop');
  if (productModalBackdrop) productModalBackdrop.addEventListener('click', () => { closeProductModal(); exitCompareMode(); });

  // (loadingRefreshBtn already wired above)
  // modalCloseBtn is wired in openProductModal using onclick to avoid duplicate handlers
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeProductModal(); });
  // ESC should close CSV editor too
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const csvModal = document.getElementById('csvEditorModal');
      if (csvModal && csvModal.classList.contains('open')) { csvModal.setAttribute('aria-hidden','true'); csvModal.classList.remove('open'); document.body.classList.remove('no-scroll'); }
      const fieldModal = document.getElementById('fieldEditorModal');
      if (fieldModal && fieldModal.classList.contains('open')) { fieldModal.setAttribute('aria-hidden','true'); fieldModal.classList.remove('open'); document.body.classList.remove('no-scroll'); }
    }
  });

  // ensure snappy scrolling: keyboard navigation
  const container = document.querySelector('.docks-grid-container');
  container.addEventListener('wheel', (e) => {
    // prevent horizontal wheel from navigating rows
  }, { passive: true});

  // Local CSV controls removed; no local CSV option
  // compare button wiring
  const compareBtn = document.getElementById('compareBtn');
  if (compareBtn) {
    compareBtn.addEventListener('click', (e) => {
      if (!isCompareMode) {
        enterCompareMode();
        compareBtn.textContent = 'Compare (0/3)';
      } else {
        // if already in compare mode, and we have selections, open compare view
        if (compareSelections.length) openCompareModal();
        else { exitCompareMode(); compareBtn.textContent = 'Compare'; }
      }
    });
  }
  // Close compare mode if clicking outside any popup, but avoid clicks on thumbnails and the compare button
  document.addEventListener('click', (e) => {
    if (!isCompareMode) return;
    const tgt = e.target;
    if (tgt.closest('#compareModal') || tgt.closest('.product-modal__dialog') || tgt.closest('#compareBtn') || tgt.closest('.product-thumb') ) return;
    // Clicked outside compare and modals: close and clear compare
    closeCompareModal();
    exitCompareMode();
  });

  // If compare mode is active and user clicks outside popups or thumbnails (including the Compare button), clear compare mode
  document.addEventListener('click', (e) => {
    if (!isCompareMode) return;
    const t = e.target;
    // allow clicks on thumbnails, compare button and within compareModal or productModal
    if (t.closest && (t.closest('.product-thumb') || t.closest('#compareModal') || t.closest('.product-modal') || t.closest('#compareBtn'))) {
      return;
    }
    exitCompareMode();
  });
  // No local CSV input; CSV Editor modal was removed

  // CSV Editor modal removed
  // backdrop close for CSV editor
  // CSV Editor removed; CSV Editor handlers are no longer wired.

  // Field editor modal wiring
  const fieldEditorModal = document.getElementById('fieldEditorModal');
  const fieldEditorCloseBtn = document.getElementById('fieldEditorCloseBtn');
  const fieldEditorSaveBtn = document.getElementById('fieldEditorSave');
  const fieldEditorCancelBtn = document.getElementById('fieldEditorCancel');
  const fieldEditorInput = document.getElementById('fieldEditorInput');
  const fieldEditorTextarea = document.getElementById('fieldEditorTextarea');
  if (fieldEditorCloseBtn) fieldEditorCloseBtn.addEventListener('click', () => { closeFieldEditor(); });
  if (fieldEditorCancelBtn) fieldEditorCancelBtn.addEventListener('click', () => { closeFieldEditor(); });
  if (fieldEditorSaveBtn) fieldEditorSaveBtn.addEventListener('click', () => saveFieldEditor());
  const fieldEditorBackdrop = document.querySelector('#fieldEditorModal .product-modal__backdrop');
  if (fieldEditorBackdrop) fieldEditorBackdrop.addEventListener('click', () => closeFieldEditor());

  // No local CSV option; removed local button state updates
}

// Loading modal and CSV fetch with retry behavior
let csvRetryTimer = null;
let csvRetryCount = 0;
const CSV_MAX_RETRIES = 5;
const CSV_RETRY_INTERVAL_MS = 3000; // 3 seconds between retries
const CSV_FETCH_TIMEOUT_MS = 3000; // 3 seconds max per fetch attempt
let loadingAttemptTimer = null;
let attemptCountdownTimer = null;
let attemptTimeLeft = 0;
function showLoadingModal(message) {
  const modal = document.getElementById('loadingModal');
  if (!modal) return;
  const msgEl = document.getElementById('loadingMessage');
  if (msgEl && message) msgEl.textContent = message;
  modal.setAttribute('aria-hidden', 'false');
  modal.classList.add('open');
  // Defensive fallback in case CSS or other rules incorrectly hide the modal
  modal.style.display = 'flex';
  console.debug('showLoadingModal: message=', message, 'csvRetryCount=', csvRetryCount);
  // Update attempt display to reflect current count
  try { setLoadingAttemptCount(csvRetryCount, CSV_MAX_RETRIES); } catch (e) { console.debug('showLoadingModal: failed to set attempt count', e); }
  // Keep the attempt count refreshed regularly while modal is open
  if (!loadingAttemptTimer) {
    loadingAttemptTimer = setInterval(() => { try { setLoadingAttemptCount(csvRetryCount, CSV_MAX_RETRIES); } catch (e) {} }, 250);
  }
  document.body.classList.add('no-scroll');
}
function hideLoadingModal() {
  const modal = document.getElementById('loadingModal');
  if (!modal) return;
  modal.setAttribute('aria-hidden', 'true');
  modal.classList.remove('open');
  // Clear any inline display style set by the fallback above
  modal.style.removeProperty('display');
  document.body.classList.remove('no-scroll');
  if (loadingAttemptTimer) { clearInterval(loadingAttemptTimer); loadingAttemptTimer = null; }
}

function setLoadingTryAgainVisible(visible) {
  const btn = document.getElementById('loadingTryAgainBtn');
  if (!btn) return;
  btn.style.display = visible ? 'inline-flex' : 'none';
}

function setLoadingAttemptCount(attempt, max) {
  const el = document.getElementById('loadingAttempt');
  if (!el) return;
  el.textContent = `Attempt: ${attempt}/${max}`;
  console.debug('setLoadingAttemptCount:', attempt, max);
}

function startAttemptCountdown(seconds) {
  stopAttemptCountdown();
  attemptTimeLeft = seconds;
  const el = document.getElementById('loadingCountdown');
  if (el) el.textContent = `Next attempt in: ${attemptTimeLeft}s`;
  attemptCountdownTimer = setInterval(() => {
    attemptTimeLeft -= 1;
    if (el) el.textContent = `Next attempt in: ${Math.max(0, attemptTimeLeft)}s`;
    if (attemptTimeLeft <= 0) { stopAttemptCountdown(); }
  }, 1000);
}

function stopAttemptCountdown() {
  if (attemptCountdownTimer) { clearInterval(attemptCountdownTimer); attemptCountdownTimer = null; }
  const el = document.getElementById('loadingCountdown');
  if (el) el.textContent = `Next attempt in: 0s`;
}

async function attemptLoadCsvOnce() {
  console.debug('attemptLoadCsvOnce: called');
  // Clear any previous retry timer
  if (csvRetryTimer) { clearTimeout(csvRetryTimer); csvRetryTimer = null; }
  try {
    // attemptLoadCsvOnce no longer increments csvRetryCount: count is managed in loadCsvData()
    console.debug(`attemptLoadCsvOnce: attempt (current csvRetryCount=${csvRetryCount})`);
    showLoadingModal(`Fetching data from server… (attempt ${csvRetryCount}/${CSV_MAX_RETRIES})`);
    setLoadingTryAgainVisible(false);
    setLoadingAttemptCount(csvRetryCount, CSV_MAX_RETRIES);
    // Enforce a per-request timeout using AbortController
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CSV_FETCH_TIMEOUT_MS);
    let resp;
    try {
      resp = await fetch(DOCKS_CSV + (DOCKS_CSV.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store', signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
    serverHasCsv = !!(resp && resp.ok);
    if (resp && resp.ok) {
      const text = await resp.text();
      const products = parseCsv(text);
      renderProducts(products);
      hideLoadingModal();
      csvRetryCount = 0; // reset
      setLoadingTryAgainVisible(false);
      setLoadingAttemptCount(0, CSV_MAX_RETRIES);
      return true;
    }
    // If not OK, mark as failed
    const grid = document.getElementById('productGrid');
    if (grid) { grid.setAttribute('role','list'); grid.innerHTML = ''; }
    return false;
  } catch (e) {
    console.error('attemptLoadCsvOnce: failed to fetch CSV', e);
    return false;
  }
}

async function loadCsvData() {
  // Start the load cycle; this will call attemptLoadCsvOnce sequentially and update UI
  console.debug('loadCsvData: start cycle');
  // Reset counters
  if (csvRetryTimer) { clearTimeout(csvRetryTimer); csvRetryTimer = null; }
  csvRetryCount = 0;
  setLoadingAttemptCount(0, CSV_MAX_RETRIES);
  // Sequential attempts with a sleep between them
  for (let attempt = 1; attempt <= CSV_MAX_RETRIES; attempt++) {
    // Before attempting, update counters and UI
    csvRetryCount = attempt;
    setLoadingAttemptCount(csvRetryCount, CSV_MAX_RETRIES);
    showLoadingModal(`Fetching data from server… (attempt ${csvRetryCount}/${CSV_MAX_RETRIES})`);
    startAttemptCountdown(Math.ceil(CSV_FETCH_TIMEOUT_MS/1000));
    const ok = await attemptLoadCsvOnce();
    stopAttemptCountdown();
    if (ok) {
      // success handled by attemptLoadCsvOnce
      if (csvRetryTimer) { clearTimeout(csvRetryTimer); csvRetryTimer = null; }
      return;
    }
    // if not final attempt, wait and retry
    if (attempt < CSV_MAX_RETRIES) {
      showLoadingModal('Failed to fetch data.');
      // show countdown during wait
      startAttemptCountdown(Math.ceil(CSV_RETRY_INTERVAL_MS/1000));
      await new Promise((resolve) => { csvRetryTimer = setTimeout(() => { stopAttemptCountdown(); resolve(); }, CSV_RETRY_INTERVAL_MS); });
    }
  }
  // If we reach here all attempts failed
  showLoadingModal('Failed to fetch data.');
  setLoadingTryAgainVisible(true);
}

function startDocksApp() {
  if (window.__docks_load_started__) return;
  window.__docks_load_started__ = true;
  init();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startDocksApp);
} else {
  startDocksApp();
}

setTimeout(() => {
  if (!window.__docks_load_started__ && document.readyState !== 'loading') {
    startDocksApp();
  }
}, 50);
