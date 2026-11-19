"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { HOURS, OPEN_HOUR, FEEDS, CAPACITY, generateDay, simulateDay, mean, percentile } = require("./engine.cjs");
const snapshot = require("./menu-snapshot.json");

const output = path.resolve(process.argv[2] || path.join(__dirname, "report"));
const DAYS = 365;
const SEED = 20261106;
const days = Array.from({ length: DAYS }, (_, i) => generateDay(i, snapshot.menus, snapshot.popularity, SEED));
const candidates = [];
const seen = new Set();
const results = [];

function key(policy) {
    return `${policy.rank}|${policy.align}|${policy.hold}|${policy.serve}`;
}

function addCandidate(policy, round) {
    const id = key(policy);
    if (seen.has(id)) return false;
    seen.add(id);
    candidates.push({ ...policy, id, round });
    return true;
}

for (const rank of ["fifo", "short", "long", "slack", "episode"]) {
    for (const align of [0, .5, 1]) {
        for (const hold of [0, 60, 120]) {
            for (const serve of ["fifo", "complete", "quality"]) {
                addCandidate({ rank, align, hold, serve }, "grid");
            }
        }
    }
}

function evaluate(policy) {
    const daily = days.map(day => simulateDay(day, policy));
    const orders = daily.reduce((sum, day) => sum + day.orders, 0);
    const items = daily.reduce((sum, day) => sum + day.items, 0);
    const multiOrders = daily.reduce((sum, day) => sum + day.multiOrders, 0);
    const hotItems = daily.reduce((sum, day) => sum + day.hotItems, 0);
    const result = {
        policy, orders, items, multiOrders, hotItems,
        meanLast: daily.reduce((sum, day) => sum + day.sumLast, 0) / orders,
        p95Last: percentile(daily.flatMap(day => day.lastWait), .95),
        meanFirst: daily.reduce((sum, day) => sum + day.sumFirst, 0) / orders,
        meanGap: daily.reduce((sum, day) => sum + day.sumGap, 0) / multiOrders,
        p90Gap: percentile(daily.flatMap(day => day.gaps), .90),
        meanHotHold: daily.reduce((sum, day) => sum + day.sumHotHold, 0) / hotItems,
        p95HotHold: percentile(daily.flatMap(day => day.hotHolds), .95),
        afterClose: daily.reduce((sum, day) => sum + day.afterClose, 0)
    };
    results.push(result);
    return result;
}

function faster(a, b) {
    return a.meanLast - b.meanLast || a.p95Last - b.p95Last || a.meanGap - b.meanGap;
}

function balanced(a, b, fastest, baseline) {
    const aFeasible = a.meanLast <= fastest.meanLast + .25 && a.meanHotHold <= baseline.meanHotHold + .4;
    const bFeasible = b.meanLast <= fastest.meanLast + .25 && b.meanHotHold <= baseline.meanHotHold + .4;
    return Number(bFeasible) - Number(aFeasible) || a.meanGap - b.meanGap || faster(a, b);
}

console.log(`Generated ${DAYS} deterministic days, ${days.reduce((n, day) => n + day.orders.length, 0)} orders`);
for (const policy of candidates) {
    evaluate(policy);
    if (results.length % 15 === 0) console.log(`Evaluated ${results.length}/${candidates.length} grid policies`);
}
const baseline = results.find(result => result.policy.id === "fifo|0|0|fifo");
let best = [...results].sort(faster)[0];
let bestBalanced = [...results].sort((a, b) => balanced(a, b, best, baseline))[0];

// A local sweep uses progressively finer steps and stops when neither incumbent improves.
for (const [round, alignStep, holdStep] of [["refine-1", .25, 30], ["refine-2", .1, 15], ["refine-3", .05, 5]]) {
    const before = results.length;
    for (const incumbent of [best, bestBalanced]) {
        for (const alignDelta of [-alignStep, 0, alignStep]) {
            for (const holdDelta of [-holdStep, 0, holdStep]) {
                const align = Math.max(0, Math.min(1, Math.round((incumbent.policy.align + alignDelta) * 100) / 100));
                const hold = Math.max(0, Math.min(180, incumbent.policy.hold + holdDelta));
                addCandidate({ rank: incumbent.policy.rank, align, hold, serve: incumbent.policy.serve }, round);
            }
        }
    }
    for (const policy of candidates.slice(before)) evaluate(policy);
    const nextBest = [...results].sort(faster)[0];
    const nextBalanced = [...results].sort((a, b) => balanced(a, b, nextBest, baseline))[0];
    console.log(`${round}: ${results.length - before} new policies; fastest ${nextBest.meanLast.toFixed(3)} min`);
    if (nextBest.policy.id === best.policy.id && nextBalanced.policy.id === bestBalanced.policy.id) break;
    best = nextBest;
    bestBalanced = nextBalanced;
}

