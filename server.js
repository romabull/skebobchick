const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const path = require('path');
const cors = require('cors');

// ============ 🔥 FIREBASE ADMIN ============
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'physics_platform_secret_2026';

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(cors({
    origin: process.env.NODE_ENV === 'production' ? false : '*',
    credentials: true
}));

// ============ 📁 СТАТИЧЕСКИЕ ФАЙЛЫ ============
app.use(express.static(path.join(__dirname, 'public')));

// ============ 🔥 ПОДКЛЮЧЕНИЕ К FIREBASE ============

let db = null;
let firebaseInitialized = false;

function initFirebase() {
    try {
        const fs = require('fs');
        if (fs.existsSync(path.join(__dirname, 'serviceAccountKey.json'))) {
            const serviceAccount = require('./serviceAccountKey.json');
            initializeApp({
                credential: cert(serviceAccount)
            });
            db = getFirestore();
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

// ============ 📦 FALLBACK: ХРАНИЛИЩЕ В ПАМЯТИ ============
const memoryDB = {
    users: {},
    tests: {},
    results: {},
    callRooms: {},
    callSignals: [],
    lessons: {},
    testIdCounter: 1
};

// ============ 🔥 ФУНКЦИИ РАБОТЫ С БД ============

async function getUser(username) {
    if (firebaseInitialized) {
        try {
            const doc = await db.collection('users').doc(username).get();
            if (doc.exists) return doc.data();
        } catch (error) {
            console.error('❌ Ошибка получения пользователя:', error.message);
        }
    }
    return memoryDB.users[username] || null;
}

async function createUser(username, password, role = 'user') {
    if (firebaseInitialized) {
        try {
            await db.collection('users').doc(username).set({
                username, password, role, created: new Date()
            });
            return true;
        } catch (error) {
            console.error('❌ Ошибка создания пользователя:', error.message);
        }
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
        } catch (error) {
            console.error('❌ Ошибка получения тестов:', error.message);
        }
    }
    return Object.values(memoryDB.tests);
}

async function getTest(testId) {
    if (firebaseInitialized) {
        try {
            const doc = await db.collection('tests').doc(String(testId)).get();
            if (doc.exists) return { id: doc.id, ...doc.data() };
        } catch (error) {
            console.error('❌ Ошибка получения теста:', error.message);
        }
    }
    return memoryDB.tests[testId] || null;
}

async function createTest(testData) {
    if (firebaseInitialized) {
        try {
            const docRef = await db.collection('tests').add({
                ...testData, createdAt: new Date()
            });
            return { id: docRef.id, ...testData };
        } catch (error) {
            console.error('❌ Ошибка создания теста:', error.message);
        }
    }
    const testId = memoryDB.testIdCounter++;
    const newTest = { id: testId, ...testData };
    memoryDB.tests[testId] = newTest;
    return newTest;
}

async function updateTest(testId, testData) {
    if (firebaseInitialized) {
        try {
            await db.collection('tests').doc(String(testId)).update(testData);
            return true;
        } catch (error) {
            console.error('❌ Ошибка обновления теста:', error.message);
            return false;
        }
    }
    if (memoryDB.tests[testId]) {
        memoryDB.tests[testId] = { id: testId, ...testData };
        return true;
    }
    return false;
}

async function deleteTest(testId) {
    if (firebaseInitialized) {
        try {
            await db.collection('tests').doc(String(testId)).delete();
            return true;
        } catch (error) {
            console.error('❌ Ошибка удаления теста:', error.message);
        }
    }
    delete memoryDB.tests[testId];
    return true;
}

async function saveResult(username, resultData) {
    if (firebaseInitialized) {
        try {
            await db.collection('results').add({
                username, ...resultData, completedAt: new Date()
            });
            return true;
        } catch (error) {
            console.error('❌ Ошибка сохранения результата:', error.message);
        }
    }
    if (!memoryDB.results[username]) memoryDB.results[username] = [];
    memoryDB.results[username].push({ ...resultData, completedAt: new Date() });
    return true;
}

async function getUserResults(username) {
    if (firebaseInitialized) {
        try {
            const snapshot = await db.collection('results')
                .where('username', '==', username).get();
            const results = [];
            snapshot.forEach(doc => results.push({ id: doc.id, ...doc.data() }));
            return results;
        } catch (error) {
            console.error('❌ Ошибка получения результатов:', error.message);
        }
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
        } catch (error) {
            console.error('❌ Ошибка получения пользователей:', error.message);
        }
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
        } catch (error) {
            console.error('❌ Ошибка получения результатов:', error.message);
        }
    }
    const allResults = [];
    Object.values(memoryDB.results).forEach(userResults => allResults.push(...userResults));
    return allResults;
}

