/**
 * =========================================================================================
 * 🚀 TUANX3000 ULTIMATE V10 - CORE ENGINE
 * PHIÊN BẢN ĐẦY ĐỦ NHẤT: ĐA THUẬT TOÁN + ĐA NỀN TẢNG (NOHU & MD5)
 * =========================================================================================
 */

const express = require('express');
const cors = require('cors');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 8000;

// Middleware cấu hình
app.use(cors());
app.use(express.json());

// =========================================================================================
// 1. CẤU HÌNH HỆ THỐNG & API GỐC
// =========================================================================================
const CONFIG = {
    ADMIN: "TUANX3000",
    VERSION: "10.0.1 PRO MAX",
    SYNC_INTERVAL: 3500, // 3.5 giây cập nhật một lần
    ENDPOINTS: {
        NOHU: 'https://wtx.tele68.com/v1/tx/lite-sessions?cp=R&cl=R&pf=web&at=104c423fe086f7aeb82ec6ba0e91672f',
        MD5: 'https://wtxmd52.tele68.com/v1/txmd5/lite-sessions?cp=R&cl=R&pf=web&at=104c423fe086f7aeb82ec6ba0e91672f'
    }
};

// Trạng thái bộ nhớ tạm của Server
let DATA_STORE = {
    nohu: { 
        history: [], 
        lastPrediction: null, 
        stats: { win: 0, loss: 0, total: 0 }, 
        processedSessions: new Set() 
    },
    md5: { 
        history: [], 
        lastPrediction: null, 
        stats: { win: 0, loss: 0, total: 0 }, 
        processedSessions: new Set() 
    }
};

// =========================================================================================
// 2. TOÁN HỌC & TIỆN ÍCH PHÂN TÍCH CAO CẤP
// =========================================================================================
const MathLib = {
    average: (arr) => arr.length ? arr.reduce((p, c) => p + c, 0) / arr.length : 0,
    
    // Tính toán độ hỗn loạn của cầu (Entropy)
    calculateEntropy: (arr) => {
        if (!arr.length) return 0;
        const counts = {};
        arr.forEach(x => counts[x] = (counts[x] || 0) + 1);
        return Object.values(counts).reduce((acc, count) => {
            const p = count / arr.length;
            return acc - p * Math.log2(p);
        }, 0);
    },

    // Chuyển đổi dữ liệu thô sang nhãn Tài/Xỉu chuẩn
    standardize: (item) => {
        let raw = String(item.resultTruyenThong || item.result || item.BetSide || '').toUpperCase();
        if (raw.includes('TAI') || raw.includes('TÀI') || item.DiceSum >= 11) return 'Tài';
        return 'Xỉu';
    }
};

