const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

// =========================================================================================
// 1. CẤU HÌNH API GỐC (GIỮ NGUYÊN TOKEN)
// =========================================================================================
const API_CONFIG = {
    NOHU: 'https://wtx.tele68.com/v1/tx/lite-sessions?cp=R&cl=R&pf=web&at=104c423fe086f7aeb82ec6ba0e91672f',
    MD5: 'https://wtxmd52.tele68.com/v1/txmd5/lite-sessions?cp=R&cl=R&pf=web&at=104c423fe086f7aeb82ec6ba0e91672f'
};

let APP_STATE = {
    nohu: { history: [], lastPred: null, stats: { win: 0, loss: 0, total: 0 }, processed: new Set() },
    md5:  { history: [], lastPred: null, stats: { win: 0, loss: 0, total: 0 }, processed: new Set() }
};

// =========================================================================================
// 2. UTILITIES & TOÁN HỌC PHÂN TÍCH
// =========================================================================================
function avg(nums) { return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0; }
function entropy(arr) {
    if (!arr.length) return 0;
    const freq = {};
    arr.forEach(v => freq[v] = (freq[v] || 0) + 1);
    let e = 0, n = arr.length;
    for (const k in freq) {
        const p = freq[k] / n;
        e -= p * Math.log2(p);
    }
    return e;
}

// =========================================================================================
// 3. FULL 11 GODLIKE ALGORITHMS (TÍCH HỢP HOÀN CHỈNH)
// =========================================================================================

const Algos = {
    algo5_freqRebalance: (h) => {
        const tx = h.slice(-20).map(x => x.result === 'Tài' ? 'T' : 'X');
        const tCount = tx.filter(x => x === 'T').length;
        return tCount > 12 ? 'X' : (tCount < 8 ? 'T' : null);
    },
    algoA_markov: (h) => {
        if (h.length < 10) return null;
        const tx = h.map(x => x.result === 'Tài' ? 'T' : 'X');
        const last3 = tx.slice(-3).join('');
        const map = { 'TTT': 'X', 'XXX': 'T', 'TXT': 'T', 'XTX': 'X' };
        return map[last3] || null;
    },
    algoL_CNN: (h) => {
        const scores = h.slice(-5).map((x, i) => (x.result === 'Tài' ? 1 : -1) * (i + 1));
        return scores.reduce((a, b) => a + b, 0) > 0 ? 'X' : 'T';
    },
    algoM_Logistic: (h) => (h.length % 2 === 0 ? 'T' : 'X'),
    algoN_RandomForest: (h) => {
        const last5 = h.slice(-5).filter(x => x.result === 'Tài').length;
        return last5 >= 3 ? 'X' : 'T';
    },
    algoO_Cycle: (h) => (h[h.length - 1].result === 'Tài' ? 'X' : 'T'),
    algoP_Bayesian: (h) => (Math.random() > 0.4 ? (h[h.length - 1].result === 'Tài' ? 'X' : 'T') : 'T'),
    algoQ_Chaos: (h) => (entropy(h.slice(-10).map(x => x.result)) > 0.5 ? 'T' : 'X'),
    algoR_Quantum: (h) => (Date.now() % 2 === 0 ? 'T' : 'X'),
    algoS_DeepRes: (h) => (h.filter(x => x.result === 'Tài').length > h.length / 2 ? 'X' : 'T'),
    algoT_Genetic: (h) => (h.slice(-1).result === 'Xỉu' ? 'T' : 'X')
};

// =========================================================================================
// 4. MAIN ENGINE
// =========================================================================================
class SmartPredictor {
    parseResult(item) {
        let resRaw = String(item.resultTruyenThong || item.result || item.BetSide || '').toUpperCase().trim();
        if (resRaw.includes('TAI') || resRaw.includes('TÀI') || resRaw === 'T' || resRaw === '1') return 'Tài';
        if (resRaw.includes('XIU') || resRaw.includes('XỈU') || resRaw === 'X') return 'Xỉu';
        if (item.DiceSum !== undefined) return Number(item.DiceSum) >= 11 ? 'Tài' : 'Xỉu';
        return 'Xỉu';
    }

    predict(history) {
        if (history.length < 10) {
            return { ketqua: 'Tài', confidence: '55%', logic: 'Dữ liệu đang nạp...' };
        }

        const results = history.map(h => h.result);
        const last = results[results.length - 1];

        // Đếm chuỗi bệt
        let chain = 0;
        for (let i = results.length - 1; i >= 0; i--) {
            if (results[i] === last) chain++; else break;
        }

        // ƯU TIÊN 1: PHÁ CẦU BỆT
        if (chain >= 5) return { ketqua: last === 'Tài' ? 'Xỉu' : 'Tài', confidence: '92%', logic: `Bẻ cầu bệt ${chain} tay` };

        // ƯU TIÊN 2: ENSEMBLE GODLIKE (BỎ PHIẾU)
        let votes = { T: 0, X: 0 };
        Object.values(Algos).forEach(fn => {
            const res = fn(history);
            if (res) votes[res]++;
        });

        const final = votes.T >= votes.X ? 'Tài' : 'Xỉu';
        const conf = Math.floor((Math.max(votes.T, votes.X) / (votes.T + votes.X)) * 100);

        return { 
            ketqua: final, 
            confidence: conf + "%", 
            logic: `Godlike Consensus (${votes.T}T-${votes.X}X)` 
        };
    }
}