fs.mkdirSync(output, { recursive: true });
const bestDays = days.map(day => simulateDay(day, best.policy, true));
const baselineDays = days.map(day => simulateDay(day, baseline.policy));
const qualityDays = bestBalanced.policy.id === best.policy.id ? bestDays : days.map(day => simulateDay(day, bestBalanced.policy));
const stressDays = Array.from({ length: DAYS }, (_, i) => generateDay(i, snapshot.menus, snapshot.popularity, SEED, 1.5));
const stressResults = [baseline, best, bestBalanced]
    .filter((row, i, list) => list.findIndex(other => other.policy.id === row.policy.id) === i)
    .map(row => {
        const runs = stressDays.map(day => simulateDay(day, row.policy));
        const orders = runs.reduce((sum, day) => sum + day.orders, 0);
        const multiOrders = runs.reduce((sum, day) => sum + day.multiOrders, 0);
        const hotItems = runs.reduce((sum, day) => sum + day.hotItems, 0);
        return { policy: row.policy.id, orders,
            meanLast: runs.reduce((sum, day) => sum + day.sumLast, 0) / orders,
            p95Last: percentile(runs.flatMap(day => day.lastWait), .95),
            meanGap: runs.reduce((sum, day) => sum + day.sumGap, 0) / multiOrders,
            meanHotHold: runs.reduce((sum, day) => sum + day.sumHotHold, 0) / hotItems,
            afterClose: runs.reduce((sum, day) => sum + day.afterClose, 0) };
    });

