const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const path = require('path');
const cors = require('cors');

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

// Статика
app.use(express.static('public'));

// База данных (в памяти)
const db = {
    users: {},
    tests: {},
    results: {},
    testIdCounter: 1
};

// Инициализация администратора
async function initAdmin() {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    db.users['admin'] = {
        username: 'admin',
        password: hashedPassword,
        role: 'admin',
        created: new Date()
    };
    console.log('✅ Администратор создан: admin / admin123');
}

async function initTestUser() {
    const hashedPassword = await bcrypt.hash('user123', 10);
    db.users['user'] = {
        username: 'user',
        password: hashedPassword,
        role: 'user',
        created: new Date()
    };
    console.log('✅ Тестовый пользователь: user / user123');
}

// Логирование
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
        
        if (db.users[username]) {
            return res.status(400).json({ error: 'Пользователь уже существует' });
        }
        
        if (username.length < 3 || password.length < 4) {
            return res.status(400).json({ error: 'Имя минимум 3 символа, пароль - 4' });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        db.users[username] = {
            username,
            password: hashedPassword,
            role: role === 'admin' ? 'admin' : 'user',
            created: new Date()
        };
        
        res.json({ success: true, message: 'Регистрация успешна!', role: db.users[username].role });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        const user = db.users[username];
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
        
        res.json({ 
            success: true, 
            username, 
            role: user.role 
        });
    } catch (error) {
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
        res.json({ 
            username: decoded.username, 
            role: decoded.role 
        });
    } catch (error) {
        res.status(401).json({ error: 'Не авторизован' });
    }
});

// ============ ТЕСТЫ ============

app.get('/api/tests', (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    
    try {
        jwt.verify(token, JWT_SECRET);
        const tests = Object.values(db.tests).map(test => ({
            id: test.id,
            title: test.title,
            description: test.description,
            class: test.class,
            questionCount: test.questions.length,
            createdAt: test.createdAt,
            createdBy: test.createdBy
        }));
        res.json(tests);
    } catch (error) {
        res.status(401).json({ error: 'Не авторизован' });
    }
});

app.get('/api/tests/:id', (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    
    try {
        jwt.verify(token, JWT_SECRET);
        const test = db.tests[req.params.id];
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
        
        const testId = db.testIdCounter++;
        const newTest = {
            id: testId,
            title,
            description: description || '',
            class: classNum || '7-8',
            questions: questions.map((q, index) => ({
                id: index + 1,
                question: q.question,
                options: q.options,
                correct: parseInt(q.correct)
            })),
            createdAt: new Date(),
            createdBy: decoded.username
        };
        
        db.tests[testId] = newTest;
        console.log(`✅ Создан тест: ${title} (ID: ${testId})`);
        
        res.json({ success: true, testId, test: newTest });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.delete('/api/tests/:id', (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role !== 'admin') {
            return res.status(403).json({ error: 'Доступ только для администратора' });
        }
        
        const testId = req.params.id;
        if (!db.tests[testId]) {
            return res.status(404).json({ error: 'Тест не найден' });
        }
        
        delete db.tests[testId];
        res.json({ success: true, message: 'Тест удален' });
    } catch (error) {
        res.status(401).json({ error: 'Не авторизован' });
    }
});

// ============ ПРОХОЖДЕНИЕ ТЕСТОВ ============

app.post('/api/tests/:id/check', (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const testId = req.params.id;
        const { answers } = req.body;
        
        const test = db.tests[testId];
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
        
        const result = {
            testId: testId,
            testTitle: test.title,
            username: decoded.username,
            total: test.questions.length,
            correct,
            percentage: Math.round((correct / test.questions.length) * 100),
            results,
            completedAt: new Date()
        };
        
        if (!db.results[decoded.username]) {
            db.results[decoded.username] = [];
        }
        db.results[decoded.username].push(result);
        
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.get('/api/results', (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const userResults = db.results[decoded.username] || [];
        res.json(userResults);
    } catch (error) {
        res.status(401).json({ error: 'Не авторизован' });
    }
});

// ============ СТАТИСТИКА ============

app.get('/api/admin/stats', (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role !== 'admin') {
            return res.status(403).json({ error: 'Доступ только для администратора' });
        }
        
        const totalUsers = Object.keys(db.users).length;
        const totalTests = Object.keys(db.tests).length;
        let totalResults = 0;
        Object.values(db.results).forEach(results => totalResults += results.length);
        
        res.json({
            totalUsers,
            totalTests,
            totalResults,
            tests: Object.values(db.tests).map(t => ({
                id: t.id,
                title: t.title,
                questions: t.questions.length,
                createdBy: t.createdBy
            })),
            users: Object.keys(db.users).filter(u => db.users[u].role !== 'admin')
        });
    } catch (error) {
        res.status(401).json({ error: 'Не авторизован' });
    }
});

// ============ СТРАНИЦЫ ============

// Отдаём админскую страницу
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Все остальные маршруты - index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============ ЗАПУСК ============

async function startServer() {
    await initAdmin();
    await initTestUser();
    
    // Создаем тестовый тест
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
    
    const testId = db.testIdCounter++;
    db.tests[testId] = {
        id: testId,
        title: 'Основы физики',
        description: 'Тест по основным формулам и понятиям физики',
        class: '7-8',
        questions: testQuestions.map((q, index) => ({
            id: index + 1,
            question: q.question,
            options: q.options,
            correct: q.correct
        })),
        createdAt: new Date(),
        createdBy: 'admin'
    };
    
    app.listen(PORT, () => {
        console.log(`\n🚀 Сервер запущен на http://localhost:${PORT}`);
        console.log('\n👤 Доступные аккаунты:');
        console.log('   📋 Администратор: admin / admin123');
        console.log('   📋 Пользователь: user / user123');
        console.log(`\n🌐 Откройте http://localhost:${PORT}`);
    });
}

// Для Vercel экспортируем app
if (process.env.NODE_ENV === 'production') {
    module.exports = app;
}

startServer();