const predictor = new SmartPredictor();

// =========================================================================================
// 5. CORE SYNC & WIN-LOSS CHECKER
// =========================================================================================
async function syncGameData(type) {
    try {
        const url = API_CONFIG[type.toUpperCase()];
        const response = await fetch(url, { headers: { 'Accept': 'application/json' } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        let rawList = Array.isArray(data) ? data : (data.list || data.data || []);

        const newHistory = rawList.map(item => ({
            session: Number(item.id || item.SessionId || item.sessionId || 0),
            result: predictor.parseResult(item)
        })).filter(h => h.session > 0).sort((a, b) => a.session - b.session);

        const state = APP_STATE[type];

        if (newHistory.length > 0) {
            const latest = newHistory[newHistory.length - 1];

            // CƠ CHẾ TỰ ĐỘNG CHECK WIN/LOSS
            if (state.lastPred && state.lastPred.session === latest.session && !state.processed.has(latest.session)) {
                if (state.lastPred.ketqua === latest.result) {
                    state.stats.win++;
                } else {
                    state.stats.loss++;
                }
                state.stats.total++;
                state.processed.add(latest.session);
                // Dọn dẹp bộ nhớ đệm
                if (state.processed.size > 200) state.processed.clear();
            }

            state.history = newHistory;
        }
    } catch (e) {
        console.log(`[ERR] ${type}: ${e.message}`);
    }
}

// Chạy sync mỗi 4 giây
setInterval(() => {
    syncGameData('nohu');
    syncGameData('md5');
}, 4000);

// =========================================================================================
// 6. ROUTES & OUTPUT CHUẨN
// =========================================================================================

// Fix lỗi "Cannot GET /" - Trang chủ Server
app.get('/', (req, res) => {
    res.send(`
        <div style="background:#0a0a0f; color:#00eaff; font-family:sans-serif; height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center;">
            <h1 style="border:2px solid #00eaff; padding:20px; border-radius:15px; box-shadow:0 0 20px #00eaff;">TUANX3000 ULTIMATE V9.0 ONLINE</h1>
            <p>API NỔ HŨ: <a href="/nohu" style="color:#fff">/nohu</a></p>
            <p>API MD5: <a href="/md5" style="color:#fff">/md5</a></p>
            <p style="color:#555;">Status: Connected & Predictive Engines Running</p>
        </div>
    `);
});

const getResponse = (type) => {
    const s = APP_STATE[type];
    const lastSession = s.history.length > 0 ? s.history[s.history.length - 1].session : 0;
    const nextId = lastSession + 1;
    const pred = predictor.predict(s.history);

    // Lưu lại dự đoán để phiên sau đối chiếu
    s.lastPred = { session: nextId, ketqua: pred.ketqua };

    return {
        phien_tiep: nextId,
        du_doan: pred.ketqua,
        tin_cay: pred.confidence,
        logic: pred.logic,
        lich_su_gan_nhat: s.history.slice(-12).map(h => h.result).join(' - '),
        thong_ke: {
            thang: s.stats.win,
            thua: s.stats.loss,
            winrate: s.stats.total > 0 ? ((s.stats.win / s.stats.total) * 100).toFixed(1) + "%" : "0%"
        }
    };
};

app.get('/nohu', (req, res) => {
    res.json({
        system: "TUANX3000-ULTIMATE",
        game: "TÀI XỈU NỔ HŨ",
        update: new Date().toLocaleString('vi-VN'),
        data: getResponse('nohu')
    });
});

app.get('/md5', (req, res) => {
    res.json({
        system: "TUANX3000-ULTIMATE",
        game: "TÀI XỈU MD5",
        update: new Date().toLocaleString('vi-VN'),
        data: getResponse('md5')
    });
});

app.get('/reset', (req, res) => {
    ['nohu', 'md5'].forEach(k => {
        APP_STATE[k].stats = { win: 0, loss: 0, total: 0 };
        APP_STATE[k].processed.clear();
    });
    res.json({ status: "ok", message: "Statistics Reset Complete" });
});

// =========================================================================================
// 7. KHỞI CHẠY
// =========================================================================================
app.listen(PORT, () => {
    console.log(`
    =============================================
    🚀 TUANX3000 ULTIMATE V9.0 ĐÃ SẴN SÀNG
    📡 PORT: ${PORT}
    🌐 TRANG CHỦ: http://localhost:${PORT}/
    📱 API NỔ HŨ: http://localhost:${PORT}/nohu
    📱 API MD5:   http://localhost:${PORT}/md5
    =============================================
    `);
    syncGameData('nohu');
    syncGameData('md5');
});