function n(value, decimals = 2) { return Number(value.toFixed(decimals)); }
function csvEscape(value) {
    const string = String(value ?? "");
    return /[",\r\n]/.test(string) ? `"${string.replaceAll('"', '""')}"` : string;
}
function saveCsv(name, headers, rows) {
    fs.writeFileSync(path.join(output, name), [headers.join(","), ...rows.map(row => row.map(csvEscape).join(","))].join("\r\n") + "\r\n", "utf8");
}
function localTime(date, seconds) {
    const base = Date.parse(`${date}T11:00:00Z`);
    return new Date(base + seconds * 1000).toISOString().slice(0, 19).replace("T", " ");
}
function escapeHtml(value) {
    return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

saveCsv("policy-comparison.csv",
    ["round", "policy", "rank", "alignment", "hold_seconds", "serve_rule", "orders", "items", "mean_last_wait_min", "p95_last_wait_min", "mean_first_wait_min", "mean_multi_item_gap_min", "p90_multi_item_gap_min", "mean_hot_hold_min", "p95_hot_hold_min", "after_close_orders"],
    results.map(({ policy, ...r }) => [policy.round, policy.id, policy.rank, policy.align, policy.hold, policy.serve,
        r.orders, r.items, n(r.meanLast), n(r.p95Last), n(r.meanFirst), n(r.meanGap), n(r.p90Gap), n(r.meanHotHold), n(r.p95HotHold), r.afterClose]));
saveCsv("stress-150pct.csv", ["policy", "orders", "mean_last_wait_min", "p95_last_wait_min", "mean_multi_item_gap_min", "mean_hot_hold_min", "after_close_orders"],
    stressResults.map(row => [row.policy, row.orders, n(row.meanLast), n(row.p95Last), n(row.meanGap), n(row.meanHotHold), row.afterClose]));

saveCsv("daily-365.csv",
    ["date", "weekday", "orders", "items", "best_mean_last_min", "best_p95_last_min", "best_mean_first_min", "best_mean_gap_min", "best_p90_gap_min", "best_mean_hot_hold_min", "best_p95_hot_hold_min", "best_after_close_orders", "best_max_cooking_queue", "fifo_mean_last_min", "fifo_p95_last_min", "quality_mean_last_min"],
    bestDays.map((day, i) => [day.date, day.weekday, day.orders, day.items, n(day.meanLast), n(day.p95Last),
        n(day.meanFirst), n(day.meanGap), n(day.p90Gap), n(day.meanHotHold), n(day.p95HotHold), day.afterClose,
        day.maxQueue, n(baselineDays[i].meanLast), n(baselineDays[i].p95Last), n(qualityDays[i].meanLast)]));

saveCsv("hourly-4380.csv",
    ["date", "hour", "orders", "best_mean_last_min", "best_p95_last_min", "best_mean_first_min", "best_mean_gap_min", "best_mean_hot_hold_min", "fifo_mean_last_min", "quality_mean_last_min"],
    bestDays.flatMap((day, i) => day.hours.map((hour, h) => [day.date, `${String(hour.hour).padStart(2, "0")}:00`,
        hour.orders, n(hour.meanLast), n(hour.p95Last), n(hour.meanFirst), n(hour.meanGap), n(hour.meanHotHold),
        n(baselineDays[i].hours[h].meanLast), n(qualityDays[i].hours[h].meanLast)])));

const orderRows = [], itemRows = [];
for (const day of bestDays) {
    for (const order of day.detailedOrders) {
        const first = Math.min(...order.items.map(item => item.servedAt));
        const last = Math.max(...order.items.map(item => item.servedAt));
        orderRows.push([day.date, order.id, order.table, order.guests, order.items.length,
            localTime(day.date, order.arrival), localTime(day.date, first), localTime(day.date, last),
            n((first - order.arrival) / 60), n((last - order.arrival) / 60), n((last - first) / 60), Number(last > 12 * 3600)]);
        for (const item of order.items) {
            itemRows.push([day.date, order.id, order.table, item.id, item.code, item.name, item.resource, Number(item.hot),
                localTime(day.date, order.arrival), localTime(day.date, item.startedAt), localTime(day.date, item.readyAt),
                localTime(day.date, item.servedAt), n((item.startedAt - order.arrival) / 60),
                n((item.readyAt - item.startedAt) / 60), n((item.servedAt - item.readyAt) / 60),
                n((item.servedAt - order.arrival) / 60)]);
        }
    }
}
saveCsv("order-times.csv", ["date", "order_id", "table", "guests", "items", "arrived_at", "first_served_at", "last_served_at", "first_wait_min", "last_wait_min", "gap_min", "after_close"], orderRows);
saveCsv("item-times.csv", ["date", "order_id", "table", "item_id", "menu_code", "menu_name", "resource", "hot", "arrived_at", "cooking_started_at", "kitchen_ready_at", "served_at", "preparation_queue_min", "cooking_min", "ready_hold_min", "total_wait_min"], itemRows);

const hourlyProfile = Array.from({ length: 12 }, (_, h) => {
    const slice = bestDays.map(day => day.hours[h]);
    const fifoSlice = baselineDays.map(day => day.hours[h]);
    const qualitySlice = qualityDays.map(day => day.hours[h]);
    const count = slice.reduce((sum, row) => sum + row.orders, 0);
    const hotItems = slice.reduce((sum, row) => sum + row.hotItems, 0);
    return {
        hour: `${String(OPEN_HOUR + h).padStart(2, "0")}:00`, orders: count,
        meanOrders: count / DAYS,
        meanLast: slice.reduce((sum, row) => sum + row.sumLast, 0) / count,
        fifoMeanLast: fifoSlice.reduce((sum, row) => sum + row.sumLast, 0) / count,
        qualityMeanLast: qualitySlice.reduce((sum, row) => sum + row.sumLast, 0) / count,
        meanGap: slice.reduce((sum, row) => sum + row.sumGap, 0) / slice.reduce((sum, row) => sum + row.multiOrders, 0),
        meanHotHold: slice.reduce((sum, row) => sum + row.sumHotHold, 0) / hotItems
    };
});
saveCsv("hourly-profile.csv", ["hour", "annual_orders", "mean_daily_orders", "best_mean_last_wait_min", "fifo_mean_last_wait_min", "quality_mean_last_wait_min", "best_mean_multi_item_gap_min", "best_mean_hot_hold_min"],
    hourlyProfile.map(row => [row.hour, row.orders, n(row.meanOrders), n(row.meanLast), n(row.fifoMeanLast), n(row.qualityMeanLast), n(row.meanGap), n(row.meanHotHold)]));

const summary = {
    schema: "lossavoid-annual-simulation-v1", generatedAt: new Date().toISOString(),
    synthetic: true, seed: SEED, days: DAYS, opening: "11:00", closing: "23:00",
    assumptions: {
        demand: "Poisson orders by hour; weekday/weekend and mild seasonal/day variation, not fitted to store POS",
        hourlyMeanOrdersBeforeMultipliers: HOURS,
        totalBaseOrdersPerDay: HOURS.reduce((sum, count) => sum + count, 0),
        menuSource: snapshot.source, popularity: "50 historical detail rows with additive smoothing; only menu mix, not real footfall",
        mainMix: { pasta: .38, doria: .25, pizza: .17, meat: .20 },
        guests: "1-4 per order, synthetic distribution; one main per guest, optional appetizer and side",
        menuDurations: "Current resolveRecipe estimates with 0.8-1.2 random multiplier and 2.5% 1.45x delay",
        resourceCapacities: CAPACITY, conveyorFeedSeconds: FEEDS, conveyorTrayPositionsPerFeed: 2,
        servingRunners: 2, servingTripSeconds: "45 + 10 for each additional item",
        maximumGroupingHoldSeconds: "Policy parameter; not a food-safety limit",
        criticalTaskFallbackSeconds: 900,
        exclusions: "No holidays, stockouts, staff breaks, food-safety certification, seating queue, separate dessert courses, measured manual oven handling, or secondary oven passes/tray-unit reservations",
        closing: "Orders stop at 23:00; cooking and service drain after closing and are counted"
    },
    search: {
        policiesEvaluated: results.length,
        rounds: [...new Set(results.map(result => result.policy.round))],
        guarantee: "Best among evaluated deterministic policies, not a global optimum or real-store forecast",
        balancedConstraint: "Among policies within 0.25 min of the fastest mean last wait and no more than 0.4 min above FIFO mean hot hold, minimize mean multi-item gap"
    },
    bestSpeed: { policy: best.policy, metrics: strip(best) },
    bestBalanced: { policy: bestBalanced.policy, metrics: strip(bestBalanced) },
    fifo: { policy: baseline.policy, metrics: strip(baseline) },
    hourlyProfile: hourlyProfile.map(row => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, typeof v === "number" ? n(v) : v]))),
    stress150pct: stressResults.map(row => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, typeof v === "number" && !Number.isInteger(v) ? n(v) : v])))
};
function strip(result) {
    return Object.fromEntries(Object.entries(result).filter(([key]) => key !== "policy").map(([key, value]) =>
        [key, typeof value === "number" && !Number.isInteger(value) ? n(value) : value]));
}
fs.writeFileSync(path.join(output, "summary.json"), JSON.stringify(summary, null, 2) + "\n", "utf8");

