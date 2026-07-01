// ==================== TUANX3000 - GODLIKE AI v4.0 ====================
// Backend hoàn chỉnh với 20 thuật toán, ensemble meta-learning, API endpoints
// Chạy: npm install fastify @fastify/cors node-fetch
//       node server.js

import fastify from "fastify";
import cors from "@fastify/cors";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import fetch from "node-fetch";

// --- CẤU HÌNH ---
const PORT = 3000;
const API_URL = "https://wtxmd52.tele68.com/v1/txmd5/sessions";
const FETCH_INTERVAL_MS = 5000;

// --- GLOBAL STATE ---
let txHistory = [];
let currentSessionId = null;
let fetchInterval = null;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==================== UTILITIES ====================
function parseLines(data) {
    if (!data || !Array.isArray(data.list)) return [];
    const sortedList = data.list.sort((a, b) => b.id - a.id);
    return sortedList.map(item => ({
        session: item.id,
        dice: item.dices,
        total: item.point,
        result: item.resultTruyenThong,
        tx: item.point >= 11 ? 'T' : 'X'
    })).sort((a, b) => a.session - b.session);
}

function lastN(arr, n) {
    const start = Math.max(0, arr.length - n);
    return arr.slice(start);
}

function majority(obj) {
    let maxK = null, maxV = -Infinity;
    for (const k in obj) if (obj[k] > maxV) { maxV = obj[k]; maxK = k; }
    return { key: maxK, val: maxV };
}

function sum(nums) { return nums.reduce((a, b) => a + b, 0); }
function avg(nums) { return nums.length ? sum(nums) / nums.length : 0; }

function entropy(arr) {
    if (!arr.length) return 0;
    const freq = {};
    for (const v of arr) freq[v] = (freq[v] || 0) + 1;
    let e = 0, n = arr.length;
    for (const k in freq) { const p = freq[k] / n; e -= p * Math.log2(p); }
    return e;
}

function similarity(a, b) {
    if (a.length !== b.length) return 0;
    let m = 0;
    for (let i = 0; i < a.length; i++) if (a[i] === b[i]) m++;
    return m / a.length;
}

// ==================== FEATURE ENGINEERING ====================
function extractFeatures(history) {
    const tx = history.map(h => h.tx);
    const totals = history.map(h => h.total);
    const dice1 = history.map(h => h.dice[0]);
    const dice2 = history.map(h => h.dice[1]);
    const dice3 = history.map(h => h.dice[2]);
    
    const freq = {};
    for (const v of tx) freq[v] = (freq[v] || 0) + 1;
    
    let runs = [], cur = tx[0], len = 1;
    for (let i = 1; i < tx.length; i++) {
        if (tx[i] === cur) len++;
        else { runs.push({ val: cur, len }); cur = tx[i]; len = 1; }
    }
    if (tx.length) runs.push({ val: cur, len });
    
    const meanTotal = avg(totals);
    const variance = avg(totals.map(t => Math.pow(t - meanTotal, 2)));
    const last10 = tx.slice(-10);
    const last10Totals = totals.slice(-10);
    const upward = last10Totals.filter((t, i) => i > 0 && t > last10Totals[i-1]).length;
    const downward = last10Totals.filter((t, i) => i > 0 && t < last10Totals[i-1]).length;
    
    const sumDice = dice1.map((d,i) => d + dice2[i] + dice3[i]);
    const avgDice1 = avg(dice1);
    const avgDice2 = avg(dice2);
    const avgDice3 = avg(dice3);
    const volatilityDice = Math.sqrt(avg(sumDice.map(s => Math.pow(s - meanTotal, 2))));
    
    return {
        tx, totals, dice1, dice2, dice3, freq, runs,
        maxRun: runs.reduce((m, r) => Math.max(m, r.len), 0),
        meanTotal, stdTotal: Math.sqrt(variance),
        entropy: entropy(tx),
        last3Pattern: tx.slice(-3).join(''),
        last5Pattern: tx.slice(-5).join(''),
        last8Pattern: tx.slice(-8).join(''),
        trends: { upward, downward },
        diceStats: { avgDice1, avgDice2, avgDice3, volatilityDice }
    };
}

// ==================== PHÁT HIỆN PATTERN ====================
function detectPatternType(runs) {
    if (runs.length < 3) return null;
    const lastRuns = runs.slice(-8);
    const lengths = lastRuns.map(r => r.len);
    const values = lastRuns.map(r => r.val);
    
    const patternLib = [
        { pattern: [1,1,1,1,1], name: 'quantum_wave_1', pred: 'alternate' },
        { pattern: [2,2,2,2,2], name: 'quantum_wave_2', pred: 'alternate' },
        { pattern: [1,2,1,2,1], name: 'fibonacci_pattern', pred: 'alternate' },
        { pattern: [1,3,1,3,1], name: 'golden_pattern', pred: 'alternate' },
        { pattern: [2,1,2,1,2], name: 'tiger_pattern', pred: 'alternate' },
        { pattern: [3,1,3,1,3], name: 'dragon_pattern', pred: 'alternate' },
        { pattern: [1,1,2,2,1], name: 'chaos_pattern', pred: 'continue' },
        { pattern: [2,2,1,1,2], name: 'yin_yang_pattern', pred: 'continue' },
        { pattern: [1,4,1,4,1], name: 'phoenix_pattern', pred: 'break' },
        { pattern: [3,3,1,1,3], name: 'thunder_pattern', pred: 'break' }
    ];
    
    for (const lib of patternLib) {
        if (lengths.slice(0, lib.pattern.length).every((v,i) => v === lib.pattern[i])) {
            if (lib.pred === 'alternate') return 'alternating_advanced';
            if (lib.pred === 'continue') return 'continuation_advanced';
            return 'break_advanced';
        }
    }
    
    if (lengths.length >= 4) {
        if (lengths[0] === lengths[2] && lengths[1] === lengths[3]) return 'mirror_pattern';
        if (lengths[0] + lengths[1] === lengths[2] + lengths[3]) return 'balance_pattern';
        if (Math.abs(lengths[0] - lengths[1]) === Math.abs(lengths[2] - lengths[3])) return 'gradient_pattern';
    }
    
    const lastRun = lastRuns[lastRuns.length - 1];
    if (lastRun && lastRun.len >= 6) return 'super_long_run';
    if (lastRun && lastRun.len === 5) return 'long_run_5';
    
    return 'normal_pattern';
}

// ==================== 20 THUẬT TOÁN ====================
function algo5_freqRebalance(history) {
    if (history.length < 20) return null;
    const features = extractFeatures(history);
    const { freq, entropy: e } = features;
    const tCount = freq['T'] || 0;
    const xCount = freq['X'] || 0;
    const diff = Math.abs(tCount - xCount);
    const total = tCount + xCount;
    
    let threshold;
    if (e > 0.9) threshold = 0.45;
    else if (e < 0.4) threshold = 0.65;
    else threshold = 0.55;
    
    const recent = history.slice(-30);
    const recentT = recent.filter(h => h.tx === 'T').length;
    const recentX = recent.filter(h => h.tx === 'X').length;
    const recentDiff = Math.abs(recentT - recentX);
    const recentTotal = recentT + recentX;
    
    if (total > 0 && recentTotal > 0) {
        const longTermRatio = diff / total;
        const shortTermRatio = recentDiff / recentTotal;
        const combinedRatio = (longTermRatio * 0.4) + (shortTermRatio * 0.6);
        if (combinedRatio > threshold) {
            if (recentT > recentX + 2) return 'X';
            if (recentX > recentT + 2) return 'T';
        }
    }
    return null;
}

