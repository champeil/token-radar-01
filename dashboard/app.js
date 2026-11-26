// Token Radar's page. It reads window.RADAR (data.js, written by main.ts from the same board the model
// ranks) and renders: the stamp, the model explainer with its constants and comparables table, the
// sortable and filterable board, the live-token view, and a per-protocol detail drawer. No network: every
// byte shown is in data.js.
(function () {
	'use strict';
	var D = window.RADAR;
	if (!D) return;
	var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
	function money(n) {
		if (n === null || n === undefined || !isFinite(n)) return 'n/a';
		var a = Math.abs(n);
		if (a >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
		if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
		if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
		if (a >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
		return usd0.format(n);
	}
	function pct(n) {
		if (n === null || n === undefined || !isFinite(n)) return 'n/a';
		return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
	}
	function pctClass(n) {
		if (n === null || n === undefined || !isFinite(n) || Math.abs(n) < 0.005) return 'flat';
		return n > 0 ? 'pos' : 'neg';
	}
	function age(days) {
		if (days === null || days === undefined) return 'unknown';
		if (days >= 730) return (days / 365).toFixed(1) + 'y';
		if (days >= 60) return Math.round(days / 30) + 'mo';
		return Math.max(0, Math.round(days)) + 'd';
	}
	function mult(x) { return (x === null || x === undefined || !isFinite(x) ? 'n/a' : x.toFixed(3) + 'x'); }
	function iso(day) { return day === null || day === undefined ? 'none recorded' : day; }
	function text(tag, cls, content) {
		var n = document.createElement(tag);
		if (cls) n.className = cls;
		if (content !== null && content !== undefined) n.textContent = String(content);
		return n;
	}
	// The same arithmetic lib/model.ts ran, written again here so the detail view can show a reader it
	// follows from the snapshot's figures alone.
	function recompute(row) {
		var m = D.model;
		// The exact factors the board used, so the page's arithmetic lands on the board's integer.
		var f = row.model.factors;
		var base = row.tvl_usd * f[0];
		var growth = Math.min(m.growth_cap, Math.max(m.growth_floor, row.change_7d === null ? 0 : row.change_7d));
		var growthMult = f[1];
		var maturity = f[2];
		var implied = Math.min(m.implied_cap, Math.max(1, Math.round(base * growthMult * maturity)));
		return { base: base, growth: growth, growthMult: growthMult, maturity: maturity, implied: implied, agrees: implied === row.implied_value_usd };
	}
	var cmpByCategory = {};
	(D.comparables || []).forEach(function (c) { cmpByCategory[c.category] = c; });
	(function stamp() {
		var host = document.getElementById('stamp');
		var fields = [
			['As of', D.as_of],
			['Watchlist', D.watchlist_size + ' protocols'],
			['Board', D.board_size + ' rows'],
			['Live view', D.live_size + ' protocols'],
			['Set aside', D.product_size + ' products'],
			['Model', D.model_version]
		];
		fields.forEach(function (f) {
			var d = document.createElement('div');
			d.appendChild(text('dt', null, f[0]));
			d.appendChild(text('dd', null, f[1]));
			host.appendChild(d);
		});
	})();
	(function howto() {
		var m = D.model;
		document.getElementById('howto-eq').textContent =
			'implied FDV = category median mcap/TVL of live-token protocols x TVL x growth multiplier x maturity multiplier';
		document.getElementById('howto-stats').textContent =
			'Global median multiple ' + mult(D.global_multiple) + '  \u00B7  ' + D.comparables.length + ' categories  \u00B7  ' +
			D.global_comparables + ' live-token comparables  \u00B7  ' + D.snapshot_size + ' protocols in the snapshot';
		document.getElementById('howto-note').textContent =
			'Each category is priced off its own live-token peers; the global median stands in only when a category has fewer than ' +
			m.min_comparables + ' of them. Growth comes from the 7-day TVL change, maturity from age since listing.';
	})();
	(function explainer() {
		var m = D.model;
		document.getElementById('explainer-lede').textContent =
			'Every ranked row is a protocol whose snapshot entry records no token: no market cap, no CoinGecko id, no symbol. ' +
			'Its implied value is not a TVL multiple picked by hand; it is the protocol priced the way the snapshot\'s own live-token ' +
			'protocols in its category are priced, then nudged by its own 7-day change and by how long it has run without a token. ' +
			'The same function scores every row; no protocol name is special-cased anywhere.';
		var steps = [
			['Who is ranked',
				'A protocol is ranked when the snapshot records no token for it, and when it is not a wrapped, staked or bridged product of one that already trades. A bridge, a liquid staking or restaking pool or a versioned pool holds other people\'s capital passing through, so its TVL would flatter an implied value; the snapshot\'s own watchlist rule excludes the same products. ' + D.product_size + ' such protocols are set aside, and the ' + D.live_size + ' largest protocols whose token already trades sit in their own view, priced by the market.',
				'ranked = records no token  and  not a product of one that trades'],
			['Comparables set',
				'Take every live-token protocol in the same category (it records a market cap, its TVL is above zero, it is not an exchange) and use the <b>median mcap / TVL</b> of that set as the category multiple. A category with fewer than ' + m.min_comparables + ' live names borrows the global median across all ' + D.global_comparables + ' live-token protocols.',
				'base = tvl_usd x median(mcap_i / tvl_i)'],
			['Growth',
				'The snapshot\'s change_7d, clamped to [' + m.growth_floor + '%, +' + m.growth_cap + '%] and scaled by ' + m.growth_weight + ', so a hot week lifts the number without letting it dominate. A null change counts as 0.',
				'growthMult = 1 + (clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100) x ' + m.growth_weight],
			['Maturity',
				'Age in days since listed_at. A protocol that has run a long time and still records no token is the seasoned case the radar looks for, so age lifts value up to ' + m.maturity_days + ' days. No listed_at uses the neutral ' + m.neutral_maturity + '.',
				'maturityMult = ' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range],
			['Implied value',
				'The three factors multiplied, rounded, floored at $1 and capped at ' + money(m.implied_cap) + '. Rows sort by it. The board carries every watchlist slug (the ' + money(D.floor_usd) + ' TVL floor, records no token) plus the ' + D.early_size + ' other rankable protocols, above and below that floor.',
				'implied = tvl x multiple x growthMult x maturityMult']
		];
		var host = document.getElementById('formula');
		steps.forEach(function (s, i) {
			var li = document.createElement('li');
			var n = text('span', 'n', String(i + 1));
			var body = document.createElement('div');
			var head = document.createElement('div');
			head.innerHTML = '<b>' + s[0] + '</b> ' + s[1];
			body.appendChild(head);
			body.appendChild(text('code', 'eq', s[2]));
			li.appendChild(n);
			li.appendChild(body);
			host.appendChild(li);
		});
		var consts = document.getElementById('constants');
		var rows = [
			['min_comparables', m.min_comparables, 'live names a category needs'],
			['growth_weight', m.growth_weight, 'weight on the clamped 7d change'],
			['growth floor / cap', m.growth_floor + '% / +' + m.growth_cap + '%', 'clamp on change_7d'],
			['maturity floor / range', m.maturity_floor + ' / ' + m.maturity_range, 'multiplier at age 0, rise to ' + (m.maturity_floor + m.maturity_range).toFixed(2)],
			['maturity_days', m.maturity_days, 'days to the top of the rise'],
			['neutral_maturity', m.neutral_maturity, 'when listed_at is null'],
			['global median', mult(D.global_multiple), 'across ' + D.global_comparables + ' live protocols'],
			['floor_usd', money(D.floor_usd), 'the watchlist floor']
		];
		rows.forEach(function (r) {
			var tr = document.createElement('tr');
			tr.appendChild(text('td', null, r[0]));
			var v = text('td', null, r[1]);
			v.title = r[2];
			tr.appendChild(v);
			consts.appendChild(tr);
		});
		var cmp = document.getElementById('comparables');
		var head = document.createElement('thead');
		var hr = document.createElement('tr');
		[['Category', ''], ['Live', 'num'], ['Median mcap/TVL', 'num'], ['Source', '']].forEach(function (h) {
			hr.appendChild(text('th', h[1], h[0]));
		});
		head.appendChild(hr);
		cmp.appendChild(head);
		var body = document.createElement('tbody');
		(D.comparables || []).forEach(function (c) {
			var tr = document.createElement('tr');
			tr.appendChild(text('td', null, c.category));
			tr.appendChild(text('td', 'num', String(c.comparables)));
			tr.appendChild(text('td', 'num', mult(c.multiple)));
			var src = document.createElement('td');
			var pill = text('span', 'pill ' + (c.source === 'category' ? 'cat' : 'glob'), c.source === 'category' ? 'category' : 'global');
			pill.title = c.source === 'category'
				? 'Median of this category\'s ' + c.comparables + ' live-token protocols'
				: 'Fewer than ' + m.min_comparables + ' live names here: the global median is used';
			src.appendChild(pill);
			tr.appendChild(src);
			body.appendChild(tr);
		});
		cmp.appendChild(body);
	})();
	var state = {
		tab: 'pre',
		q: '',
		category: 'all',
		chain: 'all',
		scope: 'all',
		sort: 'rank',
		dir: 1
	};
	var COLS = [
		{ key: 'rank', label: '#', num: true },
		{ key: 'name', label: 'Protocol', num: false },
		{ key: 'category', label: 'Category', num: false },
		{ key: 'chains', label: 'Chains', num: false },
		{ key: 'tvl_usd', label: 'TVL', num: true },
		{ key: 'change_7d', label: '7d', num: true },
		{ key: 'age_days', label: 'Age', num: true },
		{ key: 'implied_value_usd', label: 'Implied value', num: true }
	];
	var title = document.getElementById('board-h');
	var sub = document.getElementById('board-sub');
	var count = document.getElementById('count');
	function boardTitle() {
		if (state.tab === 'live') {
			title.textContent = 'Live token view: the ' + D.live_size + ' largest protocols whose token already trades';
			sub.textContent = 'These are the market\'s own figures, not the model\'s: a protocol that already trades has a real market cap, so it needs no implied value. They appear here to be read beside the board, never inside it.';
		} else {
			title.textContent = 'Pre-token board: ' + D.board_size + ' protocols ranked by implied value';
			sub.textContent = D.watchlist_size + ' on the watchlist (' + money(D.floor_usd) + ' TVL and above, records no token) plus ' + D.early_size + ' other protocols the snapshot records no token for, above and below that floor. Bridges, staked and wrapped products are set aside. Click any row for its model breakdown, the comparables behind its multiple, and its farm plan.';
		}
	}
	function fillFilters() {
		var cat = document.getElementById('f-category');
		var chain = document.getElementById('f-chain');
		var cats = {}, chs = {};
		(state.tab === 'live' ? D.live : D.rows).forEach(function (r) {
			cats[r.category || '(none)'] = (cats[r.category || '(none)'] || 0) + 1;
			(r.chains || []).forEach(function (c) { chs[c] = (chs[c] || 0) + 1; });
		});
		function option(sel, value, label) {
			var o = document.createElement('option');
			o.value = value;
			o.textContent = label;
			sel.appendChild(o);
		}
		cat.textContent = '';
		option(cat, 'all', 'All categories');
		Object.keys(cats).sort(function (a, b) { return cats[b] - cats[a] || a.localeCompare(b); }).forEach(function (c) {
			option(cat, c, c + ' (' + cats[c] + ')');
		});
		chain.textContent = '';
		option(chain, 'all', 'All chains');
		Object.keys(chs).sort(function (a, b) { return chs[b] - chs[a] || a.localeCompare(b); }).forEach(function (c) {
			option(chain, c, c + ' (' + chs[c] + ')');
		});
		cat.value = cats[state.category] !== undefined || state.category === 'all' ? state.category : 'all';
		chain.value = chs[state.chain] !== undefined || state.chain === 'all' ? state.chain : 'all';
	}
	function visibleRows() {
		if (state.tab === 'live') {
			var live = D.live.slice();
			var ql = state.q.toLowerCase();
			live = live.filter(function (r) {
				if (state.category !== 'all' && (r.category || '(none)') !== state.category) return false;
				if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
				if (ql && (r.name + ' ' + (r.category || '') + ' ' + (r.chains || []).join(' ')).toLowerCase().indexOf(ql) < 0) return false;
				return true;
			});
			live.sort(function (a, b) {
				var k = state.sort === 'rank' ? 'mcap_usd' : state.sort;
				var av, bv;
				if (k === 'name' || k === 'category') { av = String(a[k] || ''); bv = String(b[k] || ''); return av.localeCompare(bv) * state.dir; }
				if (k === 'chains') { av = (a.chains || [])[0] || ''; bv = (b.chains || [])[0] || ''; return av.localeCompare(bv) * state.dir; }
				av = a[k] === null || a[k] === undefined ? -Infinity : a[k];
				bv = b[k] === null || b[k] === undefined ? -Infinity : b[k];
				return (av - bv) * state.dir;
			});
			return live;
		}
		var q = state.q.toLowerCase();
		var rows = D.rows.filter(function (r) {
			if (state.scope === 'watchlist' && !r.on_watchlist) return false;
			if (state.scope === 'early' && r.on_watchlist) return false;
			if (state.category !== 'all' && (r.category || '(none)') !== state.category) return false;
			if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
			if (q && (r.name + ' ' + r.slug + ' ' + (r.category || '') + ' ' + (r.chains || []).join(' ')).toLowerCase().indexOf(q) < 0) return false;
			return true;
		});
		var key = state.sort;
		rows.sort(function (a, b) {
			if (key === 'rank') return (a.rank - b.rank) * state.dir;
			if (key === 'name' || key === 'category') return String(a[key] || '').localeCompare(String(b[key] || '')) * state.dir;
			if (key === 'chains') return String((a.chains || [])[0] || '').localeCompare(String((b.chains || [])[0] || '')) * state.dir;
			var av = a[key] === null || a[key] === undefined ? -Infinity : a[key];
			var bv = b[key] === null || b[key] === undefined ? -Infinity : b[key];
			return (av - bv) * state.dir;
		});
		return rows;
	}
	var LIVE_COLS = [
		{ key: 'rank', label: '#', num: true },
		{ key: 'name', label: 'Protocol', num: false },
		{ key: 'category', label: 'Category', num: false },
		{ key: 'chains', label: 'Chains', num: false },
		{ key: 'tvl_usd', label: 'TVL', num: true },
		{ key: 'change_7d', label: '7d', num: true },
		{ key: 'multiple', label: 'mcap / TVL', num: true },
		{ key: 'mcap_usd', label: 'Market cap', num: true }
	];
	function renderHead() {
		var row = document.getElementById('head-row');
		row.textContent = '';
		var head = state.tab === 'live' ? LIVE_COLS : COLS;
		head.forEach(function (c) {
			var th = document.createElement('th');
			if (c.num) th.className = 'num';
			if (state.sort === c.key) th.setAttribute('aria-sort', state.dir === 1 ? 'ascending' : 'descending');
			var b = document.createElement('button');
			b.type = 'button';
			b.appendChild(document.createTextNode(c.label));
			var arrow = text('span', 'arrow', state.sort === c.key ? (state.dir === 1 ? '\u25B2' : '\u25BC') : '\u25B2');
			b.appendChild(arrow);
			b.addEventListener('click', function () {
				if (state.sort === c.key) state.dir = -state.dir;
				else { state.sort = c.key; state.dir = c.num && c.key !== 'rank' ? -1 : 1; }
				if (state.tab === 'live' && state.sort === 'rank') state.dir = -1;
				render();
			});
			th.appendChild(b);
			row.appendChild(th);
		});
		var th = document.createElement('th');
		th.className = 'num';
		th.appendChild(text('span', null, ''));
		row.appendChild(th);
	}
	function chips(list, max) {
		var wrap = document.createElement('div');
		wrap.className = 'chips';
		list.slice(0, max).forEach(function (c) {
			wrap.appendChild(text('span', 'chip', c));
		});
		if (list.length > max) wrap.appendChild(text('span', 'chip more', '+' + (list.length - max)));
		return wrap;
	}
	function renderBody(rows) {
		var body = document.getElementById('tbody');
		body.textContent = '';
		var empty = document.getElementById('empty');
		empty.hidden = rows.length > 0;
		rows.forEach(function (r, i) {
			var tr = document.createElement('tr');
			tr.tabIndex = 0;
			tr.setAttribute('data-slug', r.slug);
			tr.setAttribute('data-name', r.name);
			if (state.tab === 'live') {
				tr.appendChild(text('td', 'rank', String(i + 1)));
				var nm = document.createElement('td');
				nm.className = 'pname';
				nm.appendChild(document.createTextNode(r.name));
				nm.appendChild(text('small', null, r.slug));
				tr.appendChild(nm);
				tr.appendChild(text('td', null, r.category || '(none)'));
				tr.appendChild((function () { var td = document.createElement('td'); td.appendChild(chips(r.chains || [], 2)); return td; })());
				tr.appendChild(text('td', 'num', money(r.tvl_usd)));
				tr.appendChild(text('td', 'num', pct(r.change_7d)));
				tr.appendChild(text('td', 'num', mult(r.multiple)));
				var cap = text('td', 'num imp', money(r.mcap_usd));
				tr.appendChild(cap);
			} else {
				var rank = document.createElement('td');
				rank.className = 'rank';
				rank.appendChild(text('b', null, String(r.rank)));
				tr.appendChild(rank);
				var name = document.createElement('td');
				name.className = 'pname';
				name.appendChild(document.createTextNode(r.name));
				if (r.on_watchlist) name.appendChild(text('span', 'flag', 'watchlist'));
				else name.appendChild(text('span', 'flag early', 'off-watchlist'));
				name.appendChild(text('small', null, r.slug));
				tr.appendChild(name);
				tr.appendChild(text('td', null, r.category || '(none)'));
				var ch = document.createElement('td');
				ch.appendChild(chips(r.chains || [], 2));
				tr.appendChild(ch);
				tr.appendChild(text('td', 'num', money(r.tvl_usd)));
				var chg = text('td', 'num ' + pctClass(r.change_7d), pct(r.change_7d));
				tr.appendChild(chg);
				tr.appendChild(text('td', 'num', age(r.age_days)));
				tr.appendChild(text('td', 'num imp', money(r.implied_value_usd)));
				var open = document.createElement('td');
				open.className = 'num';
				var btn = text('button', 'ghost', 'Details');
				btn.type = 'button';
				btn.addEventListener('click', function (ev) { ev.stopPropagation(); openDetail(r); });
				open.appendChild(btn);
				tr.appendChild(open);
			}
			tr.addEventListener('click', function () { state.tab === 'live' ? openLive(r) : openDetail(r); });
			tr.addEventListener('keydown', function (ev) {
				if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); state.tab === 'live' ? openLive(r) : openDetail(r); }
			});
			body.appendChild(tr);
		});
	}
	function render() {
		boardTitle();
		document.getElementById('howto').hidden = state.tab === 'live';
		var rows = visibleRows();
		renderHead();
		renderBody(rows);
		var noun = state.tab === 'live' ? 'live protocols' : 'ranked rows';
		count.textContent = rows.length + ' ' + noun +
			(state.tab === 'live' ? '' : ' of ' + D.rows.length) +
			' \u00B7 sorted by ' + (state.sort === 'rank' ? 'rank' : state.sort.replace('_usd', '').replace('_', ' ')) +
			(state.dir === 1 ? ' ascending' : ' descending');
	}
	var detail = document.getElementById('detail');
	var scrim = document.getElementById('scrim');
	var body = document.getElementById('detail-body');
	var crumb = document.getElementById('detail-crumb');
	function kv(parent, pairs) {
		var grid = document.createElement('div');
		grid.className = 'kv';
		pairs.forEach(function (p) {
			var d = document.createElement('div');
			d.appendChild(text('dt', null, p[0]));
			d.appendChild(text('dd', null, p[1]));
			grid.appendChild(d);
		});
		parent.appendChild(grid);
	}
	function section(parent, heading) {
		var s = document.createElement('div');
		s.className = 'dsec';
		s.appendChild(text('h3', null, heading));
		parent.appendChild(s);
		return s;
	}
	function openDetail(r) {
		crumb.textContent = 'row ' + r.rank + ' of ' + D.board_size + ' \u00B7 ' + r.slug;
		body.textContent = '';
		var head = document.createElement('h2');
		head.id = 'detail-name';
		head.textContent = r.name;
		body.appendChild(head);
		body.appendChild(text('p', 'sub', (r.category || '(no category)') + ' \u00B7 ranked ' + r.rank + ' \u00B7 ' + (r.on_watchlist ? 'on the watchlist' : 'ranked outside the watchlist')));
		var calc = recompute(r);
		var m = D.model;
		var mb = section(body, 'Model breakdown');
		var wrap = document.createElement('div');
		wrap.className = 'breakdown';
		var lead = document.createElement('div');
		lead.className = 'calc head';
		lead.appendChild(text('span', null, 'Implied FDV for this protocol'));
		lead.appendChild(text('span', 'v', money(r.implied_value_usd)));
		lead.appendChild(text('span', 'op', 'what the snapshot\u2019s own live-token protocols imply this protocol is worth at launch'));
		wrap.appendChild(lead);
		var cat = cmpByCategory[r.category || '(none)'];
		var sourceText = r.model.multiple_source === 'category'
			? 'category median: ' + r.model.comparables + ' live-token ' + (r.category || 'uncategorised') + ' peers'
			: 'global median: this category carries ' + r.model.comparables + ' live-token peer' + (r.model.comparables === 1 ? '' : 's') + ', under the ' + m.min_comparables + ' needed';
		[
			['TVL, from the snapshot', money(r.tvl_usd), 'total value locked'],
			['\u00D7 base multiple', mult(r.model.base_multiple), sourceText],
			['\u00D7 growth multiplier', mult(calc.growthMult),
				'from a 7-day TVL change of ' + pct(r.change_7d) + ', clamped to [' + m.growth_floor + '%, +' + m.growth_cap + '%] and scaled by ' + m.growth_weight],
			['\u00D7 maturity multiplier', mult(calc.maturity),
				r.age_days === null
					? 'no listed_at recorded, so the neutral ' + m.neutral_maturity + ' applies'
					: 'from ' + r.age_days + ' days since listing (' + age(r.age_days) + '), rising toward ' + (m.maturity_floor + m.maturity_range).toFixed(2) + ' at ' + m.maturity_days + ' days']
		].forEach(function (p) {
			var d = document.createElement('div');
			d.className = 'calc';
			d.appendChild(text('span', null, p[0]));
			d.appendChild(text('span', 'v', p[1]));
			d.appendChild(text('span', 'op', p[2]));
			wrap.appendChild(d);
		});
		var total = document.createElement('div');
		total.className = 'calc total';
		total.appendChild(text('span', null, '= implied FDV'));
		total.appendChild(text('span', 'v', money(r.implied_value_usd)));
		total.appendChild(text('span', 'op', money(r.tvl_usd) + ' \u00D7 ' + r.model.factors[0].toFixed(4) + ' \u00D7 ' + r.model.factors[1].toFixed(4) + ' \u00D7 ' + r.model.factors[2].toFixed(4) + ' = ' + money(calc.implied)));
		wrap.appendChild(total);
		mb.appendChild(wrap);
		mb.appendChild(text('p', 'sub check', calc.agrees
			? 'The page recomputes this from the snapshot figures and gets the board\u2019s number exactly.'
			: 'The page recomputed ' + money(calc.implied) + ' from these figures; the board carries ' + money(r.implied_value_usd) + '.'));
		var fs = section(body, 'Farm plan: what to do, what it costs, how long');
		var ol = document.createElement('ol');
		ol.className = 'steps';
		(r.farm_steps || []).forEach(function (s) {
			var li = document.createElement('li');
			var div = document.createElement('div');
			// Split "Cost: ... Time: ..." back out for a second line, keeping the words main.ts wrote.
			var m = /^(.*?)\sCost:\s(.*?)\.\sTime:\s(.*?)\.$/.exec(s);
			if (m) {
				div.appendChild(document.createTextNode(m[1]));
				div.appendChild(text('span', 'ct', 'Cost: ' + m[2] + ' \u00B7 Time: ' + m[3]));
			} else {
				div.appendChild(document.createTextNode(s));
			}
			li.appendChild(div);
			ol.appendChild(li);
		});
		fs.appendChild(ol);
		var cs = section(body, 'Comparables behind this multiple');
		cs.appendChild(text('p', 'sub', cat === undefined
			? 'This category carries no live-token protocol, so the global median across ' + D.global_comparables + ' live protocols is used: ' + mult(D.global_multiple) + '.'
			: cat.source === 'category'
				? 'The median of ' + cat.comparables + ' live-token ' + cat.category + ' protocols is ' + mult(cat.multiple) + '. These are the names nearest that median; the multiple is their median mcap/TVL, applied to this protocol\u2019s TVL.'
				: cat.category + ' carries only ' + cat.comparables + ' live-token protocol' + (cat.comparables === 1 ? '' : 's') + ', under the ' + D.model.min_comparables + ' needed, so the global median ' + mult(D.global_multiple) + ' across ' + D.global_comparables + ' live protocols is used. The category\u2019s own live names:'));
		if (cat !== undefined && cat.examples.length > 0) {
			var list = document.createElement('div');
			list.className = 'cmp-list';
			cat.examples.forEach(function (e) {
				var d = document.createElement('div');
				d.appendChild(text('span', null, e.name + '  ' + money(e.tvl_usd) + ' TVL'));
				d.appendChild(text('span', null, money(e.mcap_usd) + ' \u00B7 ' + mult(e.multiple)));
				list.appendChild(d);
			});
			cs.appendChild(list);
		}
		var sf = section(body, 'Snapshot record');
		kv(sf, [
			['slug', r.slug],
			['category', r.category || '(none)'],
			['chains', (r.chains || []).length ? (r.chains || []).join(', ') : '(none)'],
			['tvl_usd', money(r.tvl_usd)],
			['change_7d', pct(r.change_7d)],
			['listed_at', iso(r.listed_at)],
			['age_days', r.age_days === null ? 'unknown' : String(r.age_days)],
			['mcap_usd', r.mcap_usd === null ? 'none recorded' : money(r.mcap_usd)],
			['gecko_id', r.gecko_id === null ? 'none recorded' : r.gecko_id],
			['symbol', r.symbol === null ? 'none recorded' : r.symbol]
		]);
		sf.appendChild(text('p', 'caveat',
			'This row says the snapshot records no token for ' + r.name + '; it does not say the protocol has none. ' +
			'The snapshot is DefiLlama\'s record as of ' + D.as_of + ', and every number above is read from it, not live.'));
		scrim.hidden = false;
		detail.hidden = false;
		document.getElementById('detail-close').focus();
	}
	function openLive(r) {
		crumb.textContent = 'live token \u00B7 ' + r.slug;
		body.textContent = '';
		var head = document.createElement('h2');
		head.id = 'detail-name';
		head.textContent = r.name;
		body.appendChild(head);
		body.appendChild(text('p', 'sub', (r.category || '(no category)') + ' \u00B7 token already trades \u00B7 market cap ' + money(r.mcap_usd)));
		var sf = section(body, 'Market record');
		kv(sf, [
			['slug', r.slug],
			['chains', (r.chains || []).join(', ') || '(none)'],
			['tvl_usd', money(r.tvl_usd)],
			['mcap_usd', money(r.mcap_usd)],
			['mcap / TVL', mult(r.multiple)],
			['change_7d', pct(r.change_7d)]
		]);
		sf.appendChild(text('p', 'caveat',
			'A protocol whose token already trades is priced by its market, not by the model: it sits in the live view and never on the ranked board. ' +
			'Its multiple above is the market cap the snapshot records divided by its TVL, and it is one of the comparables the board uses.'));
		scrim.hidden = false;
		detail.hidden = false;
		document.getElementById('detail-close').focus();
	}
	function closeDetail() {
		detail.hidden = true;
		scrim.hidden = true;
	}
	document.getElementById('detail-close').addEventListener('click', closeDetail);
	scrim.addEventListener('click', closeDetail);
	document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && !detail.hidden) closeDetail(); });
	function setTab(tab) {
		state.tab = tab;
		state.sort = 'rank';
		state.dir = 1;
		state.category = 'all';
		state.chain = 'all';
		state.scope = 'all';
		document.querySelectorAll('.tab').forEach(function (b) {
			var on = b.getAttribute('data-tab') === tab;
			b.classList.toggle('is-on', on);
			b.setAttribute('aria-selected', on ? 'true' : 'false');
		});
		fillFilters();
		render();
	}
	document.querySelectorAll('.tab').forEach(function (b) {
		b.addEventListener('click', function () { setTab(b.getAttribute('data-tab')); });
	});
	document.querySelectorAll('#f-scope button').forEach(function (b) {
		b.addEventListener('click', function () {
			state.scope = b.getAttribute('data-scope');
			document.querySelectorAll('#f-scope button').forEach(function (o) { o.classList.toggle('is-on', o === b); });
			render();
		});
	});
	document.getElementById('q').addEventListener('input', function (e) { state.q = e.target.value.trim(); render(); });
	document.getElementById('f-category').addEventListener('change', function (e) { state.category = e.target.value; render(); });
	document.getElementById('f-chain').addEventListener('change', function (e) { state.chain = e.target.value; render(); });
	document.getElementById('reset').addEventListener('click', function () {
		state.q = '';
		state.category = 'all';
		state.chain = 'all';
		state.scope = 'all';
		state.sort = 'rank';
		state.dir = 1;
		document.getElementById('q').value = '';
		document.getElementById('reset').blur();
		document.querySelectorAll('#f-scope button').forEach(function (o) { o.classList.toggle('is-on', o.getAttribute('data-scope') === 'all'); });
		fillFilters();
		render();
	});
	document.getElementById('foot-source').textContent =
		'Snapshot: ' + D.source + ' \u00B7 as_of ' + D.as_of + ' \u00B7 ' + D.watchlist_size +
		' watchlist protocols, ' + D.board_size + ' ranked rows, ' + D.global_comparables + ' live-token comparables.';
	fillFilters();
	render();
})();