function chart(title, series, labels, suffix = "分") {
    const width = 850, height = 220, left = 44, right = 12, top = 22, bottom = 32;
    const values = series.flatMap(item => item.values).filter(Number.isFinite);
    const min = suffix === "分" ? Math.max(0, Math.min(...values) * .9) : 0;
    const max = Math.max(1, ...values) * 1.08;
    const x = i => left + i * (width - left - right) / Math.max(1, labels.length - 1);
    const y = value => top + (max - value) * (height - top - bottom) / (max - min);
    const paths = series.map(item => `<polyline fill="none" stroke="${item.color}" stroke-width="2" points="${item.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")}"/>`).join("");
    const ticks = [0, .5, 1].map(fraction => {
        const value = min + (max - min) * fraction;
        return `<line x1="${left}" y1="${y(value)}" x2="${width - right}" y2="${y(value)}" stroke="#e0e7e5"/><text x="${left - 7}" y="${y(value) + 4}" text-anchor="end" font-size="11" fill="#51615e">${value.toFixed(1)}${suffix}</text>`;
    }).join("");
    const marks = [0, Math.floor((labels.length - 1) / 4), Math.floor((labels.length - 1) / 2), Math.floor((labels.length - 1) * .75), labels.length - 1]
        .map(i => `<text x="${x(i)}" y="${height - 9}" text-anchor="middle" font-size="11" fill="#51615e">${escapeHtml(labels[i])}</text>`).join("");
    const legend = series.map(item => `<span><i style="background:${item.color}"></i>${escapeHtml(item.name)}</span>`).join("");
    return `<section class="chart"><div class="chart-heading"><h3>${escapeHtml(title)}</h3><div class="legend">${legend}</div></div><svg role="img" aria-label="${escapeHtml(title)}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">${ticks}${paths}${marks}</svg></section>`;
}