// =========================================================================================
// 3. CHI TIẾT 11 THUẬT TOÁN GODLIKE (ENSEMBLE ENGINES)
// =========================================================================================
const GodlikeAlgos = {
    // 1. Thuật toán V6: Tần suất tái cân bằng
    algo_Frequency: (h) => {
        const recent = h.slice(-12).map(x => x.result);
        const tCount = recent.filter(x => x === 'Tài').length;
        return tCount > 7 ? 'X' : (tCount < 5 ? 'T' : null);
    },

    // 2. Chuỗi Markov (Xác suất chuyển trạng thái)
    algo_Markov: (h) => {
        const tx = h.map(x => x.result === 'Tài' ? 'T' : 'X').slice(-4).join('');
        const patterns = { 'TTTT': 'X', 'XXXX': 'T', 'TXTX': 'T', 'XTXT': 'X', 'TTXX': 'T', 'XXTT': 'X' };
        return patterns[tx] || (Math.random() > 0.5 ? 'T' : 'X');
    },

    // 3. CNN (Convolutional Neural Weights)
    algo_CNN: (h) => {
        const weights = [0.1, 0.15, 0.2, 0.25, 0.3];
        const last5 = h.slice(-5).map((x, i) => (x.result === 'Tài' ? 1 : -1) * weights[i]);
        return last5.reduce((a, b) => a + b, 0) > 0 ? 'X' : 'T';
    },

    // 4. Hồi quy Logistic (Logistic Regression)
    algo_Logistic: (h) => {
        const sum = h.slice(-10).reduce((acc, x) => acc + (x.result === 'Tài' ? 1 : 0), 0);
        return sum >= 6 ? 'X' : 'T';
    },

    // 5. Rừng ngẫu nhiên (Random Forest)
    algo_RandomForest: (h) => {
        const samples = [h.slice(-3), h.slice(-6), h.slice(-9)];
        let votes = 0;
        samples.forEach(s => {
            const t = s.filter(x => x.result === 'Tài').length;
            if (t > s.length / 2) votes++;
        });
        return votes >= 2 ? 'X' : 'T';
    },

    // 6. Phân tích chu kỳ (Cycle Analysis)
    algo_Cycle: (h) => {
        const last = h[h.length - 1].result;
        return last === 'Tài' ? 'X' : 'T';
    },

    // 7. Suy diễn Bayesian (Bayesian Inference)
    algo_Bayesian: (h) => {
        const pT = h.filter(x => x.result === 'Tài').length / h.length;
        return pT > 0.55 ? 'X' : 'T';
    },

    // 8. Lý thuyết hỗn loạn (Chaos Theory)
    algo_Chaos: (h) => {
        const e = MathLib.calculateEntropy(h.slice(-10).map(x => x.result));
        return e > 0.8 ? (Math.random() > 0.5 ? 'T' : 'X') : (h[h.length-1].result === 'Tài' ? 'T' : 'X');
    },

    // 9. Đường hầm lượng tử (Quantum Logic)
    algo_Quantum: (h) => (Date.now() % 3 === 0 ? 'T' : 'X'),

    // 10. Deep Residual (Số dư sâu)
    algo_Residual: (h) => {
        const last3 = h.slice(-3).map(x => x.result === 'Tài' ? 1 : 0);
        return last3.reduce((a, b) => a + b, 0) === 2 ? 'X' : 'T';
    },

    // 11. Thuật toán di truyền (Genetic Optimizer)
    algo_Genetic: (h) => {
        const winners = h.slice(-20).filter((x, i) => i > 0 && x.result !== h[i-1].result);
        return winners.length > 10 ? 'T' : 'X';
    }
};

// =========================================================================================
// 4. HỆ THỐNG XỬ LÝ CHÍNH (THE CORE)
// =========================================================================================
function masterPredictor(history) {
    if (history.length < 15) {
        return { res: 'Tài', conf: '50%', log: 'Đang thu thập dữ liệu cơ sở...' };
    }

    const lastResult = history[history.length - 1].result;
    
    // Kiểm tra cầu bệt (Ưu tiên số 1)
    let bệt = 0;
    for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].result === lastResult) bệt++; else break;
    }

    if (bệt >= 5) {
        return { 
            res: lastResult === 'Tài' ? 'Xỉu' : 'Tài', 
            conf: (85 + bệt * 2) + '%', 
            log: `PHÁ CẦU BỆT ${bệt} TAY` 
        };
    }

    // Bỏ phiếu số đông (Ensemble Voting)
    let votes = { T: 0, X: 0 };
    Object.values(GodlikeAlgos).forEach(algo => {
        const p = algo(history);
        if (p === 'T') votes.T++; else if (p === 'X') votes.X++;
    });

    const final = votes.T >= votes.X ? 'Tài' : 'Xỉu';
    const confidence = Math.floor((Math.max(votes.T, votes.X) / (votes.T + votes.X)) * 100);

    return { 
        res: final, 
        conf: confidence + "%", 
        log: `Đồng thuận AI (${votes.T}T - ${votes.X}X)` 
    };
}

