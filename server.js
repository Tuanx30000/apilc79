/**
 * =========================================================================================
 * 🚀 TUANX3000 ULTIMATE V10.2 - ALL-IN-ONE CORE ENGINE
 * ADMIN: TUANX3000 | VERSION: 10.2 PRO MAX
 * ĐA THUẬT TOÁN + TRỌNG SỐ ĐỘNG + ĐU CẦU THÔNG MINH
 * =========================================================================================
 */

const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

// 1. CẤU HÌNH HỆ THỐNG
const CONFIG = {
    ADMIN: "TUANX3000",
    VERSION: "10.2 PRO MAX",
    SYNC_INTERVAL: 3000,
    ENDPOINTS: {
        NOHU: 'https://wtx.tele68.com/v1/tx/lite-sessions?cp=R&cl=R&pf=web&at=104c423fe086f7aeb82ec6ba0e91672f',
        MD5: 'https://wtxmd52.tele68.com/v1/txmd5/lite-sessions?cp=R&cl=R&pf=web&at=104c423fe086f7aeb82ec6ba0e91672f'
    }
};

// 2. BỘ NHỚ TẠM (RAM STORE)
let DATA_STORE = {
    nohu: { history: [], lastPrediction: null, stats: { win: 0, loss: 0, total: 0 }, processedSessions: new Set() },
    md5: { history: [], lastPrediction: null, stats: { win: 0, loss: 0, total: 0 }, processedSessions: new Set() }
};

// 3. THƯ VIỆN TOÁN HỌC & CHUẨN HÓA
const MathLib = {
    standardize: (item) => {
        let raw = String(item.resultTruyenThong || item.result || item.BetSide || '').toUpperCase();
        if (raw.includes('TAI') || raw.includes('TÀI') || (item.DiceSum && item.DiceSum >= 11)) return 'Tài';
        return 'Xỉu';
    },
    calculateEntropy: (arr) => {
        if (!arr.length) return 0;
        const counts = {};
        arr.forEach(x => counts[x] = (counts[x] || 0) + 1);
        return Object.values(counts).reduce((acc, count) => {
            const p = count / arr.length;
            return acc - p * Math.log2(p);
        }, 0);
    }
};

// 4. HỆ THỐNG 11 THUẬT TOÁN (CÓ TRỌNG SỐ)
const Algos = {
    // Thuật toán chính (Trọng số cao)
    markov: (h) => {
        const tx = h.map(x => x.result === 'Tài' ? 'T' : 'X').slice(-4).join('');
        const patterns = { 'TTTT': 'X', 'XXXX': 'T', 'TXTX': 'T', 'XTXT': 'X', 'TTXX': 'T', 'XXTT': 'X' };
        return patterns[tx] || null;
    },
    frequency: (h) => {
        const recent = h.slice(-10).filter(x => x.result === 'Tài').length;
        return recent >= 7 ? 'X' : (recent <= 3 ? 'T' : null);
    },
    bayesian: (h) => {
        const pT = h.filter(x => x.result === 'Tài').length / h.length;
        return pT > 0.6 ? 'X' : (pT < 0.4 ? 'T' : null);
    },
    // Thuật toán phụ
    cnn_simple: (h) => h.slice(-3).every(x => x.result === 'Tài') ? 'X' : (h.slice(-3).every(x => x.result === 'Xỉu') ? 'T' : null),
    logistic: (h) => h.slice(-5).filter(x => x.result === 'Tài').length >= 3 ? 'X' : 'T'
};

// 5. MASTER PREDICTOR (BỘ NÃO CHÍNH)
function masterPredictor(history) {
    if (history.length < 12) return { res: 'Đang đợi...', conf: '0%', log: 'Đang nạp dữ liệu...' };

    const lastResult = history[history.length - 1].result;
    
    // --- BƯỚC 1: NHẬN DIỆN CẦU BỆT (TRỌNG YẾU) ---
    let streak = 0;
    for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].result === lastResult) streak++; else break;
    }

    // Nếu bệt từ 3-6 tay: Đu bệt (Theo cầu)
    if (streak >= 3 && streak <= 5) {
        return { res: lastResult, conf: '80%', log: `ĐU CẦU BỆT ${streak} TAY` };
    }
    // Nếu bệt quá dài (>7 tay): Cảnh báo bẻ cầu
    if (streak >= 6) {
        return { res: lastResult === 'Tài' ? 'Xỉu' : 'Tài', conf: '65%', log: `CẦU QUÁ DÀI (${streak}) - CÂN NHẮC BẺ` };
    }

    // --- BƯỚC 2: BIỂU QUYẾT TRỌNG SỐ ---
    let votes = { T: 0, X: 0 };
    const weights = { markov: 3, frequency: 2, bayesian: 2, cnn_simple: 1, logistic: 1 };

    Object.keys(Algos).forEach(name => {
        const p = Algos[name](history);
        if (p === 'T') votes.T += weights[name];
        else if (p === 'X') votes.X += weights[name];
    });

    const final = votes.T > votes.X ? 'Tài' : (votes.X > votes.T ? 'Xỉu' : lastResult);
    const confidence = Math.min(95, 50 + (Math.abs(votes.T - votes.X) * 5));

    return { 
        res: final, 
        conf: confidence + "%", 
        log: `HỆ THỐNG TRỌNG SỐ (${votes.T}T - ${votes.X}X)` 
    };
}