// ============ ЛОГИРОВАНИЕ ============
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
        
        if (username.length < 3 || password.length < 4) {
            return res.status(400).json({ error: 'Имя минимум 3 символа, пароль - 4' });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        await createUser(username, hashedPassword, role);
        res.json({ success: true, message: 'Регистрация успешна!', role });
    } catch (error) {
        console.error('Ошибка регистрации:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await getUser(username);
        if (!user) return res.status(400).json({ error: 'Пользователь не найден' });
        
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(400).json({ error: 'Неверный пароль' });
        
        const token = jwt.sign({ username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
      res.cookie('token', token, { 
    httpOnly: true, 
    maxAge: 86400000,
    sameSite: 'none',  
    secure: true       
});
        res.json({ success: true, username, role: user.role });
    } catch (error) {
        console.error('Ошибка входа:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.post('/api/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ success: true });
});

app.get('/api/me', (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        res.json({ username: decoded.username, role: decoded.role });
    } catch (error) {
        res.status(401).json({ error: 'Не авторизован' });
    }
});

// ============ ТЕСТЫ ============

app.get('/api/tests', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    try {
        jwt.verify(token, JWT_SECRET);
        const tests = await getTests();
        res.json(tests);
    } catch (error) {
        res.status(401).json({ error: 'Не авторизован' });
    }
});

app.get('/api/tests/:id', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    try {
        jwt.verify(token, JWT_SECRET);
        const test = await getTest(req.params.id);
        if (!test) return res.status(404).json({ error: 'Тест не найден' });
        res.json(test);
    } catch (error) {
        res.status(401).json({ error: 'Не авторизован' });
    }
});

