/* ─── State ────────────────────────────────────────────────────── */
let mainChart = null;
let chartData = {};
let currentMode = 'one-time';
let currentEffect = 'tenure';
let customRows = [];
let goldenMonth = null;
let debCalcTimer = null;
let deferredPrompt; // PWA installation prompt

/** Packs current UI state into URLSearchParams for sharing */
function getStateParams() {
    const params = new URLSearchParams();
    params.set('p', parsePrincipal());
    params.set('r', document.getElementById('rate').value);
    params.set('n', document.getElementById('tenure').value);

    // Basic prepayment states
    params.set('otA', parseAmount('ot-amount'));
    params.set('otM', document.getElementById('ot-month').value);
    params.set('mA', parseAmount('m-amount'));
    params.set('mF', document.getElementById('m-from').value);
    params.set('mT', document.getElementById('m-to').value);
    params.set('aA', parseAmount('a-amount'));
    params.set('aM', document.getElementById('a-month-of-year').value);

    // Custom rows (packed as a comma-separated list of values)
    if (customRows.length > 0) {
        const customData = customRows.map(id => {
            const m = document.getElementById('cr-month-' + id).value || '';
            const a = parseAmount('cr-amount-' + id) || '';
            const t = document.getElementById('cr-type-' + id).value === 'Monthly from' ? 'm' : 'o';
            return `${m}:${a}:${t}`;
        }).join('|');
        params.set('c', customData);
    }

    params.set('mode', currentMode);
    params.set('eff', currentEffect);

    return params;
}

/** Reads URLSearchParams and applies them to the UI */
function applyStateFromParams() {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('p')) return false; // No share data found

    // Set primary values
    if (params.has('p')) {
        document.getElementById('principal').value = formatIndian(params.get('p'));
    }
    if (params.has('r')) document.getElementById('rate').value = params.get('r');
    if (params.has('n')) document.getElementById('tenure').value = params.get('n');

    // Prepayment values
    if (params.has('otA')) document.getElementById('ot-amount').value = formatIndian(params.get('otA'));
    if (params.has('otM')) document.getElementById('ot-month').value = params.get('otM');
    if (params.has('mA')) document.getElementById('m-amount').value = formatIndian(params.get('mA'));
    if (params.has('mF')) document.getElementById('m-from').value = params.get('mF');
    if (params.has('mT')) document.getElementById('m-to').value = params.get('mT');
    if (params.has('aA')) document.getElementById('a-amount').value = formatIndian(params.get('aA'));
    if (params.has('aM')) document.getElementById('a-month-of-year').value = params.get('aM');

    // Custom rows
    if (params.has('c')) {
        const customList = params.get('c').split('|');
        customList.forEach(item => {
            const [m, a, t] = item.split(':');
            const id = Date.now() + Math.floor(Math.random() * 1000);
            addCustomRowFromData(id, m, a, (t === 'm' ? 'Monthly from' : 'One-time'));
        });
    }

    if (params.has('mode')) {
        switchMode(params.get('mode'));
    }
    if (params.has('eff')) {
        setPrepayEffect(params.get('eff'));
    }

    return true;
}

/** Share link logic */
function copyShareLink() {
    const params = getStateParams();
    const url = window.location.origin + window.location.pathname + '?' + params.toString();

    // Use Web Share API if available (native share on mobile)
    if (navigator.share) {
        navigator.share({
            title: 'EMI Smart Advisor Scenario',
            text: 'Check out this loan prepayment scenario on EMI Smart Advisor',
            url: url
        }).catch(err => console.log('Error sharing:', err));
    } else {
        navigator.clipboard.writeText(url).then(() => {
            const btn = document.getElementById('float-share-btn');
            const oldTxt = btn.innerHTML;
            btn.innerHTML = '<span>✓ Copied!</span>';
            btn.style.background = 'var(--accent2)';
            setTimeout(() => {
                btn.innerHTML = oldTxt;
                btn.style.background = '';
            }, 3000);
        });
    }
}

/* ─── Theme Toggle ──────────────────────────────────────────────── */
function toggleTheme() {
    const body = document.body;
    const isDark = body.classList.toggle('dark-theme');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    updateThemeIcon();
}

function updateThemeIcon() {
    const btn = document.getElementById('theme-toggle');
    const isDark = document.body.classList.contains('dark-theme');
    btn.innerHTML = isDark ? '☀️' : '🌘';
}