function algoA_markov(history) {
    if (history.length < 15) return null;
    const tx = history.map(h => h.tx);
    let maxOrder = 4;
    if (history.length < 30) maxOrder = 3;
    if (history.length < 20) maxOrder = 2;
    
    let bestPred = null;
    let bestScore = -1;
    
    for (let order = 2; order <= maxOrder; order++) {
        if (tx.length < order + 8) continue;
        const transitions = {};
        const totalTransitions = tx.length - order;
        const decayFactor = 0.95;
        
        for (let i = 0; i < totalTransitions; i++) {
            const key = tx.slice(i, i + order).join('');
            const next = tx[i + order];
            const weight = Math.pow(decayFactor, totalTransitions - i - 1);
            if (!transitions[key]) transitions[key] = { T: 0, X: 0 };
            transitions[key][next] += weight;
        }
        
        const lastKey = tx.slice(-order).join('');
        const counts = transitions[lastKey];
        if (counts && (counts.T + counts.X) > 0.5) {
            const total = counts.T + counts.X;
            const confidence = Math.abs(counts.T - counts.X) / total;
            const pred = counts.T > counts.X ? 'T' : 'X';
            const orderWeight = order / maxOrder;
            const supportWeight = Math.min(1, (counts.T + counts.X) / 10);
            const score = confidence * orderWeight * supportWeight;
            if (score > bestScore) { bestScore = score; bestPred = pred; }
        }
    }
    return bestPred;
}

function algoB_ngram(history) {
    if (history.length < 30) return null;
    const tx = history.map(h => h.tx);
    const ngramSizes = [];
    if (history.length >= 50) ngramSizes.push(5, 6);
    if (history.length >= 40) ngramSizes.push(4);
    ngramSizes.push(3, 2);
    
    let bestPred = null;
    let bestConfidence = 0;
    
    for (const n of ngramSizes) {
        if (tx.length < n * 2) continue;
        const target = tx.slice(-n).join('');
        let matches = [];
        for (let i = 0; i <= tx.length - n - 1; i++) {
            const gram = tx.slice(i, i + n).join('');
            if (gram === target) matches.push({ position: i, next: tx[i + n], distance: tx.length - i });
        }
        if (matches.length >= 2) {
            const weights = { T: 0, X: 0 };
            let totalWeight = 0;
            for (const match of matches) {
                const weight = 1 / (match.distance * 0.5 + 1);
                weights[match.next] += weight;
                totalWeight += weight;
            }
            if (totalWeight > 0) {
                const tRatio = weights.T / totalWeight;
                const xRatio = weights.X / totalWeight;
                const confidence = Math.abs(tRatio - xRatio);
                if (confidence > bestConfidence) { bestConfidence = confidence; bestPred = weights.T > weights.X ? 'T' : 'X'; }
            }
        }
    }
    return bestConfidence > 0.3 ? bestPred : null;
}

function algoS_NeoPattern(history) {
    if (history.length < 25) return null;
    const features = extractFeatures(history);
    const { runs, tx } = features;
    const patternType = detectPatternType(runs);
    if (!patternType || patternType === 'normal_pattern') return null;
    const lastTx = tx[tx.length - 1];
    let prediction = null;
    
    if (patternType === 'alternating_advanced') prediction = lastTx === 'T' ? 'X' : 'T';
    else if (patternType === 'continuation_advanced') prediction = lastTx;
    else if (patternType === 'break_advanced') prediction = lastTx === 'T' ? 'X' : 'T';
    else if (patternType === 'mirror_pattern') prediction = runs[runs.length-2]?.val;
    else if (patternType === 'super_long_run') prediction = runs[runs.length-1]?.len > 7 ? (lastTx === 'T' ? 'X' : 'T') : lastTx;
    else return null;
    
    const recentRuns = runs.slice(-Math.min(8, runs.length));
    const patternConsistency = recentRuns.filter(r => 
        patternType.includes('alternating') || (patternType === 'super_long_run' && r.len >= 4)
    ).length / recentRuns.length;
    
    return patternConsistency > 0.55 ? prediction : null;
}

function algoF_SuperDeepAnalysis(history) {
    if (history.length < 60) return null;
    const timeframes = [
        { lookback: 10, weight: 0.3 },
        { lookback: 30, weight: 0.4 },
        { lookback: 60, weight: 0.3 }
    ];
    let totalScore = { T: 0, X: 0 };
    let totalWeight = 0;
    
    for (const tf of timeframes) {
        if (history.length < tf.lookback) continue;
        const slice = history.slice(-tf.lookback);
        const sliceTx = slice.map(h => h.tx);
        const sliceTotals = slice.map(h => h.total);
        const tCount = sliceTx.filter(t => t === 'T').length;
        const xCount = sliceTx.filter(t => t === 'X').length;
        const meanTotal = avg(sliceTotals);
        const volatility = Math.sqrt(avg(sliceTotals.map(t => Math.pow(t - meanTotal, 2))));
        let tScore = 0, xScore = 0;
        
        if (meanTotal > 12) xScore += 0.4;
        if (meanTotal < 9) tScore += 0.4;
        if (tCount > xCount + 3) xScore += 0.3;
        if (xCount > tCount + 3) tScore += 0.3;
        if (volatility > 4) {
            if (sliceTx[sliceTx.length - 1] === 'T') tScore += 0.2;
            else xScore += 0.2;
        }
        const trend = sliceTotals[sliceTotals.length - 1] - sliceTotals[0];
        if (trend > 3) xScore += 0.1;
        if (trend < -3) tScore += 0.1;
        
        const timeframeWeight = tf.weight * (sliceTx.length / tf.lookback);
        totalScore.T += tScore * timeframeWeight;
        totalScore.X += xScore * timeframeWeight;
        totalWeight += timeframeWeight;
    }
    
    if (totalWeight > 0 && Math.abs(totalScore.T - totalScore.X) > 0.15) {
        return totalScore.T > totalScore.X ? 'T' : 'X';
    }
    return null;
}

function algoE_Transformer(history) {
    if (history.length < 100) return null;
    const tx = history.map(h => h.tx);
    const seqLengths = [6, 8, 10, 12];
    let attentionScores = { T: 0, X: 0 };
    
    for (const seqLen of seqLengths) {
        if (tx.length < seqLen * 2) continue;
        const targetSeq = tx.slice(-seqLen).join('');
        let seqMatches = 0;
        for (let i = 0; i <= tx.length - seqLen - 1; i++) {
            const historySeq = tx.slice(i, i + seqLen).join('');
            const matchScore = similarity(historySeq, targetSeq);
            if (matchScore >= 0.7) {
                const nextResult = tx[i + seqLen];
                const recency = 1 / (tx.length - i);
                const lengthFactor = seqLen / 12;
                const weight = matchScore * recency * lengthFactor;
                attentionScores[nextResult] = (attentionScores[nextResult] || 0) + weight;
                seqMatches++;
            }
        }
        if (seqMatches >= 3) {
            const boostFactor = Math.min(1.5, seqMatches / 2);
            attentionScores.T *= boostFactor;
            attentionScores.X *= boostFactor;
        }
    }
    
    if (attentionScores.T + attentionScores.X > 0.2) {
        const total = attentionScores.T + attentionScores.X;
        const confidence = Math.abs(attentionScores.T - attentionScores.X) / total;
        if (confidence > 0.25) return attentionScores.T > attentionScores.X ? 'T' : 'X';
    }
    return null;
}

function algoG_SuperBridgePredictor(history) {
    const features = extractFeatures(history);
    const { runs, tx } = features;
    if (runs.length < 4) return null;
    const lastRun = runs[runs.length - 1];
    let prediction = null;
    let confidence = 0;
    
    if (lastRun.len >= 5) {
        if (lastRun.len >= 8) { prediction = lastRun.val === 'T' ? 'X' : 'T'; confidence = 0.8; }
        else if (lastRun.len >= 5 && lastRun.len <= 7) {
            const avgRunLength = avg(runs.map(r => r.len));
            if (lastRun.len > avgRunLength * 1.8) { prediction = lastRun.val === 'T' ? 'X' : 'T'; confidence = 0.65; }
            else { prediction = lastRun.val; confidence = 0.6; }
        }
    }
    
    if (!prediction && runs.length >= 5) {
        const last5Runs = runs.slice(-5);
        const lengths = last5Runs.map(r => r.len);
        if (lengths[0] === 1 && lengths[1] === 1 && lengths[2] >= 3) {
            if (lastRun.len >= 3) { prediction = lastRun.val === 'T' ? 'X' : 'T'; confidence = 0.7; }
        }
    }
    
    if (!prediction && runs.length >= 8) {
        const recentRuns = runs.slice(-8);
        const runLengths = recentRuns.map(r => r.len);
        const meanLength = avg(runLengths);
        const stdLength = Math.sqrt(avg(runLengths.map(l => Math.pow(l - meanLength, 2))));
        if (lastRun.len > meanLength + (stdLength * 1.5)) {
            prediction = lastRun.val === 'T' ? 'X' : 'T';
            confidence = 0.6;
        }
    }
    
    return confidence > 0.55 ? prediction : null;
}