app.post('/api/tests', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role !== 'admin') return res.status(403).json({ error: 'Доступ только для администратора' });
        
        const { title, description, class: classNum, category, timeLimit, questions, linkedLessonIds } = req.body;
        if (!title || !questions || !Array.isArray(questions) || questions.length === 0) {
            return res.status(400).json({ error: 'Некорректные данные' });
        }
        
        const newTest = {
            title,
            description: description || '',
            class: classNum || '7-8',
            category: category || 'Другое',
            timeLimit: parseInt(timeLimit) || 0,
            questions: questions.map((q, index) => ({
                id: index + 1,
                type: q.type || 'choice',
                question: q.question,
                options: q.type === 'input' ? [] : q.options,
                correct: q.type === 'input' ? q.correctText : parseInt(q.correct),
                correctText: q.type === 'input' ? q.correctText : '',
                hint: q.hint || '',
                image: q.image || null
            })),
            linkedLessonIds: Array.isArray(linkedLessonIds) ? linkedLessonIds : [],
            createdBy: decoded.username
        };
        
        const created = await createTest(newTest);
        if (!created) return res.status(500).json({ error: 'Ошибка создания теста' });
        
        console.log(`✅ Создан тест: ${title}`);
        res.json({ success: true, testId: created.id, test: created });
    } catch (error) {
        console.error('Ошибка создания теста:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.put('/api/tests/:id', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role !== 'admin') return res.status(403).json({ error: 'Доступ только для администратора' });
        
        const testId = req.params.id;
        const { title, description, class: classNum, category, timeLimit, questions, linkedLessonIds } = req.body;
        
        const existingTest = await getTest(testId);
        if (!existingTest) return res.status(404).json({ error: 'Тест не найден' });
        
        if (!title || !questions || !Array.isArray(questions) || questions.length === 0) {
            return res.status(400).json({ error: 'Некорректные данные' });
        }
        
        const updatedTest = {
            title,
            description: description || '',
            class: classNum || '7-8',
            category: category || 'Другое',
            timeLimit: parseInt(timeLimit) || 0,
            questions: questions.map((q, index) => ({
                id: index + 1,
                type: q.type || 'choice',
                question: q.question,
                options: q.type === 'input' ? [] : q.options,
                correct: q.type === 'input' ? q.correctText : parseInt(q.correct),
                correctText: q.type === 'input' ? q.correctText : '',
                hint: q.hint || '',
                image: q.image || null
            })),
            linkedLessonIds: Array.isArray(linkedLessonIds) ? linkedLessonIds : [],
            createdBy: existingTest.createdBy || decoded.username,
            updatedAt: new Date()
        };
        
        const success = await updateTest(testId, updatedTest);
        if (success) {
            console.log(`✅ Обновлен тест: ${title}`);
            res.json({ success: true, message: 'Тест обновлен', test: { id: testId, ...updatedTest } });
        } else {
            res.status(500).json({ error: 'Ошибка обновления теста' });
        }
    } catch (error) {
        console.error('Ошибка обновления теста:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.delete('/api/tests/:id', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role !== 'admin') return res.status(403).json({ error: 'Доступ только для администратора' });
        
        const testId = req.params.id;
        const test = await getTest(testId);
        if (!test) return res.status(404).json({ error: 'Тест не найден' });
        
        await deleteTest(testId);
        res.json({ success: true, message: 'Тест удален' });
    } catch (error) {
        console.error('Ошибка удаления теста:', error);
        res.status(401).json({ error: 'Не авторизован' });
    }
});

// ============ ПРОХОЖДЕНИЕ ТЕСТОВ ============

app.post('/api/tests/:id/check', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const testId = req.params.id;
        const { answers, timeSpent } = req.body;
        
        const test = await getTest(testId);
        if (!test) return res.status(404).json({ error: 'Тест не найден' });
        
        let correct = 0;
        const results = test.questions.map((q, index) => {
            const userAnswer = answers[index];
            let isCorrect = false;
            let displayAnswer = '';
            let correctAnswer = '';
            
            if (q.type === 'input') {
                const userText = (userAnswer || '').toString().trim().toLowerCase();
                const correctText = (q.correctText || '').toString().trim().toLowerCase();
                isCorrect = userText === correctText;
                displayAnswer = userAnswer || 'Не отвечено';
                correctAnswer = q.correctText;
            } else {
                isCorrect = userAnswer === q.correct;
                displayAnswer = userAnswer !== undefined ? q.options[userAnswer] : 'Не отвечено';
                correctAnswer = q.options[q.correct];
            }
            
            if (isCorrect) correct++;
            
            return {
                questionId: q.id,
                type: q.type || 'choice',
                question: q.question,
                image: q.image || null,
                userAnswer: displayAnswer,
                correctAnswer: correctAnswer,
                isCorrect,
                hint: q.hint || ''
            };
        });
        
        const resultData = {
            testId: testId,
            testTitle: test.title,
            category: test.category || 'Другое',
            username: decoded.username,
            total: test.questions.length,
            correct,
            percentage: Math.round((correct / test.questions.length) * 100),
            timeSpent: timeSpent || 0,
            results
        };
        
        await saveResult(decoded.username, resultData);
        res.json(resultData);
    } catch (error) {
        console.error('Ошибка проверки теста:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.get('/api/results', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const userResults = await getUserResults(decoded.username);
        res.json(userResults);
    } catch (error) {
        res.status(401).json({ error: 'Не авторизован' });
    }
});

// ============ СТАТИСТИКА ============

