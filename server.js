const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const path = require('path');
const cors = require('cors');

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'physics_platform_secret_2026';

const CLEANUP_HOUR_MSK = 12;
const MSK_OFFSET_HOURS = 3;
let cleanupInterval = null;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(cors({
    origin: process.env.NODE_ENV === 'production' ? false : '*',
    credentials: true
}));

app.use(express.static(path.join(__dirname, 'public')));

let db = null;
let messaging = null;
let firebaseInitialized = false;

function initFirebase() {
    try {
        const fs = require('fs');
        if (fs.existsSync(path.join(__dirname, 'serviceAccountKey.json'))) {
            const serviceAccount = require('./serviceAccountKey.json');
            initializeApp({ credential: cert(serviceAccount) });
            db = getFirestore();
            messaging = getMessaging();
            console.log('✅ Firebase подключен через serviceAccountKey.json');
            return true;
        }
    } catch (error) {
        console.log('⚠️ Не удалось подключиться через serviceAccountKey.json');
    }
    try {
        if (process.env.FIREBASE_PROJECT_ID &&
            process.env.FIREBASE_CLIENT_EMAIL &&
            process.env.FIREBASE_PRIVATE_KEY) {
            const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
            initializeApp({
                credential: cert({
                    projectId: process.env.FIREBASE_PROJECT_ID,
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                    privateKey: privateKey
                })
            });
            db = getFirestore();
            messaging = getMessaging();
            console.log('✅ Firebase подключен через переменные окружения');
            return true;
        }
    } catch (error) {
        console.error('❌ Ошибка подключения к Firebase:', error.message);
    }
    console.log('⚠️ Firebase не подключен. Используем память.');
    return false;
}

firebaseInitialized = initFirebase();

const memoryDB = {
    users: {}, tests: {}, results: {},
    callRooms: {}, callSignals: [], lessons: {}, categories: {},
    notificationFeed: [], userLocations: {},
    gameRooms: {}, gameStates: {}, testIdCounter: 1
};

const gameStateModule = require('./public/game/game-state');

// ============ ⚔️ ВОЙСКА ============
const UNIT_STATS = {
    infantry: { attack: 1.0, defense: 1.2, name: 'Пехота', icon: '🪖' },
    tanks:    { attack: 2.0, defense: 1.5, name: 'Танки',  icon: '⚔️' },
    artillery:{ attack: 2.5, defense: 1.0, name: 'Артиллерия', icon: '🎯' }
};

const MAX_UNITS_PER_HEX = 3;

const ODD_DIRS  = [[+1,0],[-1,0],[0,-1],[-1,-1],[0,+1],[-1,+1]];
const EVEN_DIRS = [[+1,0],[-1,0],[+1,-1],[0,-1],[+1,+1],[0,+1]];

// ============ ⚡ ОЧКИ ДВИЖЕНИЯ ============
const MP_PER_TURN = 2;
const MP_COST_MOVE = 1;
const MP_COST_ATTACK = 1;
const ATTACK_FATIGUE_PENALTY = 0.15;

// ============ ⛽ РАСХОД НЕФТИ ============
const OIL_COST_TANK_ATTACK = 3;
const OIL_COST_TANK_MOVE = 2;
const OIL_COST_ARTILLERY_ATTACK = 2;
const OIL_COST_ARTILLERY_MOVE = 1;

// ============ ✈️ АВИАЦИЯ ============
const AIR_STATS = {
    fighters: { name: 'Истребители', icon: '✈️', attack: 3.0, defense: 3.0, range: 8, hp: 10, cost: 15, manpower: 2, oil: 1, buildProgress: 40, speedPerMilIC: 1.0 },
    bombers:  { name: 'Бомбардировщики', icon: '💣', attack: 5.0, defense: 1.5, range: 12, hp: 12, cost: 25, manpower: 3, oil: 2, buildProgress: 60, speedPerMilIC: 1.0 },
    transport:{ name: 'Транспортники', icon: '🪂', attack: 0.5, defense: 1.0, range: 15, hp: 8, cost: 20, manpower: 4, oil: 1, buildProgress: 50, speedPerMilIC: 1.0 }
};

const MAX_AIR_UNITS_PER_AIRBASE = 50;
const AIR_COMBAT_LOSS_RATIO = 0.15;
const AIR_COMBAT_FUEL_COST = 5;
const AA_DAMAGE_PER_GUN = 0.5;
const PARADROP_MIN_TRANSPORT = 3;
const PARADROP_RANGE = 10;

function getArmyMP(player, hexKey) {
    if (!player.armyMovement) player.armyMovement = {};
    if (!player.armyMovement[hexKey]) {
        player.armyMovement[hexKey] = { mp: MP_PER_TURN, attacks: 0 };
    }
    return player.armyMovement[hexKey];
}

function getFatigueMultiplier(player, hexKey) {
    const st = getArmyMP(player, hexKey);
    return Math.max(0, 1 - ATTACK_FATIGUE_PENALTY * st.attacks);
}

function calcOilCostAttack(unitData) {
    let cost = 0;
    for (const [type, count] of Object.entries(unitData || {})) {
        if (count > 0) {
            if (type === 'tanks') cost += count * OIL_COST_TANK_ATTACK;
            else if (type === 'artillery') cost += count * OIL_COST_ARTILLERY_ATTACK;
        }
    }
    return cost;
}

function calcOilCostMove(unitData) {
    let cost = 0;
    for (const [type, count] of Object.entries(unitData || {})) {
        if (count > 0) {
            if (type === 'tanks') cost += count * OIL_COST_TANK_MOVE;
            else if (type === 'artillery') cost += count * OIL_COST_ARTILLERY_MOVE;
        }
    }
    return cost;
}

function hexDistance(hex1, hex2) {
    const [c1, r1] = hex1.split(',').map(Number);
    const [c2, r2] = hex2.split(',').map(Number);
    const x1 = c1 - (r1 - (r1 & 1)) / 2;
    const z1 = r1;
    const y1 = -x1 - z1;
    const x2 = c2 - (r2 - (r2 & 1)) / 2;
    const z2 = r2;
    const y2 = -x2 - z2;
    return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2), Math.abs(z1 - z2));
}

// ============ 🏭 ЭКОНОМИКА ============
const STARTING_CIV_FACTORIES = {
    germany: 30, soviet: 40, uk: 25, france: 20, italy: 15,
    poland: 8, spain: 10, turkey: 8, sweden: 8, romania: 6,
    yugoslavia: 5, czechoslovakia: 8, hungary: 5, bulgaria: 4,
    greece: 3, finland: 5, norway: 4, denmark: 4, netherlands: 7,
    belgium: 7, portugal: 4, switzerland: 5, austria: 5, ireland: 2,
    estonia: 2, latvia: 2, lithuania: 2, albania: 1, luxembourg: 1,
    saudi: 2, iraq: 2, iran: 3, afghanistan: 2,
    default: 4
};

const STARTING_MIL_FACTORIES = {
    germany: 8, soviet: 20, uk: 6, france: 6, italy: 5,
    poland: 3, spain: 3, turkey: 3, sweden: 3, romania: 2,
    yugoslavia: 2, czechoslovakia: 4, hungary: 2, bulgaria: 2,
    greece: 2, finland: 2, norway: 1, denmark: 1, netherlands: 2,
    belgium: 2, portugal: 1, switzerland: 2, austria: 2, ireland: 1,
    estonia: 1, latvia: 1, lithuania: 1, albania: 1, luxembourg: 1,
    saudi: 1, iraq: 1, iran: 1, afghanistan: 1,
    default: 1
};

function getStartingCivFactories(country) {
    return STARTING_CIV_FACTORIES[country] || STARTING_CIV_FACTORIES.default;
}

function getStartingMilFactories(country) {
    return STARTING_MIL_FACTORIES[country] || STARTING_MIL_FACTORIES.default;
}

const CONSUMER_GOODS_RATIO = {
    germany: 0.15, italy: 0.20, soviet: 0.20, uk: 0.30, france: 0.35,
    usa: 0.40, poland: 0.25, spain: 0.30, portugal: 0.30, ireland: 0.30,
    switzerland: 0.25, sweden: 0.25, norway: 0.25, denmark: 0.25,
    finland: 0.25, netherlands: 0.28, belgium: 0.28, luxembourg: 0.28,
    austria: 0.25, czechoslovakia: 0.25, hungary: 0.22, romania: 0.25,
    yugoslavia: 0.28, bulgaria: 0.25, greece: 0.30, albania: 0.28,
    turkey: 0.28, estonia: 0.25, latvia: 0.25, lithuania: 0.25,
    saudi: 0.30, iraq: 0.30, iran: 0.30, afghanistan: 0.30,
    water: 0, default: 0.25
};

function getConsumerGoodsRatio(country) {
    return CONSUMER_GOODS_RATIO[country] ?? CONSUMER_GOODS_RATIO.default;
}

const MIL_LINE_COSTS = {
    infantry:  { steelPerMil: 0.5, oilPerMil: 0 },
    tanks:     { steelPerMil: 2.0, oilPerMil: 0.5 },
    artillery: { steelPerMil: 1.0, oilPerMil: 0 }
};

const LINE_EFFICIENCY_GAIN = 0.05;
const LINE_EFFICIENCY_SWITCH_PENALTY = 0.30;
const LINE_EFFICIENCY_MIN = 0.30;

const POP_GROWTH_PEACE = 0.003;
const POP_GROWTH_WAR = 0.001;
const POP_GROWTH_DEFICIT = -0.005;

const COUNTRY_POPULATION_1936 = {
    germany: 68.0, soviet: 168.0, france: 42.0, uk: 47.0, italy: 43.0,
    poland: 34.0, romania: 19.0, yugoslavia: 15.4, hungary: 9.0,
    czechoslovakia: 15.0, bulgaria: 6.3, greece: 7.0, albania: 1.0,
    sweden: 6.2, norway: 2.9, denmark: 3.7, finland: 3.7, estonia: 1.1,
    latvia: 1.9, lithuania: 2.5, ireland: 2.9, portugal: 7.2, austria: 6.7,
    switzerland: 4.2, belgium: 8.3, netherlands: 8.6, luxembourg: 0.3,
    turkey: 17.5, iraq: 3.7, iran: 15.0, saudi: 2.5, afghanistan: 7.0,
    water: 0, default: 5.0
};

const MOBILIZATION_PER_TURN = 0.001;

const PROVINCE_RESOURCES = {
    grain:  { oil: 0, steel: 0, manpowerBonus: 1.0 },
    oil:    { oil: 4, steel: 0, manpowerBonus: 0.5 },
    metal:  { oil: 0, steel: 3, manpowerBonus: 0.5 },
    coal:   { oil: 0, steel: 1, manpowerBonus: 1.0 },
    rubber: { oil: 0, steel: 0, manpowerBonus: 0.5 },
    none:   { oil: 0, steel: 0, manpowerBonus: 0.2 }
};

const BUILDING_TYPES = {
    civFactory: { name: '🏭 Гражданский завод', cost: 40, steelCost: 0,  buildTime: 90 },
    milFactory: { name: '⚙️ Военный завод',     cost: 50, steelCost: 20, buildTime: 120 },
    airFactory: { name: '✈️ Авиазавод',         cost: 60, steelCost: 30, buildTime: 100 },
    airbase:    { name: '🛬 Аэродром',          cost: 30, steelCost: 15, buildTime: 60 },
    aagun:      { name: '🎯 ПВО',               cost: 25, steelCost: 10, buildTime: 45 }
};

const UNIT_COSTS = {
    infantry:  { name: 'Пехота',     manpowerCost: 10, steelCost: 5,  oilCost: 0, buildProgress: 30, speedPerMilIC: 1.0 },
    tanks:     { name: 'Танки',      manpowerCost: 5,  steelCost: 20, oilCost: 0, buildProgress: 60, speedPerMilIC: 1.0 },
    artillery: { name: 'Артиллерия', manpowerCost: 8,  steelCost: 12, oilCost: 0, buildProgress: 45, speedPerMilIC: 1.0 }
};

function getStartingResources(country, provinces = {}) {
    const popMillions = COUNTRY_POPULATION_1936[country] || COUNTRY_POPULATION_1936.default;
    const DRAFTABLE_SHARE = 0.20;
    const manpowerPool = Math.max(50, Math.round(popMillions * DRAFTABLE_SHARE * 1000));
    const manpower = Math.max(5, Math.round(manpowerPool * 0.01));
    return { manpower, manpowerPool };
}

function getNeighborKeys(col, row) {
    const dirs = (row & 1) ? ODD_DIRS : EVEN_DIRS;
    return dirs.map(([dc, dr]) => `${col + dc},${row + dr}`);
}

function computeBorderHexes(province, allProvinces, ownCountry) {
    const hexSet = new Set(province.hexes.map(([c, r]) => `${c},${r}`));
    const ownerMap = {};
    Object.entries(allProvinces).forEach(([id, p]) => {
        if (id === province.id) return;
        p.hexes.forEach(([c, r]) => { ownerMap[`${c},${r}`] = p.country; });
    });
    const borderHexes = [];
    for (const [c, r] of province.hexes) {
        const key = `${c},${r}`;
        const neighbors = getNeighborKeys(c, r);
        const hasForeignNeighbor = neighbors.some(nKey => {
            if (hexSet.has(nKey)) return false;
            const neighborCountry = ownerMap[nKey];
            return !neighborCountry || neighborCountry !== ownCountry;
        });
        if (hasForeignNeighbor) borderHexes.push(key);
    }
    return borderHexes;
}

function getHexStrength(unitData, isAttacker) {
    let strength = 0;
    if (!unitData) return 0;
    for (const [type, count] of Object.entries(unitData)) {
        if (count > 0 && UNIT_STATS[type]) {
            strength += count * (isAttacker ? UNIT_STATS[type].attack : UNIT_STATS[type].defense);
        }
    }
    return strength;
}

function getHexUnitCount(unitData) {
    if (!unitData) return 0;
    return Object.values(unitData).reduce((s, n) => s + n, 0);
}

function findRetreatHex(province, fromKey, targetKey, excludeKeys, preferredOwner) {
    const [c, r] = fromKey.split(',').map(Number);
    const neighbors = getNeighborKeys(c, r);
    const provinceHexSet = new Set(province.hexes.map(([hc, hr]) => `${hc},${hr}`));
    for (const nKey of neighbors) {
        if (nKey === targetKey) continue;
        if (excludeKeys.has(nKey)) continue;
        if (!provinceHexSet.has(nKey)) continue;
        if (preferredOwner) {
            const nOwner = province.hexOwner?.[nKey] || province.country;
            if (nOwner !== preferredOwner) continue;
        }
        return nKey;
    }
    return null;
}

