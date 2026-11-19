// 設備ごとの投入枠と同卓の完成時刻を考慮して、着手予定を計算する。全組合せの最適解を保証する方式ではなく、反復回数と完成差を結果に含める。
(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    if (root) root.KitchenScheduler = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
    "use strict";

    const DEFAULTS = {
        targetWaitMinutes: 12,
        firstBiteTargetMinutes: 6,
        syncAlignment: 0.7,
        starterSyncAlignment: 0,
        sideSyncAlignment: 0.9,
        // 同卓の完成合わせだけを理由に、短時間料理を長く待たせない。
        // 設備枠・在庫・投入済み予約による実待機は、この上限とは別に反映する。
        maxSynchronizationHoldSeconds: 20,
        // 1mの炉内を、搬送方向13cmの鉄板が隙間なく進む暫定値。
        // 実測後はここだけを変更すれば投入枠が再計算される。
        upperFeedSeconds: 23,
        lowerFeedSeconds: 43,
        largeBacklogThreshold: 30,
        workGroupMinTickets: 3,
        workGroupMaxTickets: 5,
        // 店舗教材の作業順を、同時刻表示だけでなく実際の着手順にも反映する。
        // 各工程の食材準備は並行できるため、ウェーブ間は短い5秒間隔とする。
        workWaveGapSeconds: 5
    };

    // 調理時間_タイムテーブル.xlsx の投入/取出し時刻。手作業は時間未計測。
    const OVEN_TIMETABLE = {
        "1305": { resource: "OVEN_UPPER", seconds: 180, prep: "土鍋にスープとグランモラビアチーズを入れる", finish: "オリーブオイル・パセリをかける" },
        "1307": { resource: "OVEN_UPPER", seconds: 180, prep: "土鍋にスープ・スライスパン・グランモラビアチーズを入れる", finish: "オリーブオイル・パセリをかける" },
        "1401": { resource: "OVEN_LOWER", seconds: 330, prep: "辛味チキン4個を鉄板にのせる" },
        "1402": { resource: "OVEN_LOWER", seconds: 330, prep: "アロスティチーニ2本を鉄板にのせる", finish: "やみつきスパイスを添える" },
        "1452": { resource: "OVEN_LOWER", seconds: 330, prep: "アロスティチーニ4本を鉄板にのせる", finish: "やみつきスパイスを添える" },
        "1404": { resource: "OVEN_UPPER", seconds: 180, prep: "ポップコーンシュリンプ9個を鉄板にのせる", finish: "ドレッシングを添える" },
        "1405": { resource: "OVEN_LOWER", seconds: 330, prep: "エスカルゴを用意する" },
        "1407": { resource: "OVEN_UPPER", seconds: 180, prep: "ソーセージ5本とポテト2本を鉄板にのせる" },
        "1410": { resource: "OVEN_LOWER", seconds: 330, prep: "ムール貝4個を鉄板にのせる" },
        "1416": { resource: "OVEN_UPPER", seconds: 180, prep: "ポテト8本を鉄板にのせる" },
        "2203": { resource: "OVEN_UPPER", seconds: 180, prep: "ピザ生地にチーズとモッツァレラをのせる" },
        "2204": { resource: "OVEN_UPPER", seconds: 180, prep: "ピザ生地にチーズ・きのこ・野菜ペーストをのせる" },
        "2206": { resource: "OVEN_UPPER", seconds: 180, prep: "ピザ生地にチーズ・コーン・グランモラビアチーズをのせる" },
        "2208": { resource: "OVEN_UPPER", seconds: 180, prep: "ピザ生地にチーズとソーセージをのせる" },
        "2402": { resource: "OVEN_UPPER", seconds: 180, prep: "焼き置きチキンにポテト・コーンを盛る", finish: "野菜ペースト・ガルムソースをかける" },
        "2404": { resource: "OVEN_UPPER", seconds: 180, prep: "焼き置きチキンにピザソース・チーズ・ポテト・コーンを盛る", finish: "デミグラスソースをかける" },
        "2403": { resource: "OVEN_UPPER", seconds: 390, passes: 2, prep: "ハンバーグを鉄板にのせる", between: "ピザソース・チーズ・ポテト・コーンをのせる", finish: "デミグラスソース・パセリをかける" },
        "2406": { resource: "OVEN_UPPER", seconds: 390, passes: 2, passTrayUnits: [2, 1], prep: "ハンバーグと目玉焼き用の卵を別々の鉄板にのせる", between: "ポテト・コーンをのせ、卵を保温する", finish: "デミグラスソースと目玉焼きをのせる" },
        "2407": { resource: "OVEN_UPPER", seconds: 390, passes: 2, passTrayUnits: [2, 1], prep: "ハンバーグと目玉焼き用の卵を別々の鉄板にのせる", between: "ポテト・コーンをのせ、卵を保温する", finish: "野菜ペースト・ガルムソース・目玉焼きをのせる" },
        "2417": { resource: "OVEN_UPPER", seconds: 390, passes: 2, prep: "ラムの血を切り、鉄板にのせる", between: "ポテト・コーンをのせる", finish: "ラムを裏返し、やみつきココットを添える" },
        "2418": { resource: "OVEN_LOWER", seconds: 330, prep: "ハンバーグ・ポテト・コーン・辛味チキン2個・シュリンプ5個を盛る", finish: "具材を鉄板から離し、デミグラスソースをかける" },
        "3110": { resource: "OVEN_UPPER", seconds: 180, prep: "フォッカチオにオリーブオイルをかける" },
        "3111": { resource: "OVEN_UPPER", seconds: 180, prep: "フォッカチオにオリーブオイルをかける", finish: "ガーリックソースをかける" },
        "3112": { resource: "OVEN_UPPER", seconds: 180, prep: "フォッカチオにオリーブオイルをかける", finish: "シナモンをかける" },
        "3114": { resource: "OVEN_UPPER", seconds: 180, prep: "フォッカチオを裏面でのせ、ピザチーズ・グランモラビアチーズをかける" },
        "3214": { resource: "OVEN_UPPER", seconds: 180, prep: "シナモンフォッカチオを焼く", finish: "フロアでミルクジェラートとスプーンを添える" }
    };

    const PASTA_SAUCE = {
        "2303": "塩オイルソース・フライドガーリック・唐辛子を炒める",
        "2317": "塩オイルソース・フライドガーリック・唐辛子を炒める",
        "2304": "トマトソース・パンチェッタを炒める",
        "2305": "カルボソースを温める",
        "2318": "カルボソースを温める",
        "2306": "ミートソースを温める",
        "2316": "ミートソースを温める",
        "2310": "塩オイルソース・ボンゴレ・フライドガーリックを温める",
        "2321": "きのこソース・ほうれん草を温める",
        "2325": "トマトソース・フライドガーリック・唐辛子を炒める",
        "2328": "イカ墨ソース・カットしたイカを温める"
    };
    const TARAKO_PASTA_CODES = new Set(["2301", "2320"]);
    const EGG_PASTA_CODES = new Set(["2316", "2317", "2318"]);
    const COLD_PLATES = {
        "1406": "小皿にわかめ・小エビ・ドレッシング・パプリカパウダーを盛る",
        "1408": "小皿にわかめ・チキン・ドレッシング・パプリカパウダーを盛る",
        "1413": "小皿に人参を盛り、オリーブオイル・パセリをかける",
        "1417": "小皿にミニトマト2個・モッツァレラ4個を盛り、オリーブオイル・パセリをかける",
        "1422": "ハモン・セラーヌを盛り、パセリをかける",
        "1423": "ハモン・セラーヌとモッツァレラ2個を盛り、パセリをかける"
    };
    const DORIA_CODES = new Set(["2101", "2103", "2108", "2110", "2115"]);
    const LONG_MEAT_CODES = new Set(["SYS_CHICKEN", "2402", "2404"]);
    const LOWER_STARTER_CODES = new Set(["1401", "1402", "1452", "1405", "1410"]);
    const LOWER_MEAT_CODES = new Set(["2418"]);
    const UPPER_TWO_PASS_MEAT_CODES = new Set(["2403", "2406", "2407", "2417"]);
    const UPPER_STARTER_CODES = new Set(["1305", "1307", "1404", "1407", "1416"]);
    const PIZZA_BREAD_CODES = new Set([
        "2203", "2204", "2206", "2208", "3110", "3111", "3112", "3114", "3214"
    ]);
    const SALAD_TOPPINGS = new Map([["1202", "小エビ"], ["1205", "わかめ"], ["1209", "チキン"]]);
    const PHASE_LABELS = {
        PREP: "準備", TOPPING: "盛付", DRESSING: "ドレッシング", FINISH: "仕上げ",
        IN: "イン", HEAT: "加熱", OUT: "アウト", SERVE: "提供"
    };

    const RESOURCE_ORDER = {
        OVEN_LOWER: 0,
        OVEN_CHAIN: 1,
        OVEN_UPPER: 2,
        PASTA: 3,
        HEAT: 4,
        HOT_PLATING: 5,
        COLD_PREP: 6,
        FLOOR_PREP: 7,
        OTHER: 8
    };
    const STABLE_COLLATOR = new Intl.Collator("ja", { numeric: true });

    function normalizeCode(item) {
        return String(item.code ?? item.menuCode ?? "").trim();
    }

    function episodeKey(item, index = 0) {
        return `${String(item.orderId ?? `item-${index}`)}\u0000${String(item.table ?? "--")}`;
    }

    // 整理ボタンを押した瞬間に投入可能とはみなさず、食材・容器を準備する実作業分を確保する。
    // 実測値が揃うまでは、工程の複雑さに応じて10〜20秒の範囲で扱う。
    function preparationLeadSeconds(item, recipe) {
        const code = normalizeCode(item);
        if (code === "SYS_CHICKEN" || DORIA_CODES.has(code) || PIZZA_BREAD_CODES.has(code) ||
            UPPER_TWO_PASS_MEAT_CODES.has(code) || code === "2418") return 20;
        if (String(recipe.resource || "").startsWith("OVEN_")) return 15;
        return 10;
    }

    // 手作業の時間は未計測のまま保持し、機器の加熱時間や「0秒」と混同しない。
    function withSteps(recipe, definitions) {
        const steps = definitions.map((step, index) => ({
            ...step,
            phaseLabel: PHASE_LABELS[step.phase],
            kind: step.phase === "HEAT" ? "equipment" : (step.phase === "SERVE" ? "handoff" : "manual"),
            durationSeconds: step.durationSeconds ?? null,
            dependsOn: step.dependsOn ? [...step.dependsOn] : (index === 0 ? [] : [definitions[index - 1].id])
        }));
        const ovenHandling = String(recipe.resource || "").startsWith("OVEN_") ?
            (Number(recipe.passes) > 1 ?
                "入口直前から投入し、ジャストアウト後はすぐに盛付して再投入する。食材をオーブン側に寄せ、コンベア幅内に収める" :
                "入口直前から投入する。食材をオーブン側に寄せ、コンベア幅内に収め、庫内へ押し込まない") : null;
        return {
            ...recipe,
            handlingInstruction: recipe.handlingInstruction || ovenHandling,
            steps,
            hasUntimedManualSteps: steps.some(step => step.kind === "manual" && step.durationSeconds === null)
        };
    }

    function detailedRecipe(code, fallbackMinutes) {
        const topping = SALAD_TOPPINGS.get(code);
        if (topping) {
            return withSteps({
                resource: "COLD_PREP", resourceLabel: "サラダ盛付",
                durationSeconds: Math.round(fallbackMinutes * 60),
                durationSource: "menu-master-estimate", provisional: true,
                trayUnits: 1, passes: 1,
                instruction: `${topping}をのせ、ドレッシング6周、パプリカパウダー`
            }, [
                { id: "salad-base", phase: "PREP", instruction: "サラダのベースを用意する" },
                { id: "salad-topping", phase: "TOPPING", instruction: `${topping}をのせる` },
                { id: "salad-dressing", phase: "DRESSING", instruction: "ドレッシングを6周かける", repetitions: 6 },
                { id: "salad-paprika", phase: "FINISH", instruction: "パプリカパウダーをかける" },
                { id: "serve", phase: "SERVE", instruction: "提供する" }
            ]);
        }
        if (code === "1301") {
            return withSteps({
                resource: "HOT_PLATING", resourceLabel: "温製スープ盛付",
                durationSeconds: Math.round(fallbackMinutes * 60),
                durationSource: "menu-master-estimate", provisional: true,
                trayUnits: 1, passes: 1,
                instruction: "温まっている個包装のスープを皿に入れる"
            }, [
                { id: "warm-packet", phase: "PREP", instruction: "温まっている個包装のスープを用意する" },
                { id: "plate-soup", phase: "TOPPING", instruction: "個包装のスープを皿に入れる" },
                { id: "serve", phase: "SERVE", instruction: "提供する" }
            ]);
        }
        if (!DORIA_CODES.has(code)) return null;
        const steps = [{ id: "prepared-dish", phase: "PREP", instruction: "事前準備品を用意する" }];
        if (code === "2108") {
            steps.push(
                { id: "pizza-cheese", phase: "TOPPING", instruction: "ピザチーズをのせる" },
                { id: "powdered-cheese", phase: "TOPPING", instruction: "粉チーズをのせる" }
            );
        }
        steps.push(
            { id: "oven-in", phase: "IN", instruction: "下段オーブンへ入れる" },
            { id: "oven-heat", phase: "HEAT", instruction: "下段オーブンで加熱する", durationSeconds: 330 },
            { id: "oven-out", phase: "OUT", instruction: "オーブンから取り出す" }
        );
        if (code === "2103") {
            steps.push({ id: "soft-egg", phase: "FINISH", instruction: "半熟卵をのせる" });
        }
        steps.push({ id: "serve", phase: "SERVE", instruction: "提供する" });
        return withSteps({
            resource: "OVEN_LOWER", resourceLabel: "下段オーブン 5:30",
            durationSeconds: 330, durationSource: "equipment-only",
            trayUnits: 1, passes: 1,
            instruction: code === "2103" ? "イン → アウト → 半熟卵をのせる" :
                (code === "2108" ? "ピザチーズ・粉チーズ → イン → アウト" : "事前準備品をイン → アウト")
        }, steps);
    }

    function timetableOvenRecipe(code) {
        if (code === "SYS_CHICKEN") {
            return withSteps({
                resource: "OVEN_CHAIN",
                resourceLabel: "下段オーブン 6:00 → 上段オーブン 3:00（計9:00）",
                durationSeconds: 540,
                durationSource: "two-oven-equipment-chain",
                trayUnits: 1,
                passes: 2,
                passOffsets: [0, 360],
                passResources: ["OVEN_LOWER", "OVEN_UPPER"],
                handlingInstruction: "下段で6分焼成後、取り出してすぐ上段へ移し、さらに3分焼成する。庫内へ押し込まない",
                instruction: "下段投入 → 6分焼成 → 上段へ移動 → 3分焼成 → 焼成状態を確認"
            }, [
                { id: "prepare", phase: "PREP", instruction: "焼成チキンを焼成容器にのせる" },
                { id: "lower-in", phase: "IN", instruction: "下段オーブンへ入れる" },
                { id: "lower-heat", phase: "HEAT", instruction: "下段オーブンで1周加熱する", durationSeconds: 360 },
                { id: "lower-out", phase: "OUT", instruction: "下段オーブンから取り出す" },
                { id: "upper-in", phase: "IN", instruction: "取り出してすぐ上段オーブンへ入れる" },
                { id: "upper-heat", phase: "HEAT", instruction: "上段オーブンで1周加熱する", durationSeconds: 180 },
                { id: "upper-out", phase: "OUT", instruction: "上段オーブンから取り出す" },
                { id: "finish", phase: "FINISH", instruction: "焼成状態を確認する" },
                { id: "serve", phase: "SERVE", instruction: "焼成済み在庫へ補充する" }
            ]);
        }
        const entry = OVEN_TIMETABLE[code];
        if (!entry) return null;
        const lower = entry.resource === "OVEN_LOWER";
        const ovenName = lower ? "下段" : "上段";
        const passes = entry.passes || 1;
        const heatSeconds = passes === 2 ? 180 : entry.seconds;
        const steps = [
            { id: "prepare", phase: "PREP", instruction: entry.prep },
            { id: "oven-in-1", phase: "IN", instruction: `${ovenName}オーブンへ入れる` },
            { id: "oven-heat-1", phase: "HEAT", instruction: `${ovenName}オーブンで加熱する`, durationSeconds: heatSeconds },
            { id: "oven-out-1", phase: "OUT", instruction: "オーブンから取り出す" }
        ];
        if (passes === 2) {
            steps.push(
                { id: "between-passes", phase: "TOPPING", instruction: entry.between, durationSeconds: 30 },
                { id: "oven-in-2", phase: "IN", instruction: `${ovenName}オーブンへ再投入する` },
                { id: "oven-heat-2", phase: "HEAT", instruction: `${ovenName}オーブンで再加熱する`, durationSeconds: heatSeconds },
                { id: "oven-out-2", phase: "OUT", instruction: "オーブンから取り出す" }
            );
        }
        if (entry.finish) steps.push({ id: "finish", phase: "FINISH", instruction: entry.finish });
        steps.push({ id: "serve", phase: "SERVE", instruction: "提供する" });
        const singlePassLabel = `${Math.floor(entry.seconds / 60)}:${String(entry.seconds % 60).padStart(2, "0")}`;
        const timeLabel = passes === 2 ? "3:00×2＋中間0:30" : singlePassLabel;
        return withSteps({
            resource: entry.resource,
            resourceLabel: `${ovenName}オーブン ${timeLabel}`,
            durationSeconds: entry.seconds,
            durationSource: passes === 2 ? "timetable-with-interpass" : "timetable-equipment",
            trayUnits: entry.passTrayUnits?.[0] || 1,
            passTrayUnits: entry.passTrayUnits ? [...entry.passTrayUnits] : undefined,
            passOffsets: passes === 2 ? [0, 210] : undefined,
            passes,
            instruction: `${entry.prep} → ${ovenName}投入${passes === 2 ? " → 中間盛付 → 再投入" : ""}${entry.finish ? ` → ${entry.finish}` : ""}`
        }, steps);
    }

    function timetablePastaRecipe(code) {
        const sauce = PASTA_SAUCE[code];
        if (!sauce && !TARAKO_PASTA_CODES.has(code)) return null;
        const penne = code === "2325" || code === "2328";
        const noodle = penne ? "ペンネ" : "スパゲッティ";
        const steps = [
            { id: "noodle-prep", phase: "PREP", instruction: `${noodle}をテボに入れる` },
            { id: "noodle-in", phase: "IN", instruction: `${noodle}を茹で始める` },
            { id: "noodle-heat", phase: "HEAT", instruction: `${noodle}を茹でる`, durationSeconds: 60 }
        ];
        if (sauce) {
            steps.push({
                id: "sauce-heat", phase: "HEAT", instruction: `${sauce}（麺と並行）`,
                durationSeconds: 60, dependsOn: ["noodle-in"]
            });
        }
        steps.push({
            id: "noodle-out", phase: "OUT", instruction: `${noodle}をテボから出す`,
            dependsOn: sauce ? ["noodle-heat", "sauce-heat"] : ["noodle-heat"]
        });
        const finish = TARAKO_PASTA_CODES.has(code) ?
            (code === "2320" ? "タラコソース・小エビ・のりをのせる" : "タラコソース・のりをのせる") :
            `ソースを麺と合わせる${EGG_PASTA_CODES.has(code) ? "。半熟卵をのせる" : ""}`;
        steps.push(
            { id: "finish", phase: "FINISH", instruction: finish },
            { id: "serve", phase: "SERVE", instruction: "提供する" }
        );
        return withSteps({
            resource: "PASTA",
            resourceLabel: sauce ? "麺1:00＋ソース1:00（並行）" : "麺1:00＋盛付",
            durationSeconds: 60,
            durationSource: "timetable-equipment",
            trayUnits: 1, passes: 1,
            instruction: sauce ? "麺とソースを並行開始" : "麺を茹でてタラコソースを盛り付ける"
        }, steps);
    }

    // 商品ごとに設備・所要秒数・鉄板枚数・周回数を決める。未登録商品の推定や暫定工程は実測済みの値と区別する。
    function resolveRecipe(item) {
        const code = normalizeCode(item);
        const category = String(item.menuCategory || item.category || "").toLowerCase();
        const station = String(item.station || item.prepStation || "").toLowerCase();
        const fallbackMinutes = Math.max(0.5, Number(item.cookTime) || 0.5);
        const detailed = detailedRecipe(code, fallbackMinutes);
        if (detailed) return detailed;

        const oven = timetableOvenRecipe(code);
        if (oven) return oven;

        const pasta = timetablePastaRecipe(code);
        if (pasta) return pasta;

        if (COLD_PLATES[code]) {
            return withSteps({
                resource: "COLD_PREP", resourceLabel: "冷製盛付",
                durationSeconds: Math.round(fallbackMinutes * 60),
                durationSource: "menu-master-estimate", provisional: true,
                trayUnits: 1, passes: 1, instruction: COLD_PLATES[code]
            }, [
                { id: "plate", phase: "TOPPING", instruction: COLD_PLATES[code] },
                { id: "serve", phase: "SERVE", instruction: "提供する" }
            ]);
        }

        if (code === "1403") {
            return withSteps({
                resource: "HEAT", resourceLabel: "IH 1:30",
                durationSeconds: 90, durationSource: "timetable-equipment",
                trayUnits: 1, passes: 1, instruction: "ソース・ほうれん草・パンチェッタをIHで加熱"
            }, [
                { id: "pan", phase: "PREP", instruction: "フライパンにソテーソース・ほうれん草・パンチェッタを入れる" },
                { id: "timer", phase: "HEAT", instruction: "自動IHのタイマー加熱", durationSeconds: 60 },
                { id: "continuous", phase: "HEAT", instruction: "自動IHの連続加熱", durationSeconds: 30 },
                { id: "serve", phase: "SERVE", instruction: "提供する" }
            ]);
        }

        if (code === "1425") {
            return withSteps({
                resource: "HEAT", resourceLabel: "レンジ1:00＋盛付",
                durationSeconds: 90, durationSource: "timetable-total-approx", provisional: true,
                trayUnits: 1, passes: 1, instruction: "青豆をレンジで温め、半熟卵・チーズをのせる"
            }, [
                { id: "beans", phase: "PREP", instruction: "青豆を冷蔵庫から出す" },
                { id: "microwave", phase: "HEAT", instruction: "レンジで温める", durationSeconds: 60 },
                { id: "finish", phase: "FINISH", instruction: "小皿に移し、半熟卵・グランモラビアチーズをのせる" },
                { id: "serve", phase: "SERVE", instruction: "提供する" }
            ]);
        }

        if (["3101", "3102", "3103"].includes(code)) {
            return withSteps({
                resource: "FLOOR_PREP", resourceLabel: "フロア盛付",
                durationSeconds: Math.round(fallbackMinutes * 60),
                durationSource: "menu-master-estimate", provisional: true,
                trayUnits: 1, passes: 1, instruction: "ライスを盛る"
            }, [
                { id: "rice", phase: "TOPPING", instruction: "ライスを盛る" },
                { id: "serve", phase: "SERVE", instruction: "提供する" }
            ]);
        }

        if (category === "pasta") {
            return {
                resource: "PASTA", resourceLabel: "麺調理（マスタ目安）",
                durationSeconds: Math.round(fallbackMinutes * 60),
                durationSource: "menu-master-estimate", provisional: true,
                trayUnits: 1, passes: 1, instruction: "麺を茹でてソースを合わせる"
            };
        }

        if (station === "kitchen" && fallbackMinutes >= 5) {
            return {
                resource: "OVEN_LOWER",
                resourceLabel: "下段オーブン 5:30",
                durationSeconds: 330,
                trayUnits: 1,
                passes: 1,
                instruction: "下段へ投入（商品設定から推定）"
            };
        }

        if (station === "kitchen" && fallbackMinutes >= 3) {
            return {
                resource: "OVEN_UPPER",
                resourceLabel: "上段オーブン 3:00",
                durationSeconds: Math.round(fallbackMinutes * 60),
                trayUnits: 1,
                passes: 1,
                instruction: "上段へ投入（商品設定から推定）"
            };
        }

        const resource = station === "flor" || station === "floor" ? "FLOOR_PREP" :
            (station === "heat" ? "HEAT" : "OTHER");
        const resourceLabel = resource === "FLOOR_PREP" ? "フロア準備" :
            (resource === "HEAT" ? "ヒート台" : "その他工程");

        return {
            resource,
            resourceLabel,
            durationSeconds: Math.round(fallbackMinutes * 60),
            trayUnits: 1,
            passes: 1,
            instruction: `${resourceLabel}で調理`
        };
    }

    function stableCompare(a, b) {
        return STABLE_COLLATOR.compare(String(a ?? ""), String(b ?? ""));
    }

    function arrivalCompare(a, b) {
        if (a._createdAtMs !== b._createdAtMs) return a._createdAtMs - b._createdAtMs;
        const orderDiff = stableCompare(a.orderId, b.orderId);
        if (orderDiff) return orderDiff;
        const itemDiff = Number(a.itemIndex) - Number(b.itemIndex);
        if (Number.isFinite(itemDiff) && itemDiff) return itemDiff;
        return a._inputIndex - b._inputIndex;
    }

    // 店舗教材の作業順。上下段は別設備として並行させ、同じ設備内ではこの順で投入する。
    function cookingStage(item, recipe = item.recipe?.resource ? item.recipe : resolveRecipe(item)) {
        const code = normalizeCode(item);
        if (LONG_MEAT_CODES.has(code)) return { sequence: 1, label: "時間のかかる肉料理" };
        if (LOWER_STARTER_CODES.has(code)) return { sequence: 2, label: "下段の前菜" };
        if (/^12\d{2}$/.test(code) || COLD_PLATES[code]) {
            return { sequence: 2, label: "前菜（別設備で並行）" };
        }
        if (DORIA_CODES.has(code)) return { sequence: 3, label: "ドリア・グラタン" };
        if (LOWER_MEAT_CODES.has(code)) return { sequence: 4, label: "下段の肉料理" };
        if (UPPER_TWO_PASS_MEAT_CODES.has(code)) return { sequence: 5, label: "上段2周の肉料理" };
        if (UPPER_STARTER_CODES.has(code)) return { sequence: 6, label: "スープ・上段の前菜" };
        if (recipe.resource === "PASTA" || recipe.resource === "HEAT" || recipe.resource === "HOT_PLATING") {
            return { sequence: 6, label: "麺・温製（別設備で並行）" };
        }
        if (PIZZA_BREAD_CODES.has(code)) return { sequence: 7, label: "ピザ・パン" };
        if (/^24\d{2}$/.test(code) && recipe.resource === "OVEN_UPPER") {
            return { sequence: 8, label: "上段1周の肉料理" };
        }
        return { sequence: 9, label: "その他" };
    }

    // 教材の8分類を、現場で順番に着手する6つの作業ウェーブへまとめる。
    // 冷製前菜・麺・温製は専用設備で動かせるため、オーブンの順番を待たず並行作業とする。
    function cookingWave(item, recipe = item.recipe?.resource ? item.recipe : resolveRecipe(item)) {
        const code = normalizeCode(item);
        const stage = cookingStage(item, recipe);
        if (/^12\d{2}$/.test(code) || COLD_PLATES[code] ||
            recipe.resource === "PASTA" || recipe.resource === "HEAT" || recipe.resource === "HOT_PLATING") {
            return { sequence: 0, label: "別設備で並行", parallel: true };
        }
        if (stage.sequence === 1) return { sequence: 1, label: "時間のかかる肉料理", parallel: false };
        if (stage.sequence === 2) return { sequence: 2, label: "下段の前菜", parallel: false };
        if (stage.sequence === 3 || stage.sequence === 4) {
            return { sequence: 3, label: "ドリア・グラタン／下段の肉料理", parallel: false };
        }
        if (stage.sequence === 5) return { sequence: 4, label: "上段2周の肉料理", parallel: false };
        if (stage.sequence === 6) return { sequence: 5, label: "スープ／上段の前菜", parallel: false };
        if (stage.sequence === 7 || stage.sequence === 8) {
            return { sequence: 6, label: "ピザ・パン／上段1周の肉料理", parallel: false };
        }
        return { sequence: 0, label: "別設備で並行", parallel: true };
    }

    function workPriority(item, recipe = item.recipe?.resource ? item.recipe : resolveRecipe(item)) {
        return cookingStage(item, recipe).sequence;
    }

    // 伝票を3〜5枚へ均等に区切る。6枚を5+1にせず3+3にすることで、孤立した伝票を作らない。
    function assignWorkGroups(orderedEpisodes, minimum = 3, maximum = 5) {
        const count = orderedEpisodes.length;
        if (!count) return new Map();
        const maxSize = Math.max(1, Math.floor(Number(maximum) || 5));
        const minSize = Math.min(maxSize, Math.max(1, Math.floor(Number(minimum) || 3)));
        let groupCount = Math.max(1, Math.ceil(count / maxSize));
        while (groupCount > 1 && Math.floor(count / groupCount) < minSize) groupCount -= 1;
        const baseSize = Math.floor(count / groupCount);
        const largerGroupCount = count % groupCount;
        const assignments = new Map();
        let offset = 0;
        for (let groupIndex = 0; groupIndex < groupCount; groupIndex += 1) {
            const size = baseSize + (groupIndex < largerGroupCount ? 1 : 0);
            orderedEpisodes.slice(offset, offset + size).forEach(episode => {
                assignments.set(episode, { number: groupIndex + 1, ticketCount: size, totalGroups: groupCount });
            });
            offset += size;
        }
        return assignments;
    }

    function priorityCompare(a, b) {
        if (a._arrivalMode && b._arrivalMode) return arrivalCompare(a, b);
        const aOverdue = a._slackSeconds < 0 ? 0 : 1;
        const bOverdue = b._slackSeconds < 0 ? 0 : 1;
        if (aOverdue !== bOverdue) return aOverdue - bOverdue;
        if (a._workGroupNumber !== b._workGroupNumber) {
            return a._workGroupNumber - b._workGroupNumber;
        }
        if (a._workPriority !== b._workPriority) return a._workPriority - b._workPriority;
        if (a._priorityStrategy === "short-ticket" && b._priorityStrategy === "short-ticket" &&
            a._recipe.resource === b._recipe.resource && a._ticketWorkSeconds !== b._ticketWorkSeconds) {
            return a._ticketWorkSeconds - b._ticketWorkSeconds;
        }
        if (a._episodePriorityRank !== b._episodePriorityRank) {
            return a._episodePriorityRank - b._episodePriorityRank;
        }
        if (a._slackSeconds !== b._slackSeconds) return a._slackSeconds - b._slackSeconds;
        if (a._createdAtMs !== b._createdAtMs) return a._createdAtMs - b._createdAtMs;
        if (a._desiredStartSeconds !== b._desiredStartSeconds) {
            return a._desiredStartSeconds - b._desiredStartSeconds;
        }
        if (a._recipe.durationSeconds !== b._recipe.durationSeconds) {
            return b._recipe.durationSeconds - a._recipe.durationSeconds;
        }
        const tableDiff = stableCompare(a.table, b.table);
        if (tableDiff) return tableDiff;
        const orderDiff = stableCompare(a.orderId, b.orderId);
        if (orderDiff) return orderDiff;
        return stableCompare(a.itemId ?? a.itemIndex, b.itemId ?? b.itemIndex);
    }

    // 別注文を同じ卓だけで束ねず、伝票内の長い工程を起点に短い工程を部分的に遅らせる。
    function prepare(items, nowMs, settings) {
        const enriched = items.map((item, index) => {
            const recipe = resolveRecipe(item);
            const prepLeadSeconds = preparationLeadSeconds(item, recipe);
            return {
                ...item,
                _inputIndex: index,
                _arrivalMode: settings.orderingStrategy === "arrival",
                _recipe: recipe,
                _prepLeadSeconds: prepLeadSeconds,
                _workPriority: workPriority(item, recipe),
                _createdAtMs: Number(item.createdAtMs) || nowMs,
                _table: String(item.table ?? "--"),
                _episode: episodeKey(item, index)
            };
        });

        const longestByEpisode = new Map();
        const oldestByEpisode = new Map();
        const feedUnitsByEpisodeResource = new Map();
        for (const task of enriched) {
            const locked = settings.episodeCriticalSeconds instanceof Map ?
                settings.episodeCriticalSeconds.get(task._episode) :
                settings.episodeCriticalSeconds?.[task._episode];
            longestByEpisode.set(
                task._episode,
                Math.max(longestByEpisode.get(task._episode) || 0, task._recipe.durationSeconds,
                    Number.isFinite(Number(locked)) ? Number(locked) : 0)
            );
            oldestByEpisode.set(
                task._episode,
                Math.min(oldestByEpisode.get(task._episode) ?? Number.POSITIVE_INFINITY, task._createdAtMs)
            );
            if (task._recipe.resource.startsWith("OVEN_")) {
                const key = `${task._episode}\u0000${task._recipe.resource}`;
                const units = (task._recipe.passTrayUnits || [task._recipe.trayUnits || 1])
                    .reduce((sum, value) => sum + value, 0);
                feedUnitsByEpisodeResource.set(key,
                    (feedUnitsByEpisodeResource.get(key) || 0) +
                    Math.max(1, Math.ceil(Number(task.qty) || 1)) * units);
            }
        }

        const earlySnackByEpisode = new Map();
        for (const task of enriched) {
            if (!COLD_PLATES[normalizeCode(task)] || longestByEpisode.get(task._episode) < 300 ||
                task._recipe.durationSeconds > settings.firstBiteTargetMinutes * 60) continue;
            const previous = earlySnackByEpisode.get(task._episode);
            if (!previous || task._recipe.durationSeconds < previous._recipe.durationSeconds) {
                earlySnackByEpisode.set(task._episode, task);
            }
        }

        // A common ticket order across resources prevents cross-oven priority cycles.
        const orderedEpisodes = [...longestByEpisode.keys()]
            .sort((a, b) => {
                    const aSlack = (oldestByEpisode.get(a) + settings.targetWaitMinutes * 60000 - nowMs) / 1000 -
                        longestByEpisode.get(a);
                    const bSlack = (oldestByEpisode.get(b) + settings.targetWaitMinutes * 60000 - nowMs) / 1000 -
                        longestByEpisode.get(b);
                    const aOverdue = aSlack < 0 ? 0 : 1;
                    const bOverdue = bSlack < 0 ? 0 : 1;
                    if (aOverdue !== bOverdue) return aOverdue - bOverdue;
                    if (aSlack !== bSlack) return aSlack - bSlack;
                    if (oldestByEpisode.get(a) !== oldestByEpisode.get(b)) {
                        return oldestByEpisode.get(a) - oldestByEpisode.get(b);
                    }
                    return stableCompare(a, b);
                });
        const episodePriority = new Map(orderedEpisodes.map((episode, index) => [episode, index]));
        const workGroups = assignWorkGroups(
            orderedEpisodes,
            settings.workGroupMinTickets,
            settings.workGroupMaxTickets
        );

        // 各作業組に実在するウェーブだけを詰めて並べる。例えば1・3・6だけなら
        // 1番目、2番目、3番目として開始し、存在しない工程の待ち時間は作らない。
        const waveProfileByGroup = new Map();
        for (const task of enriched) {
            const workGroup = workGroups.get(task._episode) || { number: 1 };
            const wave = cookingWave(task, task._recipe);
            if (wave.parallel) continue;
            if (!waveProfileByGroup.has(workGroup.number)) {
                waveProfileByGroup.set(workGroup.number, { sequences: new Set(), prepLeadBySequence: new Map() });
            }
            const profile = waveProfileByGroup.get(workGroup.number);
            profile.sequences.add(wave.sequence);
            profile.prepLeadBySequence.set(wave.sequence,
                Math.max(profile.prepLeadBySequence.get(wave.sequence) || 0, task._prepLeadSeconds));
        }
        for (const profile of waveProfileByGroup.values()) {
            const sequences = [...profile.sequences].sort((a, b) => a - b);
            profile.rankBySequence = new Map(sequences.map((sequence, index) => [sequence, index]));
            profile.baseLeadSeconds = profile.prepLeadBySequence.get(sequences[0]) || 0;
        }

        return enriched.map(task => {
            const stage = cookingStage(task, task._recipe);
            const wave = cookingWave(task, task._recipe);
            const workGroup = workGroups.get(task._episode) || { number: 1, ticketCount: 1, totalGroups: 1 };
            const waveProfile = waveProfileByGroup.get(workGroup.number);
            const waveRank = wave.parallel ? 0 : (waveProfile?.rankBySequence.get(wave.sequence) ?? 0);
            const waveLaunchSeconds = wave.parallel || settings.orderingStrategy === "arrival" ? task._prepLeadSeconds :
                Math.max(task._prepLeadSeconds,
                    (waveProfile?.baseLeadSeconds || task._prepLeadSeconds) +
                        waveRank * settings.workWaveGapSeconds);
            const earlySnack = earlySnackByEpisode.get(task._episode) === task;
            const hasStarter = earlySnackByEpisode.has(task._episode);
            const isRiceSide = /^310[123]$/.test(normalizeCode(task));
            const episodeSyncAlignment = hasStarter ?
                (isRiceSide ? settings.sideSyncAlignment : settings.starterSyncAlignment) : settings.syncAlignment;
            const episodeCriticalSeconds = longestByEpisode.get(task._episode) || task._recipe.durationSeconds;
            const dueAtMs = task._createdAtMs + settings.targetWaitMinutes * 60000;
            const anchoredFinishSeconds = episodeTargetFinishSeconds(settings, task);
            const allowedLeadSeconds = (1 - episodeSyncAlignment) *
                (episodeCriticalSeconds - task._recipe.durationSeconds);
            const itemNotBeforeSeconds = Math.max(0, Number(task.notBeforeSeconds) || 0);
            const synchronizedStartSeconds = earlySnack ? task._prepLeadSeconds :
                (anchoredFinishSeconds > 0 ?
                    anchoredFinishSeconds - task._recipe.durationSeconds - allowedLeadSeconds :
                    episodeSyncAlignment * (episodeCriticalSeconds - task._recipe.durationSeconds));
            const maxSynchronizationStartSeconds = Math.max(
                itemNotBeforeSeconds,
                waveLaunchSeconds + settings.maxSynchronizationHoldSeconds
            );
            const desiredStartSeconds = Math.max(
                itemNotBeforeSeconds,
                waveLaunchSeconds,
                Math.min(synchronizedStartSeconds, maxSynchronizationStartSeconds)
            );
            const feedSeconds = task._recipe.resource === "OVEN_LOWER" ?
                settings.lowerFeedSeconds : settings.upperFeedSeconds;
            const feedUnits = feedUnitsByEpisodeResource.get(
                `${task._episode}\u0000${task._recipe.resource}`) || 1;
            return {
                ...task,
                _earlySnack: earlySnack,
                _cookingStage: stage,
                _cookingWave: wave,
                _workWaveRank: waveRank,
                _waveLaunchSeconds: waveLaunchSeconds,
                _workGroupNumber: workGroup.number,
                _workGroupTicketCount: workGroup.ticketCount,
                _workGroupTotal: workGroup.totalGroups,
                _priorityStrategy: settings.priorityStrategy,
                _ticketWorkSeconds: task._recipe.durationSeconds +
                    Math.ceil(Math.max(0, feedUnits - 2) / 2) * feedSeconds -
                    Math.max(0, (nowMs - task._createdAtMs) / 1000) * settings.shortTicketAgeWeight,
                _episodeSyncAlignment: episodeSyncAlignment,
                _episodePriorityRank: episodePriority.get(task._episode),
                _episodeCriticalSeconds: episodeCriticalSeconds,
                _preparationLeadSeconds: task._prepLeadSeconds,
                _baseDesiredStartSeconds: desiredStartSeconds,
                _desiredStartSeconds: desiredStartSeconds,
                _maxSynchronizationStartSeconds: maxSynchronizationStartSeconds,
                _slackSeconds: (dueAtMs - nowMs) / 1000 - episodeCriticalSeconds,
                _dueAtMs: dueAtMs
            };
        });
    }

    function partnerCompare(seed, a, b) {
        if (seed._arrivalMode) return arrivalCompare(a, b);
        const aSameEpisode = a._episode === seed._episode ? 0 : 1;
        const bSameEpisode = b._episode === seed._episode ? 0 : 1;
        if (aSameEpisode !== bSameEpisode) return aSameEpisode - bSameEpisode;
        const aSameTable = a._table === seed._table ? 0 : 1;
        const bSameTable = b._table === seed._table ? 0 : 1;
        if (aSameTable !== bSameTable) return aSameTable - bSameTable;
        const aSlackDistance = Math.abs(a._slackSeconds - seed._slackSeconds);
        const bSlackDistance = Math.abs(b._slackSeconds - seed._slackSeconds);
        if (aSlackDistance !== bSlackDistance) return aSlackDistance - bSlackDistance;
        return priorityCompare(a, b);
    }

    function resourceNotBeforeSeconds(settings, resource) {
        const constraint = settings.resourceNotBeforeSeconds;
        if (Number.isFinite(Number(constraint))) return Math.max(0, Number(constraint));
        if (!constraint || typeof constraint !== "object") return 0;
        const value = constraint[resource] ?? constraint.default ?? 0;
        return Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
    }

    function episodeTargetFinishSeconds(settings, task) {
        const targets = settings.episodeTargetFinishSeconds;
        const value = targets instanceof Map ? targets.get(task._episode) : targets?.[task._episode];
        if (Number.isFinite(Number(value))) return Math.max(0, Number(value));
        const legacy = settings.tableTargetFinishSeconds;
        const legacyValue = legacy instanceof Map ? legacy.get(task._table) : legacy?.[task._table];
        return Number.isFinite(Number(legacyValue)) ? Math.max(0, Number(legacyValue)) : 0;
    }

    // 既に投入された枠を予約として読み込み、左右の容量と投入間隔に矛盾がある予約は拒否する。
    function fixedReservations(settings, resource, feedSeconds) {
        if (!Array.isArray(settings.fixedReservations)) return [];
        const byTime = new Map();
        for (const reservation of settings.fixedReservations) {
            if (!reservation || reservation.resource !== resource) continue;
            const time = Number(reservation.startSeconds);
            const usedUnits = Number(reservation.trayUnits ?? 1);
            if (!Number.isFinite(time) || time < 0) {
                throw new RangeError(`${resource} の固定予約時刻が不正です`);
            }
            if (!Number.isInteger(usedUnits) || usedUnits < 1 || usedUnits > 2) {
                throw new RangeError(`${resource} の固定予約レーン数が不正です`);
            }
            byTime.set(time, (byTime.get(time) || 0) + usedUnits);
        }

        const reservations = [...byTime]
            .map(([time, usedUnits]) => {
                if (usedUnits > 2) {
                    throw new RangeError(`${resource} の固定予約が2レーンを超えています`);
                }
                return { time, usedUnits, fixed: true };
            })
            .sort((a, b) => a.time - b.time);

        for (let index = 1; index < reservations.length; index += 1) {
            if (reservations[index].time - reservations[index - 1].time < feedSeconds - 1e-9) {
                throw new RangeError(`${resource} の固定予約が投入間隔を満たしていません`);
            }
        }
        return reservations;
    }

    function passStarts(task, firstStartSeconds) {
        const passes = Math.max(1, Number(task._recipe.passes) || 1);
        return Array.from({ length: passes }, (_, index) =>
            firstStartSeconds + (task._recipe.passOffsets?.[index] ??
                index * task._recipe.durationSeconds / passes)
        );
    }

    function sameTime(a, b) {
        return Math.abs(a - b) <= 1e-9;
    }

    function slotPosition(slots, time) {
        let low = 0;
        let high = slots.length;
        while (low < high) {
            const middle = (low + high) >>> 1;
            if (slots[middle].time < time) low = middle + 1;
            else high = middle;
        }
        return low;
    }

    function slotAt(slots, time) {
        const position = slotPosition(slots, time);
        if (position < slots.length && sameTime(slots[position].time, time)) return slots[position];
        if (position > 0 && sameTime(slots[position - 1].time, time)) return slots[position - 1];
        return undefined;
    }

    function canPlacePasses(task, firstStartSeconds, slots, feedSeconds) {
        const starts = passStarts(task, firstStartSeconds);

        for (let index = 0; index < starts.length; index += 1) {
            const units = task._recipe.passTrayUnits?.[index] || task._recipe.trayUnits || 1;
            for (let other = index + 1; other < starts.length; other += 1) {
                if (Math.abs(starts[index] - starts[other]) < feedSeconds - 1e-9) return false;
            }

            const position = slotPosition(slots, starts[index]);
            const nearby = slots.slice(Math.max(0, position - 1), Math.min(slots.length, position + 2));
            for (const slot of nearby) {
                const distance = Math.abs(starts[index] - slot.time);
                if (sameTime(starts[index], slot.time)) {
                    if (slot.usedUnits + units > 2) return false;
                } else if (distance < feedSeconds - 1e-9) {
                    return false;
                }
            }
        }

        return true;
    }

    // 予約の境界を候補にして投入可能な最早時刻を探し、無制限な時刻刻みの探索を避ける。
    function earliestFeasibleStart(task, minimumStartSeconds, slots, feedSeconds) {
        const minimum = Math.max(0, minimumStartSeconds);
        const offsets = passStarts(task, 0);
        const candidates = new Set([minimum]);

        // A first pass can either share an existing feed position or start at the
        // first legal point after it. These boundaries contain the earliest
        // feasible answer for every existing reservation and every later pass.
        for (const slot of slots) {
            for (const offset of offsets) {
                const sharedStart = slot.time - offset;
                const afterStart = slot.time + feedSeconds - offset;
                if (sharedStart >= minimum - 1e-9) candidates.add(Math.max(minimum, sharedStart));
                if (afterStart >= minimum - 1e-9) candidates.add(Math.max(minimum, afterStart));
            }
        }

        const ordered = [...candidates].sort((a, b) => a - b);
        for (const candidate of ordered) {
            if (canPlacePasses(task, candidate, slots, feedSeconds)) return candidate;
        }

        // The boundary set above should always yield a result. Keep a bounded
        // fallback for malformed external reservations rather than hanging KDS.
        let candidate = ordered[ordered.length - 1] || minimum;
        for (let attempt = 0; attempt < slots.length * 4 + 16; attempt += 1) {
            candidate += feedSeconds;
            if (canPlacePasses(task, candidate, slots, feedSeconds)) return candidate;
        }
        throw new Error("オーブン投入枠を確保できませんでした");
    }

    function reserveTaskPasses(task, firstStartSeconds, slots) {
        const starts = passStarts(task, firstStartSeconds);
        const lanes = [];

        for (let index = 0; index < starts.length; index += 1) {
            const start = starts[index];
            const units = task._recipe.passTrayUnits?.[index] || task._recipe.trayUnits || 1;
            let slot = slotAt(slots, start);
            const usedBefore = slot ? slot.usedUnits : 0;
            lanes.push(units === 2 ? "左右" : String(usedBefore + 1));
            if (slot) {
                slot.usedUnits += units;
            } else {
                slot = { time: start, usedUnits: units, fixed: false };
                slots.splice(slotPosition(slots, start), 0, slot);
            }
        }
        return { starts, lanes, units: starts.map((_, index) =>
            task._recipe.passTrayUnits?.[index] || task._recipe.trayUnits || 1) };
    }

    // 数量分の物理的な鉄板と複数周回を配置し、表示時には元の明細単位へ集約する。
    function scheduleOven(tasks, resource, feedSeconds, settings) {
        // One order-detail row may represent several physical trays. Expand it
        // only inside the oven model, then collapse it back to one KDS row.
        const remaining = tasks.flatMap(task => {
            const quantity = Math.max(1, Math.ceil(Number(task.qty) || 1));
            return Array.from({ length: quantity }, (_, unitIndex) => ({
                ...task,
                _sourceTask: task,
                _unitIndex: unitIndex
            }));
        });
        const scheduledUnits = [];
        const slots = fixedReservations(settings, resource, feedSeconds);
        const notBefore = resourceNotBeforeSeconds(settings, resource);
        let cursorSeconds = Math.max(notBefore, Math.min(...remaining.map(task => task._desiredStartSeconds)));

        function scheduleAt(task, startSeconds) {
            const reservation = reserveTaskPasses(task, startSeconds, slots);
            scheduledUnits.push({
                ...task,
                scheduleStartSeconds: startSeconds,
                scheduleFinishSeconds: startSeconds + task._recipe.durationSeconds,
                ovenPassStartSeconds: reservation.starts,
                ovenPassLanes: reservation.lanes,
                lane: reservation.units[0] === 2 ? "左右" : reservation.lanes[0]
            });
            remaining.splice(remaining.indexOf(task), 1);
        }

        while (remaining.length) {
            const earliestDesired = Math.max(
                notBefore,
                Math.min(...remaining.map(task => task._desiredStartSeconds))
            );
            cursorSeconds = Math.max(cursorSeconds, earliestDesired);

            let available = remaining
                .filter(task => Math.max(notBefore, task._desiredStartSeconds) <= cursorSeconds + 1e-9)
                .sort(priorityCompare);
            if (!available.length) {
                cursorSeconds = earliestDesired;
                available = remaining
                    .filter(task => Math.max(notBefore, task._desiredStartSeconds) <= cursorSeconds + 1e-9)
                    .sort(priorityCompare);
            }

            const seed = available[0];
            const seedStart = earliestFeasibleStart(
                seed,
                Math.max(cursorSeconds, seed._desiredStartSeconds, notBefore),
                slots,
                feedSeconds
            );
            scheduleAt(seed, seedStart);

            if (seed._recipe.trayUnits === 1) {
                const partner = available
                    .filter(task => task !== seed && task._recipe.trayUnits === 1)
                    .sort((a, b) => partnerCompare(seed, a, b))
                    .find(task => canPlacePasses(task, seedStart, slots, feedSeconds));
                if (partner) scheduleAt(partner, seedStart);
            }

            cursorSeconds = seedStart;
        }

        const scheduledByInput = new Map();
        for (const unit of scheduledUnits) {
            const key = unit._sourceTask._inputIndex;
            if (!scheduledByInput.has(key)) {
                scheduledByInput.set(key, {
                    ...unit._sourceTask,
                    scheduleStartSeconds: unit.scheduleStartSeconds,
                    scheduleFinishSeconds: unit.scheduleFinishSeconds,
                    ovenPassStartSeconds: [],
                    ovenPassLanes: [],
                    ovenFeedEvents: [],
                    lane: "-"
                });
            }
            const aggregate = scheduledByInput.get(key);
            aggregate.scheduleStartSeconds = Math.min(
                aggregate.scheduleStartSeconds,
                unit.scheduleStartSeconds
            );
            aggregate.scheduleFinishSeconds = Math.max(
                aggregate.scheduleFinishSeconds,
                unit.scheduleFinishSeconds
            );
            unit.ovenPassStartSeconds.forEach((startSeconds, passIndex) => {
                aggregate.ovenPassStartSeconds.push(startSeconds);
                aggregate.ovenPassLanes.push(unit.ovenPassLanes[passIndex]);
                aggregate.ovenFeedEvents.push({
                    startSeconds,
                    pass: passIndex + 1,
                    unit: unit._unitIndex + 1,
                    trayUnits: unit._recipe.passTrayUnits?.[passIndex] || unit._recipe.trayUnits,
                    lane: unit.ovenPassLanes[passIndex]
                });
            });
        }

        const scheduled = [...scheduledByInput.values()];
        scheduled.forEach(task => {
            task.ovenFeedEvents.sort((a, b) =>
                a.startSeconds - b.startSeconds || a.pass - b.pass || a.unit - b.unit
            );
            task.ovenPassStartSeconds = task.ovenFeedEvents.map(event => event.startSeconds);
            task.ovenPassLanes = task.ovenFeedEvents.map(event => event.lane);
            task.lane = task.ovenFeedEvents.length === task._recipe.passes ?
                task.ovenFeedEvents[0].lane : "複数";
        });

        const batchStarts = [...new Set(scheduled.map(task => task.scheduleStartSeconds))]
            .sort((a, b) => a - b);
        const batchByStart = new Map(batchStarts.map((start, index) => [start, index + 1]));
        scheduled.forEach(task => {
            task.batchNumber = batchByStart.get(task.scheduleStartSeconds);
        });

        return scheduled;
    }

    // オーブン以外は開始可能時刻の下限を守るモデル。未計測の人員・設備容量を厳密に再現する処理ではない。
    function scheduleOther(tasks, resource, settings) {
        const notBefore = resourceNotBeforeSeconds(settings, resource);
        return [...tasks]
            .sort((a, b) => {
                if (a._desiredStartSeconds !== b._desiredStartSeconds) {
                    return a._desiredStartSeconds - b._desiredStartSeconds;
                }
                return priorityCompare(a, b);
            })
            .map((task, index) => ({
                ...task,
                scheduleStartSeconds: Math.max(notBefore, task._desiredStartSeconds),
                scheduleFinishSeconds: Math.max(notBefore, task._desiredStartSeconds) + task._recipe.durationSeconds,
                batchNumber: index + 1,
                lane: "-"
            }));
    }

    function chainPassRecipe(recipe, resource, durationSeconds) {
        return {
            ...recipe,
            resource,
            durationSeconds,
            passes: 1,
            passOffsets: undefined,
            passResources: undefined,
            passTrayUnits: undefined,
            trayUnits: 1
        };
    }

    // 焼成チキンは下段6分の直後に上段3分へ移す。上段枠が詰まる場合は
    // 下段の開始を遅らせ、オーブン間で待たせない投入時刻を反復して探す。
    function scheduleOvenChain(chainTasks, lowerTasks, upperTasks, settings) {
        const units = chainTasks.flatMap(task => {
            const quantity = Math.max(1, Math.ceil(Number(task.qty) || 1));
            return Array.from({ length: quantity }, (_, unitIndex) => ({
                original: task,
                unitIndex,
                desiredStartSeconds: task._desiredStartSeconds,
                key: `${task._inputIndex}:${unitIndex}`
            }));
        });
        let lowerScheduled = [];
        let upperScheduled = [];
        let lowerByKey = new Map();
        let upperByKey = new Map();

        for (let iteration = 0; iteration < 64; iteration += 1) {
            const lowerChainTasks = units.map(unit => ({
                ...unit.original,
                qty: 1,
                _inputIndex: `chain-lower:${unit.key}`,
                _chainKey: unit.key,
                _chainUnitIndex: unit.unitIndex,
                _desiredStartSeconds: unit.desiredStartSeconds,
                _recipe: chainPassRecipe(unit.original._recipe, "OVEN_LOWER", 360)
            }));
            lowerScheduled = scheduleOven(
                [...lowerTasks, ...lowerChainTasks],
                "OVEN_LOWER",
                settings.lowerFeedSeconds,
                settings
            );
            lowerByKey = new Map(lowerScheduled
                .filter(task => task._chainKey)
                .map(task => [task._chainKey, task]));

            const upperChainTasks = units.map(unit => {
                const lower = lowerByKey.get(unit.key);
                return {
                    ...unit.original,
                    qty: 1,
                    _inputIndex: `chain-upper:${unit.key}`,
                    _chainKey: unit.key,
                    _chainUnitIndex: unit.unitIndex,
                    _desiredStartSeconds: lower.scheduleStartSeconds + 360,
                    _recipe: chainPassRecipe(unit.original._recipe, "OVEN_UPPER", 180)
                };
            });
            upperScheduled = scheduleOven(
                [...upperTasks, ...upperChainTasks],
                "OVEN_UPPER",
                settings.upperFeedSeconds,
                settings
            );
            upperByKey = new Map(upperScheduled
                .filter(task => task._chainKey)
                .map(task => [task._chainKey, task]));

            let shifted = false;
            for (const unit of units) {
                const lower = lowerByKey.get(unit.key);
                const upper = upperByKey.get(unit.key);
                const transferDelay = upper.scheduleStartSeconds - (lower.scheduleStartSeconds + 360);
                if (transferDelay > 1e-9) {
                    unit.desiredStartSeconds += transferDelay;
                    shifted = true;
                }
            }
            if (!shifted) break;
            if (iteration === 63) {
                throw new Error("焼成チキンの下段・上段連続枠を確保できませんでした");
            }
        }

        const scheduledChain = chainTasks.map(original => {
            const originalUnits = units.filter(unit => unit.original === original);
            const events = originalUnits.flatMap(unit => {
                const lower = lowerByKey.get(unit.key);
                const upper = upperByKey.get(unit.key);
                return [
                    {
                        startSeconds: lower.scheduleStartSeconds,
                        pass: 1,
                        unit: unit.unitIndex + 1,
                        trayUnits: 1,
                        lane: lower.lane,
                        resource: "OVEN_LOWER"
                    },
                    {
                        startSeconds: upper.scheduleStartSeconds,
                        pass: 2,
                        unit: unit.unitIndex + 1,
                        trayUnits: 1,
                        lane: upper.lane,
                        resource: "OVEN_UPPER"
                    }
                ];
            }).sort((a, b) => a.startSeconds - b.startSeconds || a.pass - b.pass || a.unit - b.unit);
            const lowerStarts = events.filter(event => event.resource === "OVEN_LOWER")
                .map(event => event.startSeconds);
            const upperStarts = events.filter(event => event.resource === "OVEN_UPPER")
                .map(event => event.startSeconds);
            return {
                ...original,
                scheduleStartSeconds: Math.min(...lowerStarts),
                scheduleFinishSeconds: Math.max(...upperStarts) + 180,
                ovenPassStartSeconds: events.map(event => event.startSeconds),
                ovenPassLanes: events.map(event => event.lane),
                ovenFeedEvents: events,
                lane: originalUnits.length === 1 ? events[0].lane : "複数",
                batchNumber: lowerByKey.get(originalUnits[0].key).batchNumber
            };
        });

        return {
            lower: lowerScheduled.filter(task => !task._chainKey),
            upper: upperScheduled.filter(task => !task._chainKey),
            chain: scheduledChain
        };
    }

    function scheduleResources(tasks, settings) {
        const byResource = new Map();
        for (const task of tasks) {
            const key = task._recipe.resource;
            if (!byResource.has(key)) byResource.set(key, []);
            byResource.get(key).push(task);
        }

        const scheduled = [];
        const chainTasks = byResource.get("OVEN_CHAIN") || [];
        if (chainTasks.length) {
            const oven = scheduleOvenChain(
                chainTasks,
                byResource.get("OVEN_LOWER") || [],
                byResource.get("OVEN_UPPER") || [],
                settings
            );
            scheduled.push(...oven.lower, ...oven.upper, ...oven.chain);
            byResource.delete("OVEN_CHAIN");
            byResource.delete("OVEN_LOWER");
            byResource.delete("OVEN_UPPER");
        }
        for (const [resource, resourceTasks] of byResource) {
            if (resource === "OVEN_UPPER") {
                scheduled.push(...scheduleOven(resourceTasks, resource, settings.upperFeedSeconds, settings));
            } else if (resource === "OVEN_LOWER") {
                scheduled.push(...scheduleOven(resourceTasks, resource, settings.lowerFeedSeconds, settings));
            } else {
                scheduled.push(...scheduleOther(resourceTasks, resource, settings));
            }
        }
        return scheduled;
    }

    function synchronizationSpread(scheduled) {
        const resourceFinishByEpisode = new Map();
        for (const task of scheduled) {
            if (task._earlySnack) continue;
            if (!resourceFinishByEpisode.has(task._episode)) {
                resourceFinishByEpisode.set(task._episode, { table: task._table, resources: new Map() });
            }
            const byResource = resourceFinishByEpisode.get(task._episode).resources;
            byResource.set(
                task._recipe.resource,
                Math.max(byResource.get(task._recipe.resource) || 0, task.scheduleFinishSeconds)
            );
        }

        const byTable = {};
        const byEpisode = {};
        const shape = [];
        const absoluteShape = [];
        let maximum = 0;
        for (const [episode, group] of [...resourceFinishByEpisode]
            .sort(([a], [b]) => stableCompare(a, b))) {
            const { table, resources: byResource } = group;
            const finishes = [...byResource.values()];
            const spread = finishes.length > 1 ? Math.max(...finishes) - Math.min(...finishes) : 0;
            byEpisode[episode] = spread;
            byTable[table] = Math.max(byTable[table] || 0, spread);
            maximum = Math.max(maximum, spread);
            const tableMaximum = Math.max(...finishes);
            shape.push([
                episode,
                [...byResource]
                    .sort(([a], [b]) => stableCompare(a, b))
                    .map(([resource, finish]) => [resource, finish - tableMaximum])
            ]);
            absoluteShape.push([
                episode,
                [...byResource].sort(([a], [b]) => stableCompare(a, b))
            ]);
        }
        return {
            maximum,
            byTable,
            byEpisode,
            signature: JSON.stringify(shape),
            absoluteSignature: JSON.stringify(absoluteShape)
        };
    }

    // 実際の設備枠で遅れた工程を再配置し、同一伝票内の完成差の70%を詰める。
    function synchronizeEpisodes(tasks, settings) {
        const requestedLimit = Number(settings.maxSyncIterations);
        const maximumIterations = Number.isInteger(requestedLimit) && requestedLimit > 0 ?
            Math.min(64, requestedLimit) : 64;
        let scheduled = [];
        let iterations = 0;
        let previousActualStartByInput = new Map();
        const toleranceValue = Number(settings.syncToleranceSeconds);
        const syncToleranceSeconds = Number.isFinite(toleranceValue) ?
            Math.max(0, toleranceValue) :
            Math.floor(Math.max(settings.upperFeedSeconds, settings.lowerFeedSeconds) / 2);
        const largeBacklogThreshold = Math.max(1, Number(settings.largeBacklogThreshold) || 30);
        const hasExternalFloor = Boolean(settings.resourceNotBeforeSeconds) ||
            (Array.isArray(settings.fixedReservations) && settings.fixedReservations.length > 0);
        const resourceDuration = new Map();
        for (const task of tasks) {
            const key = `${task._episode}\u0000${task._recipe.resource}`;
            resourceDuration.set(key, Math.max(resourceDuration.get(key) || 0, task._recipe.durationSeconds));
        }

        for (; iterations < maximumIterations; iterations += 1) {
            scheduled = scheduleResources(tasks, settings);
            const episodeTargets = new Map();
            const resourceTargets = new Map();
            const scheduledByInput = new Map();

            for (const task of scheduled) {
                scheduledByInput.set(task._inputIndex, task);
                episodeTargets.set(
                    task._episode,
                    Math.max(
                        episodeTargets.get(task._episode) || 0,
                        episodeTargetFinishSeconds(settings, task),
                        task.scheduleFinishSeconds
                    )
                );
                const groupKey = `${task._episode}\u0000${task._recipe.resource}`;
                resourceTargets.set(
                    groupKey,
                    Math.max(resourceTargets.get(groupKey) || 0, task.scheduleFinishSeconds)
                );
            }

            const spread = synchronizationSpread(scheduled);
            const requiredShift = task => {
                if (task._earlySnack) return 0;
                if (task._desiredStartSeconds >= task._maxSynchronizationStartSeconds - 1e-9) return 0;
                const groupKey = `${task._episode}\u0000${task._recipe.resource}`;
                const allowedLead = (1 - task._episodeSyncAlignment) *
                    (task._episodeCriticalSeconds - resourceDuration.get(groupKey));
                return (episodeTargets.get(task._episode) || 0) - allowedLead -
                    (resourceTargets.get(groupKey) || 0);
            };
            const maximumRequiredShift = Math.max(0, ...tasks.map(requiredShift));
            if (tasks.length >= largeBacklogThreshold &&
                maximumRequiredShift > 0 && maximumRequiredShift <= syncToleranceSeconds) {
                return {
                    scheduled,
                    iterations: iterations + 1,
                    iterationLimit: maximumIterations,
                    converged: false,
                    stopReason: "within-feed-tolerance",
                    spread,
                    syncToleranceSeconds
                };
            }

            let changed = false;
            for (const task of tasks) {
                const difference = requiredShift(task);
                if (difference > 1e-9) {
                    const actualStartSeconds = scheduledByInput.get(task._inputIndex)
                        ?.scheduleStartSeconds ?? task._desiredStartSeconds;
                    const actualDidNotMove = sameTime(
                        previousActualStartByInput.get(task._inputIndex),
                        actualStartSeconds
                    );
                    task._desiredStartSeconds = Math.min(
                        task._maxSynchronizationStartSeconds,
                        task._desiredStartSeconds + difference
                    );
                    if (actualDidNotMove && hasExternalFloor) {
                        // The wish is below a not-before/fixed-reservation floor.
                        // Jump from the actual feasible start after one observed
                        // plateau instead of inching forward for up to 43 loops.
                        task._desiredStartSeconds = Math.min(
                            task._maxSynchronizationStartSeconds,
                            Math.max(task._desiredStartSeconds, actualStartSeconds + difference)
                        );
                    }
                    changed = true;
                }
            }
            previousActualStartByInput = new Map(
                [...scheduledByInput].map(([inputIndex, task]) => [inputIndex, task.scheduleStartSeconds])
            );

            if (!changed) {
                return {
                    scheduled,
                    iterations: iterations + 1,
                    iterationLimit: maximumIterations,
                    converged: true,
                    stopReason: "converged",
                    spread,
                    syncToleranceSeconds
                };
            }
        }

        // Apply the final desired starts when a heavily interlocked backlog hits
        // the iteration cap. This keeps runtime bounded and output self-consistent.
        scheduled = scheduleResources(tasks, settings);
        return {
            scheduled,
            iterations: iterations + 1,
            iterationLimit: maximumIterations,
            converged: false,
            stopReason: "iteration-limit",
            spread: synchronizationSpread(scheduled),
            syncToleranceSeconds
        };
    }

    function completionBoundsByEpisode(scheduled) {
        const bounds = new Map();
        for (const task of scheduled) {
            const current = bounds.get(task._episode) || { first: Infinity, last: 0 };
            current.first = Math.min(current.first, task.scheduleFinishSeconds);
            current.last = Math.max(current.last, task.scheduleFinishSeconds);
            bounds.set(task._episode, current);
        }
        return bounds;
    }

    function planWaitMetrics(plan) {
        const first = Object.values(plan.firstDishSecondsByOrder);
        const last = Object.values(plan.lastDishSecondsByOrder).sort((a, b) => a - b);
        const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
        return {
            first: mean(first),
            last: mean(last),
            p95: last[Math.ceil(last.length * 0.95) - 1],
            worst: last[last.length - 1]
        };
    }

    // Compare schedules on the same pending orders. A faster average is accepted
    // only when the first plate and the tail of the queue stay within guardrails.
    function scheduleAdaptive(items, options) {
        const arrivalBaseline = scheduleKitchenItems(items, {
            ...options, orderingStrategy: "arrival", priorityStrategy: "legacy"
        });
        const candidates = [
            { name: "training", options: { priorityStrategy: "legacy" } },
            ...(items.length <= 120 ? [
                { name: "training-short-0", options: { priorityStrategy: "short-ticket", shortTicketAgeWeight: 0,
                    syncAlignment: 0, starterSyncAlignment: 0, sideSyncAlignment: 0 } }
            ] : []),
            { name: "training-short-0.5", options: { priorityStrategy: "short-ticket", shortTicketAgeWeight: 0.5,
                syncAlignment: 0, starterSyncAlignment: 0, sideSyncAlignment: 0 } },
            ...(items.length <= 120 ? [
                { name: "training-short-1", options: { priorityStrategy: "short-ticket", shortTicketAgeWeight: 1,
                    syncAlignment: 0, starterSyncAlignment: 0, sideSyncAlignment: 0 } }
            ] : [])
        ].map(candidate => {
            const plan = scheduleKitchenItems(items, { ...options, ...candidate.options });
            return { ...candidate, plan, metrics: planWaitMetrics(plan) };
        });

        const baseline = planWaitMetrics(arrivalBaseline);
        const feasible = candidates.filter(({ metrics }) =>
            metrics.last <= baseline.last + 1e-9 &&
            metrics.first <= baseline.first + 120 &&
            metrics.p95 <= baseline.p95 + 60 &&
            metrics.worst <= baseline.worst + 120);
        feasible.sort((a, b) =>
            (a.metrics.last + 0.2 * a.metrics.first) -
                (b.metrics.last + 0.2 * b.metrics.first) ||
            a.metrics.first - b.metrics.first);
        const selected = feasible[0] || candidates[0];
        return {
            ...selected.plan,
            evaluatedTransitions: arrivalBaseline.evaluatedTransitions + candidates.reduce((sum, candidate) =>
                sum + candidate.plan.evaluatedTransitions, 0),
            assumptions: {
                ...selected.plan.assumptions,
                planPolicy: `adaptive-${selected.name}`,
                adaptiveCandidates: candidates.length,
                adaptiveMeanFirstSeconds: Math.round(selected.metrics.first),
                adaptiveMeanLastSeconds: Math.round(selected.metrics.last)
            }
        };
    }

    // 外部へ公開する計算入口。入力から作業予定と前提条件を返し、DBの注文や実際の調理状態は変更しない。
    function scheduleKitchenItems(items, options = {}) {
        if (!Array.isArray(items) || items.length === 0) {
            return {
                items: [],
                exact: true,
                score: 0,
                evaluatedTransitions: 0,
                model: "resource-slot-v7",
                firstDishSecondsByOrder: {},
                lastDishSecondsByOrder: {},
                syncSpreadSeconds: 0,
                syncSpreadByTable: {},
                syncSpreadByOrder: {},
                assumptions: {
                    ...DEFAULTS,
                    ...options,
                    planPolicy: "aligned",
                    episodePriorityPolicy: "due-slack-then-oldest-episode",
                    syncConverged: true,
                    syncIterations: 0,
                    syncIterationLimit: 0,
                    syncStopReason: "converged",
                    hasUntimedManualSteps: false
                }
            };
        }

        if (options.priorityStrategy === "adaptive" && options.orderingStrategy !== "arrival") {
            return scheduleAdaptive(items, options);
        }

        const settings = { ...DEFAULTS, ...options };
        settings.firstBiteTargetMinutes = Number.isFinite(Number(settings.firstBiteTargetMinutes)) ?
            Math.max(1, Number(settings.firstBiteTargetMinutes)) : DEFAULTS.firstBiteTargetMinutes;
        settings.syncAlignment = Number.isFinite(Number(settings.syncAlignment)) ?
            Math.max(0, Math.min(1, Number(settings.syncAlignment))) : DEFAULTS.syncAlignment;
        settings.starterSyncAlignment = Number.isFinite(Number(settings.starterSyncAlignment)) ?
            Math.max(0, Math.min(1, Number(settings.starterSyncAlignment))) : DEFAULTS.starterSyncAlignment;
        settings.sideSyncAlignment = Number.isFinite(Number(settings.sideSyncAlignment)) ?
            Math.max(0, Math.min(1, Number(settings.sideSyncAlignment))) : DEFAULTS.sideSyncAlignment;
        settings.maxSynchronizationHoldSeconds = Number.isFinite(Number(settings.maxSynchronizationHoldSeconds)) ?
            Math.max(0, Math.min(60, Number(settings.maxSynchronizationHoldSeconds))) :
            DEFAULTS.maxSynchronizationHoldSeconds;
        settings.orderingStrategy = settings.orderingStrategy === "arrival" ? "arrival" : "optimized";
        settings.priorityStrategy = settings.priorityStrategy === "short-ticket" ? "short-ticket" : "legacy";
        settings.shortTicketAgeWeight = Number.isFinite(Number(settings.shortTicketAgeWeight)) ?
            Math.max(0, Math.min(2, Number(settings.shortTicketAgeWeight))) : 0;
        settings.workGroupMinTickets = Math.max(1, Math.floor(Number(settings.workGroupMinTickets) || 3));
        settings.workGroupMaxTickets = Math.max(
            settings.workGroupMinTickets,
            Math.floor(Number(settings.workGroupMaxTickets) || 5)
        );
        settings.workWaveGapSeconds = Number.isFinite(Number(settings.workWaveGapSeconds)) ?
            Math.max(0, Math.min(30, Number(settings.workWaveGapSeconds))) : DEFAULTS.workWaveGapSeconds;
        const nowMs = Number(options.nowMs) || Date.now();
        const tasks = prepare(items, nowMs, settings);
        let synchronized;
        let evaluatedTransitions;
        let planPolicy;
        if (settings.orderingStrategy === "arrival") {
            for (const task of tasks) {
                task._desiredStartSeconds = task._prepLeadSeconds;
                task._earlySnack = false;
            }
            const scheduled = scheduleResources(tasks, settings);
            synchronized = {
                scheduled, iterations: 1, iterationLimit: 1, converged: true,
                stopReason: "not-applicable", spread: synchronizationSpread(scheduled),
                syncToleranceSeconds: 0
            };
            evaluatedTransitions = tasks.length;
            planPolicy = "arrival";
        } else {
            synchronized = synchronizeEpisodes(tasks, settings);
            evaluatedTransitions = tasks.length * synchronized.iterations;
            planPolicy = "aligned";
        }
        // 先出し案は、どの伝票の初品・全品完了も遅くしない場合だけ採用する。
        if (settings.orderingStrategy !== "arrival" && tasks.some(task => task._earlySnack) &&
            settings.starterSyncAlignment < settings.syncAlignment &&
            options.starterSyncAlignment === undefined && options.sideSyncAlignment === undefined) {
            const alignedSettings = {
                ...settings,
                starterSyncAlignment: settings.syncAlignment,
                sideSyncAlignment: settings.syncAlignment
            };
            const alignedTasks = prepare(items, nowMs, alignedSettings);
            const aligned = synchronizeEpisodes(alignedTasks, alignedSettings);
            evaluatedTransitions += alignedTasks.length * aligned.iterations;
            const fastBounds = completionBoundsByEpisode(synchronized.scheduled);
            const alignedBounds = completionBoundsByEpisode(aligned.scheduled);
            let improves = false;
            const noRegression = synchronized.converged && [...alignedBounds].every(([episode, prior]) => {
                const fast = fastBounds.get(episode);
                if (!fast || fast.first > prior.first + 1e-9 || fast.last > prior.last + 1e-9) return false;
                if (fast.first < prior.first - 1e-9 || fast.last < prior.last - 1e-9) improves = true;
                return true;
            });
            if (noRegression && improves) planPolicy = "fast-starter";
            else synchronized = aligned;
        }
        const scheduled = synchronized.scheduled;

        scheduled.sort((a, b) => {
            if (settings.orderingStrategy === "arrival") return arrivalCompare(a, b);
            if (a.scheduleStartSeconds !== b.scheduleStartSeconds) {
                return a.scheduleStartSeconds - b.scheduleStartSeconds;
            }
            const priority = priorityCompare(a, b);
            if (priority) return priority;
            const resource = (RESOURCE_ORDER[a._recipe.resource] ?? 99) -
                (RESOURCE_ORDER[b._recipe.resource] ?? 99);
            if (resource) return resource;
            return a._inputIndex - b._inputIndex;
        });

        const resultItems = scheduled.map((task, index) => ({
            ...items[task._inputIndex],
            sequence: index + 1,
            recipe: { ...task._recipe },
            workPriority: task._workPriority,
            cookingStage: { ...task._cookingStage },
            cookingWave: { ...task._cookingWave },
            workWaveRank: task._workWaveRank,
            waveLaunchSeconds: task._waveLaunchSeconds,
            workGroupNumber: task._workGroupNumber,
            workGroupTicketCount: task._workGroupTicketCount,
            workGroupTotal: task._workGroupTotal,
            earlySnack: task._earlySnack,
            preparationLeadSeconds: task._preparationLeadSeconds,
            episodeSyncAlignment: task._episodeSyncAlignment,
            scheduleStartSeconds: Math.round(task.scheduleStartSeconds * 1000) / 1000,
            scheduleFinishSeconds: Math.round(task.scheduleFinishSeconds * 1000) / 1000,
            batchNumber: task.batchNumber,
            lane: task.lane,
            ovenPassStartSeconds: task.ovenPassStartSeconds?.map(value => Math.round(value * 1000) / 1000),
            passStartSeconds: task.ovenPassStartSeconds?.map(value => Math.round(value * 1000) / 1000),
            ovenPassLanes: task.ovenPassLanes ? [...task.ovenPassLanes] : undefined,
            ovenFeedEvents: task.ovenFeedEvents?.map(event => ({
                ...event,
                startSeconds: Math.round(event.startSeconds * 1000) / 1000
            })),
            slackSeconds: Math.round(task._slackSeconds)
        }));

        const score = resultItems.reduce((sum, item) =>
            sum + Math.max(0, item.scheduleFinishSeconds - Math.max(0, item.slackSeconds)), 0);
        const firstDishSecondsByOrder = {};
        const lastDishSecondsByOrder = {};
        for (const task of scheduled) {
            const orderId = String(task.orderId ?? `item-${task._inputIndex}`);
            const elapsedSeconds = Math.max(0, (nowMs - task._createdAtMs) / 1000);
            const estimate = Math.round(elapsedSeconds + task.scheduleFinishSeconds);
            firstDishSecondsByOrder[orderId] = Math.min(
                firstDishSecondsByOrder[orderId] ?? Number.POSITIVE_INFINITY, estimate
            );
            lastDishSecondsByOrder[orderId] = Math.max(lastDishSecondsByOrder[orderId] ?? 0, estimate);
        }

        return {
            items: resultItems,
            exact: synchronized.converged,
            score,
            evaluatedTransitions,
            model: "resource-slot-v7",
            firstDishSecondsByOrder,
            lastDishSecondsByOrder,
            syncSpreadSeconds: Math.round(synchronized.spread.maximum),
            syncSpreadByTable: Object.fromEntries(
                Object.entries(synchronized.spread.byTable)
                    .map(([table, spread]) => [table, Math.round(spread)])
            ),
            syncSpreadByOrder: Object.fromEntries(
                Object.entries(synchronized.spread.byEpisode)
                    .map(([episode, spread]) => [episode.split("\u0000")[0], Math.round(spread)])
            ),
            assumptions: {
                targetWaitMinutes: settings.targetWaitMinutes,
                firstBiteTargetMinutes: settings.firstBiteTargetMinutes,
                priorityStrategy: settings.priorityStrategy,
                shortTicketAgeWeight: settings.shortTicketAgeWeight,
                syncAlignment: settings.syncAlignment,
                starterSyncAlignment: settings.starterSyncAlignment,
                sideSyncAlignment: settings.sideSyncAlignment,
                maxSynchronizationHoldSeconds: settings.maxSynchronizationHoldSeconds,
                planPolicy,
                upperFeedSeconds: settings.upperFeedSeconds,
                lowerFeedSeconds: settings.lowerFeedSeconds,
                ovenLanes: 2,
                workGroupMinTickets: settings.workGroupMinTickets,
                workGroupMaxTickets: settings.workGroupMaxTickets,
                workWaveGapSeconds: settings.workWaveGapSeconds,
                workGroupCount: Math.max(...resultItems.map(item => Number(item.workGroupTotal) || 1)),
                episodePriorityPolicy: settings.orderingStrategy === "arrival" ?
                    "arrival-order" : (settings.priorityStrategy === "short-ticket" ?
                        "due-slack-then-short-ticket" : "due-slack-then-oldest-episode"),
                syncConverged: synchronized.converged,
                syncIterations: synchronized.iterations,
                syncIterationLimit: synchronized.iterationLimit,
                syncStopReason: synchronized.stopReason,
                syncToleranceSeconds: synchronized.syncToleranceSeconds,
                largeBacklogThreshold: Math.max(1, Number(settings.largeBacklogThreshold) || 30),
                anchoredOrderCount: settings.episodeTargetFinishSeconds instanceof Map ?
                    settings.episodeTargetFinishSeconds.size :
                    Object.keys(settings.episodeTargetFinishSeconds || {}).length,
                anchoredTableCount: settings.tableTargetFinishSeconds instanceof Map ?
                    settings.tableTargetFinishSeconds.size :
                    Object.keys(settings.tableTargetFinishSeconds || {}).length,
                resourceNotBeforeSeconds: settings.resourceNotBeforeSeconds || 0,
                fixedReservationCount: Array.isArray(settings.fixedReservations) ?
                    settings.fixedReservations.length : 0,
                // 工程未計測の料理は、既存のマスタ目安または機器時間だけで同期を計算する。
                hasUntimedManualSteps: resultItems.some(item => item.recipe.hasUntimedManualSteps)
            }
        };
    }

    return {
        scheduleKitchenItems, resolveRecipe, episodeKey, workPriority,
        cookingStage, cookingWave, assignWorkGroups
    };
});
