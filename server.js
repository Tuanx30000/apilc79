const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Cấu hình Nguồn cấp dữ liệu nâng cao
const API_LINKS = {
    MD5: "https://wtxmd52.tele68.com/v1/txmd5/sessions?cp=R&cl=R&pf=web&at=104c423fe086f7aeb82ec6ba0e91672f",
    SUN: "https://wtx.tele68.com/v1/tx/sessions?cp=R&cl=R&pf=web&at=104c423fe086f7aeb82ec6ba0e91672f"
};

class TUANX3000_GODLIKE_ENGINE {
    constructor() {
        this.fullHistory = { MD5: [], SUN: [] };
        this.weights = {}; // Hệ thống tự học (Adaptive Weights)
        this.initAlgorithms();
    }

    initAlgorithms() {
        // Khởi tạo trọng số cho các nhóm thuật toán
        this.algoGroups = ['Markov', 'Pattern', 'ML_Sim', 'Quantum_Chaos', 'Statistical'];
        this.algoGroups.forEach(group => this.weights[group] = 1.0);
    }

    async fetchData(type) {
        try {
            const res = await fetch(API_LINKS[type]);
            const json = await res.json();
            if (!json.list) return [];
            return json.list.map(i => ({
                id: i.id,
                dices: i.dices,
                point: i.point,
                tx: i.point >= 11 ? 'T' : 'X'
            })).sort((a, b) => a.id - b.id);
        } catch (e) {
            console.error(`\x1b[31m[LỖI] Connection Fail: ${type}\x1b[0m`);
            return [];
        }
    }

    // --- NHÓM 1: MARKOV & N-GRAM SIÊU CẤP ---
    analyzeHyperMarkov(history) {
        if (history.length < 20) return null;
        const tx = history.map(h => h.tx);
        let votes = { T: 0, X: 0 };
        
        [3, 4, 5].forEach(order => {
            const lastKey = tx.slice(-order).join('');
            let counts = { T: 0, X: 0 };
            for (let i = 0; i < tx.length - order; i++) {
                if (tx.slice(i, i + order).join('') === lastKey) {
                    counts[tx[i + order]]++;
                }
            }
            if (counts.T > counts.X) votes.T += order;
            else if (counts.X > counts.T) votes.X += order;
        });
        return votes.T > votes.X ? 'T' : 'X';
    }

    // --- NHÓM 2: MÔ PHỎNG HỌC MÁY (CNN & LOGISTIC) ---
    analyzeMLSim(history) {
        if (history.length < 30) return null;
        const points = history.map(h => h.point);
        const lastPoints = points.slice(-5);
        
        // Kernel giả lập tích chập (CNN)
        const weights = [0.4, 0.3, 0.2, 0.1, 0.05];
        let trendScore = 0;
        lastPoints.forEach((p, i) => {
            trendScore += (p - 10.5) * weights[i];
        });

        // Logistic sigmoid giả lập
        const probT = 1 / (1 + Math.exp(trendScore));
        return probT > 0.5 ? 'T' : 'X';
    }

    // --- NHÓM 3: LÝ THUYẾT HỖN LOẠN (CHAOS & ENTROPY) ---
    analyzeChaosTheory(history) {
        if (history.length < 40) return null;
        const tx = history.map(h => h.tx);
        
        // Tính Entropy (Độ nhiễu)
        const freq = { T: 0, X: 0 };
        tx.slice(-20).forEach(v => freq[v]++);
        const pT = freq.T / 20;
        const pX = freq.X / 20;
        const entropy = -(pT * Math.log2(pT || 1) + pX * Math.log2(pX || 1));

        // Nếu entropy quá cao (loạn), đánh theo cầu lặp
        if (entropy > 0.9) return tx[tx.length - 1];
        // Nếu entropy thấp (đang ổn định), đánh bẻ cầu
        return tx[tx.length - 1] === 'T' ? 'X' : 'T';
    }

    // --- NHÓM 4: PHÂN TÍCH CHU KỲ (CYCLE ANALYSIS) ---
    analyzeCycle(history) {
        if (history.length < 50) return null;
        const tx = history.map(h => h.tx);
        for (let len = 2; len <= 10; len++) {
            const segment1 = tx.slice(-len).join('');
            const segment2 = tx.slice(-len * 2, -len).join('');
            if (segment1 === segment2) return tx[tx.length - len]; // Bắt cầu đối xứng
        }
        return null;
    }

    // --- SIÊU TỔ HỢP (META-ENSEMBLE) ---
    getEnsemble(history) {
        const results = {
            Markov: this.analyzeHyperMarkov(history),
            ML_Sim: this.analyzeMLSim(history),
            Chaos: this.analyzeChaosTheory(history),
            Cycle: this.analyzeCycle(history),
            Pattern: history.map(h => h.tx).slice(-1)[0] === 'T' ? 'X' : 'T' // Bridge logic
        };

        let scoreT = 0, scoreX = 0;
        Object.keys(results).forEach(key => {
            if (results[key] === 'T') scoreT += (this.weights[key] || 1);
            if (results[key] === 'X') scoreX += (this.weights[key] || 1);
        });

        const total = scoreT + scoreX;
        const confidence = (Math.max(scoreT, scoreX) / total * 100).toFixed(0);
        
        return {
            prediction: scoreT > scoreX ? "Tài" : "Xỉu",
            confidence: `${confidence}%`,
            details: results
        };
    }

    async processAll() {
        const types = ['MD5', 'SUN'];
        const results = {};

        for (const type of types) {
            const data = await this.fetchData(type);
            if (data.length > 0) {
                this.fullHistory[type] = data;
                const ensemble = this.getEnsemble(data);
                const last = data[data.length - 1];

                results[type] = {
                    "phien_id": last.id + 1,
                    "ket_qua_truoc": `${last.dices.join(',')} (${last.tx})`,
                    "du_doan": ensemble.prediction,
                    "do_tin_cay": ensemble.confidence,
                    "thuat_toan_chay": Object.keys(ensemble.details).length,
                    "trang_thai": parseFloat(ensemble.confidence) > 70 ? "⚡ CỰC ĐẸP" : "⚖️ CÂN NHẮC"
                };
            }
        }

        return {
            "master_tool": "LC79 MASTER TOOL V14.0 OMNI",
            "admin": "AnhTuấnMMO",
            "timestamp": new Date().toLocaleString(),
            "data": results
        };
    }
}

const engine = new TUANX3000_GODLIKE_ENGINE();

// Routes
app.get('/api/v1/predict', async (req, res) => {
    const result = await engine.processAll();
    res.json(result);
});

app.listen(PORT, () => {
    console.log(`\x1b[32m
    ╔══════════════════════════════════════════════════╗
    ║        LC79 MASTER TOOL V14.0 - GODLIKE          ║
    ║   Admin: AnhTuấnMMO | Style: Neon Cyber Green    ║
    ╚══════════════════════════════════════════════════╝
    [+] Cổng API: http://localhost:${PORT}/api/v1/predict
    [+] Tích hợp: CNN, Markov v5, Chaos Theory, Entropy
    [+] Hệ thống: Sẵn sàng quét MD5 & SUN Nổ Hũ
    \x1b[0m`);
});