function applyLosses(unitData, lossRatio) {
    const result = {};
    for (const [type, count] of Object.entries(unitData)) {
        if (count > 0) {
            const remaining = Math.max(0, Math.floor(count * (1 - lossRatio)));
            result[type] = remaining;
        }
    }
    return result;
}

function recalcBorders(prov, allProvinces, ownCountry) {
    const hexSet = new Set(prov.hexes.map(([c, r]) => `${c},${r}`));
    const ownerMap = {};
    Object.entries(allProvinces).forEach(([id, p]) => {
        if (id === prov.id) return;
        p.hexes.forEach(([c, r]) => { ownerMap[`${c},${r}`] = p.country; });
    });
    const borderHexes = [];
    for (const [c, r] of prov.hexes) {
        const key = `${c},${r}`;
        const neighbors = getNeighborKeys(c, r);
        const hasForeignNeighbor = neighbors.some(nKey => {
            if (hexSet.has(nKey)) return false;
            const nOwner = ownerMap[nKey];
            if (!nOwner) return true;
            return nOwner !== ownCountry;
        });
        if (hasForeignNeighbor) borderHexes.push(key);
    }
    return borderHexes;
}

function recalcBordersForProvinces(state, provinceIds) {
    provinceIds.forEach(id => {
        const prov = state.provinces[id];
        if (!prov) return;
        if (prov.country === 'water' || prov.isSea) {
            prov.borderHexes = [];
            return;
        }
        prov.borderHexes = recalcBorders(prov, state.provinces, prov.country);
    });
}

function countPlayerFactories(state, player) {
    let civ = 0, mil = 0;
    Object.values(state.provinces).forEach(prov => {
        if (prov.country !== player.country) return;
        civ += prov.civFactories || 0;
        mil += prov.milFactories || 0;
    });
    return { civ, mil };
}

function distributeStartingFactories(provinces, country, civCount, milCount) {
    const ownProvs = Object.values(provinces).filter(
        p => p.country === country && !p.isSea && p.country !== 'water'
    );
    if (ownProvs.length === 0) return;

    ownProvs.forEach(p => {
        p.civFactories = 0;
        p.milFactories = 0;
        p.weight = Math.max(1, (p.population || 1) * 10 + (p.industry || 0));
    });

    ownProvs.sort((a, b) => b.weight - a.weight);
    const totalWeight = ownProvs.reduce((s, p) => s + p.weight, 0);

    let remainingCiv = civCount;
    for (const p of ownProvs) {
        if (remainingCiv <= 0) break;
        const share = Math.floor(civCount * p.weight / totalWeight);
        const give = Math.min(remainingCiv, Math.max(0, share));
        p.civFactories = give;
        remainingCiv -= give;
    }
    if (remainingCiv > 0 && ownProvs[0]) ownProvs[0].civFactories += remainingCiv;

    let remainingMil = milCount;
    for (const p of ownProvs) {
        if (remainingMil <= 0) break;
        const share = Math.floor(milCount / ownProvs.length);
        const give = Math.min(remainingMil, Math.max(1, share));
        p.milFactories = give;
        remainingMil -= give;
    }
    if (remainingMil > 0 && ownProvs[0]) ownProvs[0].milFactories += remainingMil;

    ownProvs.forEach(p => delete p.weight);
}

function calculatePlayerIncome(state, player) {
    const startCiv = getStartingCivFactories(player.country);
    const startMil = getStartingMilFactories(player.country);
    const built = countPlayerFactories(state, player);

    const rentedCiv = player.civFactoriesRented || 0;
    const rentedMil = player.milFactoriesRented || 0;
    const leasedCiv = player.civFactoriesLeased || 0;
    const leasedMil = player.milFactoriesLeased || 0;

    const totalCivFactories = Math.max(0, startCiv + built.civ + rentedCiv - leasedCiv);
    const totalMilFactories = Math.max(0, startMil + built.mil + rentedMil - leasedMil);
    const totalFactories = totalCivFactories + totalMilFactories;

    const cgRatio = getConsumerGoodsRatio(player.country);
    const consumerGoods = Math.floor(totalCivFactories * cgRatio);
    const availableCiv = totalCivFactories - consumerGoods;

    let steelProduced = 0, oilProduced = 0, manpowerFromProvinces = 0;
    Object.values(state.provinces).forEach(prov => {
        if (prov.country === player.country && prov.resource) {
            const res = PROVINCE_RESOURCES[prov.resource] || PROVINCE_RESOURCES.none;
            steelProduced += res.steel || 0;
            oilProduced += res.oil || 0;
            manpowerFromProvinces += res.manpowerBonus || 0;
        }
    });

    const pool = player.manpowerPool || 0;
    const draftFromPool = Math.floor(pool * MOBILIZATION_PER_TURN);
    const totalManpowerGain = draftFromPool + manpowerFromProvinces;
    const actualDraft = Math.min(pool, totalManpowerGain);

    return {
        civIC: availableCiv,
        milIC: totalMilFactories,
        manpower: actualDraft,
        draft: actualDraft,
        draftFromPool,
        manpowerFromProvinces,
        totalFactories, totalCivFactories, totalMilFactories,
        availableCiv, consumerGoods, consumerGoodsRatio: cgRatio,
        steelProduced, oilProduced, efficiency: 100,
        builtCiv: built.civ, builtMil: built.mil,
        startCiv, startMil, rentedCiv, rentedMil, leasedCiv, leasedMil
    };
}

// ============ 🔥 ФУНКЦИИ БД ============
async function getUser(username) {
    if (firebaseInitialized) {
        try {
            const doc = await db.collection('users').doc(username).get();
            if (doc.exists) return doc.data();
        } catch (error) { console.error('❌ getUser:', error.message); }
    }
    return memoryDB.users[username] || null;
}

async function createUser(username, password, role = 'user') {
    if (firebaseInitialized) {
        try {
            await db.collection('users').doc(username).set({ username, password, role, created: new Date() });
            return true;
        } catch (error) { console.error('❌ createUser:', error.message); }
    }
    memoryDB.users[username] = { username, password, role, created: new Date() };
    return true;
}

async function getTests() {
    if (firebaseInitialized) {
        try {
            const snapshot = await db.collection('tests').get();
            const tests = [];
            snapshot.forEach(doc => tests.push({ id: doc.id, ...doc.data() }));
            return tests;
        } catch (error) { console.error('❌ getTests:', error.message); }
    }
    return Object.values(memoryDB.tests);
}

async function getTest(testId) {
    if (firebaseInitialized) {
        try {
            const doc = await db.collection('tests').doc(String(testId)).get();
            if (doc.exists) return { id: doc.id, ...doc.data() };
        } catch (error) { console.error('❌ getTest:', error.message); }
    }
    return memoryDB.tests[testId] || null;
}

async function createTest(testData) {
    if (firebaseInitialized) {
        try {
            const docRef = await db.collection('tests').add({ ...testData, createdAt: new Date() });
            return { id: docRef.id, ...testData };
        } catch (error) { console.error('❌ createTest:', error.message); }
    }
    const testId = memoryDB.testIdCounter++;
    const newTest = { id: testId, ...testData };
    memoryDB.tests[testId] = newTest;
    return newTest;
}

async function updateTest(testId, testData) {
    if (firebaseInitialized) {
        try { await db.collection('tests').doc(String(testId)).update(testData); return true; }
        catch (error) { console.error('❌ updateTest:', error.message); return false; }
    }
    if (memoryDB.tests[testId]) {
        memoryDB.tests[testId] = { id: testId, ...testData };
        return true;
    }
    return false;
}

async function deleteTest(testId) {
    if (firebaseInitialized) {
        try { await db.collection('tests').doc(String(testId)).delete(); return true; }
        catch (error) { console.error('❌ deleteTest:', error.message); }
    }
    delete memoryDB.tests[testId];
    return true;
}

async function saveResult(username, resultData) {
    if (firebaseInitialized) {
        try { await db.collection('results').add({ username, ...resultData, completedAt: new Date() }); return true; }
        catch (error) { console.error('❌ saveResult:', error.message); }
    }
    if (!memoryDB.results[username]) memoryDB.results[username] = [];
    memoryDB.results[username].push({ ...resultData, completedAt: new Date() });
    return true;
}

async function getUserResults(username) {
    if (firebaseInitialized) {
        try {
            const snapshot = await db.collection('results').where('username', '==', username).get();
            const results = [];
            snapshot.forEach(doc => results.push({ id: doc.id, ...doc.data() }));
            return results;
        } catch (error) { console.error('❌ getUserResults:', error.message); }
    }
    return memoryDB.results[username] || [];
}

async function getAllUsers() {
    if (firebaseInitialized) {
        try {
            const snapshot = await db.collection('users').get();
            const users = [];
            snapshot.forEach(doc => users.push(doc.data()));
            return users;
        } catch (error) { console.error('❌ getAllUsers:', error.message); }
    }
    return Object.values(memoryDB.users);
}

async function getAllResults() {
    if (firebaseInitialized) {
        try {
            const snapshot = await db.collection('results').get();
            const results = [];
            snapshot.forEach(doc => results.push({ id: doc.id, ...doc.data() }));
            return results;
        } catch (error) { console.error('❌ getAllResults:', error.message); }
    }
    const allResults = [];
    Object.values(memoryDB.results).forEach(r => allResults.push(...r));
    return allResults;
}

async function saveStateNonBlocking(roomId, state, changedProvinceIds = null) {
    if (!firebaseInitialized) {
        memoryDB.gameStates[roomId] = state;
        return;
    }
    const meta = { ...state };
    delete meta.provinces;
    db.collection('gameStates').doc(roomId).set(meta, { merge: true })
        .catch(e => console.error('❌ save meta:', e.message));

    if (changedProvinceIds && changedProvinceIds.length > 0) {
        (async () => {
            try {
                const provRef = db.collection('gameProvinces').doc(roomId);
                const provDoc = await provRef.get();
                let provinces = {};
                if (provDoc.exists) provinces = provDoc.data().provinces || {};
                for (const id of changedProvinceIds) {
                    if (state.provinces[id]) provinces[id] = state.provinces[id];
                }
                await provRef.set({ provinces }, { merge: true });
            } catch (e) {
                console.error('❌ save provinces:', e.message);
            }
        })();
    }
}

async function saveFullState(roomId, state) {
    if (!firebaseInitialized) {
        memoryDB.gameStates[roomId] = state;
        return;
    }
    try {
        const meta = { ...state };
        delete meta.provinces;
        await db.collection('gameStates').doc(roomId).set(meta, { merge: true });
        await db.collection('gameProvinces').doc(roomId).set({ provinces: state.provinces });
    } catch (e) {
        console.error('❌ saveFullState:', e.message);
    }
}

async function loadState(roomId) {
    if (!firebaseInitialized) {
        return memoryDB.gameStates[roomId] || null;
    }
    try {
        const metaDoc = await db.collection('gameStates').doc(roomId).get();
        if (!metaDoc.exists) return null;
        const state = metaDoc.data();
        const provDoc = await db.collection('gameProvinces').doc(roomId).get();
        if (provDoc.exists) {
            state.provinces = provDoc.data().provinces || {};
        } else {
            state.provinces = state.provinces || {};
        }
        return state;
    } catch (e) {
        console.error('❌ loadState:', e.message);
        return null;
    }
}

app.use((req, res, next) => {
    console.log(`📝 ${req.method} ${req.url}`);
    next();
});

// ============ АВТОРИЗАЦИЯ ============
app.post('/api/register', async (req, res) => {
    try {
        const { username, password, role = 'user' } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Заполните все поля' });
        const existingUser = await getUser(username);
        if (existingUser) return res.status(400).json({ error: 'Пользователь уже существует' });
        if (username.length < 3 || password.length < 4) return res.status(400).json({ error: 'Имя минимум 3, пароль - 4' });
        const hashedPassword = await bcrypt.hash(password, 10);
        await createUser(username, hashedPassword, role);
        res.json({ success: true, message: 'Регистрация успешна!', role });
    } catch (error) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await getUser(username);
        if (!user) return res.status(400).json({ error: 'Пользователь не найден' });
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(400).json({ error: 'Неверный пароль' });
        const token = jwt.sign({ username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
        res.cookie('token', token, { httpOnly: true, maxAge: 86400000, sameSite: 'none', secure: true });
        res.json({ success: true, username, role: user.role });
    } catch (error) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.post('/api/logout', (req, res) => { res.clearCookie('token'); res.json({ success: true }); });

app.get('/api/me', (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        res.json({ username: decoded.username, role: decoded.role });
    } catch (error) { res.status(401).json({ error: 'Не авторизован' }); }
});

app.post('/api/push-token', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const { token: fcmToken } = req.body;
        if (!fcmToken) return res.status(400).json({ error: 'Нет токена' });
        if (firebaseInitialized) {
            await db.collection('users').doc(decoded.username).update({ fcmToken, fcmUpdatedAt: new Date() });
        } else if (memoryDB.users[decoded.username]) {
            memoryDB.users[decoded.username].fcmToken = fcmToken;
        }
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

// ============ ТЕСТЫ ============
app.get('/api/tests', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    try { jwt.verify(token, JWT_SECRET); res.json(await getTests()); }
    catch (e) { res.status(401).json({ error: 'Не авторизован' }); }
});

app.get('/api/tests/:id', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    try {
        jwt.verify(token, JWT_SECRET);
        const test = await getTest(req.params.id);
        if (!test) return res.status(404).json({ error: 'Тест не найден' });
        res.json(test);
    } catch (e) { res.status(401).json({ error: 'Не авторизован' }); }
});

app.post('/api/tests', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role !== 'admin') return res.status(403).json({ error: 'Доступ только для админа' });
        const { title, description, class: classNum, category, timeLimit, questions, linkedLessonIds } = req.body;
        if (!title || !questions || !Array.isArray(questions) || questions.length === 0) {
            return res.status(400).json({ error: 'Некорректные данные' });
        }
        const newTest = {
            title, description: description || '', class: classNum || '7-8',
            category: category || 'Другое', timeLimit: parseInt(timeLimit) || 0,
            questions: questions.map((q, i) => ({
                id: i + 1, type: q.type || 'choice', question: q.question,
                options: q.type === 'input' ? [] : q.options,
                correct: q.type === 'input' ? q.correctText : parseInt(q.correct),
                correctText: q.type === 'input' ? q.correctText : '',
                hint: q.hint || '', image: q.image || null
            })),
            linkedLessonIds: Array.isArray(linkedLessonIds) ? linkedLessonIds : [],
            createdBy: decoded.username
        };
        const created = await createTest(newTest);
        res.json({ success: true, testId: created.id, test: created });
    } catch (error) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.put('/api/tests/:id', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role !== 'admin') return res.status(403).json({ error: 'Доступ только для админа' });
        const testId = req.params.id;
        const existingTest = await getTest(testId);
        if (!existingTest) return res.status(404).json({ error: 'Тест не найден' });
        const { title, description, class: classNum, category, timeLimit, questions, linkedLessonIds } = req.body;
        if (!title || !questions || !Array.isArray(questions) || questions.length === 0) {
            return res.status(400).json({ error: 'Некорректные данные' });
        }
        const updatedTest = {
            title, description: description || '', class: classNum || '7-8',
            category: category || 'Другое', timeLimit: parseInt(timeLimit) || 0,
            questions: questions.map((q, i) => ({
                id: i + 1, type: q.type || 'choice', question: q.question,
                options: q.type === 'input' ? [] : q.options,
                correct: q.type === 'input' ? q.correctText : parseInt(q.correct),
                correctText: q.type === 'input' ? q.correctText : '',
                hint: q.hint || '', image: q.image || null
            })),
            linkedLessonIds: Array.isArray(linkedLessonIds) ? linkedLessonIds : [],
            createdBy: existingTest.createdBy || decoded.username, updatedAt: new Date()
        };
        const ok = await updateTest(testId, updatedTest);
        if (ok) res.json({ success: true, test: { id: testId, ...updatedTest } });
        else res.status(500).json({ error: 'Ошибка обновления' });
    } catch (error) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.delete('/api/tests/:id', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role !== 'admin') return res.status(403).json({ error: 'Доступ только для админа' });
        const test = await getTest(req.params.id);
        if (!test) return res.status(404).json({ error: 'Тест не найден' });
        await deleteTest(req.params.id);
        res.json({ success: true, message: 'Тест удален' });
    } catch (error) { res.status(401).json({ error: 'Не авторизован' }); }
});

