/**
 * LC79 MASTER TOOL V14.1 OMNI - GODLIKE ENGINE
 * OS: iOS/Android/Linux (Node.js Optimized)
 * Developer: AnhTuấnMMO
 * Focus: MD5 & Jackpot Analysis
 */

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Cấu hình mã màu Neon Cyber-tech
const COLORS = {
    GREEN: "\x1b[38;2;0;255;65m", // Neon Green #00ff41[span_3](start_span)[span_3](end_span)
    CYAN: "\x1b[36m",
    RED: "\x1b[31m",
    RESET: "\x1b[0m",
    BOLD: "\x1b[1m"
};

// 1. ENGINE TRUNG TÂM - TÍCH HỢP 5 THUẬT TOÁN
class TuanX3000_Godlike_Engine {
    constructor() {
        this.history = [];
        this.weights = {
            markov: 1.8,    // Ưu tiên cao cho MD5[span_4](start_span)[span_4](end_span)
            cnn: 1.5,       // Nhận diện đà điểm số[span_5](start_span)[span_5](end_span)
            chaos: 1.2,     // Chốt chặn rủi ro[span_6](start_span)[span_6](end_span)
            cycle: 1.4,     // Bắt nhịp cầu đối xứng[span_7](start_span)[span_7](end_span)
            pattern: 1.0    // Logic cầu cơ bản
        };
        this.md5_api = "https://wtxmd52.tele68.com/v1/txmd5/sessions?cp=R&cl=R&pf=web&at=104c423fe086f7aeb82ec6ba0e91672f";
    }

    // --- LẤY DỮ LIỆU THỰC THỜI ---
    async refreshData() {
        try {
            const response = await fetch(this.md5_api);
            const json = await response.json();
            if (json && json.list) {
                this.history = json.list.map(item => ({
                    id: item.id,
                    dices: item.dices,
                    point: item.point,
                    tx: item.point >= 11 ? 'T' : 'X'
                })).sort((a, b) => a.id - b.id);
                return true;
            }
            return false;
        } catch (error) {
            console.log(`${COLORS.RED}[ERROR] Không thể kết nối API MD5${COLORS.RESET}`);
            return false;
        }
    }

    // --- THUẬT TOÁN 1: MARKOV CHAIN N-GRAM ---
    // Phân tích xác suất chuyển trạng thái dựa trên chuỗi N phiên[span_8](start_span)[span_8](end_span)
    analyzeMarkov() {
        const txArr = this.history.map(h => h.tx);
        if (txArr.length < 15) return null;

        let votes = { T: 0, X: 0 };
        const orders = [3, 4, 5]; // Kiểm tra đa tầng

        orders.forEach(order => {
            const currentPattern = txArr.slice(-order).join('');
            let counts = { T: 0, X: 0 };

            for (let i = 0; i < txArr.length - order; i++) {
                if (txArr.slice(i, i + order).join('') === currentPattern) {
                    const nextResult = txArr[i + order];
                    if (nextResult) counts[nextResult]++;
                }
            }
            
            if (counts.T > counts.X) votes.T += (order * 0.5);
            else if (counts.X > counts.T) votes.X += (order * 0.5);
        });

        return votes.T > votes.X ? 'T' : (votes.X > votes.T ? 'X' : null);
    }

    // --- THUẬT TOÁN 2: CNN POINT TREND (MÔ PHỎNG TÍCH CHẬP) ---
    // Sử dụng đà (Momentum) của tổng điểm xúc xắc để dự báo[span_9](start_span)[span_9](end_span)
    analyzeCNNTrend() {
        const points = this.history.map(h => h.point);
        if (points.length < 10) return null;

        const lastFive = points.slice(-5);
        const kernels = [0.4, 0.3, 0.15, 0.1, 0.05]; // Trọng số phiên gần nhất cao nhất
        
        // Tính toán Momentum: S = Σ(Point - 10.5) * Weight
        let momentum = 0;
        lastFive.forEach((p, i) => {
            momentum += (p - 10.5) * kernels[i];
        });

        return momentum > 0 ? 'T' : 'X';
    }

    // --- THUẬT TOÁN 3: SHANNON ENTROPY (ĐỘ NHIỄU) ---
    // Kiểm tra xem bàn đang ổn định hay loạn để giảm rủi ro[span_10](start_span)[span_10](end_span)
    calculateEntropy() {
        const last20 = this.history.slice(-20).map(h => h.tx);
        const countT = last20.filter(x => x === 'T').length;
        const pT = countT / 20;
        const pX = 1 - pT;

        if (pT === 0 || pX === 0) return 0;
        // Công thức: H(x) = -Σ p(i)log2(p(i))
        const entropy = -(pT * Math.log2(pT) + pX * Math.log2(pX));
        return entropy;
    }

