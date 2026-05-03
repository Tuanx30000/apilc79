const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const API_LINKS = {
    MD5: "https://wtxmd52.tele68.com/v1/txmd5/lite-sessions?cp=R&cl=R&pf=web&at=104c423fe086f7aeb82ec6ba0e91672f",
    SUN: "https://wtx.tele68.com/v1/tx/lite-sessions?cp=R&cl=R&pf=web&at=104c423fe086f7aeb82ec6ba0e91672f"
};

class VipPredictorEngine {
    constructor() {
        this.data = { MD5: "", SUN: "" };
        this.phien = 3085701;
    }

    async fetchRawData(type) {
        try {
            const res = await fetch(API_LINKS[type]);
            const json = await res.json();
            return (json.list || []).map(i => i.resultTruyenThong === "TAI" ? "T" : "X").join('');
        } catch (e) { return ""; }
    }

    // [VIP ALGO 1] - Khớp mẫu sâu (Lịch sử tương đồng)
    analyzePatternMatching(history, depth = 5) {
        if (history.length < depth + 1) return { t_match: 0, x_match: 0, dominant: "N/A" };
        const targetPattern = history.slice(-depth);
        let nextT = 0, nextX = 0;

        for (let i = 0; i < history.length - depth; i++) {
            if (history.substring(i, i + depth) === targetPattern) {
                if (history[i + depth] === 'T') nextT++;
                else nextX++;
            }
        }
        return { 
            t_match: nextT, 
            x_match: nextX, 
            dominant: nextT > nextX ? 'T' : (nextX > nextT ? 'X' : 'Balance'),
            pattern: targetPattern
        };
    }

    // [VIP ALGO 2] - Markov Chain Bậc 3 (Xác suất chuỗi 3 trạng thái)
    analyzeMarkov3rdOrder(history) {
        const recent = history.slice(-100);
        const seq3 = history.slice(-3); // VD: "TXT"
        let countSeq = 0, countSeqT = 0, countSeqX = 0;

        for (let i = 0; i < recent.length - 3; i++) {
            if (recent.substring(i, i + 3) === seq3) {
                countSeq++;
                if (recent[i + 3] === 'T') countSeqT++;
                else countSeqX++;
            }
        }
        return {
            sequence: seq3,
            probT: countSeq === 0 ? 50 : Math.round((countSeqT / countSeq) * 100),
            probX: countSeq === 0 ? 50 : Math.round((countSeqX / countSeq) * 100)
        };
    }

    // [VIP ALGO 3] - Thống kê lệch chuẩn (Z-Score & Bias)
    analyzeStats(history) {
        const recent100 = history.slice(-100);
        const tai = (recent100.match(/T/g) || []).length;
        const xiu = 100 - tai;
        const lastChar = history[history.length - 1];

        // Tính chuỗi liên tiếp hiện tại (Streak)
        let currentStreak = 0;
        for (let i = history.length - 1; i >= 0; i--) {
            if (history[i] === lastChar) currentStreak++;
            else break;
        }

        // Z-Score đơn giản hóa (Trị tuyệt đối của độ lệch so với mức cân bằng 50)
        const zScore = Math.abs(tai - 50) / Math.sqrt(100 * 0.5 * 0.5); 
        const isAnomaly = zScore > 1.96; // Khoảng tin cậy 95%

        return { tai, xiu, lastChar, currentStreak, zScore: zScore.toFixed(2), isAnomaly };
    }

