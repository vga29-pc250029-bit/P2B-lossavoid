DECLARE
    column_count NUMBER;
BEGIN
    SELECT COUNT(*) INTO column_count
    FROM USER_TAB_COLUMNS
    WHERE TABLE_NAME = 'MENU_MASTER' AND COLUMN_NAME = 'PREP_STATION';

    IF column_count = 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE MENU_MASTER ADD PREP_STATION VARCHAR2(20)';
    END IF;
END;
/

DECLARE
    PROCEDURE upsert_menu(
        p_code VARCHAR2,
        p_name VARCHAR2,
        p_price NUMBER,
        p_category VARCHAR2,
        p_station VARCHAR2,
        p_cook_time NUMBER
    ) IS
    BEGIN
        MERGE INTO MENU_MASTER target
        USING (
            SELECT p_code AS menu_code, p_name AS menu_name, p_price AS price,
                   p_category AS category, p_station AS prep_station,
                   p_cook_time AS cook_time_min
            FROM DUAL
        ) source
        ON (target.MENU_CODE = source.menu_code)
        WHEN MATCHED THEN UPDATE SET
            target.MENU_NAME = source.menu_name,
            target.PRICE = source.price,
            target.CATEGORY = source.category,
            target.PREP_STATION = source.prep_station,
            target.COOK_TIME_MIN = source.cook_time_min
        WHEN NOT MATCHED THEN INSERT (
            MENU_CODE, MENU_NAME, PRICE, CATEGORY, PREP_STATION,
            COOK_TIME_MIN, STOCK_QTY, SOLD_OUT
        ) VALUES (
            source.menu_code, source.menu_name, source.price, source.category,
            source.prep_station, source.cook_time_min, NULL, 0
        );
    END;