app.get('/api/admin/stats', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role !== 'admin') return res.status(403).json({ error: 'Доступ только для администратора' });
        
        const users = await getAllUsers();
        const tests = await getTests();
        const results = await getAllResults();
        
        const categoryStats = {};
        tests.forEach(t => {
            const cat = t.category || 'Другое';
            if (!categoryStats[cat]) categoryStats[cat] = { tests: 0, completions: 0 };
            categoryStats[cat].tests++;
        });
        
        results.forEach(r => {
            const cat = r.category || 'Другое';
            if (categoryStats[cat]) categoryStats[cat].completions++;
        });
        
        res.json({
            totalUsers: users.length,
            totalTests: tests.length,
            totalResults: results.length,
            categoryStats,
            tests: tests.map(t => ({
                id: t.id, title: t.title, category: t.category,
                questions: t.questions?.length || 0,
                timeLimit: t.timeLimit || 0, createdBy: t.createdBy
            })),
            users: users.map(u => ({
                username: u.username,
                role: u.role || 'user'
            }))
        });
    } catch (error) {
        console.error('Ошибка получения статистики:', error);
        res.status(401).json({ error: 'Не авторизован' });
    }
});

// ============ 🏆 ТАБЛИЦА ЛИДЕРОВ ============

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
                leaderboard.push({
                    username,
                    bestScore: best.percentage,
                    totalTests: list.length,
                    bestTest: best.testTitle,
                    completedAt: best.completedAt
                });
            }
        });
        
        leaderboard.sort((a, b) => b.bestScore - a.bestScore);
        res.json(leaderboard);
    } catch (error) {
        console.error('Ошибка получения лидеров:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ============ 📞 АУДИОЗВОНКИ ============

app.post('/api/calls/rooms', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const { name } = req.body;
        
        const roomId = 'room_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        const room = {
            id: roomId,
            name: name || `Звонок ${decoded.username}`,
            createdBy: decoded.username,
            createdAt: new Date(),
            active: true
        };
        
        if (firebaseInitialized) {
            await db.collection('callRooms').doc(roomId).set(room);
        } else {
            memoryDB.callRooms[roomId] = room;
        }
        
        console.log(`📞 Создана комната: ${room.name}`);
        res.json({ success: true, room });
    } catch (error) {
        console.error('Ошибка создания комнаты:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
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
                if (createdAt && typeof createdAt.toDate === 'function') {
                    createdAt = createdAt.toDate().toISOString();
                } else if (createdAt && createdAt._seconds) {
                    createdAt = new Date(createdAt._seconds * 1000).toISOString();
                } else if (!createdAt) {
                    createdAt = new Date().toISOString();
                }
                rooms.push({ id: doc.id, ...data, createdAt });
            });
        } else {
            rooms = Object.values(memoryDB.callRooms || {});
        }
        
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
        rooms = rooms.filter(r => {
            const time = new Date(r.createdAt).getTime();
            return isNaN(time) || time > oneDayAgo;
        });
        
        rooms.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        res.json(rooms);
    } catch (error) {
        console.error('Ошибка получения комнат:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
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
            const room = doc.data();
            if (room.createdBy !== decoded.username && decoded.role !== 'admin') {
                return res.status(403).json({ error: 'Нет прав' });
            }
            await db.collection('callRooms').doc(roomId).delete();
            
            const signals = await db.collection('callSignals').where('roomId', '==', roomId).get();
            signals.forEach(async (s) => await s.ref.delete());
        } else {
            if (!memoryDB.callRooms[roomId]) return res.status(404).json({ error: 'Комната не найдена' });
            const room = memoryDB.callRooms[roomId];
            if (room.createdBy !== decoded.username && decoded.role !== 'admin') {
                return res.status(403).json({ error: 'Нет прав' });
            }
            delete memoryDB.callRooms[roomId];
            memoryDB.callSignals = memoryDB.callSignals.filter(s => s.roomId !== roomId);
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка удаления комнаты:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.post('/api/calls/signal', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const { roomId, type, data, to } = req.body;
        
        const signal = {
            roomId,
            from: decoded.username,
            to: to || null,
            type,
            data: JSON.stringify(data),
            createdAt: new Date()
        };
        
        if (firebaseInitialized) {
            await db.collection('callSignals').add(signal);
        } else {
            signal.createdAt = Date.now();
            memoryDB.callSignals.push(signal);
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка отправки сигнала:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
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
            const snapshot = await db.collection('callSignals')
                .where('roomId', '==', roomId).get();
            
            const oneMinuteAgo = Date.now() - 60000;
            snapshot.forEach(doc => {
                const s = { id: doc.id, ...doc.data() };
                
                let createdAt = s.createdAt;
                if (createdAt && typeof createdAt.toDate === 'function') {
                    createdAt = createdAt.toDate().getTime();
                } else if (createdAt && createdAt._seconds) {
                    createdAt = createdAt._seconds * 1000;
                } else if (typeof createdAt === 'number') {
                    // уже число
                } else {
                    createdAt = Date.now();
                }
                
                if (createdAt < oneMinuteAgo) {
                    doc.ref.delete();
                    return;
                }
                
                if ((s.to === null || s.to === decoded.username) && s.from !== decoded.username) {
                    if (!lastTime || createdAt > parseInt(lastTime)) {
                        signals.push({ ...s, createdAt });
                    }
                }
            });
        } else {
            const oneMinuteAgo = Date.now() - 60000;
            memoryDB.callSignals = memoryDB.callSignals.filter(s => s.createdAt > oneMinuteAgo);
            
            signals = memoryDB.callSignals.filter(s => 
                s.roomId === roomId && 
                s.from !== decoded.username &&
                (s.to === null || s.to === decoded.username) &&
                (!lastTime || s.createdAt > parseInt(lastTime))
            );
        }
        
        res.json(signals);
    } catch (error) {
        console.error('Ошибка получения сигналов:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ============ 📚 ОБУЧЕНИЕ ============

app.post('/api/lessons', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role !== 'admin') return res.status(403).json({ error: 'Доступ только для администратора' });
        
        const { title, category, content, formulas, examples, image, linkedTestIds } = req.body;
        if (!title || !content) return res.status(400).json({ error: 'Нужны заголовок и содержание' });
        
        const lesson = {
            title,
            category: category || 'Другое',
            content,
            formulas: Array.isArray(formulas) ? formulas : [],
            examples: Array.isArray(examples) ? examples : [],
            image: image || null,
            linkedTestIds: Array.isArray(linkedTestIds) ? linkedTestIds : [],
            createdBy: decoded.username,
            createdAt: new Date()
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
        
        console.log(`📚 Создана статья: ${title}`);
        res.json({ success: true, lesson: created });
    } catch (error) {
        console.error('Ошибка создания статьи:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
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
                if (createdAt && typeof createdAt.toDate === 'function') {
                    createdAt = createdAt.toDate().toISOString();
                }
                lessons.push({ id: doc.id, ...data, createdAt });
            });
        } else {
            lessons = Object.values(memoryDB.lessons || {});
        }
        
        lessons.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        res.json(lessons);
    } catch (error) {
        console.error('Ошибка получения статей:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
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
                if (createdAt && typeof createdAt.toDate === 'function') {
                    createdAt = createdAt.toDate().toISOString();
                }
                lesson = { id: doc.id, ...data, createdAt };
            }
        } else {
            lesson = memoryDB.lessons[req.params.id] || null;
        }
        
        if (!lesson) return res.status(404).json({ error: 'Статья не найдена' });
        res.json(lesson);
    } catch (error) {
        console.error('Ошибка получения статьи:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.put('/api/lessons/:id', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role !== 'admin') return res.status(403).json({ error: 'Доступ только для администратора' });
        
        const { title, category, content, formulas, examples, image, linkedTestIds } = req.body;
        const lessonId = req.params.id;
        
        const updatedLesson = {
            title,
            category: category || 'Другое',
            content,
            formulas: Array.isArray(formulas) ? formulas : [],
            examples: Array.isArray(examples) ? examples : [],
            image: image || null,
            linkedTestIds: Array.isArray(linkedTestIds) ? linkedTestIds : [],
            updatedAt: new Date()
        };
        
        if (firebaseInitialized) {
            const doc = await db.collection('lessons').doc(lessonId).get();
            if (!doc.exists) return res.status(404).json({ error: 'Статья не найдена' });
            await db.collection('lessons').doc(lessonId).update(updatedLesson);
        } else {
            if (!memoryDB.lessons[lessonId]) {
                return res.status(404).json({ error: 'Статья не найдена' });
            }
            memoryDB.lessons[lessonId] = { ...memoryDB.lessons[lessonId], ...updatedLesson };
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка обновления статьи:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.delete('/api/lessons/:id', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role !== 'admin') return res.status(403).json({ error: 'Доступ только для администратора' });
        
        const lessonId = req.params.id;
        
        if (firebaseInitialized) {
            await db.collection('lessons').doc(lessonId).delete();
        } else {
            delete memoryDB.lessons[lessonId];
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка удаления статьи:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ============ СТАТИЧЕСКИЕ ФАЙЛЫ ============

app.get('/style.css', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'style.css'));
});

app.get('/admin.css', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.css'));
});

app.get('/script.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'script.js'));
});

