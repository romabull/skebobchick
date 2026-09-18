const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const path = require('path');
const cors = require('cors');

// ============ 🔥 FIREBASE ADMIN ============
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'physics_platform_secret_2026';

// ============ 🧹 АВТООЧИСТКА ============
const CLEANUP_HOUR_MSK = 12;
const MSK_OFFSET_HOURS = 3;
let cleanupInterval = null;

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
let messaging = null;
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

// ============ 📦 FALLBACK: ХРАНИЛИЩЕ В ПАМЯТИ ============
const memoryDB = {
    users: {},
    tests: {},
    results: {},
    callRooms: {},
    callSignals: [],
    lessons: {},
    categories: {},
    notificationFeed: [],
    userLocations: {},
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

// ============ 📱 PUSH-ТОКЕНЫ ============

app.post('/api/push-token', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const { token: fcmToken } = req.body;
        
        if (!fcmToken) return res.status(400).json({ error: 'Нет токена' });
        
        if (firebaseInitialized) {
            await db.collection('users').doc(decoded.username).update({
                fcmToken: fcmToken,
                fcmUpdatedAt: new Date()
            });
        } else {
            if (memoryDB.users[decoded.username]) {
                memoryDB.users[decoded.username].fcmToken = fcmToken;
                memoryDB.users[decoded.username].fcmUpdatedAt = new Date();
            }
        }
        
        console.log(`📱 Сохранён FCM-токен для ${decoded.username}`);
        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка сохранения токена:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
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

        // ✅ Одно общее уведомление в одном документе
        try {
            const notificationId = 'notif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
            const notification = {
                id: notificationId,
                type: 'new_test',
                title: '📝 Новый тест',
                message: `Добавлен тест "${title}" в категории "${newTest.category}"`,
                testId: created.id,
                testTitle: title,
                category: newTest.category,
                createdAt: new Date()
            };
            
            if (firebaseInitialized) {
                const feedRef = db.collection('notification_feed').doc('current');
                const feedDoc = await feedRef.get();
                
                let feed = [];
                if (feedDoc.exists) {
                    feed = feedDoc.data().items || [];
                }
                
                feed.unshift(notification);
                feed = feed.slice(0, 20);
                
                await feedRef.set({
                    items: feed,
                    updatedAt: new Date()
                });
            } else {
                if (!memoryDB.notificationFeed) memoryDB.notificationFeed = [];
                memoryDB.notificationFeed.unshift(notification);
                memoryDB.notificationFeed = memoryDB.notificationFeed.slice(0, 20);
            }
            
            console.log(`📢 Уведомление создано: ${title}`);
            
            // Push через FCM
            if (messaging) {
                const users = await getAllUsers();
                for (const user of users) {
                    if (user.username === decoded.username) continue;
                    if (!user.fcmToken) continue;
                    
                    try {
                        await messaging.send({
                            token: user.fcmToken,
                            notification: {
                                title: '📝 Новый тест',
                                body: `Добавлен тест "${title}" в категории "${newTest.category}"`
                            },
                            android: {
                                priority: 'high',
                                notification: {
                                    channelId: 'default',
                                    sound: 'default'
                                }
                            }
                        });
                        console.log(`📤 Push отправлен ${user.username}`);
                    } catch (e) {
                        console.error(`Ошибка push для ${user.username}:`, e.message);
                    }
                }
            }
        } catch (err) {
            console.error('Ошибка создания уведомления:', err);
        }

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
        
        const signalId = `${roomId}_${decoded.username}_${type}_${to || 'all'}`;
        
        const signal = {
            roomId,
            from: decoded.username,
            to: to || null,
            type,
            data: JSON.stringify(data),
            createdAt: new Date(),
            updatedAt: new Date()
        };
        
        if (firebaseInitialized) {
            const docRef = db.collection('callSignals').doc(signalId);
            const doc = await docRef.get();
            
            if (doc.exists) {
                await docRef.update({
                    data: signal.data,
                    updatedAt: new Date(),
                    createdAt: new Date()
                });
            } else {
                await docRef.set(signal);
            }
        } else {
            signal.createdAt = Date.now();
            signal.updatedAt = Date.now();
            
            memoryDB.callSignals = memoryDB.callSignals.filter(s => 
                !(s.roomId === roomId && s.from === decoded.username && s.type === type && (s.to || null) === (to || null))
            );
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
            memoryDB.callSignals = memoryDB.callSignals.filter(s => s.updatedAt > oneMinuteAgo);
            
            signals = memoryDB.callSignals.filter(s => 
                s.roomId === roomId && 
                s.from !== decoded.username &&
                (s.to === null || s.to === decoded.username) &&
                (!lastTime || s.updatedAt > parseInt(lastTime))
            );
        }
        
        res.json(signals);
    } catch (error) {
        console.error('Ошибка получения сигналов:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
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
        } else {
            categories = Object.values(memoryDB.categories || {});
        }
        
        if (categories.length === 0) {
            const defaults = ['Механика', 'Термодинамика', 'Электричество', 'Оптика', 'Квантовая физика', 'Астрономия', 'Другое'];
            for (const name of defaults) {
                if (firebaseInitialized) {
                    const docRef = await db.collection('categories').add({
                        name, createdAt: new Date()
                    });
                    categories.push({ id: docRef.id, name, createdAt: new Date() });
                }
            }
        }
        
        res.json(categories);
    } catch (error) {
        console.error('Ошибка получения категорий:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.post('/api/categories', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role !== 'admin') {
            return res.status(403).json({ error: 'Доступ только для администратора' });
        }
        
        const { name } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Введите название' });
        }
        
        const trimmedName = name.trim();
        
        let exists = false;
        if (firebaseInitialized) {
            const snapshot = await db.collection('categories')
                .where('name', '==', trimmedName).get();
            exists = !snapshot.empty;
        } else {
            exists = Object.values(memoryDB.categories || {}).some(c => c.name === trimmedName);
        }
        
        if (exists) {
            return res.status(400).json({ error: 'Такая категория уже есть' });
        }
        
        const newCategory = {
            name: trimmedName,
            createdAt: new Date(),
            createdBy: decoded.username
        };
        
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
        
        console.log(`📚 Создана категория: ${trimmedName}`);
        res.json({ success: true, category: created });
    } catch (error) {
        console.error('Ошибка создания категории:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.delete('/api/categories/:id', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role !== 'admin') {
            return res.status(403).json({ error: 'Доступ только для администратора' });
        }
        
        const catId = req.params.id;
        
        if (firebaseInitialized) {
            await db.collection('categories').doc(catId).delete();
        } else {
            if (memoryDB.categories) delete memoryDB.categories[catId];
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка удаления категории:', error);
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

// ============ 📍 ГЕОЛОКАЦИЯ ============

app.post('/api/location', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const { latitude, longitude, accuracy } = req.body;
        
        if (!latitude || !longitude) {
            return res.status(400).json({ error: 'Нет координат' });
        }
        
        const today = new Date().toISOString().split('T')[0];
        const docId = `${decoded.username}_${today}`;
        
        const locationData = {
            username: decoded.username,
            date: today,
            latitude,
            longitude,
            accuracy: accuracy || null,
            updatedAt: new Date(),
            visits: 1
        };
        
        if (firebaseInitialized) {
            // ✅ Удаляем все старые локации этого пользователя
            const oldDocs = await db.collection('userLocations')
                .where('username', '==', decoded.username)
                .get();
            
            for (const doc of oldDocs.docs) {
                if (doc.id !== docId) {
                    await doc.ref.delete();
                }
            }
            
            // ✅ Пишем/обновляем сегодняшнюю
            const docRef = db.collection('userLocations').doc(docId);
            const doc = await docRef.get();
            
            if (doc.exists) {
                const existing = doc.data();
                await docRef.update({
                    latitude,
                    longitude,
                    accuracy: accuracy || null,
                    updatedAt: new Date(),
                    visits: (existing.visits || 0) + 1
                });
                console.log(`📍 Обновлена геолокация ${decoded.username}: ${latitude}, ${longitude}`);
            } else {
                await docRef.set(locationData);
                console.log(`📍 Новая геолокация ${decoded.username}: ${latitude}, ${longitude}`);
            }
        } else {
            if (!memoryDB.userLocations) memoryDB.userLocations = {};
            
            for (const key of Object.keys(memoryDB.userLocations)) {
                if (memoryDB.userLocations[key].username === decoded.username && key !== docId) {
                    delete memoryDB.userLocations[key];
                }
            }
            
            if (memoryDB.userLocations[docId]) {
                memoryDB.userLocations[docId].latitude = latitude;
                memoryDB.userLocations[docId].longitude = longitude;
                memoryDB.userLocations[docId].accuracy = accuracy;
                memoryDB.userLocations[docId].updatedAt = new Date();
                memoryDB.userLocations[docId].visits = (memoryDB.userLocations[docId].visits || 0) + 1;
            } else {
                memoryDB.userLocations[docId] = locationData;
            }
        }
        
        res.json({ success: true, docId });
    } catch (error) {
        console.error('Ошибка геолокации:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.get('/api/admin/locations', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role !== 'admin') {
            return res.status(403).json({ error: 'Доступ только для администратора' });
        }
        
        let locations = [];
        
        if (firebaseInitialized) {
            const snapshot = await db.collection('userLocations')
                .orderBy('updatedAt', 'desc')
                .limit(100)
                .get();
            snapshot.forEach(doc => locations.push({ id: doc.id, ...doc.data() }));
        } else {
            locations = Object.values(memoryDB.userLocations || {});
        }
        
        res.json(locations);
    } catch (error) {
        console.error('Ошибка получения геолокаций:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
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
            if (feedDoc.exists) {
                feed = feedDoc.data().items || [];
            }
        } else {
            feed = memoryDB.notificationFeed || [];
        }
        
        feed.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        res.json({ notifications: feed, unreadCount: 0 });
    } catch (error) {
        console.error('Ошибка получения уведомлений:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.post('/api/notifications/read', async (req, res) => {
    // Прочитанность хранится в localStorage у пользователя
    res.json({ success: true, updated: 0 });
});

app.delete('/api/notifications/:id', async (req, res) => {
    res.json({ success: true });
});

// ============ 🧹 ЕЖЕДНЕВНАЯ ОЧИСТКА В 12:00 МСК ============

async function runCleanup() {
    console.log('🧹 Запуск автоочистки...');
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const today = new Date().toISOString().split('T')[0];
    
    try {
        // ===== 1. СИГНАЛЫ старше 1 часа =====
        let signalsDeleted = 0;
        if (firebaseInitialized) {
            const signals = await db.collection('callSignals').get();
            for (const doc of signals.docs) {
                const s = doc.data();
                let createdAt = s.createdAt;
                if (createdAt && typeof createdAt.toDate === 'function') {
                    createdAt = createdAt.toDate().getTime();
                } else if (createdAt && createdAt._seconds) {
                    createdAt = createdAt._seconds * 1000;
                } else if (typeof createdAt === 'number') {
                    // уже число
                } else {
                    createdAt = now;
                }
                if (createdAt < oneHourAgo) {
                    await doc.ref.delete();
                    signalsDeleted++;
                }
            }
        } else {
            const before = memoryDB.callSignals.length;
            memoryDB.callSignals = memoryDB.callSignals.filter(s => s.updatedAt > oneHourAgo);
            signalsDeleted = before - memoryDB.callSignals.length;
        }
        console.log(`   ✅ Сигналов удалено: ${signalsDeleted}`);
        
        // ===== 2. УВЕДОМЛЕНИЯ — старше 1 дня, максимум 20 =====
        let notifsDeleted = 0;
        if (firebaseInitialized) {
            const feedRef = db.collection('notification_feed').doc('current');
            const feedDoc = await feedRef.get();
            
            if (feedDoc.exists) {
                const feed = feedDoc.data().items || [];
                const filtered = feed.filter(n => {
                    const t = new Date(n.createdAt).getTime();
                    return t > oneDayAgo;
                }).slice(0, 20);
                
                notifsDeleted = feed.length - filtered.length;
                
                await feedRef.set({
                    items: filtered,
                    updatedAt: new Date()
                });
            }
            
            // Чистим старые отдельные уведомления (на случай, если остались)
            const oldNotifs = await db.collection('notifications').get();
            for (const doc of oldNotifs.docs) {
                await doc.ref.delete();
                notifsDeleted++;
            }
        } else {
            const feed = memoryDB.notificationFeed || [];
            const filtered = feed.filter(n => {
                const t = new Date(n.createdAt).getTime();
                return t > oneDayAgo;
            }).slice(0, 20);
            notifsDeleted = feed.length - filtered.length;
            memoryDB.notificationFeed = filtered;
        }
        console.log(`   ✅ Уведомлений удалено: ${notifsDeleted}`);
        
        // ===== 3. ЛОКАЦИИ — всё, кроме сегодняшней =====
        let locationsDeleted = 0;
        if (firebaseInitialized) {
            const locations = await db.collection('userLocations').get();
            
            const byUser = {};
            for (const doc of locations.docs) {
                const l = doc.data();
                if (!byUser[l.username]) byUser[l.username] = [];
                byUser[l.username].push({ id: doc.id, ...l, ref: doc.ref });
            }
            
            for (const username of Object.keys(byUser)) {
                const userLocs = byUser[username];
                const todayLocs = userLocs.filter(l => l.date === today);
                const toDelete = userLocs.filter(l => l.date !== today);
                
                if (todayLocs.length > 1) {
                    todayLocs.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
                    for (let i = 1; i < todayLocs.length; i++) {
                        toDelete.push(todayLocs[i]);
                    }
                }
                
                for (const loc of toDelete) {
                    await loc.ref.delete();
                    locationsDeleted++;
                }
            }
        } else {
            const byUser = {};
            for (const key of Object.keys(memoryDB.userLocations || {})) {
                const l = memoryDB.userLocations[key];
                if (!byUser[l.username]) byUser[l.username] = [];
                byUser[l.username].push({ key, ...l });
            }
            
            for (const username of Object.keys(byUser)) {
                const userLocs = byUser[username];
                const todayLocs = userLocs.filter(l => l.date === today);
                const toDelete = userLocs.filter(l => l.date !== today);
                
                if (todayLocs.length > 1) {
                    todayLocs.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
                    for (let i = 1; i < todayLocs.length; i++) {
                        toDelete.push(todayLocs[i]);
                    }
                }
                
                for (const loc of toDelete) {
                    delete memoryDB.userLocations[loc.key];
                    locationsDeleted++;
                }
            }
        }
        console.log(`   ✅ Локаций удалено: ${locationsDeleted}`);
        
        // ===== 4. КОМНАТЫ старше 24 часов =====
        let roomsDeleted = 0;
        if (firebaseInitialized) {
            const rooms = await db.collection('callRooms').get();
            for (const doc of rooms.docs) {
                const r = doc.data();
                let createdAt = r.createdAt;
                if (createdAt && typeof createdAt.toDate === 'function') {
                    createdAt = createdAt.toDate().getTime();
                } else if (createdAt && createdAt._seconds) {
                    createdAt = createdAt._seconds * 1000;
                } else {
                    createdAt = now;
                }
                if (createdAt < oneDayAgo) {
                    await doc.ref.delete();
                    roomsDeleted++;
                    const sigs = await db.collection('callSignals').where('roomId', '==', doc.id).get();
                    for (const s of sigs.docs) await s.ref.delete();
                }
            }
        } else {
            for (const roomId of Object.keys(memoryDB.callRooms || {})) {
                const r = memoryDB.callRooms[roomId];
                const t = new Date(r.createdAt).getTime();
                if (t < oneDayAgo) {
                    delete memoryDB.callRooms[roomId];
                    memoryDB.callSignals = memoryDB.callSignals.filter(s => s.roomId !== roomId);
                    roomsDeleted++;
                }
            }
        }
        console.log(`   ✅ Комнат удалено: ${roomsDeleted}`);
        
        console.log('🧹 Автоочистка завершена');
    } catch (err) {
        console.error('❌ Ошибка автоочистки:', err);
    }
}

function scheduleCleanup() {
    if (cleanupInterval) clearInterval(cleanupInterval);
    
    cleanupInterval = setInterval(async () => {
        const now = new Date();
        const utcHour = now.getUTCHours();
        const utcMinute = now.getUTCMinutes();
        const mskHour = (utcHour + MSK_OFFSET_HOURS) % 24;
        
        // 12:00 МСК = 09:00 UTC
        if (mskHour === CLEANUP_HOUR_MSK && utcMinute === 0) {
            const lastRun = global.__lastCleanupRun;
            const today = now.toISOString().split('T')[0];
            if (lastRun === today) return;
            global.__lastCleanupRun = today;
            
            console.log(`⏰ 12:00 МСК — запуск ежедневной очистки`);
            await runCleanup();
        }
    }, 60 * 1000);
    
    console.log(`⏰ Автоочистка запланирована на 12:00 МСК (09:00 UTC) каждый день`);
}

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
        firebase: firebaseInitialized ? 'connected' : 'not connected',
        messaging: messaging ? 'ready' : 'not ready'
    });
});

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
    
    // 🧹 Запускаем автоочистку
    scheduleCleanup();
    
    // Первичная очистка через 5 секунд
    setTimeout(() => {
        console.log('🧹 Первичная очистка при старте...');
        runCleanup().catch(err => console.error('Ошибка первичной очистки:', err));
    }, 5000);
    
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
                console.log(`📱 Push-уведомления: ${messaging ? 'готовы' : 'не настроены'}`);
            }
        });
    }
}

if (process.env.NODE_ENV === 'production') {
    module.exports = app;
}

startServer();