BEGIN
    upsert_menu('2203', 'バッファローモッツァレラのマルゲリータピザ', 400, 'pizza', 'kitchen', 3);
    upsert_menu('2208', 'ソーセージピザ', 400, 'pizza', 'kitchen', 3);
    upsert_menu('2206', 'たっぷりコーンのピザ', 400, 'pizza', 'kitchen', 3);
    upsert_menu('2204', '野菜ときのこのピザ', 400, 'pizza', 'kitchen', 3);
    upsert_menu('2101', 'ミラノ風ドリア', 300, 'doria', 'kitchen', 6);
    upsert_menu('2103', '半熟卵のミラノ風ドリア', 350, 'doria', 'kitchen', 6);
    upsert_menu('2108', '焼チーズミラノ風ドリア', 350, 'doria', 'kitchen', 6);
    upsert_menu('2110', 'タラコとポップコーンシュリンプのドリア', 400, 'doria', 'kitchen', 6);
    upsert_menu('2115', 'ポップコーンシュリンプとタラコのクリームグラタン', 430, 'doria', 'kitchen', 6);
    upsert_menu('2305', 'カルボナーラ', 500, 'pasta', 'heat', 3);
    upsert_menu('2318', '半熟卵のカルボナーラ', 550, 'pasta', 'heat', 3);
    upsert_menu('2301', 'タラコソースシシリー風', 400, 'pasta', 'heat', 3);
    upsert_menu('2320', '小エビのタラコソース', 540, 'pasta', 'heat', 3);
    upsert_menu('2304', 'パルマ風スパゲッティ', 400, 'pasta', 'heat', 3);
    upsert_menu('2321', 'きのことほうれん草のクリームスパゲッティ', 600, 'pasta', 'heat', 3);
    upsert_menu('2328', 'イカの墨入りセピアソース', 500, 'pasta', 'heat', 3);
    upsert_menu('2306', 'ミートソースボロニア風', 400, 'pasta', 'heat', 3);
    upsert_menu('2316', '半熟卵のミートソースボロニア風', 450, 'pasta', 'heat', 3);
    upsert_menu('2310', 'スープ入り塩味ボンゴレ', 500, 'pasta', 'heat', 3);
    upsert_menu('2303', 'ペペロンチーノ', 300, 'pasta', 'heat', 3);
    upsert_menu('2317', '半熟卵のペペロンチーノ', 350, 'pasta', 'heat', 3);
    upsert_menu('2325', 'ペンネアラビアータ', 430, 'pasta', 'heat', 3);
    upsert_menu('2418', 'ミックスグリル', 650, 'meat', 'kitchen', 6);
    upsert_menu('2406', 'ハンバーグステーキ', 400, 'meat', 'kitchen', 6);
    upsert_menu('2403', 'イタリアンハンバーグ', 500, 'meat', 'kitchen', 6);
    upsert_menu('2407', 'ディアボラ風ハンバーグ', 500, 'meat', 'kitchen', 6);
    upsert_menu('2402', '若鶏のディアボラ風', 500, 'meat', 'kitchen', 3);
    upsert_menu('2404', '柔らかチキンのチーズ焼き', 500, 'meat', 'kitchen', 3);
    upsert_menu('2417', 'ラム（仔羊）のランプステーキ', 1090, 'meat', 'kitchen', 6);
    upsert_menu('3101', 'ライス', 150, 'rice', 'Flor', 1);
    upsert_menu('3102', 'ラージライス', 200, 'rice', 'Flor', 1);
    upsert_menu('3103', 'スモールライス', 100, 'rice', 'Flor', 1);
    upsert_menu('3110', 'フォッカチオ', 150, 'rice', 'kitchen', 3);
    upsert_menu('3111', 'ガーリックフォッカチオ', 200, 'rice', 'kitchen', 3);
    upsert_menu('3112', 'シナモンフォッカチオ', 200, 'rice', 'kitchen', 3);
    upsert_menu('3114', 'チーズフォッカチオ', 250, 'rice', 'kitchen', 3);
    upsert_menu('1307', 'たまねぎのズッパ', 300, 'appetizer', 'kitchen', 3);
    upsert_menu('1301', 'コーンクリームスープ', 150, 'appetizer', 'heat', 1);
    upsert_menu('1305', '田舎風ミネストローネ', 300, 'appetizer', 'kitchen', 3);
    upsert_menu('1202', '小エビのサラダ', 350, 'appetizer', 'heat', 2);
    upsert_menu('1209', 'チキンのサラダ', 350, 'appetizer', 'heat', 2);
    upsert_menu('1205', 'わかめのサラダ', 350, 'appetizer', 'heat', 2);
    upsert_menu('1423', '生ハムとモッツァレラの盛合せ', 500, 'appetizer', 'heat', 2);
    upsert_menu('1422', 'ハモン・セラーヌ', 320, 'appetizer', 'heat', 2);
    upsert_menu('1417', 'バッファローモッツァレラのカプレーゼ', 430, 'appetizer', 'heat', 2);
    upsert_menu('1408', '蒸し鶏の香味ソース', 280, 'appetizer', 'heat', 2);
    upsert_menu('1406', '小エビのカクテル', 280, 'appetizer', 'heat', 2);
    upsert_menu('1405', 'エスカルゴのオーブン焼き', 400, 'appetizer', 'kitchen', 6);
    upsert_menu('1402', 'アロスティチーニ', 400, 'appetizer', 'kitchen', 6);
    upsert_menu('1452', 'アロスティチーニ（Ｗサイズ）', 800, 'appetizer', 'kitchen', 6);
    upsert_menu('1410', 'ムール貝のガーリック焼き', 400, 'appetizer', 'kitchen', 6);
    upsert_menu('1401', '辛味チキン', 300, 'appetizer', 'kitchen', 6);
    upsert_menu('1407', 'チョリソー', 400, 'appetizer', 'kitchen', 3);
    upsert_menu('1404', 'ポップコーンシュリンプ', 300, 'appetizer', 'kitchen', 3);
    upsert_menu('1416', 'ポテトのグリル', 300, 'appetizer', 'kitchen', 3);
    upsert_menu('1403', 'ほうれん草のソテー', 200, 'appetizer', 'heat', 3);
    upsert_menu('1413', 'キャロットラペ', 200, 'appetizer', 'heat', 2);
    upsert_menu('1425', '柔らか青豆の温サラダ', 200, 'appetizer', 'heat', 2);
    upsert_menu('5101', 'セットドリンクバー', 200, 'drink', 'No', 0);
    upsert_menu('3212', 'プリンとティラミスクラシコの盛合せ', 500, 'dessert', 'desert', 1);
    upsert_menu('3206', 'イタリアンプリン', 250, 'dessert', 'desert', 1);
    upsert_menu('3201', 'ティラミスクラシコ', 250, 'dessert', 'desert', 1);
    upsert_menu('3207', 'チョコレートケーキ', 300, 'dessert', 'desert', 1);
    upsert_menu('3205', 'ミルクジェラート', 250, 'dessert', 'desert', 1);
    upsert_menu('3216', 'チョコレートケーキ＆ミルクジェラート', 500, 'dessert', 'desert', 1);
    upsert_menu('3213', 'トリフアイスクリーム', 350, 'dessert', 'desert', 1);
    upsert_menu('3215', 'コーヒーゼリー＆ミルクジェラート', 350, 'dessert', 'desert', 1);
    upsert_menu('3214', 'ジェラート＆シナモンフォッカチオ', 450, 'dessert', 'desert', 3);

    COMMIT;
END;
/