app.post('/api/tests/:id/check', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const { answers, timeSpent } = req.body;
        const test = await getTest(req.params.id);
        if (!test) return res.status(404).json({ error: 'Тест не найден' });
        let correct = 0;
        const results = test.questions.map((q, i) => {
            const ua = answers[i];
            let isCorrect = false, displayAnswer = '', correctAnswer = '';
            if (q.type === 'input') {
                const ut = (ua || '').toString().trim().toLowerCase();
                const ct = (q.correctText || '').toString().trim().toLowerCase();
                isCorrect = ut === ct;
                displayAnswer = ua || 'Не отвечено';
                correctAnswer = q.correctText;
            } else {
                isCorrect = ua === q.correct;
                displayAnswer = ua !== undefined ? q.options[ua] : 'Не отвечено';
                correctAnswer = q.options[q.correct];
            }
            if (isCorrect) correct++;
            return { questionId: q.id, type: q.type || 'choice', question: q.question, image: q.image || null, userAnswer: displayAnswer, correctAnswer, isCorrect, hint: q.hint || '' };
        });
        const resultData = {
            testId: req.params.id, testTitle: test.title, category: test.category || 'Другое',
            username: decoded.username, total: test.questions.length, correct,
            percentage: Math.round((correct / test.questions.length) * 100),
            timeSpent: timeSpent || 0, results
        };
        await saveResult(decoded.username, resultData);
        res.json(resultData);
    } catch (error) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.get('/api/results', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        res.json(await getUserResults(decoded.username));
    } catch (error) { res.status(401).json({ error: 'Не авторизован' }); }
});

app.get('/api/admin/stats', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role !== 'admin') return res.status(403).json({ error: 'Доступ только для админа' });
        const users = await getAllUsers();
        const tests = await getTests();
        const results = await getAllResults();
        res.json({
            totalUsers: users.length, totalTests: tests.length, totalResults: results.length,
            tests: tests.map(t => ({ id: t.id, title: t.title, category: t.category, questions: t.questions?.length || 0 })),
            users: users.map(u => ({ username: u.username, role: u.role || 'user' }))
        });
    } catch (error) { res.status(401).json({ error: 'Не авторизован' }); }
});