function algoH_AdaptiveMarkov(history) {
    if (history.length < 25) return null;
    const tx = history.map(h => h.tx);
    const models = [
        { type: 'markov', orders: [2, 3, 4] },
        { type: 'frequency', lookbacks: [10, 20, 30] },
        { type: 'momentum', windows: [5, 10, 15] }
    ];
    let ensembleVotes = { T: 0, X: 0 };
    
    for (const model of models) {
        if (model.type === 'markov') {
            for (const order of model.orders) {
                if (tx.length < order + 5) continue;
                const transitions = {};
                for (let i = 0; i <= tx.length - order - 1; i++) {
                    const key = tx.slice(i, i + order).join('');
                    const next = tx[i + order];
                    if (!transitions[key]) transitions[key] = { T: 0, X: 0 };
                    transitions[key][next]++;
                }
                const lastKey = tx.slice(-order).join('');
                const counts = transitions[lastKey];
                if (counts && counts.T + counts.X >= 2) {
                    const pred = counts.T > counts.X ? 'T' : 'X';
                    const confidence = Math.abs(counts.T - counts.X) / (counts.T + counts.X);
                    ensembleVotes[pred] += confidence * (order / 10);
                }
            }
        }
        if (model.type === 'frequency') {
            for (const lookback of model.lookbacks) {
                if (tx.length < lookback) continue;
                const recent = tx.slice(-lookback);
                const tCount = recent.filter(t => t === 'T').length;
                const xCount = recent.filter(t => t === 'X').length;
                if (Math.abs(tCount - xCount) > lookback * 0.2) {
                    const pred = tCount > xCount ? 'X' : 'T';
                    const confidence = Math.abs(tCount - xCount) / lookback;
                    ensembleVotes[pred] += confidence * 0.5;
                }
            }
        }
        if (model.type === 'momentum') {
            for (const window of model.windows) {
                if (tx.length < window * 2) continue;
                const firstHalf = tx.slice(-window * 2, -window);
                const secondHalf = tx.slice(-window);
                const firstT = firstHalf.filter(t => t === 'T').length;
                const firstX = firstHalf.filter(t => t === 'X').length;
                const secondT = secondHalf.filter(t => t === 'T').length;
                const secondX = secondHalf.filter(t => t === 'X').length;
                const momentumT = secondT - firstT;
                const momentumX = secondX - firstX;
                if (Math.abs(momentumT - momentumX) > window * 0.3) {
                    const pred = momentumT > momentumX ? 'T' : 'X';
                    const confidence = Math.abs(momentumT - momentumX) / window;
                    ensembleVotes[pred] += confidence * 0.3;
                }
            }
        }
    }
    
    if (ensembleVotes.T + ensembleVotes.X > 0.3) {
        return ensembleVotes.T > ensembleVotes.X ? 'T' : 'X';
    }
    return null;
}

function algoI_PatternMaster(history) {
    if (history.length < 35) return null;
    const features = extractFeatures(history);
    const { runs, tx } = features;
    if (runs.length < 5) return null;
    const recentRuns = runs.slice(-Math.min(8, runs.length));
    const runLengths = recentRuns.map(r => r.len);
    const runValues = recentRuns.map(r => r.val);
    let patternStrength = { T: 0, X: 0 };
    
    const runPattern = runLengths.join('');
    const valuePattern = runValues.join('');
    const patternLibrary = [
        { pattern: '12121', prediction: valuePattern[valuePattern.length-1] === 'T' ? 'X' : 'T', strength: 0.7 },
        { pattern: '21212', prediction: valuePattern[valuePattern.length-1] === 'T' ? 'T' : 'X', strength: 0.7 },
        { pattern: '13131', prediction: valuePattern[valuePattern.length-1], strength: 0.6 },
        { pattern: '31313', prediction: valuePattern[valuePattern.length-1] === 'T' ? 'X' : 'T', strength: 0.6 },
        { pattern: '24242', prediction: valuePattern[valuePattern.length-1] === 'T' ? 'X' : 'T', strength: 0.65 },
        { pattern: '42424', prediction: valuePattern[valuePattern.length-1], strength: 0.65 }
    ];
    
    for (const libPattern of patternLibrary) {
        if (runPattern.includes(libPattern.pattern)) patternStrength[libPattern.prediction] += libPattern.strength;
    }
    
    const last10Tx = tx.slice(-10).join('');
    const txPatterns = [
        { pattern: 'TXTXTXTX', prediction: 'X', strength: 0.8 },
        { pattern: 'XTXTXTXT', prediction: 'T', strength: 0.8 },
        { pattern: 'TTXXTTXX', prediction: 'X', strength: 0.7 },
        { pattern: 'XXTTXXTT', prediction: 'T', strength: 0.7 }
    ];
    
    for (const txPattern of txPatterns) {
        if (last10Tx.includes(txPattern.pattern)) patternStrength[txPattern.prediction] += txPattern.strength;
    }
    
    const lastRun = recentRuns[recentRuns.length - 1];
    if (lastRun) {
        const avgRecentLength = avg(runLengths);
        if (lastRun.len > avgRecentLength * 1.8) patternStrength[lastRun.val === 'T' ? 'X' : 'T'] += 0.5;
        else if (lastRun.len < avgRecentLength * 0.6) patternStrength[lastRun.val] += 0.4;
    }
    
    if (patternStrength.T > 0 || patternStrength.X > 0) {
        const totalStrength = patternStrength.T + patternStrength.X;
        const confidence = Math.abs(patternStrength.T - patternStrength.X) / totalStrength;
        if (confidence > 0.3) return patternStrength.T > patternStrength.X ? 'T' : 'X';
    }
    return null;
}

function algoJ_QuantumEntropy(history) {
    if (history.length < 40) return null;
    const features = extractFeatures(history);
    const { entropy: e, tx, runs } = features;
    const entropyWindows = [10, 20, 30];
    let entropyPredictions = { T: 0, X: 0 };
    
    for (const window of entropyWindows) {
        if (tx.length < window) continue;
        const windowTx = tx.slice(-window);
        const windowEntropy = entropy(windowTx);
        
        if (windowEntropy < 0.3) {
            const lastVal = windowTx[windowTx.length - 1];
            entropyPredictions[lastVal] += 0.6;
        } else if (windowEntropy > 0.9) {
            const tCount = windowTx.filter(t => t === 'T').length;
            const xCount = windowTx.filter(t => t === 'X').length;
            if (tCount > xCount) entropyPredictions['X'] += 0.5;
            else if (xCount > tCount) entropyPredictions['T'] += 0.5;
        } else {
            const recentRuns = runs.slice(-4);
            if (recentRuns.length >= 3) {
                const runLengths = recentRuns.map(r => r.len);
                const isEmergingPattern = Math.max(...runLengths) - Math.min(...runLengths) <= 2;
                if (isEmergingPattern) {
                    const lastVal = tx[tx.length - 1];
                    entropyPredictions[lastVal] += 0.4;
                }
            }
        }
    }
    
    if (e < 0.4) {
        const lastVal = tx[tx.length - 1];
        entropyPredictions[lastVal] += 0.3;
    } else if (e > 0.95) {
        const recentT = tx.slice(-20).filter(t => t === 'T').length;
        const recentX = tx.slice(-20).filter(t => t === 'X').length;
        if (recentT > recentX) entropyPredictions['X'] += 0.4;
        else if (recentX > recentT) entropyPredictions['T'] += 0.4;
    }
    
    if (entropyPredictions.T + entropyPredictions.X > 0.4) {
        return entropyPredictions.T > entropyPredictions.X ? 'T' : 'X';
    }
    return null;
}

