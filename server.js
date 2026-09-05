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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(cors({
    origin: process.env.NODE_ENV === 'production' ? false : '*',
    credentials: true
}));

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
    testIdCounter: 1
};

// ============ 🔥 ФУНКЦИИ РАБОТЫ С БД ============

async function getUser(username) {
    if (firebaseInitialized) {
        try {
            const doc = await db.collection('users').doc(username).get();
            if (doc.exists) {
                return doc.data();
            }
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
                username,
                password,
                role,
                created: new Date()
            });
            return true;
        } catch (error) {
            console.error('❌ Ошибка создания пользователя:', error.message);
        }
    }
    memoryDB.users[username] = {
        username,
        password,
        role,
        created: new Date()
    };
    return true;
}

async function getTests() {
    if (firebaseInitialized) {
        try {
            const snapshot = await db.collection('tests').get();
            const tests = [];
            snapshot.forEach(doc => {
                tests.push({ id: doc.id, ...doc.data() });
            });
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
            if (doc.exists) {
                return { id: doc.id, ...doc.data() };
            }
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
                ...testData,
                createdAt: new Date()
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
                username,
                ...resultData,
                completedAt: new Date()
            });
            return true;
        } catch (error) {
            console.error('❌ Ошибка сохранения результата:', error.message);
        }
    }
    if (!memoryDB.results[username]) {
        memoryDB.results[username] = [];
    }
    memoryDB.results[username].push({
        ...resultData,
        completedAt: new Date()
    });
    return true;
}

async function getUserResults(username) {
    if (firebaseInitialized) {
        try {
            const snapshot = await db.collection('results')
                .where('username', '==', username)
                .get();
            const results = [];
            snapshot.forEach(doc => {
                results.push({ id: doc.id, ...doc.data() });
            });
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
            snapshot.forEach(doc => {
                users.push(doc.data());
            });
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
            snapshot.forEach(doc => {
                results.push({ id: doc.id, ...doc.data() });
            });
            return results;
        } catch (error) {
            console.error('❌ Ошибка получения результатов:', error.message);
        }
    }
    const allResults = [];
    Object.values(memoryDB.results).forEach(userResults => {
        allResults.push(...userResults);
    });
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
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Заполните все поля' });
        }
        
        const existingUser = await getUser(username);
        if (existingUser) {
            return res.status(400).json({ error: 'Пользователь уже существует' });
        }
        
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
        if (!user) {
            return res.status(400).json({ error: 'Пользователь не найден' });
        }
        
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(400).json({ error: 'Неверный пароль' });
        }
        
        const token = jwt.sign({ username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
        res.cookie('token', token, { 
            httpOnly: true, 
            maxAge: 86400000,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production'
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
    if (!token) {
        return res.status(401).json({ error: 'Не авторизован' });
    }
    
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
        if (!test) {
            return res.status(404).json({ error: 'Тест не найден' });
        }
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
        if (decoded.role !== 'admin') {
            return res.status(403).json({ error: 'Доступ только для администратора' });
        }
        
        const { title, description, class: classNum, questions } = req.body;
        
        if (!title || !questions || !Array.isArray(questions) || questions.length === 0) {
            return res.status(400).json({ error: 'Некорректные данные' });
        }
        
        const newTest = {
            title,
            description: description || '',
            class: classNum || '7-8',
            questions: questions.map((q, index) => ({
                id: index + 1,
                question: q.question,
                options: q.options,
                correct: parseInt(q.correct)
            })),
            createdBy: decoded.username
        };
        
        const created = await createTest(newTest);
        if (!created) {
            return res.status(500).json({ error: 'Ошибка создания теста' });
        }
        
        console.log(`✅ Создан тест: ${title}`);
        res.json({ success: true, testId: created.id, test: created });
    } catch (error) {
        console.error('Ошибка создания теста:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.delete('/api/tests/:id', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role !== 'admin') {
            return res.status(403).json({ error: 'Доступ только для администратора' });
        }
        
        const testId = req.params.id;
        const test = await getTest(testId);
        if (!test) {
            return res.status(404).json({ error: 'Тест не найден' });
        }
        
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
        const { answers } = req.body;
        
        const test = await getTest(testId);
        if (!test) {
            return res.status(404).json({ error: 'Тест не найден' });
        }
        
        let correct = 0;
        const results = test.questions.map((q, index) => {
            const userAnswer = answers[index];
            const isCorrect = userAnswer === q.correct;
            if (isCorrect) correct++;
            return {
                questionId: q.id,
                question: q.question,
                userAnswer: userAnswer !== undefined ? q.options[userAnswer] : 'Не отвечено',
                correctAnswer: q.options[q.correct],
                isCorrect
            };
        });
        
        const resultData = {
            testId: testId,
            testTitle: test.title,
            username: decoded.username,
            total: test.questions.length,
            correct,
            percentage: Math.round((correct / test.questions.length) * 100),
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
        if (decoded.role !== 'admin') {
            return res.status(403).json({ error: 'Доступ только для администратора' });
        }
        
        const users = await getAllUsers();
        const tests = await getTests();
        const results = await getAllResults();
        
        res.json({
            totalUsers: users.length,
            totalTests: tests.length,
            totalResults: results.length,
            tests: tests.map(t => ({
                id: t.id,
                title: t.title,
                questions: t.questions?.length || 0,
                createdBy: t.createdBy
            })),
            users: users.filter(u => u.role !== 'admin').map(u => u.username)
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
            if (!userResults[r.username]) {
                userResults[r.username] = [];
            }
            userResults[r.username].push(r);
        });
        
        Object.keys(userResults).forEach(username => {
            const userResultsList = userResults[username];
            if (userResultsList && userResultsList.length > 0) {
                const bestResult = userResultsList.reduce((best, current) => {
                    return (current.percentage > best.percentage) ? current : best;
                }, userResultsList[0]);
                
                leaderboard.push({
                    username: username,
                    bestScore: bestResult.percentage,
                    totalTests: userResultsList.length,
                    bestTest: bestResult.testTitle,
                    completedAt: bestResult.completedAt
                });
            }
        });
        
        leaderboard.sort((a, b) => b.bestScore - a.bestScore);
        res.json(leaderboard);
    } catch (error) {
        console.error('Ошибка получения таблицы лидеров:', error);
        res.status(500).json({ error: 'Ошибка получения таблицы лидеров' });
    }
});

// ============ СТАТИЧЕСКИЕ ФАЙЛЫ ============
// ВАЖНО: Эти маршруты должны быть ПЕРЕД app.get('*')!

// CSS файлы
app.get('/style.css', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'style.css'));
});