app.get('/admin.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.js'));
});

app.get('/favicon.ico', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'favicon.ico'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/api/test', (req, res) => {
    res.json({ 
        status: 'ok', 
        firebase: firebaseInitialized ? 'connected' : 'not connected'
    });
});

// ВСЕГДА В КОНЦЕ!
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============ ЗАПУСК ============

async function startServer() {
    const adminExists = await getUser('admin');
    if (!adminExists) {
        const hashedPassword = await bcrypt.hash('admin123', 10);
        await createUser('admin', hashedPassword, 'admin');
        console.log('✅ Создан администратор: admin / admin123');
    }
    
    const userExists = await getUser('user');
    if (!userExists) {
        const hashedPassword = await bcrypt.hash('user123', 10);
        await createUser('user', hashedPassword, 'user');
        console.log('✅ Создан пользователь: user / user123');
    }
    
    const existingTests = await getTests();
    if (existingTests.length === 0) {
        const testQuestions = [
            {
                type: 'choice',
                question: 'Какая формула используется для расчета скорости?',
                options: ['v = s/t', 'v = t/s', 'v = s*t', 'v = s/t²'],
                correct: 0,
                hint: 'Скорость = расстояние / время'
            },
            {
                type: 'input',
                question: 'В каких единицах измеряется скорость в системе СИ? (напишите сокращённо)',
                options: [],
                correctText: 'м/с',
                hint: 'Метр в секунду'
            }
        ];
        
        await createTest({
            title: 'Основы физики',
            description: 'Тест по основным формулам и понятиям физики',
            class: '7-8',
            category: 'Механика',
            timeLimit: 10,
            questions: testQuestions,
            linkedLessonIds: [],
            createdBy: 'admin'
        });
        console.log('✅ Тестовый тест создан');
    }
    
    if (process.env.NODE_ENV !== 'production') {
        app.listen(PORT, () => {
            console.log(`\n🚀 Сервер запущен на http://localhost:${PORT}`);
            console.log('\n👤 Доступные аккаунты:');
            console.log('   📋 Администратор: admin / admin123');
            console.log('   📋 Пользователь: user / user123');
            console.log(`\n🌐 Откройте http://localhost:${PORT}`);
            if (!firebaseInitialized) {
                console.log('\n⚠️ Данные хранятся в памяти!');
            } else {
                console.log('✅ Данные сохраняются в Firebase');
            }
        });
    }
}

if (process.env.NODE_ENV === 'production') {
    module.exports = app;
}

startServer();