// --- Thuật toán mới (10 cái siêu cấp) ---
function algoK_HyperMarkov(history) {
    if (history.length < 25) return null;
    const tx = history.map(h => h.tx);
    let predictions = [];
    for (let order = 3; order <= Math.min(6, Math.floor(history.length / 5)); order++) {
        const transitions = new Map();
        for (let i = 0; i <= tx.length - order - 1; i++) {
            const key = tx.slice(i, i + order).join('');
            const next = tx[i + order];
            if (!transitions.has(key)) transitions.set(key, { T: 0, X: 0, total: 0 });
            const entry = transitions.get(key);
            entry[next]++; entry.total++;
        }
        const lastKey = tx.slice(-order).join('');
        const probs = transitions.get(lastKey);
        if (probs && probs.total >= 2) {
            const confidence = Math.abs(probs.T - probs.X) / probs.total;
            const pred = probs.T > probs.X ? 'T' : 'X';
            predictions.push({ pred, confidence, order });
        }
    }
    if (predictions.length === 0) return null;
    predictions.sort((a,b) => b.confidence - a.confidence);
    const best = predictions[0];
    return best.confidence > 0.4 ? best.pred : null;
}

function algoL_CNN(history) {
    if (history.length < 50) return null;
    const tx = history.map(h => h.tx);
    const totals = history.map(h => h.total);
    const kernels = [
        { size: 3, weights: [0.5, 0.3, 0.2] },
        { size: 5, weights: [0.3, 0.25, 0.2, 0.15, 0.1] },
        { size: 7, weights: [0.25, 0.2, 0.15, 0.12, 0.1, 0.09, 0.09] }
    ];
    let cnnScore = { T: 0, X: 0 };
    for (const kernel of kernels) {
        if (tx.length < kernel.size + 5) continue;
        let convResult = [];
        for (let i = 0; i <= tx.length - kernel.size; i++) {
            let weightedSum = 0;
            for (let j = 0; j < kernel.size; j++) {
                const val = tx[i + j] === 'T' ? 1 : 0;
                weightedSum += val * kernel.weights[j];
            }
            convResult.push(weightedSum > 0.5 ? 'T' : 'X');
        }
        const lastConv = convResult[convResult.length - 1];
        if (lastConv === 'T') cnnScore.T += 0.3;
        else cnnScore.X += 0.3;
        const recentPool = convResult.slice(-5);
        const tPool = recentPool.filter(v => v === 'T').length;
        const xPool = recentPool.filter(v => v === 'X').length;
        if (tPool > xPool) cnnScore.T += 0.2 * (tPool / 5);
        else cnnScore.X += 0.2 * (xPool / 5);
    }
    const totalKernel = [0.4, 0.3, 0.2, 0.1];
    if (totals.length >= 4) {
        let trendScore = 0;
        for (let i = 0; i < 4; i++) {
            trendScore += (totals[totals.length - 1 - i] - 10.5) * totalKernel[i];
        }
        if (trendScore > 1.5) cnnScore.X += 0.25;
        else if (trendScore < -1.5) cnnScore.T += 0.25;
    }
    const total = cnnScore.T + cnnScore.X;
    if (total > 0.5 && Math.abs(cnnScore.T - cnnScore.X) > 0.15) {
        return cnnScore.T > cnnScore.X ? 'T' : 'X';
    }
    return null;
}

function algoM_LogisticRegression(history) {
    if (history.length < 40) return null;
    const features = extractFeatures(history);
    const { tx, totals, runs } = features;
    let X_features = [];
    let y_labels = [];
    for (let i = 20; i < tx.length - 1; i++) {
        const window = tx.slice(i-20, i);
        const totalsWindow = totals.slice(i-20, i);
        const tCount = window.filter(v => v === 'T').length;
        const xCount = window.filter(v => v === 'X').length;
        const meanTotal = avg(totalsWindow);
        const recentTrend = totalsWindow[totalsWindow.length-1] - totalsWindow[0];
        const volatility = Math.sqrt(avg(totalsWindow.map(t => Math.pow(t - meanTotal, 2))));
        let runsWindow = [], cur = window[0], len = 1;
        for (let j = 1; j < window.length; j++) {
            if (window[j] === cur) len++;
            else { runsWindow.push(len); cur = window[j]; len = 1; }
        }
        runsWindow.push(len);
        const avgRun = avg(runsWindow);
        const maxRun = Math.max(...runsWindow);
        X_features.push([tCount, xCount, meanTotal, recentTrend, volatility, avgRun, maxRun]);
        y_labels.push(tx[i+1] === 'T' ? 1 : 0);
    }
    if (X_features.length < 10) return null;
    let weights = new Array(7).fill(0);
    const learningRate = 0.01;
    const epochs = 100;
    for (let epoch = 0; epoch < epochs; epoch++) {
        let gradients = new Array(7).fill(0);
        for (let i = 0; i < X_features.length; i++) {
            let linear = 0;
            for (let j = 0; j < 7; j++) linear += weights[j] * X_features[i][j];
            const sigmoid = 1 / (1 + Math.exp(-linear));
            const error = y_labels[i] - sigmoid;
            for (let j = 0; j < 7; j++) gradients[j] += error * X_features[i][j];
        }
        for (let j = 0; j < 7; j++) weights[j] += learningRate * gradients[j] / X_features.length;
    }
    const lastWindow = tx.slice(-20);
    const lastTotals = totals.slice(-20);
    const tCountLast = lastWindow.filter(v => v === 'T').length;
    const xCountLast = lastWindow.filter(v => v === 'X').length;
    const meanTotalLast = avg(lastTotals);
    const recentTrendLast = lastTotals[lastTotals.length-1] - lastTotals[0];
    const volatilityLast = Math.sqrt(avg(lastTotals.map(t => Math.pow(t - meanTotalLast, 2))));
    let runsLast = [], curLast = lastWindow[0], lenLast = 1;
    for (let j = 1; j < lastWindow.length; j++) {
        if (lastWindow[j] === curLast) lenLast++;
        else { runsLast.push(lenLast); curLast = lastWindow[j]; lenLast = 1; }
    }
    runsLast.push(lenLast);
    const avgRunLast = avg(runsLast);
    const maxRunLast = Math.max(...runsLast);
    let predictionLinear = 0;
    const lastFeatures = [tCountLast, xCountLast, meanTotalLast, recentTrendLast, volatilityLast, avgRunLast, maxRunLast];
    for (let j = 0; j < 7; j++) predictionLinear += weights[j] * lastFeatures[j];
    const probability = 1 / (1 + Math.exp(-predictionLinear));
    return probability > 0.55 ? 'T' : (probability < 0.45 ? 'X' : null);
}

function algoN_RandomForest(history) {
    if (history.length < 60) return null;
    const features = extractFeatures(history);
    const { tx, totals, runs } = features;
    const nTrees = 7;
    let votes = { T: 0, X: 0 };
    for (let tree = 0; tree < nTrees; tree++) {
        const sampleSize = Math.min(30, Math.floor(history.length * 0.7));
        const indices = [];
        for (let i = 0; i < sampleSize; i++) {
            indices.push(Math.floor(Math.random() * (history.length - 10)) + 5);
        }
        const featureSet = {
            useTotals: tree % 2 === 0,
            useRuns: tree % 3 !== 0,
            useLastPattern: tree % 4 !== 1
        };
        let tCount = 0, xCount = 0;
        for (const idx of indices) {
            if (idx >= tx.length - 1) continue;
            let score = 0;
            if (featureSet.useTotals && totals[idx] > 11) score -= 0.3;
            else if (featureSet.useTotals && totals[idx] < 10) score += 0.3;
            if (featureSet.useRuns) {
                const currentRun = runs[runs.length - 1]?.len || 1;
                if (currentRun >= 4) score += 0.2;
                if (currentRun >= 6) score -= 0.2;
            }
            if (featureSet.useLastPattern && idx >= 3) {
                const last3 = tx.slice(idx-3, idx).join('');
                if (last3 === 'TTT') score += 0.25;
                if (last3 === 'XXX') score -= 0.25;
                if (last3 === 'TXT') score -= 0.15;
                if (last3 === 'XTX') score += 0.15;
            }
            if (score > 0) tCount++;
            else if (score < 0) xCount++;
        }
        if (tCount > xCount) votes.T++;
        else if (xCount > tCount) votes.X++;
    }
    if (votes.T + votes.X > 3 && Math.abs(votes.T - votes.X) >= 2) {
        return votes.T > votes.X ? 'T' : 'X';
    }
    return null;
}