function initTheme() {
    // Check local storage first
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-theme');
    } else if (savedTheme === 'light') {
        document.body.classList.remove('dark-theme');
    } else {
        // Default to light, but could also check system preference
        // For now, as per request: "Make the default UI as light / day mode"
        document.body.classList.remove('dark-theme');
    }
    updateThemeIcon();
}

function debouncedCalc() {
    clearTimeout(debCalcTimer);
    debCalcTimer = setTimeout(() => {
        calculate();
    }, 400);
}

/* ─── Formatters ───────────────────────────────────────────────── */
function fmt(n) {
    if (n >= 10000000) return '₹' + (n / 10000000).toFixed(2) + 'Cr';
    if (n >= 100000) return '₹' + (n / 100000).toFixed(2) + 'L';
    return '₹' + Math.round(n).toLocaleString('en-IN');
}

function fmtFull(n) {
    return '₹' + Math.round(n).toLocaleString('en-IN');
}

/** Format integer as Indian comma notation  e.g. 5000000 → "50,00,000" */
function formatIndian(n) {
    if (!n && n !== 0) return '';
    const s = Math.floor(Math.abs(n)).toString();
    if (s.length <= 3) return s;
    const last3 = s.slice(-3);
    const rest = s.slice(0, s.length - 3);
    const formatted = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
    return formatted;
}

/** Strip commas and return numeric value from the principal text field */
function parsePrincipal() {
    const raw = document.getElementById('principal').value.replace(/,/g, '');
    return +raw || 0;
}

/** Strip commas from any amount input by ID and return a number */
function parseAmount(id) {
    const el = document.getElementById(id);
    if (!el) return 0;
    return +(el.value.replace(/,/g, '')) || 0;
}

/** Format an amount text-input's value live in Indian comma notation while preserving cursor position */
function fmtInputAmount(el) {
    const val = el.value;
    const start = el.selectionStart;
    const digits = val.replace(/[^\d]/g, '');
    if (!digits) { el.value = ''; return; }

    const num = parseInt(digits, 10);
    const formatted = formatIndian(num);

    // Calculate how many characters before the cursor were NOT digits (i.e. commas)
    const beforeCursor = val.substring(0, start);
    const commasBefore = (beforeCursor.match(/,/g) || []).length;
    const digitsBefore = (beforeCursor.match(/\d/g) || []).length;

    el.value = formatted;

    // Find new cursor position: it should be after the same number of 'digitsBefore'
    let newPos = 0;
    let digitCount = 0;
    for (let i = 0; i < formatted.length; i++) {
        if (digitCount === digitsBefore) break;
        if (/\d/.test(formatted[i])) digitCount++;
        newPos = i + 1;
    }
    el.setSelectionRange(newPos, newPos);
}

/** Convert months → human-readable years string */
function monthsToYears(m) {
    if (!m || m <= 0) return '';
    const yrs = Math.floor(m / 12);
    const mos = m % 12;
    if (yrs === 0) return `${mos} month${mos !== 1 ? 's' : ''}`;
    if (mos === 0) return `${yrs} year${yrs !== 1 ? 's' : ''}`;
    return `${yrs} yr${yrs !== 1 ? 's' : ''} ${mos} mo`;
}

/* ─── Tenure years hint ────────────────────────────────────────── */
function updateTenureHint() {
    const n = +document.getElementById('tenure').value || 0;
    const hint = document.getElementById('tenure-hint');
    if (hint) hint.textContent = n ? `= ${monthsToYears(n)}` : '';
}

/* ─── Prepayment tab indicators ────────────────────────────────── */
function updateTabIndicators() {
    const otActive =
        parseAmount('ot-amount') > 0 &&
        (+document.getElementById('ot-month').value || 0) > 0;

    const mActive = parseAmount('m-amount') > 0;
    const aActive = parseAmount('a-amount') > 0;
    const cActive = customRows.some(id =>
        parseAmount('cr-amount-' + id) > 0
    );

    setTabDot('tab-one-time', otActive);
    setTabDot('tab-monthly', mActive);
    setTabDot('tab-annual', aActive);
    setTabDot('tab-custom', cActive);
}

function setTabDot(tabId, isActive) {
    const tab = document.getElementById(tabId);
    if (!tab) return;
    const existing = tab.querySelector('.tab-dot');
    if (existing) existing.remove();
    if (isActive) {
        const dot = document.createElement('span');
        dot.className = 'tab-dot';
        tab.appendChild(dot);
    }
}