const dayLabels = bestDays.map(day => day.date.slice(5));
const hourlyLabels = hourlyProfile.map(row => row.hour);
const comparison = [baseline, best, bestBalanced].filter((row, i, list) => list.findIndex(x => x.policy.id === row.policy.id) === i);
const report = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>年間調理順シミュレーション | 2026</title><style>
:root{color-scheme:light;--ink:#19302c;--muted:#53635e;--line:#cad7d2;--green:#087a58;--orange:#c75c2c;--blue:#2776ad}*{box-sizing:border-box}body{margin:0;background:#f5f8f6;color:var(--ink);font:15px/1.5 system-ui,'Yu Gothic UI',Meiryo,sans-serif;letter-spacing:0}header{background:#183d35;color:white;padding:28px max(18px,calc((100vw - 1100px)/2))}h1{font-size:25px;margin:2px 0 8px}header p{max-width:850px;margin:0;color:#d2e8dc}main{max-width:1100px;margin:auto;padding:20px 18px 70px}h2{font-size:19px;margin:32px 0 12px}h3{font-size:16px;margin:0}.note{background:#fff4e6;border-left:4px solid #d4882d;padding:13px;margin:16px 0}.kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.kpi{background:#fff;border:1px solid var(--line);padding:15px}.kpi strong{display:block;font-size:24px;color:var(--green)}.kpi span{color:var(--muted)}.chart{background:#fff;border:1px solid var(--line);padding:15px;margin:12px 0}.chart-heading{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px}.chart svg{width:100%;height:auto;display:block}.legend{display:flex;gap:14px;flex-wrap:wrap;color:var(--muted);font-size:13px}.legend span{display:flex;align-items:center;gap:5px}.legend i{display:block;width:10px;height:10px}.table-wrap{overflow-x:auto;border:1px solid var(--line);background:#fff}table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}th,td{border-bottom:1px solid #e6eeea;padding:8px 10px;text-align:right;white-space:nowrap}th:first-child,td:first-child{text-align:left}thead th{background:#e7f0eb;position:sticky;top:0}tbody tr:nth-child(even){background:#f8faf9}.daily{max-height:440px;overflow:auto}.files{display:flex;gap:8px;flex-wrap:wrap}.files a{background:#fff;border:1px solid var(--line);padding:7px 10px;color:#12634c;text-decoration:none}code{font-size:13px;overflow-wrap:anywhere}footer{color:var(--muted);margin-top:24px}@media(max-width:680px){h1{font-size:21px}.kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.kpi strong{font-size:20px}th,td{padding:7px}}
</style></head><body><header><h1>年間調理順シミュレーション</h1><p>11:00〜23:00・365日。到着した注文を同じ条件の複数ルールで比較し、調理開始から持出し完了までを記録したオフライン実験です。</p></header><main>
<div class="note"><strong>実績予測ではありません。</strong> 客足・席利用・実調理時間の通年実測値はありません。客足は時間帯ごとの仮定、設備とメニュー時間はコード上の推定です。最速は探索した${results.length}ルール中であり、数学的な最適解ではありません。</div>
<div class="kpis"><div class="kpi"><strong>${DAYS}</strong><span>模擬営業日</span></div><div class="kpi"><strong>${best.orders.toLocaleString("ja-JP")}</strong><span>模擬注文</span></div><div class="kpi"><strong>${best.items.toLocaleString("ja-JP")}</strong><span>料理単位</span></div><div class="kpi"><strong>${results.length}</strong><span>比較した順序ルール</span></div></div>
<h2>結果</h2><p>最速: <code>${escapeHtml(best.policy.id)}</code>。提供差を抑えた候補: <code>${escapeHtml(bestBalanced.policy.id)}</code>。後者は平均全品提供が最速より15秒以内、温製品の完成後待機がFIFOより24秒以内増の条件で選びます。単位は分です。</p>
<div class="table-wrap"><table><thead><tr><th>ルール</th><th>全品提供 平均</th><th>全品提供 p95</th><th>最初の一品 平均</th><th>同一伝票の提供差 平均</th><th>温製品の完成後待機 平均</th><th>閉店後完了</th></tr></thead><tbody>${comparison.map(row => `<tr><td>${row === best ? "最速" : row === baseline ? "FIFO" : "品質制約付き"}</td><td>${n(row.meanLast)}</td><td>${n(row.p95Last)}</td><td>${n(row.meanFirst)}</td><td>${n(row.meanGap)}</td><td>${n(row.meanHotHold)}</td><td>${row.afterClose}</td></tr>`).join("")}</tbody></table></div>
<h2>客足1.5倍の感度確認</h2><p>追加の365日を同じ生成規則で作り、候補の混雑時の傾向を確認しました。通常年の結果とは合算していません。</p><div class="table-wrap"><table><thead><tr><th>ルール</th><th>注文</th><th>全品提供 平均</th><th>p95</th><th>提供差 平均</th><th>温製待機 平均</th><th>閉店後</th></tr></thead><tbody>${stressResults.map(row=>`<tr><td>${escapeHtml(row.policy)}</td><td>${row.orders}</td><td>${n(row.meanLast)}</td><td>${n(row.p95Last)}</td><td>${n(row.meanGap)}</td><td>${n(row.meanHotHold)}</td><td>${row.afterClose}</td></tr>`).join("")}</tbody></table></div>
<h2>時間帯別</h2>${chart("1時間あたりの模擬注文数",[{name:"件/日",color:"#2776ad",values:hourlyProfile.map(row=>row.meanOrders)}],hourlyLabels,"件")}${chart("注文から全品提供までの平均",[{name:"FIFO",color:"#c75c2c",values:hourlyProfile.map(row=>row.fifoMeanLast)},{name:"最速",color:"#087a58",values:hourlyProfile.map(row=>row.meanLast)},{name:"提供差重視",color:"#2776ad",values:hourlyProfile.map(row=>row.qualityMeanLast)}],hourlyLabels)}
<div class="table-wrap"><table><thead><tr><th>時刻</th><th>件/日</th><th>全品提供 平均</th><th>同伝票の差 平均</th><th>温製品の待機 平均</th></tr></thead><tbody>${hourlyProfile.map(row=>`<tr><td>${row.hour}</td><td>${n(row.meanOrders)}</td><td>${n(row.meanLast)}</td><td>${n(row.meanGap)}</td><td>${n(row.meanHotHold)}</td></tr>`).join("")}</tbody></table></div>
<h2>365日の推移</h2>${chart("日ごとの注文数",[{name:"件",color:"#2776ad",values:bestDays.map(day=>day.orders)}],dayLabels,"件")}${chart("日ごとの全品提供 平均",[{name:"FIFO",color:"#c75c2c",values:baselineDays.map(day=>day.meanLast)},{name:"最速",color:"#087a58",values:bestDays.map(day=>day.meanLast)},{name:"提供差重視",color:"#2776ad",values:qualityDays.map(day=>day.meanLast)}],dayLabels)}
<div class="table-wrap daily"><table><thead><tr><th>日付</th><th>注文</th><th>料理</th><th>全品平均</th><th>p95</th><th>提供差平均</th><th>温製待機平均</th><th>FIFO全品平均</th></tr></thead><tbody>${bestDays.map((day,i)=>`<tr><td>${day.date}</td><td>${day.orders}</td><td>${day.items}</td><td>${n(day.meanLast)}</td><td>${n(day.p95Last)}</td><td>${n(day.meanGap)}</td><td>${n(day.meanHotHold)}</td><td>${n(baselineDays[i].meanLast)}</td></tr>`).join("")}</tbody></table></div>
<h2>詳細データ</h2><p>全件の時刻はCSVで閲覧できます。時刻は模擬店舗の現地時刻です。</p><div class="files">${["summary.json","policy-comparison.csv","stress-150pct.csv","daily-365.csv","hourly-4380.csv","hourly-profile.csv","order-times.csv","item-times.csv"].map(file=>`<a href="${file}" download>${file}</a>`).join("")}</div>
<footer>客足: ランチ11〜14時とディナー17〜21時に山を設定。祝日・天候・席待ち・従業員休憩は未反映。レシピ所要時間と手作業は実測確認が必要です。</footer></main></body></html>`;
fs.writeFileSync(path.join(output, "report.html"), report, "utf8");
console.log(`Best speed: ${best.policy.id}, mean last ${best.meanLast.toFixed(3)} min; FIFO ${baseline.meanLast.toFixed(3)} min`);
console.log(`Balanced: ${bestBalanced.policy.id}, mean last ${bestBalanced.meanLast.toFixed(3)} min`);
console.log(`Report: ${output}`);