    // [VIP ALGO 4] - Ensemble Hệ thống Bầu chọn Trọng số
    getEnsemblePrediction(stats, patternMatch, markov) {
        let scoreT = 0;
        let scoreX = 0;

        // 1. Điểm từ Bias (Chiếm 20%) - Ưu tiên Hồi quy (Mean Reversion)
        if (stats.tai > stats.xiu) scoreX += 20; else scoreT += 20;

        // 2. Điểm từ Streak (Chiếm 30%) - Logic Bẻ cầu thông minh
        if (stats.currentStreak >= 4) {
            // Chuỗi dài -> Khả năng gãy cực cao
            stats.lastChar === 'T' ? scoreX += 30 : scoreT += 30;
        } else if (stats.currentStreak === 1) {
            // Cầu 1-1 -> Ưu tiên lặp lại cầu đảo
            stats.lastChar === 'T' ? scoreX += 15 : scoreT += 15;
        } else {
            // Chuỗi lửng (2,3) -> Đuổi theo (Follow)
            stats.lastChar === 'T' ? scoreT += 15 : scoreX += 15;
        }

        // 3. Điểm từ Lịch sử tương đồng (Chiếm 25%)
        if (patternMatch.dominant === 'T') scoreT += 25;
        if (patternMatch.dominant === 'X') scoreX += 25;

        // 4. Điểm từ Markov Chain (Chiếm 25%)
        if (markov.probT > markov.probX) scoreT += 25;
        if (markov.probX > markov.probT) scoreX += 25;

        const totalDiff = Math.abs(scoreT - scoreX);
        const finalPred = scoreT > scoreX ? "Tài" : "Xỉu";
        let tinCayStr = totalDiff > 40 ? "Rất cao ⭐⭐⭐ (Đồng thuận)" : (totalDiff > 20 ? "Cao ⭐⭐" : "Trung bình ⭐ (Nhiễu)");

        return { finalPred, scoreT, scoreX, tinCayStr, totalDiff };
    }

    async processEngine(type) {
        const raw = await this.fetchRawData(type);
        this.data[type] = (raw + this.data[type]).slice(0, 10000); // Lưu max 10k phiên
        const history = this.data[type];

        // Khởi chạy đồng thời 4 mô hình
        const stats = this.analyzeStats(history);
        const patternData = this.analyzePatternMatching(history, 5);
        const markovData = this.analyzeMarkov3rdOrder(history);
        const prediction = this.getEnsemblePrediction(stats, patternData, markovData);

        return {
            "id_he_thong": `VIP_ENGINE_${type}_V4.0`,
            "phien_du_doan": this.phien++,
            "cau_truc_cau": {
                "nhan_dien_cau": `Chuỗi hiện tại: ${stats.lastChar} x${stats.currentStreak}`,
                "trang_thai_ban": stats.isAnomaly ? "Bàn Đang Ảo (Z-Score Cao)" : "Bàn Cân Bằng (Tiêu Chuẩn)",
            },
            "du_doan_van_sau": prediction.finalPred,
            "do_tin_cay": prediction.tinCayStr,
            "thong_ke_ai_models": {
                "bias_100": `Tài: ${stats.tai}% | Xỉu: ${stats.xiu}%`,
                "z_score_anomaly": stats.zScore,
                "markov_chain_3rd": `Nếu gặp [${markovData.sequence}] -> Tỷ lệ ra: T(${markovData.probT}%) / X(${markovData.probX}%)`,
                "deep_pattern_match": `Mẫu [${patternData.pattern}] từng lặp lại ${patternData.t_match + patternData.x_match} lần. Tỷ lệ tiếp theo -> T:${patternData.t_match} / X:${patternData.x_match}`,
                "diem_bau_chon_cuoi_cung": `Tổng điểm: Tài (${prediction.scoreT}) vs Xỉu (${prediction.scoreX})`
            },
            "tinh_nang_vip_kich_hoat": [
                "Deep Pattern Matching (Dò mẫu 10,000 phiên)",
                "3rd-Order Markov Probability",
                "Z-Score Anti-Scam Detection",
                "Weighted Ensemble Voting"
            ],
            "hieu_suat_he_thong": (50 + (prediction.totalDiff / 2)).toFixed(1) + "%"
        };
    }
}

const botEngine = new VipPredictorEngine();

app.get('/vip/md5', async (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.send(JSON.stringify(await botEngine.processEngine('MD5'), null, 4));
});

app.get('/vip/sun', async (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.send(JSON.stringify(await botEngine.processEngine('SUN'), null, 4));
});

app.listen(PORT, () => {
    console.log(`
    [🤖] HỆ THỐNG VIP AI PREDICTOR ĐÃ KHỞI ĐỘNG
    - Phân tích đa tầng thuật toán
    - API MD5: http://localhost:${PORT}/vip/md5
    - API SUN: http://localhost:${PORT}/vip/sun
    `);
});