/* ─── Mode switcher ─────────────────────────────────────────────── */
function switchMode(m) {
    currentMode = m;
    document.querySelectorAll('.tab').forEach((t, i) => {
        const modes = ['one-time', 'monthly', 'annual', 'custom'];
        t.classList.toggle('active', modes[i] === m);
    });
    document.querySelectorAll('.prepay-section').forEach(s => s.classList.remove('active'));
    document.getElementById('mode-' + m).classList.add('active');
    debouncedCalc();
}

/* ─── Prepayment Effect switcher ────────────────────────────────── */
function setPrepayEffect(e) {
    currentEffect = e;
    document.getElementById('btn-dec-tenure').classList.toggle('active', e === 'tenure');
    document.getElementById('btn-dec-emi').classList.toggle('active', e === 'emi');
    debouncedCalc();
}

/* ─── Custom row management ─────────────────────────────────────── */
function addCustomRow() {
    const id = Date.now();
    customRows.push(id);
    const div = document.createElement('div');
    div.className = 'prepay-item';
    div.id = 'cr-' + id;
    div.innerHTML = `
    <div class="field" style="margin:0">
      <label>Month #</label>
      <input type="number" id="cr-month-${id}" placeholder="e.g. 12" min="1" step="1" oninput="updateTabIndicators(); debouncedCalc();">
    </div>
    <div class="field" style="margin:0">
      <label>Amount (₹)</label>
      <input type="text" id="cr-amount-${id}" placeholder="e.g. 1,00,000" inputmode="numeric" oninput="fmtInputAmount(this); updateTabIndicators(); debouncedCalc();">
    </div>
    <div class="field" style="margin:0">
      <label>Type</label>
      <select id="cr-type-${id}" onchange="updateTabIndicators(); debouncedCalc();">
        <option>One-time</option>
        <option>Monthly from</option>
      </select>
    </div>
    <button class="remove-btn" onclick="removeRow(${id})">×</button>
  `;
    document.getElementById('custom-list').appendChild(div);
    updateTabIndicators();
}

/** Optimized version for loading shared data */
function addCustomRowFromData(id, month, amount, type) {
    customRows.push(id);
    const div = document.createElement('div');
    div.className = 'prepay-item';
    div.id = 'cr-' + id;
    div.innerHTML = `
    <div class="field" style="margin:0">
      <label>Month #</label>
      <input type="number" id="cr-month-${id}" value="${month}" placeholder="e.g. 12" min="1" step="1" oninput="updateTabIndicators(); debouncedCalc();">
    </div>
    <div class="field" style="margin:0">
      <label>Amount (₹)</label>
      <input type="text" id="cr-amount-${id}" value="${formatIndian(amount)}" placeholder="e.g. 1,00,000" inputmode="numeric" oninput="fmtInputAmount(this); updateTabIndicators(); debouncedCalc();">
    </div>
    <div class="field" style="margin:0">
      <label>Type</label>
      <select id="cr-type-${id}" onchange="updateTabIndicators(); debouncedCalc();">
        <option ${type === 'One-time' ? 'selected' : ''}>One-time</option>
        <option ${type === 'Monthly from' ? 'selected' : ''}>Monthly from</option>
      </select>
    </div>
    <button class="remove-btn" onclick="removeRow(${id})">×</button>
  `;
    document.getElementById('custom-list').appendChild(div);
    updateTabIndicators();
}

function removeRow(id) {
    customRows = customRows.filter(r => r !== id);
    const el = document.getElementById('cr-' + id);
    if (el) el.remove();
    updateTabIndicators();
    debouncedCalc();
}

/* ─── Core maths ────────────────────────────────────────────────── */
function calcEMI(p, r, n) {
    const mr = r / 1200;
    if (mr === 0) return p / n;
    return p * mr * Math.pow(1 + mr, n) / (Math.pow(1 + mr, n) - 1);
}