function algoO_CycleAnalysis(history) {
    if (history.length < 80) return null;
    const tx = history.map(h => h.tx);
    let bestCycle = null;
    let bestCorrelation = -1;
    for (let cycle = 2; cycle <= Math.min(20, Math.floor(history.length / 3)); cycle++) {
        let correlation = 0;
        let comparisons = 0;
        for (let i = cycle; i < tx.length - cycle; i++) {
            if (tx[i] === tx[i - cycle]) correlation++;
            comparisons++;
        }
        const cycleStrength = correlation / comparisons;
        if (cycleStrength > bestCorrelation && cycleStrength > 0.6) {
            bestCorrelation = cycleStrength;
            bestCycle = cycle;
        }
    }
    if (bestCycle && bestCorrelation > 0.65) {
        const prediction = tx[tx.length - bestCycle];
        const recentCycleMatch = tx.slice(-bestCycle*2).filter((v,i) => 
            i >= bestCycle && v === tx[i - bestCycle]
        ).length / bestCycle;
        if (recentCycleMatch > 0.6) return prediction;
    }
    return null;
}

function algoP_BayesianInference(history) {
    if (history.length < 30) return null;
    const tx = history.map(h => h.tx);
    const totals = history.map(h => h.total);
    let priorT = 0.5, priorX = 0.5;
    const recentTx = tx.slice(-20);
    priorT = recentTx.filter(v => v === 'T').length / 20;
    priorX = 1 - priorT;
    let likelihoodT = 1, likelihoodX = 1;
    const lastTx = tx[tx.length - 1];
    if (lastTx === 'T') {
        const afterT_ProbT = tx.slice(0, -1).filter((v,i) => v === 'T' && tx[i+1] === 'T').length / 
                            Math.max(1, tx.filter(v => v === 'T').length);
        const afterT_ProbX = 1 - afterT_ProbT;
        likelihoodT *= afterT_ProbT;
        likelihoodX *= afterT_ProbX;
    } else {
        const afterX_ProbT = tx.slice(0, -1).filter((v,i) => v === 'X' && tx[i+1] === 'T').length / 
                            Math.max(1, tx.filter(v => v === 'X').length);
        const afterX_ProbX = 1 - afterX_ProbT;
        likelihoodT *= afterX_ProbT;
        likelihoodX *= afterX_ProbX;
    }
    const last3Totals = totals.slice(-3);
    const totalTrend = last3Totals[2] - last3Totals[0];
    if (totalTrend > 2) {
        likelihoodT *= 0.7;
        likelihoodX *= 1.3;
    } else if (totalTrend < -2) {
        likelihoodT *= 1.3;
        likelihoodX *= 0.7;
    }
    let currentRun = 1;
    for (let i = tx.length - 2; i >= 0; i--) {
        if (tx[i] === lastTx) currentRun++;
        else break;
    }
    if (currentRun >= 4) {
        const breakProb = 0.6;
        if (lastTx === 'T') {
            likelihoodT *= (1 - breakProb);
            likelihoodX *= breakProb;
        } else {
            likelihoodT *= breakProb;
            likelihoodX *= (1 - breakProb);
        }
    }
    const posteriorT = (likelihoodT * priorT) / (likelihoodT * priorT + likelihoodX * priorX);
    if (posteriorT > 0.6) return 'T';
    if (posteriorT < 0.4) return 'X';
    return null;
}

function algoQ_ChaosTheory(history) {
    if (history.length < 50) return null;
    const tx = history.map(h => h.tx);
    let divergence = [];
    for (let delta = 1; delta <= 5; delta++) {
        let differences = 0;
        let count = 0;
        for (let i = 0; i < tx.length - delta; i++) {
            if (tx[i] !== tx[i + delta]) differences++;
            count++;
        }
        divergence.push(differences / count);
    }
    const embeddingDim = 3;
    const delay = 2;
    let phaseSpace = [];
    for (let i = 0; i <= tx.length - embeddingDim * delay; i++) {
        const point = [];
        for (let d = 0; d < embeddingDim; d++) {
            point.push(tx[i + d * delay] === 'T' ? 1 : 0);
        }
        phaseSpace.push(point);
    }
    const lastPoint = phaseSpace[phaseSpace.length - 1];
    let nearestNeighbor = null;
    let minDistance = Infinity;
    for (let i = 0; i < phaseSpace.length - 1; i++) {
        const point = phaseSpace[i];
        let distance = 0;
        for (let j = 0; j < embeddingDim; j++) {
            distance += Math.pow(point[j] - lastPoint[j], 2);
        }
        distance = Math.sqrt(distance);
        if (distance < minDistance && distance > 0) {
            minDistance = distance;
            nearestNeighbor = i;
        }
    }
    if (nearestNeighbor !== null && minDistance < 0.5) {
        const nextIdx = nearestNeighbor + 1;
        if (nextIdx < tx.length) {
            const prediction = tx[nextIdx];
            const divergenceRate = divergence[divergence.length - 1];
            const confidence = Math.max(0, 0.8 - divergenceRate);
            if (confidence > 0.5) return prediction;
        }
    }
    return null;
}

function algoR_QuantumTunneling(history) {
    if (history.length < 40) return null;
    const features = extractFeatures(history);
    const { tx, entropy: e, runs } = features;
    let quantumState = { T: 0.5, X: 0.5 };
    const operators = [
        { name: 'entropy', threshold: 0.5, collapse: e < 0.4 ? 'T' : (e > 0.7 ? 'X' : null) },
        { name: 'run_operator', collapse: runs.length > 0 && runs[runs.length-1].len >= 4 ? runs[runs.length-1].val : null },
        { name: 'balance_operator', collapse: (() => {
            const recent20 = tx.slice(-20);
            const tCount = recent20.filter(v => v === 'T').length;
            if (tCount >= 14) return 'X';
            if (tCount <= 6) return 'T';
            return null;
        })() }
    ];
    for (const op of operators) {
        if (op.collapse) {
            quantumState[op.collapse] += 0.3;
            quantumState[op.collapse === 'T' ? 'X' : 'T'] -= 0.15;
        }
    }
    const tunnelingProb = Math.min(0.3, Math.max(0.05, 1 - e));
    quantumState.T = quantumState.T * (1 - tunnelingProb) + quantumState.X * tunnelingProb;
    quantumState.X = quantumState.X * (1 - tunnelingProb) + quantumState.T * tunnelingProb;
    const total = quantumState.T + quantumState.X;
    quantumState.T /= total;
    quantumState.X /= total;
    if (Math.abs(quantumState.T - quantumState.X) > 0.2) {
        return quantumState.T > quantumState.X ? 'T' : 'X';
    }
    return null;
}

function algoS_DeepResidual(history) {
    if (history.length < 70) return null;
    const tx = history.map(h => h.tx);
    const totals = history.map(h => h.total);
    let residual = { T: 0, X: 0 };
    const blocks = [
        { weights: [0.4, 0.3, 0.2, 0.1], lookback: 4 },
        { weights: [0.35, 0.25, 0.2, 0.12, 0.08], lookback: 5 },
        { weights: [0.3, 0.25, 0.2, 0.15, 0.07, 0.03], lookback: 6 }
    ];
    for (const block of blocks) {
        let weightedSum = 0;
        for (let i = 0; i < block.lookback && i < totals.length; i++) {
            const totalValue = totals[totals.length - 1 - i];
            weightedSum += (totalValue - 10.5) * block.weights[i];
        }
        const rawPrediction = weightedSum > 0 ? 'X' : 'T';
        const confidence = Math.min(0.8, Math.abs(weightedSum) / 10);
        if (rawPrediction === 'T') residual.T += confidence;
        else residual.X += confidence;
        const skipPred = tx[tx.length - 1 - block.lookback];
        if (skipPred === 'T') residual.T += 0.15;
        else residual.X += 0.15;
    }
    const last5Tx = tx.slice(-5);
    const last5T = last5Tx.filter(v => v === 'T').length;
    if (last5T >= 4) residual.T += 0.2;
    else if (last5T <= 1) residual.X += 0.2;
    if (Math.abs(residual.T - residual.X) > 0.3) {
        return residual.T > residual.X ? 'T' : 'X';
    }
    return null;
}

