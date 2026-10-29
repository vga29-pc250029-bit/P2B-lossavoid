// KDSの現在時刻を端末の時計から1秒間隔で表示する。注文や調理時刻の保存は行わない。

        function updateTime() {
            const now = new Date();
            const h = String(now.getHours()).padStart(2, '0');
            const m = String(now.getMinutes()).padStart(2, '0');
            const s = String(now.getSeconds()).padStart(2, '0');

            document.getElementById('current-time').innerText =
                `${h}:${m}:${s}`;
        }

        setInterval(updateTime, 1000);
        updateTime();
    