function buildPrepayMap(tenure) {
    const map = {};
    const add = (m, v) => { map[m] = (map[m] || 0) + v; };

    if (currentMode === 'one-time') {
        const am = parseAmount('ot-amount');
        const mo = Math.min(+document.getElementById('ot-month').value || 1, tenure);
        add(mo, am);
    } else if (currentMode === 'monthly') {
        const am = parseAmount('m-amount');
        const fr = +document.getElementById('m-from').value || 1;
        const to = +document.getElementById('m-to').value || 0;
        const end = to === 0 ? tenure : Math.min(to, tenure);
        for (let m = fr; m <= end; m++) add(m, am);
    } else if (currentMode === 'annual') {
        const am = parseAmount('a-amount');
        const moy = +document.getElementById('a-month-of-year').value || 3;
        for (let m = moy; m <= tenure; m += 12) add(m, am);
    } else {
        customRows.forEach(id => {
            const mo = +document.getElementById('cr-month-' + id).value || 1;
            const am = parseAmount('cr-amount-' + id);
            const tp = document.getElementById('cr-type-' + id).value;
            if (tp === 'Monthly from') {
                for (let m = mo; m <= tenure; m++) add(m, am);
            } else {
                add(mo, am);
            }
        });
    }
    return map;
}

function simulate(p, r, n, prepayMap, effect = 'tenure') {
    let emi = calcEMI(p, r, n);
    const mr = r / 1200;
    let bal = p;
    const months = [];
    let totalInterest = 0, actualMonths = 0;

    for (let m = 1; m <= n; m++) {
        if (bal <= 0) break;
        const intPart = bal * mr;
        let prinPart = Math.min(emi - intPart, bal);
        if (prinPart < 0) prinPart = 0;
        const prepay = Math.min(prepayMap[m] || 0, Math.max(0, bal - prinPart));
        bal -= (prinPart + prepay);
        if (bal < 0) bal = 0;
        totalInterest += intPart;
        actualMonths = m;
        months.push({ m, emi: emi + prepay, currentEMI: emi, intPart, prinPart, prepay, bal, totalInterest });

        // If 'Decrease EMI' and there was a prepayment, recalculate the EMI for the remaining months
        if (effect === 'emi' && prepay > 0 && bal > 0 && m < n) {
            emi = calcEMI(bal, r, n - m);
        }

        if (bal <= 0) break;
    }
    return { emi, months, totalInterest, actualMonths };
}

/* ─── Main calculate ────────────────────────────────────────────── */
function calculate(silent) {
    const p = parsePrincipal();
    const r = +document.getElementById('rate').value;
    const n = +document.getElementById('tenure').value;
    if (!p || !r || !n) return;

    const emi = calcEMI(p, r, n);
    document.getElementById('disp-emi').textContent = fmt(emi);
    document.getElementById('disp-interest').textContent = fmt(emi * n - p);
    document.getElementById('disp-total').textContent = fmt(emi * n);

    const base = simulate(p, r, n, {});
    const prepayMap = buildPrepayMap(n);
    const with_pre = simulate(p, r, n, prepayMap, currentEffect);

    const savedInt = base.totalInterest - with_pre.totalInterest;
    const savedMo = base.actualMonths - with_pre.actualMonths;
    const savedPct = (savedInt / base.totalInterest * 100).toFixed(1);

    document.getElementById('saved-interest').textContent = fmt(savedInt);
    document.getElementById('saved-pct').textContent = savedPct + '% of total interest';
    document.getElementById('saved-tenure').textContent = savedMo + ' months';
    document.getElementById('saved-tenure-sub').textContent = (savedMo / 12).toFixed(1) + ' years earlier';

    if (currentEffect === 'emi') {
        const lastEMI = with_pre.months[with_pre.months.length - 1].currentEMI;
        document.getElementById('saved-tenure').textContent = '—';
        document.getElementById('saved-tenure-sub').textContent = 'EMI Reduced to ' + fmt(lastEMI);
    }

    document.getElementById('new-payoff').textContent = with_pre.actualMonths + ' mo';
    document.getElementById('old-payoff').textContent = 'Originally ' + base.actualMonths + ' months';

    chartData = { base, with_pre, p, r, n };
    buildChart('balance');
    buildSchedule(base, with_pre, prepayMap, n);
    buildInsights(base, with_pre, savedInt, savedMo, p);

    // Auto-compute & show golden month and diminishing returns
    _computeGoldenNumber(p, r, n, base, with_pre, prepayMap);
    _computeDiminishingReturns(p, r, n, base);

    document.getElementById('results').style.display = 'block';
    document.getElementById('floating-actions').style.display = 'flex';
}