function algoT_GeneticAlgorithm(history) {
    if (history.length < 100) return null;
    const tx = history.map(h => h.tx);
    const populationSize = 20;
    let population = [];
    for (let i = 0; i < populationSize; i++) {
        population.push({
            lookback: Math.floor(Math.random() * 15) + 5,
            threshold: Math.random() * 0.4 + 0.3,
            bias: Math.random() * 0.6 - 0.3,
            weights: Array(5).fill(0).map(() => Math.random() * 2 - 1)
        });
    }
    const trainSize = Math.min(60, history.length - 20);
    for (const individual of population) {
        let correct = 0;
        let total = 0;
        for (let i = trainSize; i < history.length - 1; i++) {
            const windowTx = tx.slice(i - individual.lookback, i);
            let score = individual.bias;
            for (let j = 0; j < Math.min(5, windowTx.length); j++) {
                score += (windowTx[j] === 'T' ? 1 : -1) * individual.weights[j];
            }
            const prediction = score > individual.threshold ? 'T' : 'X';
            if (prediction === tx[i]) correct++;
            total++;
        }
        individual.fitness = correct / total;
    }
    population.sort((a,b) => b.fitness - a.fitness);
    const best = population[0];
    if (best.fitness < 0.55) return null;
    const lastWindowTx = tx.slice(-best.lookback);
    let finalScore = best.bias;
    for (let j = 0; j < Math.min(5, lastWindowTx.length); j++) {
        finalScore += (lastWindowTx[j] === 'T' ? 1 : -1) * best.weights[j];
    }
    return finalScore > best.threshold ? 'T' : 'X';
}

// ==================== DANH SÁCH TẤT CẢ THUẬT TOÁN ====================
const ALL_ALGS = [
    { id: 'algo5_freqrebalance', fn: (h) => algo5_freqRebalance(h) },
    { id: 'a_markov', fn: (h) => algoA_markov(h) },
    { id: 'b_ngram', fn: (h) => algoB_ngram(h) },
    { id: 's_neo_pattern', fn: (h) => algoS_NeoPattern(h) },
    { id: 'f_super_deep_analysis', fn: (h) => algoF_SuperDeepAnalysis(h) },
    { id: 'e_transformer', fn: (h) => algoE_Transformer(h) },
    { id: 'g_super_bridge_predictor', fn: (h) => algoG_SuperBridgePredictor(h) },
    { id: 'h_adaptive_markov', fn: (h) => algoH_AdaptiveMarkov(h) },
    { id: 'i_pattern_master', fn: (h) => algoI_PatternMaster(h) },
    { id: 'j_quantum_entropy', fn: (h) => algoJ_QuantumEntropy(h) },
    { id: 'k_hyper_markov', fn: algoK_HyperMarkov },
    { id: 'l_cnn_simulator', fn: algoL_CNN },
    { id: 'm_logistic_regression', fn: algoM_LogisticRegression },
    { id: 'n_random_forest', fn: algoN_RandomForest },
    { id: 'o_cycle_analysis', fn: algoO_CycleAnalysis },
    { id: 'p_bayesian', fn: algoP_BayesianInference },
    { id: 'q_chaos_theory', fn: algoQ_ChaosTheory },
    { id: 'r_quantum_tunneling', fn: algoR_QuantumTunneling },
    { id: 's_deep_residual', fn: algoS_DeepResidual },
    { id: 't_genetic', fn: algoT_GeneticAlgorithm }
];

// ==================== GODLIKE ENSEMBLE ====================
class GodlikeEnsemble {
    constructor(algorithms, opts = {}) {
        this.algs = algorithms;
        this.weights = {};
        this.metaWeights = {};
        this.emaAlpha = opts.emaAlpha ?? 0.04;
        this.minWeight = opts.minWeight ?? 0.005;
        this.historyWindow = opts.historyWindow ?? 1000;
        this.performanceHistory = {};
        this.patternMemory = {};
        this.algorithmClusters = this.createClusters();
        this.adaptiveThreshold = 0.55;
        for (const a of algorithms) {
            this.weights[a.id] = 1.0;
            this.metaWeights[a.id] = 0.5;
            this.performanceHistory[a.id] = [];
        }
    }
    
    createClusters() {
        return {
            markov_cluster: ['a_markov', 'k_hyper_markov', 'h_adaptive_markov'],
            pattern_cluster: ['i_pattern_master', 's_neo_pattern', 'j_quantum_entropy'],
            ml_cluster: ['m_logistic_regression', 'n_random_forest', 't_genetic'],
            advanced_cluster: ['l_cnn_simulator', 'o_cycle_analysis', 's_deep_residual'],
            quantum_cluster: ['q_chaos_theory', 'r_quantum_tunneling', 'p_bayesian'],
            classical_cluster: ['algo5_freqrebalance', 'b_ngram', 'g_super_bridge_predictor'],
            deep_cluster: ['e_transformer', 'f_super_deep_analysis']
        };
    }
    
    fitInitial(history) {
        const window = lastN(history, Math.min(this.historyWindow, history.length));
        if (window.length < 40) return;
        const algScores = {};
        for (const a of this.algs) algScores[a.id] = 0;
        const evalSamples = Math.min(60, window.length - 20);
        const startIdx = window.length - evalSamples;
        for (let i = Math.max(20, startIdx); i < window.length; i++) {
            const prefix = window.slice(0, i);
            const actual = window[i].tx;
            const features = extractFeatures(prefix);
            const patternType = detectPatternType(features.runs);
            for (const a of this.algs) {
                try {
                    const pred = a.fn(prefix);
                    if (pred && pred === actual) {
                        algScores[a.id] += 1;
                        if (patternType) {
                            const key = `${a.id}_${patternType}`;
                            this.patternMemory[key] = (this.patternMemory[key] || 0) + 1;
                        }
                    }
                } catch (e) {}
            }
        }
        let totalWeight = 0;
        for (const id in algScores) {
            const score = algScores[id] || 0;
            const accuracy = score / evalSamples;
            const baseWeight = 0.2 + (accuracy * 0.8);
            this.weights[id] = Math.max(this.minWeight, baseWeight);
            totalWeight += this.weights[id];
        }
        if (totalWeight > 0) {
            for (const id in this.weights) this.weights[id] /= totalWeight;
        }
        this.updateMetaWeights(history.slice(-Math.min(100, history.length)));
        console.log(`GODLIKE ENSEMBLE: ${Object.keys(this.weights).length} thuật toán, adaptive threshold = ${this.adaptiveThreshold}`);
    }
    
    updateMetaWeights(history) {
        const clusterPerformance = {};
        for (const clusterName in this.algorithmClusters) {
            clusterPerformance[clusterName] = 0;
            let clusterVotes = 0;
            for (const algId of this.algorithmClusters[clusterName]) {
                const recentPerf = lastN(this.performanceHistory[algId] || [], 30);
                const clusterAcc = recentPerf.reduce((a,b) => a + b, 0) / Math.max(1, recentPerf.length);
                clusterPerformance[clusterName] += clusterAcc;
                clusterVotes++;
            }
            clusterPerformance[clusterName] /= clusterVotes;
        }
        const overallPerf = Object.values(clusterPerformance).reduce((a,b) => a + b, 0) / Object.keys(clusterPerformance).length;
        this.adaptiveThreshold = Math.max(0.52, Math.min(0.7, 0.6 - (overallPerf - 0.5) * 0.3));
        const bestCluster = Object.entries(clusterPerformance).sort((a,b) => b[1] - a[1])[0];
        if (bestCluster && bestCluster[1] > 0.6) {
            for (const algId of this.algorithmClusters[bestCluster[0]]) {
                if (this.weights[algId]) this.weights[algId] *= 1.1;
            }
        }
    }
    
