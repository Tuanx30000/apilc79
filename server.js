// server.js - PHIÊN BẢN TỐI ƯU V2.2.0 
// Bản quyền: tuanx3000 - Tổng hợp dữ liệu Tài Xỉu từ đa nguồn (MD5 & NOHU)

const express = require('express');
const cors = require('cors');

const app = express();

// ==================== CẤU HÌNH CONSTANTS ====================
const PORT = process.env.PORT || 3000;
const HISTORY_LIMIT = 200;
const FETCH_INTERVAL = 5000;
const FETCH_TIMEOUT = 10000;
const MAX_RETRY = 3;
const RETRY_DELAY = 1000;

// ==================== BRAND INFO ====================
const BRAND = {
    name: 'tuanx3000',
    version: '2.2.0',
    author: 'tuanx3000',
    contact: 'https://t.me/tuanx3000'
};

// ==================== CORS CONFIGURATION ====================
const corsOptions = {
    origin: '*', // Cho phép mọi domain truy cập (bạn có thể giới hạn lại sau)
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// ==================== DATA SOURCES MỚI ====================
const SOURCES = {
    MD5: {
        name: 'MD5',
        url: 'https://wtxmd52.tele68.com/v1/txmd5/sessions?cp=R&cl=R&pf=web&at=85f666e4654999d6d2b7c4650c3f6da3'
    },
    NOHU: {
        name: 'NOHU',
        url: 'https://wtx.tele68.com/v1/tx/sessions?cp=R&cl=R&pf=web&at=85f666e4654999d6d2b7c4650c3f6da3'
    }
};

// ==================== DATA STORE ====================
const dataStore = {
    MD5: { history: [], latest: createEmptyRecord('MD5'), lastUpdate: null, errorCount: 0 },
    NOHU: { history: [], latest: createEmptyRecord('NOHU'), lastUpdate: null, errorCount: 0 }
};

let aggregatedHistory = [];
let aggregatedLatest = createEmptyRecord('Tổng hợp');
let lastAggregationTime = null;

function createEmptyRecord(source) {
    return {
        Phien: null,
        Xuc_xac_1: null,
        Xuc_xac_2: null,
        Xuc_xac_3: null,
        Tong: null,
        Ket_qua: '',
        nguon: source,
        brand: BRAND.name,
        server_time: new Date().toISOString(),
        update_count: 0
    };
}

// ==================== FETCH LOGIC VỚI TIMEOUT ====================
async function fetchWithRetry(url, retries = MAX_RETRY) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        let timeoutHandle = null;
        try {
            const controller = new AbortController();
            timeoutHandle = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

            const response = await fetch(url, { 
                signal: controller.signal,
                headers: { 
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                    'Accept': 'application/json'
                }
            });

            clearTimeout(timeoutHandle);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const json = await response.json();
            return json;
        } catch (error) {
            if (timeoutHandle) clearTimeout(timeoutHandle);
            if (attempt < retries) {
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
            } else {
                return null;
            }
        }
    }
    return null;
}

// ==================== HÀM CONVERT DỮ LIỆU ĐƯỢC VIẾT LẠI CHO API MỚI ====================
function convertToStandard(rawData, sourceName) {
    if (!rawData) return [];

    // Lấy mảng dữ liệu từ property "list" theo đúng cấu trúc API mới
    let items = Array.isArray(rawData.list) ? rawData.list : [];
    if (items.length === 0) return [];

    const validItems = [];
    const fetchTime = new Date().toISOString(); // API mới không có giờ, lấy giờ hệ thống

    for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];
        try {
            // Lấy ID Phiên
            let sessionId = String(item.id || '').trim();
            if (!sessionId) continue;

            // Xử lý mảng xúc xắc (dices: [5,4,4])
            let dice1 = 0, dice2 = 0, dice3 = 0;
            if (Array.isArray(item.dices) && item.dices.length === 3) {
                dice1 = parseInt(item.dices[0], 10);
                dice2 = parseInt(item.dices[1], 10);
                dice3 = parseInt(item.dices[2], 10);
            }

            // Lấy Tổng điểm và Kết quả
            let diceSum = parseInt(item.point, 10) || (dice1 + dice2 + dice3);
            let ketQua = String(item.resultTruyenThong || '').toUpperCase() === 'TAI' ? 'Tài' : 'Xỉu';

            validItems.push({
                Phien: sessionId,
                Xuc_xac_1: dice1,
                Xuc_xac_2: dice2,
                Xuc_xac_3: dice3,
                Tong: diceSum,
                Ket_qua: ketQua,
                nguon: sourceName,
                server_time: fetchTime
            });

        } catch (error) {
            console.warn(`[tuanx3000] ⚠️ Lỗi đọc item ${idx}: ${error.message}`);
        }
    }
    return validItems;
}