app.get('/admin.css', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.css'));
});

// JavaScript файлы
app.get('/script.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'script.js'));
});

app.get('/admin.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.js'));
});

// HTML страницы
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ВСЕГДА В КОНЦЕ! - Перехватывает только неизвестные маршруты
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============ ЗАПУСК ============

async function startServer() {
    // Создаем тестовых пользователей
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
    
    // Создаем тестовый тест, если тестов нет
    const existingTests = await getTests();
    if (existingTests.length === 0) {
        const testQuestions = [
            {
                question: 'Какая формула используется для расчета скорости?',
                options: ['v = s/t', 'v = t/s', 'v = s*t', 'v = s/t²'],
                correct: 0
            },
            {
                question: 'В каких единицах измеряется скорость в системе СИ?',
                options: ['км/ч', 'м/с', 'см/с', 'м/мин'],
                correct: 1
            },
            {
                question: 'По какой формуле вычисляется плотность вещества?',
                options: ['ρ = V/m', 'ρ = m/V', 'ρ = m*V', 'ρ = V/m²'],
                correct: 1
            },
            {
                question: 'В чем измеряется сила в системе СИ?',
                options: ['Ньютон', 'Джоуль', 'Ватт', 'Паскаль'],
                correct: 0
            },
            {
                question: 'Какое количество теплоты требуется для нагревания тела?',
                options: ['Q = cmΔt', 'Q = λm', 'Q = Lm', 'Q = qm'],
                correct: 0
            }
        ];
        
        await createTest({
            title: 'Основы физики',
            description: 'Тест по основным формулам и понятиям физики',
            class: '7-8',
            questions: testQuestions,
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
                console.log('\n⚠️ ВНИМАНИЕ: Данные хранятся в памяти!');
                console.log('   При перезапуске сервера данные будут потеряны.');
                console.log('   Для сохранения данных подключите Firebase.');
            } else {
                console.log('✅ Данные сохраняются в Firebase');
            }
        });
    }
}

// Для Vercel
if (process.env.NODE_ENV === 'production') {
    module.exports = app;
}

startServer();