// 6. ĐỒNG BỘ DỮ LIỆU TỰ ĐỘNG
async function sync() {
    for (const type of ['nohu', 'md5']) {
        try {
            const res = await fetch(CONFIG.ENDPOINTS[type.toUpperCase()]);
            const json = await res.json();
            const list = Array.isArray(json) ? json : (json.list || json.data || []);
            const state = DATA_STORE[type];

            const newHistory = list.map(item => ({
                session: Number(item.id || item.SessionId || 0),
                result: MathLib.standardize(item)
            })).filter(h => h.session > 0).sort((a, b) => a.session - b.session);

            if (newHistory.length > 0) {
                const newest = newHistory[newHistory.length - 1];
                // Kiểm tra kết quả dự đoán của phiên vừa qua
                if (state.lastPrediction && state.lastPrediction.session === newest.session) {
                    if (!state.processedSessions.has(newest.session)) {
                        if (state.lastPrediction.res === newest.result) state.stats.win++; else state.stats.loss++;
                        state.stats.total++;
                        state.processedSessions.add(newest.session);
                        if(state.processedSessions.size > 200) state.processedSessions.clear();
                    }
                }
                state.history = newHistory;
            }
        } catch (e) { console.error(`Sync error ${type}`); }
    }
}

setInterval(sync, CONFIG.SYNC_INTERVAL);

// 7. ENDPOINTS API
app.get('/api/all', (req, res) => {
    const getResult = (type) => {
        const s = DATA_STORE[type];
        const lastSession = s.history.length > 0 ? s.history[s.history.length - 1].session : 0;
        const pred = masterPredictor(s.history);
        s.lastPrediction = { session: lastSession + 1, res: pred.res };

        return {
            phien_hien_tai: lastSession,
            phien_tiep: lastSession + 1,
            du_doan: pred.res,
            tin_cay: pred.conf,
            phan_tich: pred.log,
            thong_ke: {
                win: s.stats.win,
                loss: s.stats.loss,
                rate: s.stats.total > 0 ? ((s.stats.win / s.stats.total) * 100).toFixed(1) + "%" : "0%"
            },
            chuoi: s.history.slice(-12).map(x => x.result[0]).join(' ')
        };
    };

    res.json({
        admin: CONFIG.ADMIN,
        version: CONFIG.VERSION,
        time: new Date().toLocaleString('vi-VN'),
        data: { nohu: getResult('nohu'), md5: getResult('md5') }
    });
});

// Giao diện Web View trực tiếp
app.get('/', (req, res) => {
    res.send(`
        <body style="background:#050505; color:#00ffcc; font-family:'Courier New', monospace; padding:20px; text-align:center;">
            <h1 style="text-shadow: 0 0 10px #00ffcc;">🚀 TUANX3000 CORE V10.2 PRO MAX</h1>
            <p>DỮ LIỆU TỔNG HỢP: <a href="/api/all" style="color:yellow">/api/all</a></p>
            <hr style="border:0.5px solid #222">
            <div style="display:flex; justify-content: space-around; flex-wrap: wrap;">
                <div id="nohu_box" style="border:1px solid #00ffcc; padding:15px; margin:10px; min-width:300px; border-radius:10px;">
                    <h2>NỔ HŨ</h2><div id="nohu_content">Loading...</div>
                </div>
                <div id="md5_box" style="border:1px solid #ff00ff; padding:15px; margin:10px; min-width:300px; border-radius:10px; color:#ff00ff;">
                    <h2 style="color:#ff00ff;">MD5</h2><div id="md5_content">Loading...</div>
                </div>
            </div>
            <script>
                async function load() {
                    const res = await fetch('/api/all');
                    const d = await res.json();
                    const nh = d.data.nohu;
                    const m = d.data.md5;
                    
                    document.getElementById('nohu_content').innerHTML = \`
                        <h1 style="font-size:40px; margin:10px 0;">\${nh.du_doan}</h1>
                        <p>Độ tin cậy: <b>\${nh.tin_cay}</b></p>
                        <p>Lịch sử: \${nh.chuoi}</p>
                        <p style="color:#fff">Win: \${nh.thong_ke.win} | Loss: \${nh.thong_ke.win} | Rate: \${nh.thong_ke.rate}</p>
                    \`;
                    document.getElementById('md5_content').innerHTML = \`
                        <h1 style="font-size:40px; margin:10px 0;">\${m.du_doan}</h1>
                        <p>Độ tin cậy: <b>\${m.tin_cay}</b></p>
                        <p>Lịch sử: \${m.chuoi}</p>
                        <p style="color:#fff">Win: \${m.thong_ke.win} | Loss: \${m.thong_ke.win} | Rate: \${m.thong_ke.rate}</p>
                    \`;
                }
                setInterval(load, 2500);
            </script>
        </body>
    `);
});

app.listen(PORT, () => {
    console.log(\`[TUANX3000 V10.2] Server is running on port \${PORT}\`);
    sync();
});