/* ─── Insights ──────────────────────────────────────────────────── */
function buildInsights(base, wp, savedInt, savedMo, p) {
    const box = document.getElementById('insights-box');
    const insights = [];
    const pct = savedInt / base.totalInterest * 100;

    if (pct > 30) {
        insights.push({ cls: 'green', icon: '✓', title: 'Excellent prepayment strategy', text: `You're saving ${pct.toFixed(1)}% of total interest — prepayment is highly effective at this stage.` });
    } else if (pct > 15) {
        insights.push({ cls: 'warn', icon: '◎', title: 'Good prepayment impact', text: `You're saving ${pct.toFixed(1)}% of interest. Consider larger or earlier prepayments for bigger gains.` });
    } else {
        insights.push({ cls: 'danger', icon: '!', title: 'Low prepayment efficiency', text: `Only ${pct.toFixed(1)}% interest savings. Early-tenure prepayments yield far better returns — consider shifting prepayments earlier.` });
    }

    if (savedMo > 24) {
        insights.push({ cls: 'gold', icon: '★', title: `Loan closes ${(savedMo / 12).toFixed(1)} years early`, text: 'This significantly frees up cash flow and reduces financial risk exposure for years.' });
    }

    const prepayTotal = Object.values(buildPrepayMap(base.actualMonths)).reduce((a, b) => a + b, 0);
    if (prepayTotal > 0) {
        const roi = (savedInt / prepayTotal * 100).toFixed(1);
        insights.push({ cls: +roi > 100 ? 'green' : 'warn', icon: '◈', title: `Prepayment ROI: ${roi}%`, text: `For every ₹1 you prepay, you save ₹${(savedInt / prepayTotal).toFixed(2)} in interest — ${+roi > 100 ? 'an excellent return' : 'decent return, but improves significantly if prepaid earlier'}.` });
    }

    box.innerHTML = insights.map(i => `
    <div class="insight-box ${i.cls}">
      <div class="insight-icon">${i.icon}</div>
      <div class="insight-content">
        <div class="insight-title ${i.cls}">${i.title}</div>
        <p>${i.text}</p>
      </div>
    </div>
  `).join('');
}

/* ─── Amortization schedule ─────────────────────────────────────── */
function buildSchedule(base, wp, prepayMap, tenure) {
    const tbody = document.getElementById('schedule-body');
    const totalMonths = Math.max(base.actualMonths, wp.actualMonths);
    let rows = '';
    let currentYr = 0;

    for (let m = 1; m <= totalMonths; m++) {
        // Add Year Header every 12 months
        if (m === 1 || (m - 1) % 12 === 0) {
            currentYr = Math.ceil(m / 12);
            rows += `
        <tr class="year-header" onclick="toggleYear(${currentYr})" style="cursor: pointer; background: var(--surface2); border-bottom: 2px solid var(--border);">
          <td colspan="7" style="font-weight: 600; color: var(--accent); font-size: 0.75rem; padding: 0.75rem; display: flex; align-items: center; gap: 8px;">
            <span id="yr-icon-${currentYr}">▾</span> Year ${currentYr}
            <span style="font-weight: normal; font-size: 0.65rem; color: var(--dim); margin-left: auto;">Click to collapse</span>
          </td>
        </tr>`;
        }

        const bRow = base.months[m - 1]; // Base row for M
        const wRow = wp.months[m - 1];   // Prepayment row for M

        if (!bRow && !wRow) break;

        const wPre = wRow ? wRow.prepay : 0;
        const wEmi = wRow ? wRow.emi : 0;
        const wInt = wRow ? wRow.intPart : 0;
        const wPri = wRow ? wRow.prinPart : 0;
        const wBal = wRow ? wRow.bal : 0;
        const moSaved = bRow && wRow ? bRow.intPart - wRow.intPart : 0;

        const hasPrepay = wPre > 0;
        const isGolden = goldenMonth && m === goldenMonth;
        const cls = `yr-row-${currentYr}` + (isGolden ? ' highlight-row' : '');
        const display = ''; // Expanded by default

        rows += `<tr class="${cls}" ${display}>
      <td>
        ${hasPrepay ? '⭐ ' : ''}Month ${m}
        ${isGolden ? '<div style="color:var(--gold);font-weight:600;font-size:0.65rem;margin-top:4px">🔄 MILESTONE: Crossover Point</div>' : ''}
      </td>
      <td class="accent">${fmt(wRow ? wRow.currentEMI + wPre : 0)}</td>
      <td class="${hasPrepay ? 'gold' : ''}">${hasPrepay ? fmt(wPre) : '—'}</td>
      <td class="warn">${fmt(wInt)}</td>
      <td>${fmt(wPri)}</td>
      <td class="${wBal <= 0 && wRow ? 'green' : ''}">${wBal <= 0 && wRow ? 'PAID OFF' : fmt(wBal)}</td>
      <td class="${moSaved > 0 ? 'green' : ''}">${moSaved > 0 ? '+' + fmt(moSaved) : (bRow && !wRow ? 'CLEAR' : '—')}</td>
    </tr>`;
    }
    tbody.innerHTML = rows;
}