// ==================== LỌC TRÙNG LẶP ====================
function deduplicateByPhienAndSource(items) {
    const seen = new Map();
    const result = [];
    for (const item of items) {
        const key = `${item.Phien}#${item.nguon}`;
        if (!seen.has(key)) {
            result.push(item);
            seen.set(key, item);
        }
    }
    return result;
}

// ==================== CẬP NHẬT TỪNG NGUỒN ====================
async function refreshSource(sourceKey) {
    const source = SOURCES[sourceKey];
    const store = dataStore[sourceKey];

    try {
        const raw = await fetchWithRetry(source.url);
        if (!raw) {
            store.errorCount++;
            return;
        }

        let converted = convertToStandard(raw, sourceKey);
        if (converted.length === 0) return;

        // Sort: ID Phiên lớn nhất (mới nhất) lên đầu
        converted.sort((a, b) => parseInt(b.Phien) - parseInt(a.Phien));
        const unique = deduplicateByPhienAndSource(converted);

        store.history = unique.slice(0, HISTORY_LIMIT);
        store.lastUpdate = new Date().toISOString();
        store.errorCount = 0;

        if (store.history.length > 0) {
            const latest = store.history[0];
            store.latest = {
                ...latest,
                brand: BRAND.name,
                update_count: (store.latest.update_count || 0) + 1
            };
            console.log(`[tuanx3000] ✅ ${sourceKey}: Đã cập nhật phiên #${latest.Phien}`);
        }
    } catch (error) {
        store.errorCount++;
        console.error(`[tuanx3000] ❌ Lỗi ${sourceKey}: ${error.message}`);
    }
}

// ==================== TỔNG HỢP DỮ LIỆU ====================
function updateAggregated() {
    const all = [...dataStore.MD5.history, ...dataStore.NOHU.history];
    if (all.length === 0) return;

    // Sắp xếp lại toàn bộ theo ID Phiên từ mới nhất đến cũ nhất
    all.sort((a, b) => parseInt(b.Phien) - parseInt(a.Phien));
    const unique = deduplicateByPhienAndSource(all);

    aggregatedHistory = unique.slice(0, HISTORY_LIMIT * 2);
    lastAggregationTime = new Date().toISOString();

    if (aggregatedHistory.length > 0) {
        const latest = aggregatedHistory[0];
        aggregatedLatest = {
            ...latest,
            brand: BRAND.name,
            update_count: (aggregatedLatest.update_count || 0) + 1
        };
    }
}

// ==================== ĐỒNG BỘ DATA ====================
async function refreshAll() {
    try {
        await Promise.all([refreshSource('MD5'), refreshSource('NOHU')]);
        updateAggregated();
    } catch (error) {
        console.error(`[tuanx3000] ❌ Lỗi refreshAll: ${error.message}`);
    }
}

// ==================== ROUTES ====================
app.get('/', (req, res) => {
    res.json({ brand: BRAND.name, version: BRAND.version, status: 'API Đang Chạy
/ Kiểm tra server GET /
/health Trạng thái chi tiết GET /health
/api/latest Lấy bản ghi mới nhất tổng hợp GET /api/latest
/api/history?limit=N Lấy N bản ghi gần nhất (mặc định 50, max 500) GET /api/history?limit=100
/api/source/:name?limit=N Lấy lịch sử riêng nguồn (MD5 hoặc NOHU) GET /api/source/MD5?limit=20' });
});

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        MD5: { records: dataStore.MD5.history.length, latest: dataStore.MD5.latest.Phien },
        NOHU: { records: dataStore.NOHU.history.length, latest: dataStore.NOHU.latest.Phien },
        Tổng_hợp: aggregatedHistory.length
    });
});

app.get('/api/latest', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.json(aggregatedLatest);
});

app.get('/api/history', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 50, 500);
    res.setHeader('Cache-Control', 'no-cache');
    res.json({ brand: BRAND.name, total: aggregatedHistory.length, data: aggregatedHistory.slice(0, limit) });
});

app.get('/api/source/:name', (req, res) => {
    const sourceName = req.params.name.toUpperCase();
    const store = dataStore[sourceName];
    if (!store) return res.status(404).json({ error: 'Không tìm thấy nguồn' });

    const limit = Math.min(parseInt(req.query.limit) || 50, 500);
    res.setHeader('Cache-Control', 'no-cache');
    res.json({ brand: BRAND.name, source: sourceName, data: store.history.slice(0, limit) });
});

// ==================== KHỞI CHẠY SERVER ====================
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`\n[tuanx3000] ✅ Server chạy tại cổng ${PORT}`);
    console.log(`[tuanx3000] Xem data tại: http://localhost:${PORT}/api/history\n`);
    
    await refreshAll();
    setInterval(refreshAll, FETCH_INTERVAL); // Chạy ngầm 5 giây/lần
});