app.get('/api/leaderboard', async (req, res) => {
    try {
        const results = await getAllResults();
        const leaderboard = [];
        const userResults = {};
        results.forEach(r => {
            if (!userResults[r.username]) userResults[r.username] = [];
            userResults[r.username].push(r);
        });
        Object.keys(userResults).forEach(username => {
            const list = userResults[username];
            if (list && list.length > 0) {
                const best = list.reduce((b, c) => (c.percentage > b.percentage) ? c : b, list[0]);
                leaderboard.push({ username, bestScore: best.percentage, totalTests: list.length, bestTest: best.testTitle });
            }
        });
        leaderboard.sort((a, b) => b.bestScore - a.bestScore);
        res.json(leaderboard);
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

// ============ 📞 ЗВОНКИ ============
app.post('/api/calls/rooms', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const { name } = req.body;
        const roomId = 'room_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        const room = { id: roomId, name: name || `Звонок ${decoded.username}`, createdBy: decoded.username, createdAt: new Date(), active: true };
        if (firebaseInitialized) await db.collection('callRooms').doc(roomId).set(room);
        else memoryDB.callRooms[roomId] = room;
        res.json({ success: true, room });
    } catch (error) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.get('/api/calls/rooms', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    try {
        jwt.verify(token, JWT_SECRET);
        let rooms = [];
        if (firebaseInitialized) {
            const snapshot = await db.collection('callRooms').get();
            snapshot.forEach(doc => {
                const data = doc.data();
                let createdAt = data.createdAt;
                if (createdAt && typeof createdAt.toDate === 'function') createdAt = createdAt.toDate().toISOString();
                else if (createdAt && createdAt._seconds) createdAt = new Date(createdAt._seconds * 1000).toISOString();
                else if (!createdAt) createdAt = new Date().toISOString();
                rooms.push({ id: doc.id, ...data, createdAt });
            });
        } else rooms = Object.values(memoryDB.callRooms || {});
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
        rooms = rooms.filter(r => { const t = new Date(r.createdAt).getTime(); return isNaN(t) || t > oneDayAgo; });
        rooms.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        res.json(rooms);
    } catch (error) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.delete('/api/calls/rooms/:id', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const roomId = req.params.id;
        if (firebaseInitialized) {
            const doc = await db.collection('callRooms').doc(roomId).get();
            if (!doc.exists) return res.status(404).json({ error: 'Комната не найдена' });
            if (doc.data().createdBy !== decoded.username && decoded.role !== 'admin') return res.status(403).json({ error: 'Нет прав' });
            await db.collection('callRooms').doc(roomId).delete();
            const signals = await db.collection('callSignals').where('roomId', '==', roomId).get();
            signals.forEach(async (s) => await s.ref.delete());
        } else {
            if (!memoryDB.callRooms[roomId]) return res.status(404).json({ error: 'Комната не найдена' });
            if (memoryDB.callRooms[roomId].createdBy !== decoded.username && decoded.role !== 'admin') return res.status(403).json({ error: 'Нет прав' });
            delete memoryDB.callRooms[roomId];
            memoryDB.callSignals = memoryDB.callSignals.filter(s => s.roomId !== roomId);
        }
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.post('/api/calls/signal', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const { roomId, type, data, to } = req.body;
        const signalId = `${roomId}_${decoded.username}_${type}_${to || 'all'}`;
        const signal = { roomId, from: decoded.username, to: to || null, type, data: JSON.stringify(data), createdAt: new Date(), updatedAt: new Date() };
        if (firebaseInitialized) {
            const docRef = db.collection('callSignals').doc(signalId);
            const doc = await docRef.get();
            if (doc.exists) await docRef.update({ data: signal.data, updatedAt: new Date(), createdAt: new Date() });
            else await docRef.set(signal);
        } else {
            signal.createdAt = Date.now();
            signal.updatedAt = Date.now();
            memoryDB.callSignals = memoryDB.callSignals.filter(s => !(s.roomId === roomId && s.from === decoded.username && s.type === type && (s.to || null) === (to || null)));
            memoryDB.callSignals.push(signal);
        }
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.get('/api/calls/signal/:roomId', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const { roomId } = req.params;
        const { lastTime } = req.query;
        let signals = [];
        if (firebaseInitialized) {
            const snapshot = await db.collection('callSignals').where('roomId', '==', roomId).get();
            const oneMinuteAgo = Date.now() - 60000;
            snapshot.forEach(doc => {
                const s = { id: doc.id, ...doc.data() };
                let createdAt = s.createdAt;
                if (createdAt && typeof createdAt.toDate === 'function') createdAt = createdAt.toDate().getTime();
                else if (createdAt && createdAt._seconds) createdAt = createdAt._seconds * 1000;
                else if (typeof createdAt !== 'number') createdAt = Date.now();
                if (createdAt < oneMinuteAgo) { doc.ref.delete(); return; }
                if ((s.to === null || s.to === decoded.username) && s.from !== decoded.username) {
                    if (!lastTime || createdAt > parseInt(lastTime)) signals.push({ ...s, createdAt });
                }
            });
        } else {
            const oneMinuteAgo = Date.now() - 60000;
            memoryDB.callSignals = memoryDB.callSignals.filter(s => s.updatedAt > oneMinuteAgo);
            signals = memoryDB.callSignals.filter(s => s.roomId === roomId && s.from !== decoded.username && (s.to === null || s.to === decoded.username) && (!lastTime || s.updatedAt > parseInt(lastTime)));
        }
        res.json(signals);
    } catch (error) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

// ============ 📚 КАТЕГОРИИ ============
app.get('/api/categories', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    try {
        jwt.verify(token, JWT_SECRET);
        let categories = [];
        if (firebaseInitialized) {
            const snapshot = await db.collection('categories').orderBy('createdAt', 'asc').get();
            snapshot.forEach(doc => categories.push({ id: doc.id, ...doc.data() }));
        } else categories = Object.values(memoryDB.categories || {});
        res.json(categories);
    } catch (error) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.post('/api/categories', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role !== 'admin') return res.status(403).json({ error: 'Доступ только для админа' });
        const { name } = req.body;
        if (!name || !name.trim()) return res.status(400).json({ error: 'Введите название' });
        const newCategory = { name: name.trim(), createdAt: new Date(), createdBy: decoded.username };
        let created;
        if (firebaseInitialized) {
            const docRef = await db.collection('categories').add(newCategory);
            created = { id: docRef.id, ...newCategory };
        } else {
            const id = 'cat_' + Date.now();
            created = { id, ...newCategory };
            if (!memoryDB.categories) memoryDB.categories = {};
            memoryDB.categories[id] = created;
        }
        res.json({ success: true, category: created });
    } catch (error) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.delete('/api/categories/:id', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role !== 'admin') return res.status(403).json({ error: 'Доступ только для админа' });
        if (firebaseInitialized) await db.collection('categories').doc(req.params.id).delete();
        else if (memoryDB.categories) delete memoryDB.categories[req.params.id];
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

// ============ 📚 ОБУЧЕНИЕ ============
app.post('/api/lessons', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role !== 'admin') return res.status(403).json({ error: 'Доступ только для админа' });
        const { title, category, content, formulas, examples, image, linkedTestIds } = req.body;
        if (!title || !content) return res.status(400).json({ error: 'Нужны заголовок и содержание' });
        const lesson = {
            title, category: category || 'Другое', content,
            formulas: Array.isArray(formulas) ? formulas : [],
            examples: Array.isArray(examples) ? examples : [],
            image: image || null, linkedTestIds: Array.isArray(linkedTestIds) ? linkedTestIds : [],
            createdBy: decoded.username, createdAt: new Date()
        };
        let created;
        if (firebaseInitialized) {
            const docRef = await db.collection('lessons').add(lesson);
            created = { id: docRef.id, ...lesson };
        } else {
            const lessonId = 'lesson_' + Date.now();
            created = { id: lessonId, ...lesson };
            memoryDB.lessons[lessonId] = created;
        }
        res.json({ success: true, lesson: created });
    } catch (error) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.get('/api/lessons', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    try {
        jwt.verify(token, JWT_SECRET);
        let lessons = [];
        if (firebaseInitialized) {
            const snapshot = await db.collection('lessons').get();
            snapshot.forEach(doc => {
                const data = doc.data();
                let createdAt = data.createdAt;
                if (createdAt && typeof createdAt.toDate === 'function') createdAt = createdAt.toDate().toISOString();
                lessons.push({ id: doc.id, ...data, createdAt });
            });
        } else lessons = Object.values(memoryDB.lessons || {});
        lessons.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        res.json(lessons);
    } catch (error) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.get('/api/lessons/:id', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    try {
        jwt.verify(token, JWT_SECRET);
        let lesson = null;
        if (firebaseInitialized) {
            const doc = await db.collection('lessons').doc(req.params.id).get();
            if (doc.exists) {
                const data = doc.data();
                let createdAt = data.createdAt;
                if (createdAt && typeof createdAt.toDate === 'function') createdAt = createdAt.toDate().toISOString();
                lesson = { id: doc.id, ...data, createdAt };
            }
        } else lesson = memoryDB.lessons[req.params.id] || null;
        if (!lesson) return res.status(404).json({ error: 'Статья не найдена' });
        res.json(lesson);
    } catch (error) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.put('/api/lessons/:id', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role !== 'admin') return res.status(403).json({ error: 'Доступ только для админа' });
        const { title, category, content, formulas, examples, image, linkedTestIds } = req.body;
        const lessonId = req.params.id;
        const updatedLesson = {
            title, category: category || 'Другое', content,
            formulas: Array.isArray(formulas) ? formulas : [],
            examples: Array.isArray(examples) ? examples : [],
            image: image || null, linkedTestIds: Array.isArray(linkedTestIds) ? linkedTestIds : [],
            updatedAt: new Date()
        };
        if (firebaseInitialized) {
            const doc = await db.collection('lessons').doc(lessonId).get();
            if (!doc.exists) return res.status(404).json({ error: 'Статья не найдена' });
            await db.collection('lessons').doc(lessonId).update(updatedLesson);
        } else {
            if (!memoryDB.lessons[lessonId]) return res.status(404).json({ error: 'Статья не найдена' });
            memoryDB.lessons[lessonId] = { ...memoryDB.lessons[lessonId], ...updatedLesson };
        }
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.delete('/api/lessons/:id', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role !== 'admin') return res.status(403).json({ error: 'Доступ только для админа' });
        if (firebaseInitialized) await db.collection('lessons').doc(req.params.id).delete();
        else delete memoryDB.lessons[req.params.id];
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

// ============ 📍 ГЕОЛОКАЦИЯ ============
app.post('/api/location', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const { latitude, longitude, accuracy } = req.body;
        if (!latitude || !longitude) return res.status(400).json({ error: 'Нет координат' });
        const today = new Date().toISOString().split('T')[0];
        const docId = `${decoded.username}_${today}`;
        const locationData = { username: decoded.username, date: today, latitude, longitude, accuracy: accuracy || null, updatedAt: new Date(), visits: 1 };
        if (firebaseInitialized) {
            const oldDocs = await db.collection('userLocations').where('username', '==', decoded.username).get();
            for (const doc of oldDocs.docs) if (doc.id !== docId) await doc.ref.delete();
            const docRef = db.collection('userLocations').doc(docId);
            const doc = await docRef.get();
            if (doc.exists) {
                const existing = doc.data();
                await docRef.update({ latitude, longitude, accuracy: accuracy || null, updatedAt: new Date(), visits: (existing.visits || 0) + 1 });
            } else await docRef.set(locationData);
        } else {
            if (!memoryDB.userLocations) memoryDB.userLocations = {};
            for (const key of Object.keys(memoryDB.userLocations)) {
                if (memoryDB.userLocations[key].username === decoded.username && key !== docId) delete memoryDB.userLocations[key];
            }
            memoryDB.userLocations[docId] = memoryDB.userLocations[docId] ? { ...memoryDB.userLocations[docId], ...locationData, visits: (memoryDB.userLocations[docId].visits || 0) + 1 } : locationData;
        }
        res.json({ success: true, docId });
    } catch (error) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.get('/api/admin/locations', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role !== 'admin') return res.status(403).json({ error: 'Доступ только для админа' });
        let locations = [];
        if (firebaseInitialized) {
            const snapshot = await db.collection('userLocations').orderBy('updatedAt', 'desc').limit(100).get();
            snapshot.forEach(doc => locations.push({ id: doc.id, ...doc.data() }));
        } else locations = Object.values(memoryDB.userLocations || {});
        res.json(locations);
    } catch (error) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

// ============ 📢 УВЕДОМЛЕНИЯ ============
app.get('/api/notifications', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    try {
        jwt.verify(token, JWT_SECRET);
        let feed = [];
        if (firebaseInitialized) {
            const feedDoc = await db.collection('notification_feed').doc('current').get();
            if (feedDoc.exists) feed = feedDoc.data().items || [];
        } else feed = memoryDB.notificationFeed || [];
        feed.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        res.json({ notifications: feed, unreadCount: 0 });
    } catch (error) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.post('/api/notifications/read', async (req, res) => { res.json({ success: true }); });
app.delete('/api/notifications/:id', async (req, res) => { res.json({ success: true }); });

// ============ 🎮 ИГРА: КОМНАТЫ ============
app.post('/api/game/rooms', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const { name, password, maxPlayers } = req.body;
        const roomId = 'game_room_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        const hashedPassword = password ? await bcrypt.hash(password, 10) : null;
        const room = {
            id: roomId, name: name || `Партия ${decoded.username}`,
            password: hashedPassword, hasPassword: !!hashedPassword,
            createdBy: decoded.username, createdAt: new Date(),
            maxPlayers: Math.min(Math.max(parseInt(maxPlayers) || 4, 1), 6),
            players: [{ username: decoded.username, country: null, ready: false, joinedAt: new Date() }],
            status: 'lobby', turn: 1, currentPlayerIndex: 0
        };
        if (firebaseInitialized) await db.collection('gameRooms').doc(roomId).set(room);
        else memoryDB.gameRooms[roomId] = room;
        const safeRoom = { ...room };
        delete safeRoom.password;
        res.json({ success: true, room: safeRoom });
    } catch (error) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.get('/api/game/rooms', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    try {
        jwt.verify(token, JWT_SECRET);
        let rooms = [];
        if (firebaseInitialized) {
            const snapshot = await db.collection('gameRooms').get();
            const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
            snapshot.forEach(doc => {
                const data = doc.data();
                let createdAt = data.createdAt;
                if (createdAt && typeof createdAt.toDate === 'function') createdAt = createdAt.toDate().getTime();
                else if (createdAt && createdAt._seconds) createdAt = createdAt._seconds * 1000;
                else createdAt = Date.now();
                if (createdAt < oneDayAgo) { doc.ref.delete(); return; }
                const safe = { ...data, createdAt: new Date(createdAt).toISOString() };
                delete safe.password;
                rooms.push(safe);
            });
        } else {
            rooms = Object.values(memoryDB.gameRooms || {})
                .filter(r => new Date(r.createdAt).getTime() > Date.now() - 24 * 60 * 60 * 1000)
                .map(r => { const safe = { ...r }; delete safe.password; return safe; });
        }
        rooms.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        res.json(rooms);
    } catch (error) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.get('/api/game/rooms/:id', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    try {
        jwt.verify(token, JWT_SECRET);
        const roomId = req.params.id;
        let room;
        if (firebaseInitialized) {
            const doc = await db.collection('gameRooms').doc(roomId).get();
            if (!doc.exists) return res.status(404).json({ error: 'Комната не найдена' });
            room = { id: doc.id, ...doc.data() };
        } else {
            room = memoryDB.gameRooms?.[roomId];
            if (!room) return res.status(404).json({ error: 'Комната не найдена' });
        }
        const safe = { ...room };
        delete safe.password;
        res.json({ room: safe });
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.post('/api/game/rooms/:id/join', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const { password } = req.body;
        const roomId = req.params.id;
        let room, ref;
        if (firebaseInitialized) {
            ref = db.collection('gameRooms').doc(roomId);
            const doc = await ref.get();
            if (!doc.exists) return res.status(404).json({ error: 'Комната не найдена' });
            room = { id: doc.id, ...doc.data() };
        } else {
            room = memoryDB.gameRooms?.[roomId];
            if (!room) return res.status(404).json({ error: 'Комната не найдена' });
        }
        if (room.hasPassword && room.password) {
            const valid = await bcrypt.compare(password || '', room.password);
            if (!valid) return res.status(403).json({ error: 'Неверный пароль' });
        }
        const exists = room.players.some(p => p.username === decoded.username);
        if (!exists) {
            if (room.players.length >= room.maxPlayers) return res.status(400).json({ error: 'Комната заполнена' });
            room.players.push({ username: decoded.username, country: null, ready: false, joinedAt: new Date() });
            if (firebaseInitialized) await ref.update({ players: room.players });
            else memoryDB.gameRooms[roomId].players = room.players;
        }
        const safeRoom = { ...room };
        delete safeRoom.password;
        res.json({ success: true, room: safeRoom });
    } catch (error) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.post('/api/game/rooms/:id/select-country', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const { country } = req.body;
        const roomId = req.params.id;
        if (!country || country === 'water') return res.status(400).json({ error: 'Неверная страна' });
        let room, ref;
        if (firebaseInitialized) {
            ref = db.collection('gameRooms').doc(roomId);
            const doc = await ref.get();
            if (!doc.exists) return res.status(404).json({ error: 'Комната не найдена' });
            room = doc.data();
        } else {
            room = memoryDB.gameRooms?.[roomId];
            if (!room) return res.status(404).json({ error: 'Комната не найдена' });
        }
        const taken = room.players.some(p => p.username !== decoded.username && p.country === country);
        if (taken) return res.status(400).json({ error: 'Эта страна уже занята' });
        room.players = room.players.map(p => p.username === decoded.username ? { ...p, country, ready: false } : p);
        if (firebaseInitialized) await ref.update({ players: room.players });
        else memoryDB.gameRooms[roomId].players = room.players;
        const safe = { ...room };
        delete safe.password;
        res.json({ success: true, room: safe });
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.post('/api/game/rooms/:id/ready', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const roomId = req.params.id;
        let room, ref;
        if (firebaseInitialized) {
            ref = db.collection('gameRooms').doc(roomId);
            const doc = await ref.get();
            if (!doc.exists) return res.status(404).json({ error: 'Комната не найдена' });
            room = doc.data();
        } else {
            room = memoryDB.gameRooms?.[roomId];
            if (!room) return res.status(404).json({ error: 'Комната не найдена' });
        }
        room.players = room.players.map(p => p.username === decoded.username ? { ...p, ready: !p.ready } : p);
        if (firebaseInitialized) await ref.update({ players: room.players });
        else memoryDB.gameRooms[roomId].players = room.players;
        const safe = { ...room };
        delete safe.password;
        res.json({ success: true, room: safe });
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

// ============ 🎮 СТАРТ ИГРЫ ============
app.post('/api/game/rooms/:id/start', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const roomId = req.params.id;
        const { provinces } = req.body;
        let room, ref;
        if (firebaseInitialized) {
            ref = db.collection('gameRooms').doc(roomId);
            const doc = await ref.get();
            if (!doc.exists) return res.status(404).json({ error: 'Комната не найдена' });
            room = doc.data();
        } else {
            room = memoryDB.gameRooms?.[roomId];
            if (!room) return res.status(404).json({ error: 'Комната не найдена' });
        }
        if (room.createdBy !== decoded.username) return res.status(403).json({ error: 'Только создатель может начать' });
        const allReady = room.players.length >= 1 && room.players.every(p => p.ready && p.country);
        if (!allReady) return res.status(400).json({ error: 'Не все игроки готовы' });

        const enrichedProvinces = { ...provinces };
        Object.keys(enrichedProvinces).forEach(id => {
            const p = enrichedProvinces[id];
            if (!p.units) p.units = {};
            if (!p.hexOwner) {
                p.hexOwner = {};
                (p.hexes || []).forEach(([c, r]) => { p.hexOwner[`${c},${r}`] = p.country; });
            }
            p.airFactories = p.airFactories || 0;
            p.airbases = p.airbases || 0;
            p.aaguns = p.aaguns || 0;
        });

        const countrySet = new Set(room.players.map(p => p.country));
        countrySet.forEach(country => {
            distributeStartingFactories(
                enrichedProvinces,
                country,
                getStartingCivFactories(country),
                getStartingMilFactories(country)
            );
        });

        Object.keys(enrichedProvinces).forEach(id => {
            const p = enrichedProvinces[id];
            if (p.isSea || p.country === 'water') { p.borderHexes = []; return; }
            p.borderHexes = computeBorderHexes(p, enrichedProvinces, p.country);
        });

        const humanCountries = room.players.map(p => p.country);

        const allCountriesOnMap = new Set();
        Object.values(enrichedProvinces).forEach(p => {
            if (p.country && p.country !== 'water' && !p.isSea) {
                allCountriesOnMap.add(p.country);
            }
        });

        const allPlayers = [];

        function giveStartingArmy(player) {
            const myProvs = Object.values(enrichedProvinces).filter(
                p => p.country === player.country && !p.isSea && p.country !== 'water'
            );
            if (myProvs.length === 0) return;

            const popMillions = COUNTRY_POPULATION_1936[player.country] || COUNTRY_POPULATION_1936.default;
            const rawDivisions = Math.sqrt(popMillions) / 2;
            const divisionCount = Math.max(1, Math.min(10, Math.round(rawDivisions)));
            const finalCount = player.isAI ? Math.ceil(divisionCount * 1.5) : divisionCount;

            const capital = myProvs.find(p => p.isCapital) || myProvs[0];
            if (!capital || !capital.hexes || capital.hexes.length === 0) return;

            const capitalBorders = capital.borderHexes && capital.borderHexes.length > 0
                ? capital.borderHexes
                : capital.hexes.map(([c, r]) => `${c},${r}`);

            let placed = 0;
            for (const hexKey of capitalBorders) {
                if (placed >= finalCount) break;
                if (!capital.units) capital.units = {};
                if (!capital.units[hexKey]) capital.units[hexKey] = {};
                const currentCount = Object.values(capital.units[hexKey]).reduce((s, n) => s + n, 0);
                const canPlace = Math.min(MAX_UNITS_PER_HEX - currentCount, finalCount - placed);
                if (canPlace <= 0) continue;
                capital.units[hexKey].infantry = (capital.units[hexKey].infantry || 0) + canPlace;
                placed += canPlace;
            }

            if (placed < finalCount) {
                for (const prov of myProvs) {
                    if (placed >= finalCount) break;
                    if (prov.id === capital.id) continue;
                    if (!prov.borderHexes || prov.borderHexes.length === 0) continue;
                    for (const hexKey of prov.borderHexes) {
                        if (placed >= finalCount) break;
                        if (!prov.units) prov.units = {};
                        if (!prov.units[hexKey]) prov.units[hexKey] = {};
                        const currentCount = Object.values(prov.units[hexKey]).reduce((s, n) => s + n, 0);
                        const canPlace = Math.min(MAX_UNITS_PER_HEX - currentCount, finalCount - placed);
                        if (canPlace <= 0) continue;
                        prov.units[hexKey].infantry = (prov.units[hexKey].infantry || 0) + canPlace;
                        placed += canPlace;
                    }
                }
            }
        }

        room.players.forEach(p => {
            const startRes = getStartingResources(p.country, enrichedProvinces);
            const cgRatio = getConsumerGoodsRatio(p.country);
            const humanPlayer = {
                username: p.username, country: p.country, isAI: false,
                resources: { civIC: 0, milIC: 0, manpower: startRes.manpower },
                manpowerPool: startRes.manpowerPool,
                steelPool: 300, oilPool: 150,
                consumerGoodsRatio: cgRatio,
                constructionQueue: [], productionQueue: [],
                milLines: {
                    infantry: { efficiency: 1.0 },
                    tanks: { efficiency: 1.0 },
                    artillery: { efficiency: 1.0 },
                    air: { efficiency: 1.0 }
                },
                milSplit: { infantry: 40, tanks: 20, artillery: 15, air: 25 },
                civFactoriesLeased: 0, milFactoriesLeased: 0,
                civFactoriesRented: 0, milFactoriesRented: 0,
                tradeEmbargo: [], unrest: 0, bonusProduction: 1.0,
                isAlive: true, armyMovement: {},
                airUnits: { fighters: 0, bombers: 0, transport: 0 },
                airProductionQueue: [],
                airLosses: { fighters: 0, bombers: 0, transport: 0 },
                airKills: { fighters: 0, bombers: 0, transport: 0 }
            };
            giveStartingArmy(humanPlayer);
            allPlayers.push(humanPlayer);
        });

        allCountriesOnMap.forEach(country => {
            if (humanCountries.includes(country)) return;
            const startRes = getStartingResources(country, enrichedProvinces);
            const cgRatio = getConsumerGoodsRatio(country);
            const aiPlayer = {
                username: `ИИ (${country})`, country: country, isAI: true,
                resources: { civIC: 0, milIC: 0, manpower: startRes.manpower },
                manpowerPool: startRes.manpowerPool,
                steelPool: 500, oilPool: 250,
                consumerGoodsRatio: cgRatio,
                constructionQueue: [], productionQueue: [],
                milLines: {
                    infantry: { efficiency: 1.0 },
                    tanks: { efficiency: 1.0 },
                    artillery: { efficiency: 1.0 },
                    air: { efficiency: 1.0 }
                },
                milSplit: { infantry: 45, tanks: 20, artillery: 15, air: 20 },
                civFactoriesLeased: 0, milFactoriesLeased: 0,
                civFactoriesRented: 0, milFactoriesRented: 0,
                tradeEmbargo: [], unrest: 0, bonusProduction: 1.0,
                isAlive: true, armyMovement: {},
                airUnits: { fighters: 0, bombers: 0, transport: 0 },
                airProductionQueue: [],
                airLosses: { fighters: 0, bombers: 0, transport: 0 },
                airKills: { fighters: 0, bombers: 0, transport: 0 }
            };
            giveStartingArmy(aiPlayer);
            allPlayers.push(aiPlayer);
        });

        const state = {
            turn: 1, currentPlayerIndex: 0, players: allPlayers,
            provinces: enrichedProvinces,
            wars: [], alliances: [], pacts: [], diplomaticOffers: [],
            marketOffers: [], activeContracts: [], eventLog: [],
            finished: false, winner: null, updatedAt: new Date()
        };

        await saveFullState(roomId, state);

        room.status = 'playing';
        room.startedAt = new Date();
        if (firebaseInitialized) await ref.update({ status: 'playing', startedAt: new Date() });
        const safe = { ...room };
        delete safe.password;
        res.json({ success: true, room: safe, state });
    } catch (e) {
        console.error('start error:', e);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.get('/api/game/rooms/:id/state', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    try {
        jwt.verify(token, JWT_SECRET);
        const roomId = req.params.id;
        const state = await loadState(roomId);
        if (!state) return res.status(404).json({ error: 'Игра не начата' });
        res.json(state);
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

// ============ ⚙️ MIL SPLIT ============
app.post('/api/game/rooms/:id/mil-split', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const roomId = req.params.id;
        const { infantry, tanks, artillery, air } = req.body;
        const i = parseInt(infantry) || 0;
        const t = parseInt(tanks) || 0;
        const a = parseInt(artillery) || 0;
        const ai = parseInt(air) || 0;
        if (i < 0 || t < 0 || a < 0 || ai < 0) return res.status(400).json({ error: 'Отрицательные значения' });
        if (i + t + a + ai !== 100) return res.status(400).json({ error: `Сумма должна быть 100% (сейчас ${i + t + a + ai}%)` });

        const state = await loadState(roomId);
        if (!state) return res.status(404).json({ error: 'Игра не найдена' });

        const currentPlayer = state.players[state.currentPlayerIndex];
        if (currentPlayer.username !== decoded.username) return res.status(403).json({ error: 'Сейчас не ваш ход' });

        const old = currentPlayer.milSplit || { infantry: 50, tanks: 30, artillery: 20, air: 0 };
        const lines = ['infantry', 'tanks', 'artillery', 'air'];
        const newSplit = { infantry: i, tanks: t, artillery: a, air: ai };

        if (!currentPlayer.milLines) {
            currentPlayer.milLines = {
                infantry: { efficiency: 1.0 },
                tanks: { efficiency: 1.0 },
                artillery: { efficiency: 1.0 },
                air: { efficiency: 1.0 }
            };
        }

        lines.forEach(line => {
            const oldVal = old[line] || 0;
            const newVal = newSplit[line];
            if (newVal < oldVal) {
                const lostRatio = (oldVal - newVal) / Math.max(1, oldVal);
                currentPlayer.milLines[line].efficiency = Math.max(
                    LINE_EFFICIENCY_MIN,
                    currentPlayer.milLines[line].efficiency - LINE_EFFICIENCY_SWITCH_PENALTY * lostRatio
                );
            }
        });

        currentPlayer.milSplit = newSplit;
        state.updatedAt = new Date();
        saveStateNonBlocking(roomId, state);
        res.json({ success: true, state });
    } catch (e) {
        console.error('mil-split error:', e);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ============ 🏗️ СТРОИТЕЛЬСТВО (без логов) ============
app.post('/api/game/rooms/:id/build', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const roomId = req.params.id;
        const { buildingType, provinceId } = req.body;
        if (!BUILDING_TYPES[buildingType]) return res.status(400).json({ error: 'Неизвестное здание' });
        if (!provinceId) return res.status(400).json({ error: 'Не указана провинция' });
        const state = await loadState(roomId);
        if (!state) return res.status(404).json({ error: 'Игра не найдена' });

        const currentPlayer = state.players[state.currentPlayerIndex];
        if (currentPlayer.username !== decoded.username) return res.status(403).json({ error: 'Сейчас не ваш ход' });

        const targetProv = state.provinces[provinceId];
        if (!targetProv) return res.status(400).json({ error: 'Провинция не найдена' });
        if (targetProv.country !== currentPlayer.country) return res.status(400).json({ error: 'Это не ваша провинция' });
        if (targetProv.isSea || targetProv.country === 'water') return res.status(400).json({ error: 'Нельзя строить в море' });

        if (!currentPlayer.constructionQueue) currentPlayer.constructionQueue = [];
        if (currentPlayer.constructionQueue.length >= 3) return res.status(400).json({ error: 'Очередь строительства заполнена (макс 3)' });

        const b = BUILDING_TYPES[buildingType];

        if (b.steelCost > 0) {
            if (!currentPlayer.steelPool) currentPlayer.steelPool = 0;
            if (currentPlayer.steelPool < b.steelCost) {
                return res.status(400).json({ error: `Не хватает 🔩 стали (нужно ${b.steelCost}, есть ${Math.floor(currentPlayer.steelPool)})` });
            }
            currentPlayer.steelPool -= b.steelCost;
        }

        currentPlayer.constructionQueue.push({
            type: buildingType, provinceId, progress: 0,
            totalProgress: b.buildTime, steelCost: b.steelCost, startedAt: state.turn
        });

        // 🔇 Лог строительства отключён
        state.updatedAt = new Date();
        saveStateNonBlocking(roomId, state, [provinceId]);
        res.json({ success: true, state });
    } catch (e) {
        console.error('build error:', e);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ============ КОНЕЦ ХОДА (ПОЛНЫЙ, БЕЗ СТРАТЕГИЧЕСКИХ ЛОГОВ) ============
app.post('/api/game/rooms/:id/move', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const roomId = req.params.id;
        const { type, data } = req.body;
        const state = await loadState(roomId);
        if (!state) return res.status(404).json({ error: 'Игра не найдена' });
        const currentPlayer = state.players[state.currentPlayerIndex];
        if (currentPlayer.username !== decoded.username) return res.status(403).json({ error: 'Сейчас не ваш ход' });

        let logMessage = '';
        if (type === 'end_turn') {
            let nextIdx = state.currentPlayerIndex;
            let attempts = 0;
            do {
                nextIdx = (nextIdx + 1) % state.players.length;
                attempts++;
            } while (state.players[nextIdx]?.isAI && attempts < state.players.length);

            let roundComplete = false;
            if (attempts >= state.players.length) roundComplete = true;
            else if (nextIdx <= state.currentPlayerIndex) roundComplete = true;

            state.currentPlayerIndex = nextIdx;
            const nextPlayer = state.players[state.currentPlayerIndex];
            if (nextPlayer) nextPlayer.armyMovement = {};

            if (roundComplete) {
                state.turn++;

                state.players.forEach(p => {
                    const inc = calculatePlayerIncome(state, p);

                    p.resources.manpower = (p.resources.manpower || 0) + inc.manpower;
                    p.manpowerPool = Math.max(0, (p.manpowerPool || 0) - inc.draft);
                    p.steelPool = Math.round(((p.steelPool || 0) + inc.steelProduced) * 100) / 100;
                    p.oilPool = Math.round(((p.oilPool || 0) + inc.oilProduced) * 100) / 100;
                    p.resources.civIC = inc.civIC;
                    p.resources.milIC = inc.milIC;

                    const inWar = (state.wars || []).some(w => w.attacker === p.country || w.defender === p.country);
                    let popGrowth = inWar ? POP_GROWTH_WAR : POP_GROWTH_PEACE;

                    const totalUnits = Object.values(state.provinces)
                        .filter(pr => pr.country === p.country)
                        .reduce((s, pr) => s + Object.values(pr.units || {}).reduce((a, u) =>
                            a + Object.values(u).reduce((x, n) => x + (n || 0), 0), 0), 0);
                    const needGoods = Math.floor((p.manpowerPool || 0) / 100000 + totalUnits * 0.3);
                    const hasDeficit = inc.consumerGoods < needGoods;

                    if (hasDeficit) {
                        popGrowth = POP_GROWTH_DEFICIT;
                        p.unrest = Math.min(100, (p.unrest || 0) + 1);
                        // 🔇 Лог дефицита отключён
                    } else {
                        p.unrest = Math.max(0, (p.unrest || 0) - 2);
                    }

                    p.manpowerPool = Math.max(0, Math.round((p.manpowerPool || 0) * (1 + popGrowth)));

                    const unrestPenalty = 1 - Math.min(0.5, (p.unrest || 0) / 200);
                    const effectiveMilIC = Math.floor(inc.milIC * unrestPenalty);

                    // 🏗️ СТРОИТЕЛЬСТВО (без логов)
                    let availableCivIC = inc.civIC;
                    if (!p.constructionQueue) p.constructionQueue = [];
                    p.constructionQueue.forEach(item => {
                        if (item.done) return;
                        const b = BUILDING_TYPES[item.type];
                        if (!b) return;
                        const remaining = item.totalProgress - item.progress;
                        const spend = Math.min(availableCivIC, remaining);
                        item.progress += spend;
                        availableCivIC -= spend;

                        if (item.progress >= item.totalProgress) {
                            item.done = true;
                            const prov = state.provinces[item.provinceId];
                            if (prov && prov.country === p.country) {
                                if (item.type === 'civFactory') prov.civFactories = (prov.civFactories || 0) + 1;
                                else if (item.type === 'milFactory') prov.milFactories = (prov.milFactories || 0) + 1;
                                else if (item.type === 'airFactory') prov.airFactories = (prov.airFactories || 0) + 1;
                                else if (item.type === 'airbase') prov.airbases = (prov.airbases || 0) + 1;
                                else if (item.type === 'aagun') prov.aaguns = (prov.aaguns || 0) + 1;
                            }
                            // 🔇 Лог постройки отключён
                        }
                    });
                    p.constructionQueue = p.constructionQueue.filter(i => !i.done);

                    // ⚙️ MIL ЛИНИИ (4)
                    if (!p.milLines) {
                        p.milLines = {
                            infantry: { efficiency: 1.0 },
                            tanks: { efficiency: 1.0 },
                            artillery: { efficiency: 1.0 },
                            air: { efficiency: 1.0 }
                        };
                    }
                    if (!p.milSplit) p.milSplit = { infantry: 40, tanks: 20, artillery: 15, air: 25 };

                    const milByLine = {
                        infantry: Math.floor(effectiveMilIC * (p.milSplit.infantry || 0) / 100),
                        tanks: Math.floor(effectiveMilIC * (p.milSplit.tanks || 0) / 100),
                        artillery: Math.floor(effectiveMilIC * (p.milSplit.artillery || 0) / 100),
                        air: Math.floor(effectiveMilIC * (p.milSplit.air || 0) / 100)
                    };
                    const assignedMil = milByLine.infantry + milByLine.tanks + milByLine.artillery + milByLine.air;
                    milByLine.infantry += effectiveMilIC - assignedMil;

                    // ⚔️ ПРОИЗВОДСТВО НАЗЕМКИ (без логов)
                    if (!p.productionQueue) p.productionQueue = [];
                    p.productionQueue.forEach(item => {
                        if (item.done) return;
                        const line = item.unitType;
                        const u = UNIT_COSTS[line];
                        if (!u) return;
                        const prov = state.provinces[item.provinceId];
                        if (!prov) { item.done = true; return; }
                        const hexUnits = prov.units?.[item.hexKey] || {};
                        const totalOnHex = Object.values(hexUnits).reduce((s, n) => s + (n || 0), 0);
                        if (totalOnHex >= MAX_UNITS_PER_HEX) { item.stalled = 'hex_full'; return; }

                        const lineCost = MIL_LINE_COSTS[line];
                        const steelNeeded = milByLine[line] * lineCost.steelPerMil;
                        const oilNeeded = milByLine[line] * lineCost.oilPerMil;
                        let lineEfficiency = p.milLines[line].efficiency;

                        if (p.steelPool < steelNeeded) { lineEfficiency *= 0.5; p.steelPool = Math.max(0, p.steelPool); }
                        else { p.steelPool -= steelNeeded; }
                        if (p.oilPool < oilNeeded) { lineEfficiency *= 0.5; p.oilPool = Math.max(0, p.oilPool); }
                        else { p.oilPool -= oilNeeded; }

                        const remaining = item.totalProgress - item.progress;
                        const aiBoost = p.isAI ? 3.0 : 1.0;
                        const spend = Math.min(milByLine[line] * lineEfficiency * u.speedPerMilIC * aiBoost, remaining);
                        item.progress += spend;
                        item.stalled = null;

                        if (item.progress >= item.totalProgress) {
                            item.done = true;
                            if (!prov.units) prov.units = {};
                            if (!prov.units[item.hexKey]) prov.units[item.hexKey] = {};
                            prov.units[item.hexKey][item.unitType] = (prov.units[item.hexKey][item.unitType] || 0) + 1;
                            // 🔇 Лог готового юнита отключён
                        }
                    });
                    p.productionQueue = p.productionQueue.filter(i => !i.done);

                    // ✈️ ПРОИЗВОДСТВО АВИАЦИИ (без логов)
                    if (!p.airProductionQueue) p.airProductionQueue = [];
                    if (!p.airUnits) p.airUnits = { fighters: 0, bombers: 0, transport: 0 };
                    if (!p.airLosses) p.airLosses = { fighters: 0, bombers: 0, transport: 0 };
                    if (!p.airKills) p.airKills = { fighters: 0, bombers: 0, transport: 0 };

                    p.airProductionQueue.forEach(item => {
                        if (item.done) return;
                        const air = AIR_STATS[item.airType];
                        if (!air) { item.done = true; return; }
                        const prov = state.provinces[item.provinceId];
                        if (!prov || prov.country !== p.country) { item.done = true; return; }
                        if ((prov.airbases || 0) === 0) { item.done = true; return; }

                        const airIC = milByLine.air || 0;
                        if (airIC === 0) { item.stalled = 'no_air_ic'; return; }

                        const spend = Math.min(
                            airIC * air.speedPerMilIC * (p.isAI ? 3 : 1),
                            item.totalProgress - item.progress
                        );
                        item.progress += spend;

                        if (p.oilPool < air.oil) { item.stalled = 'no_oil'; return; }
                        p.oilPool = Math.round((p.oilPool - air.oil * 0.2) * 100) / 100;
                        item.stalled = null;

                        if (item.progress >= item.totalProgress) {
                            item.done = true;
                            p.airUnits[item.airType] = (p.airUnits[item.airType] || 0) + 1;
                            // 🔇 Лог готовой авиации отключён
                        }
                    });
                    p.airProductionQueue = p.airProductionQueue.filter(i => !i.done);

                    // ✈️ РАСХОД НЕФТИ НА АВИАЦИЮ (без логов)
                    const airUpkeep =
                        (p.airUnits.fighters || 0) * AIR_STATS.fighters.oil +
                        (p.airUnits.bombers || 0) * AIR_STATS.bombers.oil +
                        (p.airUnits.transport || 0) * AIR_STATS.transport.oil;

                    if (airUpkeep > 0) {
                        if (p.oilPool >= airUpkeep) {
                            p.oilPool = Math.round((p.oilPool - airUpkeep) * 100) / 100;
                        } else {
                            const lostRatio = 0.1;
                            Object.keys(p.airUnits).forEach(t => {
                                const lost = Math.floor((p.airUnits[t] || 0) * lostRatio);
                                p.airUnits[t] = Math.max(0, (p.airUnits[t] || 0) - lost);
                                // 🔇 Лог потери авиации отключён
                            });
                            p.oilPool = 0;
                        }
                    }

                    // 📈 ЭФФЕКТИВНОСТЬ ЛИНИЙ
                    ['infantry', 'tanks', 'artillery', 'air'].forEach(line => {
                        if (p.milLines[line]) {
                            p.milLines[line].efficiency = Math.min(1.0, p.milLines[line].efficiency + LINE_EFFICIENCY_GAIN);
                        }
                    });

                    // 🔇 Итоговый лог дохода отключён
                });

                gameStateModule.processMarketContracts(state);

                try {
                    gameStateModule.processAllAITurns(state);
                } catch (aiErr) {
                    console.error('❌ AI turn error:', aiErr.message);
                }

                logMessage = `Ход ${state.turn} начался`;
            } else {
                logMessage = `Ход перешёл к ${state.players[state.currentPlayerIndex].username}`;
            }
        }

        if (logMessage) {
            state.eventLog.push({ turn: state.turn, title: '📢', message: logMessage });
            if (state.eventLog.length > 50) state.eventLog = state.eventLog.slice(-50);
        }
        state.updatedAt = new Date();
        saveStateNonBlocking(roomId, state);
        res.json({ success: true, state });
    } catch (e) {
        console.error('move error:', e);
        res.status(500).json({ error: 'Ошибка сервера: ' + e.message });
    }
});

// ============ 🕊️ ДИПЛОМАТИЯ ============
app.post('/api/game/rooms/:id/diplomacy', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const roomId = req.params.id;
        const { action, target, terms } = req.body;

        const state = await loadState(roomId);
        if (!state) return res.status(404).json({ error: 'Игра не найдена' });

        const me = state.players.find(p => p.username === decoded.username);
        if (!me) return res.status(403).json({ error: 'Вы не участник' });

        const result = gameStateModule.processDiplomacyAction(
            state, me, action, target, terms,
            { recalcBordersForProvinces: (st, ids) => recalcBordersForProvinces(st, ids) }
        );

        if (result.error) return res.status(400).json({ error: result.error });

        state.updatedAt = new Date();
        saveStateNonBlocking(roomId, state);
        res.json({ success: true, state });
    } catch (e) {
        console.error('diplomacy error:', e);
        res.status(500).json({ error: 'Ошибка сервера: ' + e.message });
    }
});

// ============ 💰 РЫНОК ============
app.post('/api/game/rooms/:id/market', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const roomId = req.params.id;
        const { action, data } = req.body;

        const state = await loadState(roomId);
        if (!state) return res.status(404).json({ error: 'Игра не найдена' });

        const me = state.players.find(p => p.username === decoded.username);
        if (!me) return res.status(403).json({ error: 'Вы не участник' });

        const result = gameStateModule.processMarketAction(state, me, action, data || {});
        if (result.error) return res.status(400).json({ error: result.error });

        state.updatedAt = new Date();
        saveStateNonBlocking(roomId, state);
        res.json({ success: true, state });
    } catch (e) {
        console.error('market error:', e);
        res.status(500).json({ error: 'Ошибка сервера: ' + e.message });
    }
});

// ============ ЕДИНЫЙ ЭНДПОИНТ ЮНИТОВ (без логов) ============
app.post('/api/game/rooms/:id/unit-action', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const roomId = req.params.id;
        const { action, provinceId, hexKey, unitType, toHex, moveUnits } = req.body;
        const state = await loadState(roomId);
        if (!state) return res.status(404).json({ error: 'Игра не найдена' });

        const currentPlayer = state.players[state.currentPlayerIndex];
        if (currentPlayer.username !== decoded.username) return res.status(403).json({ error: 'Сейчас не ваш ход' });
        const prov = state.provinces[provinceId];
        if (!prov) return res.status(404).json({ error: 'Провинция не найдена' });
        const provHexSet = new Set(prov.hexes.map(([c, r]) => `${c},${r}`));
        if (!provHexSet.has(hexKey)) return res.status(400).json({ error: 'Гекс не в этой провинции' });
        const hexOwner = prov.hexOwner?.[hexKey] || prov.country;
        if (hexOwner !== currentPlayer.country) return res.status(400).json({ error: 'Этот гекс вам не принадлежит' });

        const currentUnits = prov.units?.[hexKey] || {};
        const totalOnHex = Object.values(currentUnits).reduce((s, n) => s + (n || 0), 0);

        if (action === 'recruit') {
            if (!UNIT_STATS[unitType]) return res.status(400).json({ error: 'Неверный тип войск' });
            const u = UNIT_COSTS[unitType];
            if ((currentPlayer.resources.manpower || 0) < u.manpowerCost) {
                return res.status(400).json({ error: `Не хватает 👥 людей (нужно ${u.manpowerCost} тыс.)` });
            }
            if (!currentPlayer.steelPool) currentPlayer.steelPool = 0;
            if (currentPlayer.steelPool < u.steelCost) {
                return res.status(400).json({ error: `Не хватает 🔩 стали (нужно ${u.steelCost}, есть ${Math.floor(currentPlayer.steelPool)})` });
            }

            currentPlayer.resources.manpower -= u.manpowerCost;
            currentPlayer.steelPool -= u.steelCost;

            if (!currentPlayer.productionQueue) currentPlayer.productionQueue = [];
            if (currentPlayer.productionQueue.length >= 5) {
                return res.status(400).json({ error: 'Очередь производства заполнена (макс 5)' });
            }

            currentPlayer.productionQueue.push({
                unitType, provinceId, hexKey, progress: 0,
                totalProgress: u.buildProgress, speedPerMilIC: u.speedPerMilIC,
                startedAt: state.turn, stalled: null
            });

            // 🔇 Лог найма отключён
        } else if (action === 'disband') {
            if (!currentUnits[unitType] || currentUnits[unitType] <= 0) return res.status(400).json({ error: 'Нет такого юнита' });
            currentUnits[unitType] -= 1;
            if (currentUnits[unitType] === 0) delete currentUnits[unitType];
            if (Object.keys(currentUnits).length === 0) delete prov.units[hexKey];

            const u = UNIT_COSTS[unitType];
            const returnManpower = Math.floor(u.manpowerCost * 0.5);
            const returnSteel = Math.floor(u.steelCost * 0.5);
            currentPlayer.manpowerPool = (currentPlayer.manpowerPool || 0) + returnManpower;
            currentPlayer.steelPool = (currentPlayer.steelPool || 0) + returnSteel;

            // 🔇 Лог роспуска отключён
        } else if (action === 'move') {
            if (!toHex || !provHexSet.has(toHex)) return res.status(400).json({ error: 'Целевой гекс не в этой провинции' });
            const targetOwner = prov.hexOwner?.[toHex] || prov.country;
            if (targetOwner !== currentPlayer.country) return res.status(400).json({ error: 'Целевой гекс вам не принадлежит' });
            if (totalOnHex === 0) return res.status(400).json({ error: 'На гексе нет войск' });
            const targetUnits = prov.units?.[toHex] || {};
            const targetCount = Object.values(targetUnits).reduce((s, n) => s + (n || 0), 0);

            let movingUnits;
            if (moveUnits && typeof moveUnits === 'object') {
                movingUnits = {};
                let totalMoving = 0;
                for (const [t, n] of Object.entries(moveUnits)) {
                    const have = currentUnits[t] || 0;
                    const want = parseInt(n) || 0;
                    if (want <= 0) continue;
                    if (want > have) return res.status(400).json({ error: `Недостаточно ${UNIT_STATS[t]?.name || t}: у вас ${have}, запрошено ${want}` });
                    movingUnits[t] = want;
                    totalMoving += want;
                }
                if (totalMoving === 0) return res.status(400).json({ error: 'Не выбрано ни одного юнита' });
            } else {
                movingUnits = { ...currentUnits };
            }

            const movingCount = Object.values(movingUnits).reduce((s, n) => s + n, 0);
            if (targetCount + movingCount > MAX_UNITS_PER_HEX) {
                return res.status(400).json({ error: `На целевом гексе не хватит места (свободно ${MAX_UNITS_PER_HEX - targetCount}, нужно ${movingCount})` });
            }

            const [fc, fr] = hexKey.split(',').map(Number);
            const dirs = (fr & 1) ? ODD_DIRS : EVEN_DIRS;
            const neighbors = dirs.map(([dc, dr]) => `${fc + dc},${fr + dr}`);
            if (!neighbors.includes(toHex)) return res.status(400).json({ error: 'Только на соседний гекс' });

            const fromState = getArmyMP(currentPlayer, hexKey);
            if (fromState.mp < MP_COST_MOVE) {
                return res.status(400).json({ error: `У армии не осталось очков движения (${fromState.mp}/${MP_PER_TURN})` });
            }

            const oilCost = calcOilCostMove(movingUnits);
            if (oilCost > 0) {
                if (!currentPlayer.oilPool) currentPlayer.oilPool = 0;
                if (currentPlayer.oilPool < oilCost) {
                    return res.status(400).json({ error: `Не хватает ⛽ нефти для перемещения (нужно ${oilCost}, есть ${Math.floor(currentPlayer.oilPool)})` });
                }
                currentPlayer.oilPool -= oilCost;
            }

            const remainingAfterMove = {};
            for (const [t, n] of Object.entries(currentUnits)) {
                const moving = movingUnits[t] || 0;
                const left = n - moving;
                if (left > 0) remainingAfterMove[t] = left;
            }
            const isMovingAll = Object.keys(remainingAfterMove).length === 0;
            const oldFromMP = fromState.mp;
            const oldFromAttacks = fromState.attacks;

            if (!prov.units) prov.units = {};
            if (!prov.units[toHex]) prov.units[toHex] = {};
            for (const [t, n] of Object.entries(movingUnits)) {
                prov.units[toHex][t] = (prov.units[toHex][t] || 0) + n;
                if (!prov.units[hexKey]) prov.units[hexKey] = {};
                prov.units[hexKey][t] = (prov.units[hexKey][t] || 0) - n;
                if (prov.units[hexKey][t] <= 0) delete prov.units[hexKey][t];
            }
            if (prov.units[hexKey] && Object.keys(prov.units[hexKey]).length === 0) {
                delete prov.units[hexKey];
            }

            const newMP = oldFromMP - MP_COST_MOVE;
            if (isMovingAll) {
                delete currentPlayer.armyMovement[hexKey];
            } else {
                currentPlayer.armyMovement[hexKey] = { mp: oldFromMP, attacks: oldFromAttacks };
            }

            const toState = getArmyMP(currentPlayer, toHex);
            const targetOldMP = toState.mp;
            const targetOldAttacks = toState.attacks;
            toState.mp = Math.min(targetOldMP, newMP);
            toState.attacks = Math.max(targetOldAttacks, oldFromAttacks);

            // 🔇 Лог перемещения отключён
        } else {
            return res.status(400).json({ error: 'Неизвестное действие' });
        }
        if (state.eventLog.length > 50) state.eventLog = state.eventLog.slice(-50);
        state.updatedAt = new Date();
        saveStateNonBlocking(roomId, state, [provinceId]);
        res.json({ success: true, state });
    } catch (e) {
        console.error('unit-action error:', e);
        res.status(500).json({ error: 'Ошибка сервера: ' + e.message });
    }
});

// ============ ✈️ ПРОИЗВОДСТВО АВИАЦИИ (без логов) ============
app.post('/api/game/rooms/:id/air-recruit', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const roomId = req.params.id;
        const { airType, provinceId } = req.body;
        const state = await loadState(roomId);
        if (!state) return res.status(404).json({ error: 'Игра не найдена' });

        const currentPlayer = state.players[state.currentPlayerIndex];
        if (currentPlayer.username !== decoded.username) return res.status(403).json({ error: 'Сейчас не ваш ход' });

        const air = AIR_STATS[airType];
        if (!air) return res.status(400).json({ error: 'Неверный тип авиации' });

        const prov = state.provinces[provinceId];
        if (!prov) return res.status(404).json({ error: 'Провинция не найдена' });
        if (prov.country !== currentPlayer.country) return res.status(400).json({ error: 'Это не ваша провинция' });
        if (!prov.airbases || prov.airbases < 1) return res.status(400).json({ error: 'Нужен хотя бы 1 аэродром в провинции' });
        if ((currentPlayer.steelPool || 0) < air.cost) return res.status(400).json({ error: `Не хватает 🔩 стали (нужно ${air.cost})` });
        if ((currentPlayer.resources.manpower || 0) < air.manpower) return res.status(400).json({ error: `Не хватает 👥 людей (нужно ${air.manpower} тыс.)` });
        if ((currentPlayer.oilPool || 0) < air.oil * 5) return res.status(400).json({ error: `Не хватает ⛽ нефти на производство (нужно ${air.oil * 5})` });

        if (!currentPlayer.airProductionQueue) currentPlayer.airProductionQueue = [];
        if (currentPlayer.airProductionQueue.length >= 5) return res.status(400).json({ error: 'Очередь производства авиации заполнена (макс 5)' });

        currentPlayer.steelPool -= air.cost;
        currentPlayer.resources.manpower -= air.manpower;
        currentPlayer.oilPool -= air.oil * 5;

        currentPlayer.airProductionQueue.push({
            airType, provinceId, progress: 0,
            totalProgress: air.buildProgress, startedAt: state.turn
        });

        // 🔇 Лог производства авиации отключён
        if (state.eventLog.length > 50) state.eventLog = state.eventLog.slice(-50);
        state.updatedAt = new Date();
        saveStateNonBlocking(roomId, state, [provinceId]);
        res.json({ success: true, state });
    } catch (e) {
        console.error('air-recruit error:', e);
        res.status(500).json({ error: 'Ошибка сервера: ' + e.message });
    }
});

// ============ 🪂 ВОЗДУШНЫЙ ДЕСАНТ ============
app.post('/api/game/rooms/:id/paradrop', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const roomId = req.params.id;
        const { fromProvinceId, fromHex, toProvinceId, toHex, units } = req.body;

        const state = await loadState(roomId);
        if (!state) return res.status(404).json({ error: 'Игра не найдена' });

        const currentPlayer = state.players[state.currentPlayerIndex];
        if (currentPlayer.username !== decoded.username) return res.status(403).json({ error: 'Сейчас не ваш ход' });

        const transports = currentPlayer.airUnits?.transport || 0;
        if (transports < PARADROP_MIN_TRANSPORT) {
            return res.status(400).json({ error: `Нужно минимум ${PARADROP_MIN_TRANSPORT} транспортников (у вас ${transports})` });
        }

        const fromProv = state.provinces[fromProvinceId];
        const toProv = state.provinces[toProvinceId];
        if (!fromProv || !toProv) return res.status(404).json({ error: 'Провинция не найдена' });
        if (fromProv.country !== currentPlayer.country) return res.status(400).json({ error: 'Провинция-источник не ваша' });
        if (toProv.country === currentPlayer.country) return res.status(400).json({ error: 'Это ваша провинция' });
        if (toProv.country === 'water') return res.status(400).json({ error: 'Это море' });

        const myAirbases = [];
        Object.entries(state.provinces).forEach(([id, p]) => {
            if (p.country === currentPlayer.country && (p.airbases || 0) > 0) {
                (p.hexes || []).forEach(([c, r]) => myAirbases.push(`${c},${r}`));
            }
        });

        let canReach = false;
        for (const abHex of myAirbases) {
            if (hexDistance(abHex, toHex) <= AIR_STATS.transport.range) {
                canReach = true;
                break;
            }
        }

        if (!canReach) {
            return res.status(400).json({ error: `Нет аэродрома в радиусе ${AIR_STATS.transport.range} гексов от цели` });
        }

        const targetUnits = toProv.units?.[toHex] || {};
        const targetCount = Object.values(targetUnits).reduce((s, n) => s + n, 0);
        if (targetCount > 0) {
            return res.status(400).json({ error: 'В целевом гексе есть войска — сначала уничтожьте их' });
        }

        const targetHexOwner = toProv.hexOwner?.[toHex] || toProv.country;
        const atWar = (state.wars || []).some(w =>
            (w.attacker === currentPlayer.country && w.defender === targetHexOwner) ||
            (w.defender === currentPlayer.country && w.attacker === targetHexOwner)
        );

        if (!atWar) {
            const targetName = (typeof COUNTRIES !== 'undefined' && COUNTRIES[targetHexOwner]?.name) || targetHexOwner;
            return res.status(400).json({ 
                error: `Сначала объявите войну ${targetName}! Десант в мирное время невозможен.` 
            });
        }

        const myFighters = currentPlayer.airUnits?.fighters || 0;
        const enemy = state.players.find(p => p.country === targetHexOwner);
        const enemyFighters = enemy?.airUnits?.fighters || 0;
        if (myFighters < enemyFighters * 0.8) {
            return res.status(400).json({ error: 'Нет господства в воздухе' });
        }

        const fromUnits = fromProv.units?.[fromHex] || {};
        const paradropUnits = {};
        let totalDropped = 0;
        for (const [type, count] of Object.entries(units || {})) {
            const have = fromUnits[type] || 0;
            const want = parseInt(count) || 0;
            if (want <= 0) continue;
            if (want > have) return res.status(400).json({ error: `Недостаточно ${UNIT_STATS[type]?.name || type}` });
            paradropUnits[type] = want;
            totalDropped += want;
        }
        if (totalDropped === 0) return res.status(400).json({ error: 'Не выбрано ни одного юнита' });
        if (totalDropped > transports) return res.status(400).json({ error: `Нужно ${totalDropped} транспортников, у вас ${transports}` });

        const oilCost = totalDropped * 3;
        if ((currentPlayer.oilPool || 0) < oilCost) {
            return res.status(400).json({ error: `Не хватает ⛽ нефти (нужно ${oilCost})` });
        }
        currentPlayer.oilPool -= oilCost;

        if (!toProv.units) toProv.units = {};
        if (!toProv.units[toHex]) toProv.units[toHex] = {};
        for (const [type, count] of Object.entries(paradropUnits)) {
            toProv.units[toHex][type] = (toProv.units[toHex][type] || 0) + count;
            fromProv.units[fromHex][type] = (fromProv.units[fromHex][type] || 0) - count;
            if (fromProv.units[fromHex][type] <= 0) delete fromProv.units[fromHex][type];
        }
        if (Object.keys(fromProv.units[fromHex]).length === 0) delete fromProv.units[fromHex];

        if (!toProv.hexOwner) toProv.hexOwner = {};
        toProv.hexOwner[toHex] = currentPlayer.country;

        const allHexes = toProv.hexes || [];
        const allMine = allHexes.every(([c, r]) => {
            const k = `${c},${r}`;
            return (toProv.hexOwner[k] || toProv.country) === currentPlayer.country;
        });
        let provinceCaptured = false;
        if (allMine) {
            toProv.country = currentPlayer.country;
            provinceCaptured = true;
        }

        currentPlayer.airUnits.transport = Math.max(0, transports - 1);

        state.eventLog.push({
            turn: state.turn, title: '🪂',
            message: `${currentPlayer.username} высадил десант в ${toProv.name}${provinceCaptured ? ' — вся провинция!' : ''} (−${oilCost}⛽)`
        });

        if (state.eventLog.length > 50) state.eventLog = state.eventLog.slice(-50);
        state.updatedAt = new Date();
        saveStateNonBlocking(roomId, state, [fromProvinceId, toProvinceId]);
        res.json({ success: true, state });
    } catch (e) {
        console.error('paradrop error:', e);
        res.status(500).json({ error: 'Ошибка сервера: ' + e.message });
    }
});

// ============ ⚔️ ВОЗДУШНЫЙ БОЙ ============
app.post('/api/game/rooms/:id/air-battle', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const roomId = req.params.id;
        const { provinceId, hexKey } = req.body;

        const state = await loadState(roomId);
        if (!state) return res.status(404).json({ error: 'Игра не найдена' });

        const currentPlayer = state.players[state.currentPlayerIndex];
        if (currentPlayer.username !== decoded.username) return res.status(403).json({ error: 'Сейчас не ваш ход' });

        const prov = state.provinces[provinceId];
        if (!prov) return res.status(404).json({ error: 'Провинция не найдена' });

        const targetCountry = prov.hexOwner?.[hexKey] || prov.country;
        if (targetCountry === currentPlayer.country) return res.status(400).json({ error: 'Это ваш гекс' });

        const atWar = (state.wars || []).some(w =>
            (w.attacker === currentPlayer.country && w.defender === targetCountry) ||
            (w.defender === currentPlayer.country && w.attacker === targetCountry)
        );

        if (!atWar) {
            const targetName = (typeof COUNTRIES !== 'undefined' && COUNTRIES[targetCountry]?.name) || targetCountry;
            return res.status(400).json({ 
                error: `Сначала объявите войну ${targetName}! Бомбардировка в мирное время невозможна.` 
            });
        }

        const enemy = state.players.find(p => p.country === targetCountry);
        if (!enemy) return res.status(404).json({ error: 'Враг не найден' });

        const myFighters = currentPlayer.airUnits?.fighters || 0;
        const myBombers = currentPlayer.airUnits?.bombers || 0;
        const enemyFighters = enemy.airUnits?.fighters || 0;

        if (myFighters + myBombers === 0) return res.status(400).json({ error: 'У вас нет авиации' });

        const myAirbases = [];
        Object.entries(state.provinces).forEach(([id, p]) => {
            if (p.country === currentPlayer.country && (p.airbases || 0) > 0) {
                (p.hexes || []).forEach(([c, r]) => myAirbases.push(`${c},${r}`));
            }
        });

        const maxRange = Math.max(
            myFighters > 0 ? AIR_STATS.fighters.range : 0,
            myBombers > 0 ? AIR_STATS.bombers.range : 0
        );

        let canReach = false;
        for (const abHex of myAirbases) {
            if (hexDistance(abHex, hexKey) <= maxRange) {
                canReach = true;
                break;
            }
        }

        if (!canReach) {
            return res.status(400).json({ 
                error: `Нет аэродрома в радиусе ${maxRange} гексов. Постройте 🛬 Аэродром ближе к цели.` 
            });
        }

        const oilCost = AIR_COMBAT_FUEL_COST * (myFighters + myBombers);
        if ((currentPlayer.oilPool || 0) < oilCost) {
            return res.status(400).json({ error: `Не хватает ⛽ нефти (нужно ${oilCost})` });
        }
        currentPlayer.oilPool = Math.round((currentPlayer.oilPool - oilCost) * 100) / 100;

        const myPower = myFighters * AIR_STATS.fighters.attack + myBombers * AIR_STATS.bombers.attack;
        const enemyPower = enemyFighters * AIR_STATS.fighters.defense;

        const result = {
            myPower: Math.round(myPower), enemyPower: Math.round(enemyPower),
            myLosses: { fighters: 0, bombers: 0, transport: 0 },
            enemyLosses: { fighters: 0, bombers: 0, transport: 0 },
            groundDamage: 0
        };

        if (enemyFighters > 0) {
            const myLossRatio = Math.min(0.5, enemyPower / Math.max(1, myPower) * AIR_COMBAT_LOSS_RATIO);
            const enemyLossRatio = Math.min(0.5, myPower / Math.max(1, enemyPower) * AIR_COMBAT_LOSS_RATIO);

            result.myLosses.fighters = Math.floor(myFighters * myLossRatio);
            result.myLosses.bombers = Math.floor(myBombers * myLossRatio * 0.5);
            result.enemyLosses.fighters = Math.floor(enemyFighters * enemyLossRatio);

            currentPlayer.airUnits.fighters -= result.myLosses.fighters;
            currentPlayer.airUnits.bombers -= result.myLosses.bombers;
            enemy.airUnits.fighters -= result.enemyLosses.fighters;

            currentPlayer.airLosses.fighters += result.myLosses.fighters;
            currentPlayer.airLosses.bombers += result.myLosses.bombers;
            enemy.airLosses.fighters += result.enemyLosses.fighters;
            currentPlayer.airKills.fighters += result.enemyLosses.fighters;
            enemy.airKills.fighters += result.myLosses.fighters;
        }

        if (myBombers > 0) {
            const groundTargets = prov.units?.[hexKey] || {};
            const groundCount = Object.values(groundTargets).reduce((s, n) => s + n, 0);
            if (groundCount > 0) {
                const enemyAA = prov.aaguns || 0;
                const aaDamage = enemyAA * AA_DAMAGE_PER_GUN;
                const bomberLosses = Math.min(myBombers, Math.floor(aaDamage));
                currentPlayer.airUnits.bombers -= bomberLosses;
                currentPlayer.airLosses.bombers += bomberLosses;
                result.myLosses.bombers += bomberLosses;

                const damageRatio = 0.2 + Math.random() * 0.2;
                const killed = Math.floor(groundCount * damageRatio);
                result.groundDamage = killed;

                let killedLeft = killed;
                for (const [type, count] of Object.entries(groundTargets)) {
                    if (killedLeft <= 0) break;
                    const kill = Math.min(count, killedLeft);
                    groundTargets[type] -= kill;
                    killedLeft -= kill;
                    if (groundTargets[type] <= 0) delete groundTargets[type];
                }
                if (Object.keys(groundTargets).length === 0) delete prov.units[hexKey];
            }
        }

        const totalMyLosses = result.myLosses.fighters + result.myLosses.bombers;
        const totalEnemyLosses = result.enemyLosses.fighters;

        state.eventLog.push({
            turn: state.turn, title: '⚔️✈️',
            message: `${currentPlayer.username}: воздушный бой над ${prov.name} — сбито ${totalEnemyLosses} врагов, потеряно ${totalMyLosses} (−${oilCost}⛽)`
        });

        if (state.eventLog.length > 50) state.eventLog = state.eventLog.slice(-50);
        state.updatedAt = new Date();
        saveStateNonBlocking(roomId, state, [provinceId]);
        res.json({ success: true, result, state });
    } catch (e) {
        console.error('air-battle error:', e);
        res.status(500).json({ error: 'Ошибка сервера: ' + e.message });
    }
});

// ============ АТАКА ГЕКСА ============
app.post('/api/game/rooms/:id/attack-hex', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const roomId = req.params.id;
        const { fromHex, toHex } = req.body;
        if (!fromHex || !toHex) return res.status(400).json({ error: 'Не указаны гексы' });
        const state = await loadState(roomId);
        if (!state) return res.status(404).json({ error: 'Игра не найдена' });
        const attacker = state.players[state.currentPlayerIndex];
        if (attacker.username !== decoded.username) return res.status(403).json({ error: 'Сейчас не ваш ход' });

        const [fc, fr] = fromHex.split(',').map(Number);
        const [tc, tr] = toHex.split(',').map(Number);
        let fromProv = null, toProv = null;
        for (const [id, p] of Object.entries(state.provinces)) {
            const hexSet = new Set(p.hexes.map(([c, r]) => `${c},${r}`));
            if (hexSet.has(fromHex)) fromProv = p;
            if (hexSet.has(toHex)) toProv = p;
        }
        if (!fromProv || !toProv) return res.status(400).json({ error: 'Гекс не найден' });

        const fromHexOwner = fromProv.hexOwner?.[fromHex] || fromProv.country;
        if (fromHexOwner !== attacker.country) return res.status(400).json({ error: 'Гекс-источник не ваш' });
        const targetHexOwner = toProv.hexOwner?.[toHex] || toProv.country;
        if (targetHexOwner === attacker.country) return res.status(400).json({ error: 'Это ваш гекс' });
        if (targetHexOwner === 'water') return res.status(400).json({ error: 'Это море' });

        const atWar = (state.wars || []).some(w =>
            (w.attacker === attacker.country && w.defender === targetHexOwner) ||
            (w.defender === attacker.country && w.attacker === targetHexOwner)
        );

        if (!atWar) {
            const hasPact = (state.pacts || []).some(p =>
                (p.a === attacker.country && p.b === targetHexOwner) ||
                (p.b === attacker.country && p.a === targetHexOwner)
            );
            const targetName = (typeof COUNTRIES !== 'undefined' && COUNTRIES[targetHexOwner]?.name) || targetHexOwner;
            
            if (hasPact) {
                return res.status(400).json({ 
                    error: `У вас пакт с ${targetName}. Разорвите пакт в дипломатии и объявите войну.` 
                });
            }
            
            return res.status(400).json({ 
                error: `Сначала объявите войну ${targetName}! Атака в мирное время невозможна.` 
            });
        }

        const neighborKeys = getNeighborKeys(fc, fr);
        if (!neighborKeys.includes(toHex)) return res.status(400).json({ error: 'Гексы не соседние' });

        const fromUnits = { ...(fromProv.units?.[fromHex] || {}) };
        if (getHexStrength(fromUnits, true) <= 0) return res.status(400).json({ error: 'На гексе нет войск' });

        const armyState = getArmyMP(attacker, fromHex);
        if (armyState.mp < MP_COST_ATTACK) {
            return res.status(400).json({ error: `У армии не осталось очков движения (${armyState.mp}/${MP_PER_TURN})` });
        }

        const oilCost = calcOilCostAttack(fromUnits);
        if (oilCost > 0) {
            if (!attacker.oilPool) attacker.oilPool = 0;
            if (attacker.oilPool < oilCost) {
                return res.status(400).json({ error: `Не хватает ⛽ нефти для атаки (нужно ${oilCost}, есть ${Math.floor(attacker.oilPool)})` });
            }
            attacker.oilPool -= oilCost;
        }

        const fatigueMult = getFatigueMultiplier(attacker, fromHex);
        const attackerStrength = getHexStrength(fromUnits, true) * fatigueMult;

        const toUnits = { ...(toProv.units?.[toHex] || {}) };
        let defenderStrength = getHexStrength(toUnits, false);

        const toNeighbors = getNeighborKeys(tc, tr);
        const toProvHexSet = new Set(toProv.hexes.map(([c, r]) => `${c},${r}`));
        let supportBonus = 0;
        for (const nKey of toNeighbors) {
            if (!toProvHexSet.has(nKey)) continue;
            const nHexOwner = toProv.hexOwner?.[nKey] || toProv.country;
            if (nHexOwner !== targetHexOwner) continue;
            const nUnits = toProv.units?.[nKey];
            if (nUnits && getHexUnitCount(nUnits) > 0) {
                supportBonus += 0.2;
                if (supportBonus >= 0.6) break;
            }
        }
        defenderStrength *= (1 + supportBonus);

        const result = {
            fromHex, toHex,
            attackerStrength: Math.round(attackerStrength * 10) / 10,
            defenderStrength: Math.round(defenderStrength * 10) / 10,
            supportBonus: Math.round(supportBonus * 100),
            fatiguePenalty: Math.round((1 - fatigueMult) * 100),
            oilCost, captured: false, attackerLosses: {}, defenderLosses: {},
            retreated: false, retreatHex: null, provinceCaptured: false
        };

        const attackerWins = attackerStrength > defenderStrength;

        if (attackerWins) {
            const attackerLossRatio = Math.min(0.7, defenderStrength / attackerStrength * 0.5);
            const excludeKeys = new Set([fromHex, toHex]);
            const retreatHex = findRetreatHex(toProv, toHex, toHex, excludeKeys, targetHexOwner);
            let survivors = {};
            if (retreatHex && getHexUnitCount(toUnits) > 0) {
                survivors = applyLosses(toUnits, 0.5);
                if (getHexUnitCount(survivors) > 0) {
                    const existing = toProv.units[retreatHex] || {};
                    const merged = { ...existing };
                    for (const [t, n] of Object.entries(survivors)) {
                        merged[t] = Math.min(MAX_UNITS_PER_HEX, (merged[t] || 0) + n);
                    }
                    toProv.units[retreatHex] = merged;
                    result.retreated = true;
                    result.retreatHex = retreatHex;
                }
            }
            result.defenderLosses = survivors;
            const survivingAttackers = applyLosses(fromUnits, attackerLossRatio);
            result.attackerLosses = survivingAttackers;
            delete toProv.units[toHex];
            fromProv.units[fromHex] = {};
            toProv.units[toHex] = survivingAttackers;
            if (!toProv.hexOwner) toProv.hexOwner = {};
            toProv.hexOwner[toHex] = attacker.country;
            result.captured = true;

            const allHexes = toProv.hexes || [];
            const allOwner = allHexes.every(([c, r]) => {
                const k = `${c},${r}`;
                return (toProv.hexOwner[k] || toProv.country) === attacker.country;
            });
            if (allOwner) { toProv.country = attacker.country; result.provinceCaptured = true; }
            else {
                const oldOwnerHexesLeft = allHexes.filter(([c, r]) => {
                    const k = `${c},${r}`;
                    return (toProv.hexOwner[k] || toProv.country) === targetHexOwner;
                });
                if (oldOwnerHexesLeft.length === 0) { toProv.country = attacker.country; result.provinceCaptured = true; }
            }

            armyState.mp -= MP_COST_ATTACK;
            armyState.attacks += 1;
            const newHexState = getArmyMP(attacker, toHex);
            newHexState.attacks = armyState.attacks;
            newHexState.mp = Math.min(newHexState.mp, armyState.mp);
        } else {
            const attackerLossRatio = 0.7;
            const defenderLossRatio = Math.min(0.6, attackerStrength / defenderStrength * 0.5);
            const survivingAttackers = applyLosses(fromUnits, attackerLossRatio);
            const survivingDefenders = applyLosses(toUnits, defenderLossRatio);
            fromProv.units[fromHex] = survivingAttackers;
            toProv.units[toHex] = survivingDefenders;
            result.attackerLosses = survivingAttackers;
            result.defenderLosses = survivingDefenders;
            armyState.mp -= MP_COST_ATTACK;
            armyState.attacks += 1;
        }

        try {
            const provincesToRecalc = new Set([fromProv.id, toProv.id]);
            const toProvHexSet2 = new Set(toProv.hexes.map(([c, r]) => `${c},${r}`));
            Object.entries(state.provinces).forEach(([id, p]) => {
                if (id === toProv.id || id === fromProv.id) return;
                if (p.country === 'water' || p.isSea) return;
                if (p.hexes.some(([c, r]) => {
                    const neighbors = getNeighborKeys(c, r);
                    return neighbors.some(nk => toProvHexSet2.has(nk));
                })) {
                    provincesToRecalc.add(id);
                }
            });
            recalcBordersForProvinces(state, Array.from(provincesToRecalc));
        } catch (borderErr) { console.error('border recalc error:', borderErr); }

        const oilText = oilCost > 0 ? ` (−${oilCost}⛽)` : '';
        state.eventLog.push({
            turn: state.turn, title: attackerWins ? '⚔️' : '🛡️',
            message: attackerWins
                ? `${attacker.username} захватил гекс ${toHex} в ${toProv.name}${result.provinceCaptured ? ' — вся провинция!' : ''}${oilText}`
                : `${attacker.username} отбит в ${toProv.name}${oilText}`
        });
        if (state.eventLog.length > 50) state.eventLog = state.eventLog.slice(-50);
        state.updatedAt = new Date();
        saveStateNonBlocking(roomId, state, [fromProv.id, toProv.id]);
        res.json({ success: true, result, state });
    } catch (e) {
        console.error('attack-hex error:', e);
        res.status(500).json({ error: 'Ошибка сервера: ' + e.message });
    }
});

// ============ УДАЛЕНИЕ КОМНАТЫ ============
app.delete('/api/game/rooms/:id', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const roomId = req.params.id;
        if (firebaseInitialized) {
            const doc = await db.collection('gameRooms').doc(roomId).get();
            if (!doc.exists) return res.status(404).json({ error: 'Комната не найдена' });
            if (doc.data().createdBy !== decoded.username && decoded.role !== 'admin') return res.status(403).json({ error: 'Нет прав' });
            await db.collection('gameRooms').doc(roomId).delete();
            await db.collection('gameStates').doc(roomId).delete();
            await db.collection('gameProvinces').doc(roomId).delete();
        } else {
            const room = memoryDB.gameRooms?.[roomId];
            if (!room) return res.status(404).json({ error: 'Комната не найдена' });
            if (room.createdBy !== decoded.username && decoded.role !== 'admin') return res.status(403).json({ error: 'Нет прав' });
            delete memoryDB.gameRooms[roomId];
            delete memoryDB.gameStates[roomId];
        }
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

// ============ 🧹 АВТООЧИСТКА ============
async function runCleanup() {
    console.log('🧹 Запуск автоочистки...');
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    try {
        if (firebaseInitialized) {
            const rooms = await db.collection('gameRooms').get();
            for (const doc of rooms.docs) {
                const r = doc.data();
                let createdAt = r.createdAt;
                if (createdAt && typeof createdAt.toDate === 'function') createdAt = createdAt.toDate().getTime();
                else if (createdAt && createdAt._seconds) createdAt = createdAt._seconds * 1000;
                else createdAt = now;
                if (createdAt < oneDayAgo) {
                    await doc.ref.delete();
                    await db.collection('gameStates').doc(doc.id).delete();
                    await db.collection('gameProvinces').doc(doc.id).delete();
                }
            }
        } else {
            for (const roomId of Object.keys(memoryDB.gameRooms || {})) {
                const r = memoryDB.gameRooms[roomId];
                if (new Date(r.createdAt).getTime() < oneDayAgo) {
                    delete memoryDB.gameRooms[roomId];
                    delete memoryDB.gameStates[roomId];
                }
            }
        }
        console.log('🧹 Автоочистка завершена');
    } catch (err) { console.error('❌ Ошибка автоочистки:', err); }
}

function scheduleCleanup() {
    if (cleanupInterval) clearInterval(cleanupInterval);
    cleanupInterval = setInterval(async () => {
        const now = new Date();
        const utcHour = now.getUTCHours();
        const utcMinute = now.getUTCMinutes();
        const mskHour = (utcHour + MSK_OFFSET_HOURS) % 24;
        if (mskHour === CLEANUP_HOUR_MSK && utcMinute === 0) {
            const today = now.toISOString().split('T')[0];
            if (global.__lastCleanupRun === today) return;
            global.__lastCleanupRun = today;
            await runCleanup();
        }
    }, 60 * 1000);
}

// ============ СТАТИКА ============
app.get('/style.css', (req, res) => res.sendFile(path.join(__dirname, 'public', 'style.css')));
app.get('/admin.css', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.css')));
app.get('/script.js', (req, res) => res.sendFile(path.join(__dirname, 'public', 'script.js')));
app.get('/admin.js', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.js')));
app.get('/favicon.ico', (req, res) => res.sendFile(path.join(__dirname, 'public', 'favicon.ico')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

app.get('/api/test', (req, res) => {
    res.json({ status: 'ok', firebase: firebaseInitialized ? 'connected' : 'not connected' });
});
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ============ ЗАПУСК ============
async function startServer() {
    const adminExists = await getUser('admin');
    if (!adminExists) {
        const hp = await bcrypt.hash('admin123', 10);
        await createUser('admin', hp, 'admin');
        console.log('✅ Создан admin / admin123');
    }
    const userExists = await getUser('user');
    if (!userExists) {
        const hp = await bcrypt.hash('user123', 10);
        await createUser('user', hp, 'user');
        console.log('✅ Создан user / user123');
    }
    scheduleCleanup();

    if (process.env.NODE_ENV !== 'production') {
        app.listen(PORT, () => {
            console.log(`\n🚀 Сервер запущен на http://localhost:${PORT}`);
            console.log('👤 admin / admin123 | user / user123');
            if (!firebaseInitialized) console.log('⚠️ Данные в памяти');
            else console.log('✅ Данные в Firebase');
            console.log('✈️ Радиус: истр=8, бомб=12, трансп=15');
            console.log('🛬 Радиус десанта: 10 гексов');
        });
    }
}

if (process.env.NODE_ENV === 'production') module.exports = app;
startServer();