function toggleYear(yr) {
    const rows = document.querySelectorAll('.yr-row-' + yr);
    const icon = document.getElementById('yr-icon-' + yr);
    if (rows.length === 0) return;

    const currentlyHidden = rows[0].style.display === 'none';
    rows.forEach(r => r.style.display = currentlyHidden ? '' : 'none');
    icon.textContent = currentlyHidden ? '▾' : '▸';

    // Update the hint text
    const hint = icon.parentElement.querySelector('span:last-child');
    if (hint) hint.textContent = currentlyHidden ? 'Click to collapse' : 'Click to expand';
}

/* ─── Chart ─────────────────────────────────────────────────────── */
function buildChart(type) {
    const { base, with_pre, n } = chartData;
    if (!base) return;
    if (mainChart) { mainChart.destroy(); mainChart = null; }

    const ctx = document.getElementById('mainChart').getContext('2d');
    const labels = [], ds1 = [], ds2 = [];

    if (type === 'balance') {
        const step = Math.max(1, Math.floor(base.actualMonths / 60));
        for (let m = 0; m <= base.actualMonths; m += step) {
            labels.push('M' + m);
            const b1 = base.months[m - 1];
            const b2 = with_pre.months[m - 1];
            ds1.push(b1 ? Math.round(b1.bal) : 0);
            ds2.push(b2 ? Math.round(b2.bal) : 0);
        }
        mainChart = new Chart(ctx, {
            type: 'line', data: {
                labels, datasets: [
                    { label: 'Without prepayment', data: ds1, borderColor: '#555568', backgroundColor: 'rgba(85,85,104,0.08)', tension: 0.3, pointRadius: 0, fill: true },
                    { label: 'With prepayment', data: ds2, borderColor: '#5ee8b0', backgroundColor: 'rgba(94,232,176,0.10)', tension: 0.3, pointRadius: 0, fill: true }
                ]
            }, options: chartOptions(v => fmt(v))
        });
    } else if (type === 'breakdown') {
        const step = Math.max(1, Math.floor(with_pre.actualMonths / 40));
        for (let i = 0; i < with_pre.months.length; i += step) {
            const m = with_pre.months[i];
            labels.push('M' + m.m);
            ds1.push(Math.round(m.prinPart));
            ds2.push(Math.round(m.intPart));
        }
        mainChart = new Chart(ctx, {
            type: 'bar', data: {
                labels, datasets: [
                    { label: 'Principal', data: ds1, backgroundColor: 'rgba(124,109,240,0.7)', stack: 's' },
                    { label: 'Interest', data: ds2, backgroundColor: 'rgba(240,160,94,0.7)', stack: 's' }
                ]
            }, options: chartOptions(v => fmt(v), true)
        });
    } else {
        let cum1 = 0, cum2 = 0;
        const step = Math.max(1, Math.floor(base.actualMonths / 60));
        for (let m = 1; m <= base.actualMonths; m += step) {
            const b1 = base.months[m - 1], b2 = with_pre.months[m - 1];
            if (b1) cum1 += b1.intPart;
            if (b2) cum2 += b2.intPart;
            labels.push('M' + m);
            ds1.push(Math.round(cum1));
            ds2.push(Math.round(cum2));
        }
        mainChart = new Chart(ctx, {
            type: 'line', data: {
                labels, datasets: [
                    { label: 'Interest without prepayment', data: ds1, borderColor: '#f05e72', backgroundColor: 'rgba(240,94,114,0.06)', tension: 0.3, pointRadius: 0, fill: true },
                    { label: 'Interest with prepayment', data: ds2, borderColor: '#7c6df0', backgroundColor: 'rgba(124,109,240,0.08)', tension: 0.3, pointRadius: 0, fill: true }
                ]
            }, options: chartOptions(v => fmt(v))
        });
    }
}

function chartOptions(yFormatter, stacked = false) {
    const axisBase = {
        ticks: { color: '#555568', font: { size: 10 } },
        grid: { color: 'rgba(255,255,255,0.04)' }
    };
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: true, labels: { color: '#8888a0', font: { size: 11 } } } },
        scales: {
            x: { ...axisBase, ...(stacked ? { stacked: true } : {}) },
            y: { ...axisBase, ...(stacked ? { stacked: true } : {}), ticks: { ...axisBase.ticks, callback: yFormatter } }
        }
    };
}