    updateWithOutcome(historyPrefix, actualTx) {
        if (historyPrefix.length < 15) return;
        const features = extractFeatures(historyPrefix);
        const patternType = detectPatternType(features.runs);
        for (const a of this.algs) {
            try {
                const pred = a.fn(historyPrefix);
                const correct = pred === actualTx ? 1 : 0;
                this.performanceHistory[a.id].push(correct);
                if (this.performanceHistory[a.id].length > 80) this.performanceHistory[a.id].shift();
                const recentPerf = lastN(this.performanceHistory[a.id], 30);
                let weightedAccuracy = 0;
                let weightSum = 0;
                for (let i = 0; i < recentPerf.length; i++) {
                    const weight = Math.pow(0.92, recentPerf.length - i - 1);
                    weightedAccuracy += recentPerf[i] * weight;
                    weightSum += weight;
                }
                const recentAccuracy = weightSum > 0 ? weightedAccuracy / weightSum : 0.5;
                let patternBonus = 0;
                if (patternType) {
                    const key = `${a.id}_${patternType}`;
                    const patternSuccess = this.patternMemory[key] || 0;
                    if (patternSuccess > 5) patternBonus = 0.12;
                }
                let clusterBoost = 0;
                for (const clusterName in this.algorithmClusters) {
                    if (this.algorithmClusters[clusterName].includes(a.id)) {
                        const clusterPerf = this.performanceHistory[a.id].slice(-20).reduce((s,v)=>s+v,0)/20;
                        if (clusterPerf > 0.65) clusterBoost = 0.08;
                        break;
                    }
                }
                const targetWeight = Math.min(1.2, recentAccuracy + patternBonus + clusterBoost + 0.08);
                const currentWeight = this.weights[a.id] || this.minWeight;
                const newWeight = this.emaAlpha * targetWeight + (1 - this.emaAlpha) * currentWeight;
                this.weights[a.id] = Math.max(this.minWeight, Math.min(1.8, newWeight));
                if (patternType && correct) {
                    const key = `${a.id}_${patternType}`;
                    this.patternMemory[key] = (this.patternMemory[key] || 0) + 1;
                }
            } catch (e) {
                this.weights[a.id] = Math.max(this.minWeight, (this.weights[a.id] || 1) * 0.9);
            }
        }
        const sumWeights = Object.values(this.weights).reduce((s, w) => s + w, 0);
        if (sumWeights > 0) {
            for (const id in this.weights) this.weights[id] /= sumWeights;
        }
        if (historyPrefix.length % 20 === 0) this.updateMetaWeights(historyPrefix);
    }
    
    predict(history) {
        if (history.length < 15) {
            return { prediction: 'tài', confidence: 0.5, rawPrediction: 'T' };
        }
        const features = extractFeatures(history);
        const patternType = detectPatternType(features.runs);
        const votes = { T: 0, X: 0 };
        let algorithmDetails = [];
        let totalWeight = 0;
        for (const a of this.algs) {
            try {
                const pred = a.fn(history);
                if (!pred) continue;
                let weight = this.weights[a.id] || this.minWeight;
                if (patternType) {
                    const key = `${a.id}_${patternType}`;
                    const patternSuccess = this.patternMemory[key] || 0;
                    if (patternSuccess > 3) weight *= 1.25;
                }
                votes[pred] += weight;
                totalWeight += weight;
                algorithmDetails.push({ algorithm: a.id, prediction: pred, weight });
            } catch (e) {}
        }
        if (votes.T === 0 && votes.X === 0) {
            const fallback = (history[history.length-1]?.tx === 'T' ? 'X' : 'T') || 'T';
            return { prediction: fallback === 'T' ? 'tài' : 'xỉu', confidence: 0.5, rawPrediction: fallback };
        }
        const { key: best, val: bestVal } = majority(votes);
        const baseConfidence = bestVal / totalWeight;
        let consensusBonus = 0;
        const tAlgorithms = algorithmDetails.filter(a => a.prediction === 'T').length;
        const xAlgorithms = algorithmDetails.filter(a => a.prediction === 'X').length;
        const totalAlgorithms = tAlgorithms + xAlgorithms;
        if (totalAlgorithms > 0) {
            const consensusRatio = Math.max(tAlgorithms, xAlgorithms) / totalAlgorithms;
            if (consensusRatio > 0.7) consensusBonus = 0.12;
            if (consensusRatio > 0.85) consensusBonus = 0.2;
        }
        let patternBonus = 0;
        if (patternType && patternType.includes('alternating')) patternBonus = 0.08;
        if (patternType === 'super_long_run') patternBonus = -0.05;
        const confidence = Math.min(0.97, Math.max(0.55, baseConfidence + consensusBonus + patternBonus));
        return {
            prediction: best === 'T' ? 'tài' : 'xỉu',
            confidence,
            rawPrediction: best,
            algorithmCount: algorithmDetails.length,
            patternDetected: patternType || 'normal'
        };
    }
}

// ==================== GODLIKE MANAGER ====================
class GodlikeManager {
    constructor(opts = {}) {
        this.history = [];
        this.ensemble = new GodlikeEnsemble(ALL_ALGS, {
            emaAlpha: opts.emaAlpha ?? 0.04,
            historyWindow: opts.historyWindow ?? 1000
        });
        this.currentPrediction = null;
        this.patternHistory = [];
        this.performanceMetrics = { correct: 0, total: 0, last10Correct: [] };
    }
    
    calculateInitialStats() {
        const minStart = 25;
        if (this.history.length < minStart) return;
        const trainSamples = Math.min(80, this.history.length - minStart);
        const startIdx = this.history.length - trainSamples;
        for (let i = Math.max(minStart, startIdx); i < this.history.length; i++) {
            const historyPrefix = this.history.slice(0, i);
            const actualTx = this.history[i].tx;
            this.ensemble.updateWithOutcome(historyPrefix, actualTx);
        }
        console.log(`Đã huấn luyện trên ${trainSamples} mẫu với ${ALL_ALGS.length} thuật toán`);
    }
    
    loadInitial(lines) {
        this.history = lines;
        this.ensemble.fitInitial(this.history);
        this.calculateInitialStats();
        this.currentPrediction = this.getPrediction();
        console.log(`Đã tải ${lines.length} phiên lịch sử. Hệ thống GODLIKE AI sẵn sàng.`);
        const nextSession = this.history.at(-1) ? this.history.at(-1).session + 1 : 'N/A';
        console.log(`Dự đoán phiên ${nextSession}: ${this.currentPrediction.prediction} (${(this.currentPrediction.confidence * 100).toFixed(0)}%)`);
        if (this.currentPrediction.patternDetected) {
            console.log(`Pattern phát hiện: ${this.currentPrediction.patternDetected}`);
        }
    }
    
    pushRecord(record) {
        this.history.push(record);
        if (this.currentPrediction && this.currentPrediction.rawPrediction === record.tx) {
            this.performanceMetrics.correct++;
            this.performanceMetrics.last10Correct.push(1);
        } else if (this.currentPrediction) {
            this.performanceMetrics.last10Correct.push(0);
        }
        this.performanceMetrics.total++;
        if (this.performanceMetrics.last10Correct.length > 10) this.performanceMetrics.last10Correct.shift();
        if (this.history.length > 800) this.history = this.history.slice(-700);
        const prefix = this.history.slice(0, -1);
        if (prefix.length >= 15) this.ensemble.updateWithOutcome(prefix, record.tx);
        this.currentPrediction = this.getPrediction();
        const features = extractFeatures(this.history);
        const patternType = detectPatternType(features.runs);
        if (patternType) {
            this.patternHistory.push(patternType);
            if (this.patternHistory.length > 30) this.patternHistory.shift();
        }
        const last10Acc = this.performanceMetrics.last10Correct.reduce((a,b)=>a+b,0);
        console.log(`📥 ${record.session} → ${record.result} (${record.tx}) | Dự đoán ${record.session + 1}: ${this.currentPrediction.prediction} (${(this.currentPrediction.confidence * 100).toFixed(0)}%) | Acc 10 gần: ${last10Acc}/10`);
    }
    