    // --- THUẬT TOÁN 4: CYCLE SYMMETRY (CHU KỲ ĐỐI XỨNG) ---
    // Tìm kiếm các mẫu cầu đối xứng gương[span_11](start_span)[span_11](end_span)
    analyzeCycle() {
        const txArr = this.history.map(h => h.tx).slice(-10);
        const pattern = txArr.join('');
        
        // Ví dụ: TXT - TXT (Lặp) hoặc TXT - TXT (Đối xứng)
        if (pattern.slice(-3) === pattern.slice(-6, -3)) {
            return txArr[txArr.length - 1]; // Đánh theo cầu lặp
        }
        return null;
    }

    // --- THUẬT TOÁN 5: JACKPOT DETECTOR (SĂN NỔ HŨ) ---
    // Nhận diện biến động điểm số cực đại báo hiệu nhịp Jackpot[span_12](start_span)[span_12](end_span)
    detectJackpot() {
        const lastPoints = this.history.slice(-3).map(h => h.point);
        // Nhịp báo: Điểm số bám biên liên tục (Sát 3 hoặc 18)
        const isExtremity = lastPoints.some(p => p <= 5 || p >= 16);
        return isExtremity ? "HIGH_CHANCE" : "NORMAL";
    }

    // --- TỔNG HỢP KẾT QUẢ (BAYESIAN ENSEMBLE) ---
    generateFinalPrediction() {
        const results = {
            markov: this.analyzeMarkov(),
            cnn: this.analyzeCNNTrend(),
            cycle: this.analyzeCycle()
        };

        let scoreT = 0;
        let scoreX = 0;

        // Cộng dồn điểm tin cậy dựa trên trọng số[span_13](start_span)[span_13](end_span)
        for (const [algo, result] of Object.entries(results)) {
            if (result === 'T') scoreT += this.weights[algo];
            if (result === 'X') scoreX += this.weights[algo];
        }

        const totalScore = scoreT + scoreX;
        const confidence = ((Math.max(scoreT, scoreX) / totalScore) * 100).toFixed(1);
        const finalVote = scoreT > scoreX ? "TÀI" : "XỈU";
        
        // Kiểm soát độ nhiễu
        const entropy = this.calculateEntropy();
        const status = (entropy > 0.95) ? "⏳ ĐANG LOẠN - CHỜ" : (confidence > 75 ? "🔥 CỰC ĐẸP - VÀO" : "⚖️ CÂN NHẮC");

        return {
            prediction: finalVote,
            confidence: confidence + "%",
            entropy: entropy.toFixed(3),
            jackpot: this.detectJackpot(),
            status: status
        };
    }
}

const engine = new TuanX3000_Godlike_Engine();

// 2. API ENDPOINTS
app.get('/api/predict/md5', async (req, res) => {
    const success = await engine.refreshData();
    if (!success) return res.status(500).json({ error: "Lỗi kết nối máy chủ MD5" });

    const analysis = engine.generateFinalPrediction();
    const lastSession = engine.history[engine.history.length - 1];

    res.json({
        author: "AnhTuấnMMO",
        tool: "LC79 Master v14.1",
        target: "MD5 & NỔ HŨ",
        session_info: {
            current_id: lastSession.id,
            next_id: lastSession.id + 1,
            last_result: `${lastSession.dices.join('-')} (${lastSession.tx})`
        },
        analysis: analysis,
        timestamp: new Date().toISOString()
    });
});

// 3. KHỞI CHẠY SERVER
app.listen(PORT, () => {
    console.clear();
    console.log(`${COLORS.GREEN}${COLORS.BOLD}`);
    console.log(`    ██╗     ██████╗███████╗ █████╗     ███╗   ███╗ █████╗ ███████╗████████╗███████╗██████╗ `);
    console.log(`    ██║    ██╔════╝╚════██║██╔══██╗    ████╗ ████║██╔══██╗██╔════╝╚══██╔══╝██╔════╝██╔══██╗`);
    console.log(`    ██║    ██║         ██╔╝╚██████║    ██╔████╔██║███████║███████╗   ██║   █████╗  ██████╔╝`);
    console.log(`    ██║    ██║        ██╔╝  ╚═══██║    ██║╚██╔╝██║██╔══██║╚════██║   ██║   ██╔══╝  ██╔══██╗`);
    console.log(`    ███████╗╚██████╗  ██║   █████╔╝    ██║ ╚═╝ ██║██║  ██║███████║   ██║   ███████╗██║  ██║`);
    console.log(`    ╚══════╝ ╚═════╝  ╚═╝   ╚════╝     ╚═╝     ╚═╝╚═╝  ╚═╝╚══════╝   ╚═╝   ╚══════╝╚═╝  ╚═╝`);
    console.log(`\n                  --- VERSION 14.1 OMNI | ADMIN: ANHTUẤNMMO ---`);
    console.log(`\n[+] Chế độ: CHỈ QUÉT MD5 & NỔ HŨ (Đã gỡ bỏ SUN)`);
    console.log(`[+] Kiến trúc: Godlike Engine (Markov, CNN, Entropy, Cycle, Bayesian)`);
    console.log(`[+] API Endpoint: http://localhost:${PORT}/api/predict/md5`);
    console.log(`[+] Trạng thái: ${COLORS.CYAN}SẴN SÀNG CHIẾN ĐẤU!${COLORS.RESET}\n`);
});