function switchChart(type) {
    ['balance', 'breakdown', 'savings'].forEach(t => {
        document.getElementById('btn-' + t).classList.toggle('active', t === type);
    });
    buildChart(type);
}

/* ─── Golden number (internal, auto-called from calculate) ──────── */
function _computeGoldenNumber(p, r, n, base, with_pre, prepayMap) {
    const emi = calcEMI(p, r, n);
    const mr = r / 1200;

    // Find the first month where principal > interest in the ACTUAL simulation (with prepayments)
    let golden = with_pre.actualMonths;
    for (let i = 0; i < with_pre.months.length; i++) {
        const m = with_pre.months[i];
        if (m.prinPart >= m.intPart) {
            golden = m.m;
            break;
        }
    }
    goldenMonth = golden;

    const preAt1 = simulate(p, r, n, { [1]: 100000 });
    const preAtGold = simulate(p, r, n, { [golden]: 100000 });
    const preAtEnd = simulate(p, r, n, { [Math.floor(n * 0.8)]: 100000 });
    const effEarly = base.totalInterest - preAt1.totalInterest;
    const effGolden = base.totalInterest - preAtGold.totalInterest;
    const effLate = base.totalInterest - preAtEnd.totalInterest;

    const payoffMo = with_pre.actualMonths;
    // For a prepaid loan, golden is almost always reached, or the loan closes very early.
    // If golden is reached, it's a success.
    const isFinishedNoCrossover = (golden === payoffMo && with_pre.months[with_pre.months.length - 1].prinPart < with_pre.months[with_pre.months.length - 1].intPart);

    document.getElementById('golden-num').textContent = golden;
    document.getElementById('golden-tag').textContent = isFinishedNoCrossover ? 'PAYOFF' : 'Month ' + golden;

    // Update the schedule note text
    const noteMonth = document.getElementById('golden-note-month');
    if (noteMonth) {
        noteMonth.textContent = `Month ${golden}`;
    }

    const yr = (golden / 12).toFixed(1);
    const yrPayoff = (payoffMo / 12).toFixed(1);

    let desc = '';
    if (isFinishedNoCrossover) {
        desc = `
      <strong>Debt-free before crossover!</strong> Your prepayments have successfully closed the loan in <strong>Month ${payoffMo}</strong> (Year ${yrPayoff}) before ever reaching the crossover point.
      This is an exceptional result, as you've bypassed the phase where interest payments would have dominated your EMI.
    `;
    } else {
        desc = `
      <strong>At month ${golden} (year ${yr})</strong>, principal repayment exceeds interest — the crossover point under your current strategy.<br><br>
      <span style="opacity:.8;font-size:.8rem">₹1L prepaid at <b>month 1</b> saves <b>${fmt(effEarly)}</b> interest<br>
      ₹1L prepaid at <b>month ${golden}</b> saves <b>${fmt(effGolden)}</b><br>
      ₹1L prepaid at <b>month ${Math.floor(n * 0.8)}</b> saves <b>${fmt(effLate)}</b></span>
    `;
    }
    document.getElementById('golden-desc').innerHTML = desc;

    document.getElementById('golden-box').style.display = 'block';

    // Rebuild schedule so golden row highlights correctly
    buildSchedule(base, with_pre, prepayMap, n);
}

/** Public button still works */
function findGoldenNumber() {
    const p = parsePrincipal(), r = +document.getElementById('rate').value, n = +document.getElementById('tenure').value;
    if (!p || !r || !n) return;
    const base = simulate(p, r, n, {});
    const prepayMap = buildPrepayMap(n);
    const with_pre = simulate(p, r, n, prepayMap);
    _computeGoldenNumber(p, r, n, base, with_pre, prepayMap);
    document.getElementById('results').style.display = 'block';
}

