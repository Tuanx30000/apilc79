// server.js - V3.0.1 cho Render (không WebSocket)
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { Worker } = require('worker_threads');
const fs = require('fs').promises;
const path = require('path');
const zlib = require('zlib');
const { promisify } = require('util');
const gunzip = promisify(zlib.gunzip);
const gzip = promisify(zlib.gzip);

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== CẤU HÌNH ====================
const HISTORY_LIMIT = 200;
const FETCH_INTERVAL = 5000;
const BACKUP_INTERVAL = 30000;
const BACKUP_FILE = path.join(__dirname, 'backup.json.gz');
const RATE_LIMIT_WINDOW = 60000;
const RATE_LIMIT_MAX = 100;

// ==================== BRAND ====================
const BRAND = { name: 'tuanx3000', version: '3.0.1' };

// ==================== MIDDLEWARE ====================
app.use(cors({ origin: '*', credentials: true }));
app.use(compression({ level: 6, threshold: 1024 }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const limiter = rateLimit({
    windowMs: RATE_LIMIT_WINDOW,
    max: RATE_LIMIT_MAX,
    handler: (req, res) => res.status(429).json({ error: 'Quá tải, thử lại sau 60s' })
});
app.use('/api/', limiter);

// ==================== NGUỒN DỮ LIỆU ====================
const SOURCES = {
    MD5: { url: 'https://wtxmd52.tele68.com/v1/txmd5/sessions?cp=R&cl=R&pf=web&at=85f666e4654999d6d2b7c4650c3f6da3' },
    NOHU: { url: 'https://wtx.tele68.com/v1/tx/sessions?cp=R&cl=R&pf=web&at=85f666e4654999d6d2b7c4650c3f6da3' }
};

// ==================== DATA STORE ====================
const store = {
    MD5: { history: [], latest: null, errorCount: 0, lastUpdate: null },
    NOHU: { history: [], latest: null, errorCount: 0, lastUpdate: null }
};
let aggregatedHistory = [];
let aggregatedLatest = null;
let lastAggregation = null;

// ==================== HELPER ====================
function createEmpty() {
    return { Phien: null, Xuc_xac_1: null, Xuc_xac_2: null, Xuc_xac_3: null, Tong: null, Ket_qua: '', nguon: '', brand: BRAND.name };
}

// ==================== WORKER FETCH (tách luồng) ====================
function fetchSourceWorker(url) {
    return new Promise((resolve, reject) => {
        const worker = new Worker(
            `const { parentPort } = require('worker_threads');
             const fetch = require('node-fetch');
             (async () => {
                 try {
                     const res = await fetch('${url}', { timeout: 10000 });
                     const data = await res.json();
                     parentPort.postMessage({ ok: true, data });
                 } catch (e) {
                     parentPort.postMessage({ ok: false, error: e.message });
                 }
             })();`,
            { eval: true }
        );
        worker.on('message', resolve);
        worker.on('error', reject);
        worker.on('exit', (code) => { if (code !== 0) reject(new Error(`Worker exit ${code}`)); });
        setTimeout(() => { worker.terminate(); reject(new Error('Timeout')); }, 12000);
    });
}

// ==================== CHUYỂN ĐỔI DỮ LIỆU ====================
function convertItems(raw, sourceName) {
    if (!raw || !raw.list) return [];
    const items = raw.list;
    const result = [];
    const now = new Date().toISOString();
    for (const item of items) {
        if (!item.id) continue;
        const dices = item.dices || [];
        const d1 = parseInt(dices[0]) || 0;
        const d2 = parseInt(dices[1]) || 0;
        const d3 = parseInt(dices[2]) || 0;
        const sum = parseInt(item.point) || (d1 + d2 + d3);
        const resultText = (item.resultTruyenThong || '').toUpperCase() === 'TAI' ? 'Tài' : 'Xỉu';
        result.push({
            Phien: String(item.id),
            Xuc_xac_1: d1,
            Xuc_xac_2: d2,
            Xuc_xac_3: d3,
            Tong: sum,
            Ket_qua: resultText,
            nguon: sourceName,
            server_time: now
        });
    }
    return result;
}

// ==================== CẬP NHẬT NGUỒN ====================
async function refreshSource(name) {
    try {
        const result = await fetchSourceWorker(SOURCES[name].url);
        if (!result.ok) throw new Error(result.error);
        const raw = result.data;
        let converted = convertItems(raw, name);
        if (converted.length === 0) return;
        // sort mới nhất
        converted.sort((a, b) => parseInt(b.Phien) - parseInt(a.Phien));
        // dedup
        const seen = new Set();
        const unique = converted.filter(item => {
            const key = item.Phien;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
        store[name].history = unique.slice(0, HISTORY_LIMIT);
        store[name].lastUpdate = new Date().toISOString();
        store[name].errorCount = 0;
        if (store[name].history.length > 0) {
            store[name].latest = { ...store[name].history[0], brand: BRAND.name };
        }
    } catch (err) {
        store[name].errorCount++;
        console.error(`[${name}] Lỗi: ${err.message}`);
    }
}

// ==================== TỔNG HỢP ====================
function aggregate() {
    const all = [...store.MD5.history, ...store.NOHU.history];
    if (all.length === 0) return;
    all.sort((a, b) => parseInt(b.Phien) - parseInt(a.Phien));
    const seen = new Set();
    const unique = all.filter(item => {
        const key = item.Phien + '#' + item.nguon;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    aggregatedHistory = unique.slice(0, HISTORY_LIMIT);
    lastAggregation = new Date().toISOString();
    if (aggregatedHistory.length > 0) {
        aggregatedLatest = { ...aggregatedHistory[0], brand: BRAND.name };
    }
}

// ==================== BACKUP & RESTORE ====================
async function backup() {
    try {
        const data = { store, aggregatedHistory, aggregatedLatest, lastAggregation };
        const json = JSON.stringify(data);
        const compressed = await gzip(json);
        await fs.writeFile(BACKUP_FILE, compressed);
    } catch (err) { console.error('Backup lỗi:', err.message); }
}

async function restore() {
    try {
        const compressed = await fs.readFile(BACKUP_FILE);
        const json = await gunzip(compressed);
        const data = JSON.parse(json.toString());
        Object.assign(store, data.store);
        aggregatedHistory = data.aggregatedHistory || [];
        aggregatedLatest = data.aggregatedLatest || null;
        lastAggregation = data.lastAggregation || null;
        console.log('Phục hồi backup thành công');
    } catch (err) { console.log('Không có backup hoặc lỗi đọc'); }
}

// ==================== REFRESH ALL ====================
async function refreshAll() {
    await Promise.all([refreshSource('MD5'), refreshSource('NOHU')]);
    aggregate();
}

// ==================== ROUTES ====================
app.get('/', (req, res) => res.json({ brand: BRAND.name, version: BRAND.version, status: 'API Running' }));

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        MD5: { records: store.MD5.history.length, latest: store.MD5.latest?.Phien || null, errors: store.MD5.errorCount },
        NOHU: { records: store.NOHU.history.length, latest: store.NOHU.latest?.Phien || null, errors: store.NOHU.errorCount },
        total: aggregatedHistory.length,
        lastAggregation
    });
});

app.get('/api/latest', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.json(aggregatedLatest || createEmpty());
});

app.get('/api/history', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 50, 500);
    res.setHeader('Cache-Control', 'no-cache');
    res.json({ brand: BRAND.name, total: aggregatedHistory.length, data: aggregatedHistory.slice(0, limit) });
});

app.get('/api/source/:name', (req, res) => {
    const name = req.params.name.toUpperCase();
    if (!store[name]) return res.status(404).json({ error: 'Nguồn không tồn tại' });
    const limit = Math.min(parseInt(req.query.limit) || 50, 500);
    res.setHeader('Cache-Control', 'no-cache');
    res.json({ brand: BRAND.name, source: name, data: store[name].history.slice(0, limit) });
});

// ==================== KHỞI ĐỘNG ====================
(async function start() {
    await restore();
    await refreshAll();
    // Lập lịch refresh
    setInterval(refreshAll, FETCH_INTERVAL);
    // Lập lịch backup
    setInterval(backup, BACKUP_INTERVAL);
    // Backup khi thoát
    process.on('SIGINT', () => { backup(); process.exit(); });
    process.on('SIGTERM', () => { backup(); process.exit(); });

    app.listen(PORT, '0.0.0.0', () => {
        console.log(`[${BRAND.name}] Server chạy cổng ${PORT}`);
        console.log(`API: https://apilc79-2zq9.onrender.com/api/history`);
    });
})();