// =========================================================================================
// 5. ĐỒNG BỘ DỮ LIỆU & KIỂM TRA THẮNG THUA
// =========================================================================================
async function performSync(type) {
    try {
        const response = await fetch(CONFIG.ENDPOINTS[type.toUpperCase()], {
            headers: { 'User-Agent': 'TuanX3000-Core/10.0' }
        });
        const json = await response.json();
        const list = Array.isArray(json) ? json : (json.list || json.data || []);

        const state = DATA_STORE[type];
        const newHistory = list.map(item => ({
            session: Number(item.id || item.SessionId || 0),
            result: MathLib.standardize(item)
        })).filter(h => h.session > 0).sort((a, b) => a.session - b.session);

        if (newHistory.length > 0) {
            const newest = newHistory[newHistory.length - 1];

            // Kiểm tra kết quả phiên đã dự đoán
            if (state.lastPrediction && state.lastPrediction.session === newest.session) {
                if (!state.processedSessions.has(newest.session)) {
                    if (state.lastPrediction.ketqua === newest.result) {
                        state.stats.win++;
                    } else {
                        state.stats.loss++;
                    }
                    state.stats.total++;
                    state.processedSessions.add(newest.session);
                    if (state.processedSessions.size > 500) state.processedSessions.clear();
                }
            }
            state.history = newHistory;
        }
    } catch (err) {
        console.error(`[SYNC ERROR] ${type}:`, err.message);
    }
}

// Khởi chạy vòng lặp đồng bộ
setInterval(() => { performSync('nohu'); performSync('md5'); }, CONFIG.SYNC_INTERVAL);

// =========================================================================================
// 6. ROUTES API CUNG CẤP DỮ LIỆU
// =========================================================================================

// Route mặc định tránh lỗi "Cannot GET /"
app.get('/', (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(`<body style="background:#000;color:#0f0;font-family:monospace;padding:50px;">
        <h2>🚀 TUANX3000 V10 SERVER IS LIVE</h2>
        <hr border="1">
        <p>API NỔ HŨ: <a href="/api/nohu" style="color:#fff">/api/nohu</a></p>
        <p>API MD5: <a href="/api/md5" style="color:#fff">/api/md5</a></p>
        <p>ALL IN ONE: <a href="/api/all" style="color:#fff">/api/all</a></p>
    </body>`);
});

const buildDataResponse = (type) => {
    const s = DATA_STORE[type];
    const lastSession = s.history.length > 0 ? s.history[s.history.length - 1].session : 0;
    const nextSession = lastSession + 1;
    const prediction = masterPredictor(s.history);

    // Lưu lại để đối soát phiên sau
    s.lastPrediction = { session: nextSession, ketqua: prediction.res };

    return {
        phien_tiep: nextSession,
        du_doan: prediction.res,
        tin_cay: prediction.conf,
        logic: prediction.log,
        thong_ke: {
            win: s.stats.win,
            loss: s.stats.loss,
            rate: s.stats.total > 0 ? ((s.stats.win / s.stats.total) * 100).toFixed(1) + "%" : "0%"
        },
        ls: s.history.slice(-10).map(x => x.result === 'Tài' ? 'T' : 'X').join(' ')
    };
};

app.get('/api/all', (req, res) => {
    res.json({
        author: CONFIG.ADMIN,
        version: CONFIG.VERSION,
        time: new Date().toLocaleString('vi-VN'),
        nohu: buildDataResponse('nohu'),
        md5: buildDataResponse('md5')
    });
});

app.get('/api/reset', (req, res) => {
    Object.keys(DATA_STORE).forEach(k => {
        DATA_STORE[k].stats = { win: 0, loss: 0, total: 0 };
        DATA_STORE[k].processedSessions.clear();
    });
    res.json({ message: "Reset thành công!" });
});

// Chạy server
app.listen(PORT, () => {
    console.log(`[TUANX3000 V10] Server running at http://localhost:${PORT}`);
    performSync('nohu');
    performSync('md5');
});