    getPrediction() {
        return this.ensemble.predict(this.history);
    }
}

const godlikeManager = new GodlikeManager();

// ==================== API SERVER ====================
const app = fastify({ logger: true });
await app.register(cors, { origin: "*" });

async function fetchAndProcessHistory() {
    try {
        const response = await fetch(API_URL);
        const data = await response.json();
        const newHistory = parseLines(data);
        if (newHistory.length === 0) {
            console.log("⚠️ Không có dữ liệu từ API.");
            return;
        }
        const lastSessionInHistory = newHistory.at(-1);
        if (!currentSessionId) {
            godlikeManager.loadInitial(newHistory);
            txHistory = newHistory;
            currentSessionId = lastSessionInHistory.session;
            console.log(`✅ Đã tải ${newHistory.length} phiên lịch sử.`);
        } else if (lastSessionInHistory.session > currentSessionId) {
            const newRecords = newHistory.filter(r => r.session > currentSessionId);
            for (const record of newRecords) godlikeManager.pushRecord(record);
            txHistory.push(...newRecords);
            if (txHistory.length > 450) txHistory = txHistory.slice(-400);
            currentSessionId = lastSessionInHistory.session;
            if (newRecords.length > 0) console.log(`🆕 Cập nhật ${newRecords.length} phiên. Phiên cuối: ${currentSessionId}`);
        }
    } catch (e) {
        console.error("❌ Lỗi fetch dữ liệu:", e.message);
    }
}

// Khởi động fetch định kỳ
fetchAndProcessHistory();
clearInterval(fetchInterval);
fetchInterval = setInterval(fetchAndProcessHistory, FETCH_INTERVAL_MS);
console.log(`🔄 GODLIKE AI đang chạy với chu kỳ ${FETCH_INTERVAL_MS/1000} giây.`);

// API Endpoints
app.get("/api/taixiumd5/lc79", async () => {
    const lastResult = txHistory.at(-1) || null;
    const currentPrediction = godlikeManager.currentPrediction;
    if (!lastResult || !currentPrediction) {
        return {
            id: "GODLIKE AI v4.0",
            phien_truoc: null,
            xuc_xac1: null,
            xuc_xac2: null,
            xuc_xac3: null,
            tong: null,
            ket_qua: "đang chờ...",
            pattern: "đang phân tích...",
            phien_hien_tai: null,
            du_doan: "chưa có",
            do_tin_cay: "0%",
            so_thuat_toan: 0,
            pattern_detected: "none"
        };
    }
    return {
        id: "GODLIKE AI v4.0 - Siêu Cấp",
        phien_truoc: lastResult.session,
        xuc_xac1: lastResult.dice[0],
        xuc_xac2: lastResult.dice[1],
        xuc_xac3: lastResult.dice[2],
        tong: lastResult.total,
        ket_qua: lastResult.result.toLowerCase(),
        pattern: godlikeManager.patternHistory.slice(-10).join(' → ') || "n/a",
        phien_hien_tai: lastResult.session + 1,
        du_doan: currentPrediction.prediction,
        do_tin_cay: `${(currentPrediction.confidence * 100).toFixed(0)}%`,
        so_thuat_toan: currentPrediction.algorithmCount || 20,
        pattern_detected: currentPrediction.patternDetected || "normal"
    };
});

app.get("/api/taixiumd5/history", async () => { 
    if (!txHistory.length) return { message: "không có dữ liệu lịch sử." };
    const reversedHistory = [...txHistory].sort((a, b) => b.session - a.session);
    return reversedHistory.map((i) => ({
        session: i.session,
        dice: i.dice,
        total: i.total,
        result: i.result.toLowerCase(),
        tx_label: i.tx.toLowerCase(),
    }));
});

app.get("/api/taixiumd5/stats", async () => {
    return {
        total_predictions: godlikeManager.performanceMetrics.total,
        correct_predictions: godlikeManager.performanceMetrics.correct,
        accuracy: godlikeManager.performanceMetrics.total > 0 ? 
            (godlikeManager.performanceMetrics.correct / godlikeManager.performanceMetrics.total * 100).toFixed(1) + "%" : "0%",
        last10_accuracy: godlikeManager.performanceMetrics.last10Correct.reduce((a,b)=>a+b,0) + "/10",
        algorithms_count: ALL_ALGS.length,
        history_length: txHistory.length,
        pattern_memory_size: Object.keys(godlikeManager.ensemble.patternMemory).length
    };
});

app.get("/", async () => { 
    return {
        status: "ok",
        msg: "Tài Xỉu MD5 Phiên Bản V2",
        version: "4.0 - Ultimate Edition",
        algorithms: ALL_ALGS.length,
        pattern_recognition: "20+ mẫu siêu cấp + Meta Learning",
        features: [
            "20 thuật toán AI tiên tiến",
            "Meta-learning & Adaptive threshold",
            "Pattern recognition siêu việt",
            "Quantum tunneling simulation",
            "Chaos theory analysis",
            "CNN & Deep Residual learning",
            "Genetic algorithm optimization",
            "Real-time performance tracking"
        ],
        endpoints: [
            "GET /api/taixiumd5/lc79 - Dự đoán chính",
            "GET /api/taixiumd5/history - Lịch sử kết quả",
            "GET /api/taixiumd5/stats - Thống kê hiệu suất"
        ]
    };
});

// ==================== START SERVER ====================
const start = async () => {
    try {
        await app.listen({ port: PORT, host: "0.0.0.0" });
    } catch (err) {
        const fs = await import("node:fs");
        const logFile = path.join(__dirname, "server-error.log");
        const errorMsg = `
================= SERVER ERROR =================
Time: ${new Date().toISOString()}
Error: ${err.message}
Stack: ${err.stack}
=================================================
`;
        console.error(errorMsg);
        fs.writeFileSync(logFile, errorMsg, { encoding: "utf8", flag: "a+" });
        process.exit(1);
    }
    
    let publicIP = "0.0.0.0";
    try {
        const res = await fetch("https://ifconfig.me/ip");
        publicIP = (await res.text()).trim();
    } catch (e) {
        console.error("❌ Lỗi lấy public IP:", e.message);
    }
    
    console.log("\n╔══════════════════════════════════════════════════════════════╗");
    console.log("║       TÀI XỈU MD5 SIÊU CẤP ĐÃ KHỞI ĐỘNG      ║");
    console.log("╚══════════════════════════════════════════════════════════════╝");
    console.log(`   ➜ Local:   http://localhost:${PORT}/`);
    console.log(`   ➜ Network: http://${publicIP}:${PORT}/\n`);
    console.log(" Các API endpoints:");
    console.log(`   ➜ GET /api/taixiumd5/lc79    → Dự đoán phiên tiếp theo`);
    console.log(`   ➜ GET /api/taixiumd5/history → Lịch sử kết quả`);
    console.log(`   ➜ GET /api/taixiumd5/stats   → Thống kê hiệu suất AI\n`);
    console.log(" KIẾN TRÚC AI:");
    console.log(`   • ${ALL_ALGS.length} thuật toán tiên tiến (Markov, CNN, Transformer, Genetic...)`);
    console.log("   • Meta-learning ensemble với adaptive threshold");
    console.log("   • Pattern recognition: 20+ mẫu cầu phức tạp");
    console.log("   • Quantum tunneling & Chaos theory analysis");
    console.log("   • Real-time performance tracking & weight optimization\n");
    console.log(" CHẾ ĐỘ HOẠT ĐỘNG: HIGH-PERFORMANCE MODE");
    console.log(` Fetch interval: ${FETCH_INTERVAL_MS/1000} giây`);
};

start();