/* ─── Diminishing returns (internal, auto-called from calculate) ── */
function _computeDiminishingReturns(p, r, n, base) {
    const checkpoints = [
        { label: 'Month 1', m: 1 },
        { label: 'Month 6', m: 6 },
        { label: 'Month 12', m: 12 },
        { label: 'Year 2', m: 24 },
        { label: 'Year 3', m: 36 },
        { label: 'Year 5', m: 60 },
        { label: 'Year 7', m: 84 },
        { label: 'Year 10', m: 120 },
        { label: `Year ${Math.round(n / 24)}`, m: Math.floor(n / 2) },
        { label: `Year ${Math.round(n * 0.7 / 12)}`, m: Math.floor(n * 0.7) },
    ].filter(c => c.m < base.actualMonths);

    // If we filtered out almost everything because it's a short/prepaid loan,
    // add a checkpoint for the mid-point of the remaining tenure
    if (checkpoints.length < 3 && base.actualMonths > 12) {
        const mid = Math.floor(base.actualMonths / 2);
        checkpoints.push({ label: `Month ${mid}`, m: mid });
        checkpoints.sort((a, b) => a.m - b.m);
    }

    const fixed = 500000;
    const results = checkpoints.map(c => {
        const sim = simulate(p, r, n, { [c.m]: fixed });
        const saved = Math.max(0, base.totalInterest - sim.totalInterest);
        return { ...c, saved, roi: saved / fixed * 100 };
    });
    const maxSaved = Math.max(...results.map(r => r.saved), 1);

    let html = '<p class="note" style="margin-bottom:1rem">Savings from a ₹5L one-time prepayment made at different points in the loan lifecycle.</p>';

    results.forEach(r => {
        const width = (r.saved / maxSaved * 100).toFixed(1);
        const col = r.roi > 80 ? '#5ee8b0' : r.roi > 40 ? '#f0a05e' : '#f05e72';
        const recommendation = r.roi > 80 ? 'Highly recommended' : r.roi > 40 ? 'Moderate benefit' : 'Diminishing returns';
        html += `
      <div class="diminish-bar">
        <div class="diminish-label">${r.label}</div>
        <div class="diminish-track">
          <div class="diminish-fill" style="width:${width}%;background:${col}"></div>
        </div>
        <div class="diminish-val" style="color:${col}">${fmt(r.saved)}</div>
        <div style="width:120px;font-size:.68rem;color:var(--dim);text-align:right">${recommendation}</div>
      </div>
    `;
    });

    const stopMonth = results.find(r => r.roi < 40);
    if (stopMonth) {
        html += `<div class="insight-box danger" style="margin-top:1rem">
      <div class="insight-icon">!</div>
      <div class="insight-content">
        <div class="insight-title danger">Stop prepayments after ${stopMonth.label}</div>
        <p>After this point, ROI on prepayment drops below 40%. Redirecting funds to equity investments likely yields better returns — especially if your loan rate is below 9%.</p>
      </div>
    </div>`;
    }

    document.getElementById('diminish-content').innerHTML = html;
    document.getElementById('diminish-box').style.display = 'block';
}

/** Public button still works */
function showDiminishingReturns() {
    const p = parsePrincipal(), r = +document.getElementById('rate').value, n = +document.getElementById('tenure').value;
    if (!p || !r || !n) return;
    const base = simulate(p, r, n, {});
    _computeDiminishingReturns(p, r, n, base);
    document.getElementById('results').style.display = 'block';
}

/* ─── Live listeners ─────────────────────────────────────────────── */

// Indian comma formatting for principal
document.getElementById('principal').addEventListener('input', function () {
    fmtInputAmount(this);
    debouncedCalc();
});

// Tenure years hint + live EMI update
document.getElementById('tenure').addEventListener('input', function () {
    updateTenureHint();
    debouncedCalc();
});

// Live EMI & years hint update on any loan param change
['principal', 'rate', 'tenure'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
        const p = parsePrincipal();
        const r = +document.getElementById('rate').value;
        const n = +document.getElementById('tenure').value;
        if (p && r && n) {
            const emi = calcEMI(p, r, n);
            document.getElementById('disp-emi').textContent = fmt(emi);
            document.getElementById('disp-interest').textContent = fmt(emi * n - p);
            document.getElementById('disp-total').textContent = fmt(emi * n);
        }
        // debouncedCalc is already called by specific listeners above, 
        // but adding it here for rate (which isn't covered separately)
        if (id === 'rate') debouncedCalc();
    });
});

/* ─── Boot ───────────────────────────────────────────────────────── */
initTheme();
updateTenureHint();
if (!applyStateFromParams()) {
    addCustomRow();
}
updateTabIndicators();
calculate(true);

// PWA installation support
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // Prevent automatic prompt
    deferredPrompt = e;
    console.log('PWA: Ready to install');
});

window.addEventListener('appinstalled', (evt) => {
    console.log('PWA: Installed');
});
