let currentUser = null;
let currentRole = null;
let tests = [];
let currentTest = null;
let currentQuestionIndex = 0;
let userAnswers = {};
let currentTestId = null;
let questionCounterAdmin = 0;

// DOM элементы
const authPage = document.getElementById('authPage');
const mainPage = document.getElementById('mainPage');
const testPage = document.getElementById('testPage');
const resultsPage = document.getElementById('resultsPage');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('loginBtn');
const registerBtn = document.getElementById('registerBtn');
const logoutBtn = document.getElementById('logoutBtn');
const authError = document.getElementById('authError');
const currentUserEl = document.getElementById('currentUser');
const userRoleEl = document.getElementById('userRole');
const testsList = document.getElementById('testsList');
const testTitle = document.getElementById('testTitle');
const questionContainer = document.getElementById('questionContainer');
const questionCounter = document.getElementById('questionCounter');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const submitBtn = document.getElementById('submitBtn');
const backBtn = document.getElementById('backBtn');
const backToTestsBtn = document.getElementById('backToTestsBtn');
const adminNav = document.getElementById('adminNav');
const userNav = document.getElementById('userNav');
const createForm = document.getElementById('createTestForm');
const addQuestionBtn = document.getElementById('addQuestionBtn');
const questionsList = document.getElementById('questionsList');
const statsContent = document.getElementById('statsContent');
const myResultsContent = document.getElementById('myResultsContent');
const leaderboardContent = document.getElementById('leaderboardContent');

// Редактирование
const editTestForm = document.getElementById('editTestForm');
const editTestId = document.getElementById('editTestId');
const editTestTitle = document.getElementById('editTestTitle');
const editTestDescription = document.getElementById('editTestDescription');
const editTestClass = document.getElementById('editTestClass');
const editQuestionsList = document.getElementById('editQuestionsList');
const addEditQuestionBtn = document.getElementById('addEditQuestionBtn');
const cancelEditBtn = document.getElementById('cancelEditBtn');
let editQuestionCounter = 0;

// Подсказка
const hintBtn = document.getElementById('hintBtn');
const hintContainer = document.getElementById('hintContainer');
const hintText = document.getElementById('hintText');
let hintUsed = false;

// ============ 🎨 ФОН С КВАДРАТИКАМИ ============
function createSquares() {
    const container = document.getElementById('background-squares');
    const colors = ['color-1', 'color-2', 'color-3', 'color-4'];
    const sizes = ['size-1', 'size-2', 'size-3', 'size-4'];
    const count = 80;
    const squares = [];
    
    for (let i = 0; i < count; i++) {
        const square = document.createElement('div');
        square.className = `square ${sizes[Math.floor(Math.random() * sizes.length)]} ${colors[Math.floor(Math.random() * colors.length)]}`;
        square.style.left = Math.random() * 100 + '%';
        square.style.top = Math.random() * 100 + '%';
        square.style.transform = `rotate(${Math.random() * 360}deg)`;
        container.appendChild(square);
        squares.push(square);
    }
    
    let mouseX = -1000;
    let mouseY = -1000;
    let animationId = null;
    let isMouseOnScreen = false;
    
    function updateSquares() {
        const radius = 200;
        
        squares.forEach((square) => {
            const rect = square.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            
            const dx = mouseX - centerX;
            const dy = mouseY - centerY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (isMouseOnScreen && distance < radius) {
                const intensity = 1 - (distance / radius);
                square.classList.add('active');
                square.style.opacity = 0.2 + intensity * 0.8;
                square.style.transform = `scale(${0.8 + intensity * 0.4}) rotate(${intensity * 10}deg)`;
                square.style.boxShadow = `0 0 ${30 + intensity * 40}px rgba(102, 126, 234, ${0.1 + intensity * 0.3})`;
                
                if (intensity > 0.7) {
                    square.style.background = 'rgba(102, 126, 234, 0.5)';
                    square.style.borderColor = 'rgba(102, 126, 234, 0.8)';
                } else if (intensity > 0.4) {
                    square.style.background = 'rgba(102, 126, 234, 0.3)';
                    square.style.borderColor = 'rgba(102, 126, 234, 0.5)';
                } else {
                    square.style.background = 'rgba(102, 126, 234, 0.15)';
                    square.style.borderColor = 'rgba(102, 126, 234, 0.3)';
                }
            } else {
                square.classList.remove('active');
                square.style.opacity = '0';
                square.style.transform = `scale(0.5) rotate(0deg)`;
                square.style.boxShadow = 'none';
            }
        });
        
        animationId = requestAnimationFrame(updateSquares);
    }
    
    document.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
        isMouseOnScreen = true;
        
        if (!animationId) {
            updateSquares();
        }
    });
    
    document.addEventListener('mouseleave', () => {
        isMouseOnScreen = false;
        mouseX = -1000;
        mouseY = -1000;
        
        squares.forEach(square => {
            square.classList.remove('active');
            square.style.opacity = '0';
            square.style.transform = `scale(0.5) rotate(0deg)`;
            square.style.boxShadow = 'none';
        });
        
        if (animationId) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }
    });
}

// ============ АВТОРИЗАЦИЯ ============

async function checkAuth() {
    try {
        const response = await fetch('/api/me');
        if (response.ok) {
            const data = await response.json();
            currentUser = data.username;
            currentRole = data.role;
            showMainPage();
            loadTests();
            loadMyResults();
            loadLeaderboard();
            if (currentRole === 'admin') {
                loadStats();
            }
        } else {
            showAuthPage();
        }
    } catch (error) {
        showAuthPage();
    }
}

function showAuthPage() {
    authPage.style.display = 'block';
    mainPage.style.display = 'none';
    testPage.style.display = 'none';
    resultsPage.style.display = 'none';
}

function showMainPage() {
    authPage.style.display = 'none';
    mainPage.style.display = 'block';
    testPage.style.display = 'none';
    resultsPage.style.display = 'none';
    currentUserEl.textContent = currentUser;
    userRoleEl.textContent = currentRole === 'admin' ? 'Админ' : 'Пользователь';
    userRoleEl.className = `role-tag ${currentRole}`;
    
    if (currentRole === 'admin') {
        adminNav.style.display = 'flex';
        userNav.style.display = 'none';
    } else {
        adminNav.style.display = 'none';
        userNav.style.display = 'flex';
    }
}

function showTestPage(test) {
    authPage.style.display = 'none';
    mainPage.style.display = 'none';
    testPage.style.display = 'block';
    resultsPage.style.display = 'none';
    currentTest = test;
    currentTestId = test.id;
    currentQuestionIndex = 0;
    userAnswers = {};
    testTitle.textContent = test.title;
    renderQuestion();
    updateNavigation();
}

function showResultsPage() {
    authPage.style.display = 'none';
    mainPage.style.display = 'none';
    testPage.style.display = 'none';
    resultsPage.style.display = 'block';
}

// ============ ТЕСТЫ ============

async function loadTests() {
    try {
        const response = await fetch('/api/tests');
        if (response.ok) {
            tests = await response.json();
            console.log('📝 Загружены тесты:', tests);
            renderTests();
        }
    } catch (error) {
        console.error('Ошибка загрузки тестов:', error);
    }
}

function renderTests() {
    if (!tests || tests.length === 0) {
        testsList.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #718096;">
                <p>📭 Нет доступных тестов</p>
                ${currentRole === 'admin' ? '<p style="font-size: 14px;">Создайте тест на вкладке "Создать тест"</p>' : ''}
            </div>
        `;
        return;
    }
    
    let html = '';
    tests.forEach((test) => {
        const testId = test.id;
        
        html += `
            <div class="test-card">
                <div class="test-card-header">
                    <div>
                        <h3>${test.title || 'Без названия'}</h3>
                        <p>${test.description || 'Нет описания'}</p>
                        <div class="meta">
                            ${test.class || '7-8'} класс • ${test.questions?.length || 0} вопросов
                            ${test.createdBy ? ` • Создал: ${test.createdBy}` : ''}
                            ${test.updatedAt ? ` • Обновлен: ${new Date(test.updatedAt).toLocaleDateString()}` : ''}
                        </div>
                    </div>
                    <div class="actions">
                        <button class="btn-primary" data-test-id="${testId}">Пройти тест</button>
                        ${currentRole === 'admin' ? `
                            <button class="btn-secondary btn-edit" data-test-id="${testId}">✏️</button>
                            <button class="btn-small btn-danger" data-test-id="${testId}">🗑️</button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    });
    
    testsList.innerHTML = html;

    testsList.querySelectorAll('.btn-primary[data-test-id]').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            const testId = this.getAttribute('data-test-id');
            if (testId) startTest(testId);
        });
    });

    testsList.querySelectorAll('.btn-edit[data-test-id]').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            const testId = this.getAttribute('data-test-id');
            if (testId) editTest(testId);
        });
    });

    testsList.querySelectorAll('.btn-danger[data-test-id]').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            const testId = this.getAttribute('data-test-id');
            if (testId) deleteTest(testId);
        });
    });
}

async function startTest(testId) {
    console.log('🔍 startTest начал работу с testId:', testId);
    
    if (!testId) {
        console.error('❌ testId пустой');
        alert('Ошибка: ID теста не указан');
        return;
    }
    
    try {
        console.log(`📤 Запрос к /api/tests/${testId}`);
        const response = await fetch(`/api/tests/${testId}`);
        console.log('📥 Ответ сервера:', response.status);
        
        if (response.ok) {
            const test = await response.json();
            console.log('✅ Тест загружен:', test.title);
            showTestPage(test);
        } else {
            const error = await response.json().catch(() => ({}));
            console.error('❌ Ошибка загрузки:', error);
            alert('Ошибка загрузки теста: ' + (error.error || 'Тест не найден'));
        }
    } catch (error) {
        console.error('❌ Ошибка соединения:', error);
        alert('Ошибка загрузки теста. Проверьте соединение с сервером.');
    }
}

async function deleteTest(testId) {
    if (!testId) {
        alert('Ошибка: неверный ID теста');
        return;
    }
    
    if (!confirm('Удалить этот тест?')) return;
    
    try {
        const response = await fetch(`/api/tests/${testId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            alert('Тест удалён!');
            loadTests();
            if (currentRole === 'admin') loadStats();
            loadLeaderboard();
        } else {
            const error = await response.json().catch(() => ({}));
            alert('Ошибка удаления: ' + (error.error || 'Неизвестная ошибка'));
        }
    } catch (error) {
        console.error('Ошибка удаления:', error);
        alert('Ошибка удаления');
    }
}

// ============ ОТОБРАЖЕНИЕ ВОПРОСОВ С ПОДСКАЗКОЙ ============

function renderQuestion() {
    if (!currentTest) return;
    
    const q = currentTest.questions[currentQuestionIndex];
    const total = currentTest.questions.length;
    
    questionCounter.textContent = `Вопрос ${currentQuestionIndex + 1} из ${total}`;
    
    const hasHint = q.hint && q.hint.trim().length > 0;
    hintBtn.style.display = hasHint ? 'inline-block' : 'none';
    hintContainer.style.display = 'none';
    hintUsed = false;
    
    let html = `
        <div class="question-item">
            <div class="question-text">${q.question}</div>
            <div class="options">
    `;
    
    q.options.forEach((option, index) => {
        const isSelected = userAnswers[currentQuestionIndex] === index;
        const checked = isSelected ? 'checked' : '';
        html += `
            <div class="option ${isSelected ? 'selected' : ''}" onclick="selectOption(${index})">
                <input type="radio" name="question" value="${index}" ${checked}>
                <label>${option}</label>
            </div>
        `;
    });
    
    html += `
            </div>
        </div>
    `;
    
    questionContainer.innerHTML = html;
    
    hintBtn.onclick = function() {
        if (hasHint) {
            hintContainer.style.display = 'block';
            hintText.textContent = q.hint;
            hintUsed = true;
            hintBtn.style.display = 'none';
        }
    };
}

function selectOption(optionIndex) {
    userAnswers[currentQuestionIndex] = optionIndex;
    
    const options = document.querySelectorAll('.option');
    options.forEach((opt, index) => {
        const radio = opt.querySelector('input[type="radio"]');
        if (index === optionIndex) {
            opt.classList.add('selected');
            radio.checked = true;
        } else {
            opt.classList.remove('selected');
        }
    });
    
    updateNavigation();
}

function updateNavigation() {
    const total = currentTest.questions.length;
    const hasAnswer = userAnswers[currentQuestionIndex] !== undefined;
    
    prevBtn.disabled = currentQuestionIndex === 0;
    
    if (currentQuestionIndex === total - 1) {
        nextBtn.style.display = 'none';
        submitBtn.style.display = 'block';
        submitBtn.disabled = !hasAnswer;
    } else {
        nextBtn.style.display = 'block';
        submitBtn.style.display = 'none';
    }
}

function nextQuestion() {
    if (currentQuestionIndex < currentTest.questions.length - 1) {
        currentQuestionIndex++;
        renderQuestion();
        updateNavigation();
    }
}

function prevQuestion() {
    if (currentQuestionIndex > 0) {
        currentQuestionIndex--;
        renderQuestion();
        updateNavigation();
    }
}

async function submitTest() {
    const allAnswered = currentTest.questions.every((_, index) => 
        userAnswers[index] !== undefined
    );
    
    if (!allAnswered) {
        alert('Ответьте на все вопросы!');
        return;
    }
    
    const answers = currentTest.questions.map((_, index) => userAnswers[index]);
    
    try {
        const response = await fetch(`/api/tests/${currentTestId}/check`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ answers })
        });
        
        if (response.ok) {
            const results = await response.json();
            showResults(results);
            loadMyResults();
            loadLeaderboard();
        }
    } catch (error) {
        alert('Ошибка проверки теста');
    }
}

// ============ ОТОБРАЖЕНИЕ РЕЗУЛЬТАТОВ С ПОДСКАЗКАМИ ============

function showResults(results) {
    showResultsPage();
    
    let html = `
        <div class="result-card">
            <h3>${results.testTitle}</h3>
            <div class="result-score">${results.correct} / ${results.total}</div>
            <p style="font-size: 1.2em; color: #4a5568; margin: 10px 0;">
                ${results.percentage}% правильных ответов
            </p>
            <div style="font-size: 0.9em; color: #718096;">
                ${results.percentage >= 70 ? '✅ Отличный результат!' : 
                  results.percentage >= 50 ? '📚 Хорошо, но стоит повторить материал' : 
                  '💪 Нужно больше практики!'}
            </div>
        </div>
        <div class="result-details">
            <h3 style="margin-bottom: 15px; color: #2d3748;">Детальный разбор:</h3>
    `;
    
    results.results.forEach((r, index) => {
        const hintHtml = r.hint ? `<div style="font-size: 12px; color: #d69e2e; margin-top: 4px;">💡 Подсказка: ${r.hint}</div>` : '';
        
        html += `
            <div class="answer-detail ${r.isCorrect ? 'correct' : 'wrong'}">
                <div style="flex: 1;">
                    <div>${index + 1}. ${r.question}</div>
                    ${hintHtml}
                </div>
                <div style="text-align: right; min-width: 120px;">
                    ${r.isCorrect ? '✅' : '❌'} 
                    ${r.isCorrect ? r.userAnswer : `${r.userAnswer} → ${r.correctAnswer}`}
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    document.getElementById('resultsContent').innerHTML = html;
}

// ============ РЕЗУЛЬТАТЫ ============

async function loadMyResults() {
    try {
        const response = await fetch('/api/results');
        if (response.ok) {
            const results = await response.json();
            renderMyResults(results);
        }
    } catch (error) {
        console.error('Ошибка загрузки результатов:', error);
    }
}

function renderMyResults(results) {
    if (!results || results.length === 0) {
        myResultsContent.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #718096;">
                <p>📭 Вы ещё не проходили тесты</p>
            </div>
        `;
        return;
    }
    
    myResultsContent.innerHTML = results.map(r => `
        <div class="test-card" style="cursor: default;">
            <div class="test-card-header">
                <div>
                    <h4>${r.testTitle}</h4>
                    <div class="meta">
                        ${r.correct} из ${r.total} правильных (${r.percentage}%)
                        • ${new Date(r.completedAt).toLocaleString()}
                    </div>
                </div>
                <span style="font-size: 1.5em; font-weight: 700; color: ${r.percentage >= 70 ? '#48bb78' : r.percentage >= 50 ? '#ed8936' : '#fc8181'}">
                    ${r.percentage}%
                </span>
            </div>
        </div>
    `).join('');
}

// ============ 🏆 ТАБЛИЦА ЛИДЕРОВ ============

async function loadLeaderboard() {
    try {
        const response = await fetch('/api/leaderboard');
        if (response.ok) {
            const data = await response.json();
            renderLeaderboard(data);
        }
    } catch (error) {
        console.error('Ошибка загрузки таблицы лидеров:', error);
    }
}

function renderLeaderboard(leaderboard) {
    if (!leaderboard || leaderboard.length === 0) {
        leaderboardContent.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #718096;">
                <p>🏆 Пока нет результатов</p>
                <p style="font-size: 14px;">Пройдите тест, чтобы попасть в таблицу лидеров!</p>
            </div>
        `;
        return;
    }
    
    let html = '';
    leaderboard.forEach((item, index) => {
        const rank = index + 1;
        let rankClass = '';
        if (rank === 1) rankClass = 'gold';
        else if (rank === 2) rankClass = 'silver';
        else if (rank === 3) rankClass = 'bronze';
        
        let scoreClass = '';
        if (item.bestScore >= 80) scoreClass = 'excellent';
        else if (item.bestScore >= 60) scoreClass = 'good';
        else scoreClass = 'poor';
        
        const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
        
        html += `
            <div class="leaderboard-item">
                <div class="rank ${rankClass}">${medal}</div>
                <div class="info">
                    <div class="name">${item.username}</div>
                    <div class="details">
                        Лучший результат: ${item.bestTest} • Пройдено тестов: ${item.totalTests}
                        ${item.completedAt ? ` • ${new Date(item.completedAt).toLocaleDateString()}` : ''}
                    </div>
                </div>
                <div class="score ${scoreClass}">${item.bestScore}%</div>
            </div>
        `;
    });
    
    leaderboardContent.innerHTML = html;
}

// ============ СОЗДАНИЕ ТЕСТА ============

createForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const title = document.getElementById('testTitle').value;
    const description = document.getElementById('testDescription').value;
    const classNum = document.getElementById('testClass').value;
    
    const questionElements = document.querySelectorAll('.question-editor');
    const questions = [];
    
    questionElements.forEach(el => {
        const qText = el.querySelector('.q-text').value;
        const options = [];
        const optionInputs = el.querySelectorAll('.option-input');
        optionInputs.forEach(input => options.push(input.value));
        const correct = parseInt(el.querySelector('.correct-option').value);
        const hint = el.querySelector('.hint-input') ? el.querySelector('.hint-input').value : '';
        
        if (qText && options.length === 4 && options.every(o => o.trim())) {
            questions.push({ question: qText, options, correct, hint });
        }
    });
    
    if (questions.length === 0) {
        alert('Добавьте хотя бы один вопрос с 4 вариантами ответов');
        return;
    }
    
    try {
        const response = await fetch('/api/tests', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, description, class: classNum, questions })
        });
        
        if (response.ok) {
            alert('Тест создан успешно!');
            createForm.reset();
            questionsList.innerHTML = '';
            questionCounterAdmin = 0;
            loadTests();
            if (currentRole === 'admin') loadStats();
            loadLeaderboard();
            switchTab('tests');
        } else {
            const data = await response.json();
            alert(data.error || 'Ошибка создания теста');
        }
    } catch (error) {
        alert('Ошибка сервера');
    }
});

addQuestionBtn.addEventListener('click', () => {
    questionCounterAdmin++;
    const html = `
        <div class="question-editor">
            <div class="question-number">Вопрос ${questionCounterAdmin}</div>
            <div class="form-group">
                <input type="text" class="q-text" placeholder="Введите вопрос" required>
            </div>
            <div class="options-editor">
                <input type="text" class="option-input" placeholder="Вариант A" required>
                <input type="text" class="option-input" placeholder="Вариант B" required>
                <input type="text" class="option-input" placeholder="Вариант C" required>
                <input type="text" class="option-input" placeholder="Вариант D" required>
            </div>
            <div class="form-group">
                <label>Правильный ответ (0-3)</label>
                <input type="number" class="correct-option" min="0" max="3" value="0" required>
            </div>
            <div class="form-group">
                <label>Подсказка (необязательно)</label>
                <input type="text" class="hint-input" placeholder="Введите подсказку для этого вопроса">
            </div>
            <button type="button" class="remove-question" onclick="this.parentElement.remove()">✕ Удалить вопрос</button>
        </div>
    `;
    questionsList.insertAdjacentHTML('beforeend', html);
});

// ============ РЕДАКТИРОВАНИЕ ТЕСТА ============

async function editTest(testId) {
    console.log('✏️ Редактирование теста:', testId);
    
    try {
        const response = await fetch(`/api/admin/tests/${testId}/edit`);
        if (response.ok) {
            const test = await response.json();
            
            editTestId.value = testId;
            editTestTitle.value = test.title || '';
            editTestDescription.value = test.description || '';
            editTestClass.value = test.class || '7-8';
            
            editQuestionsList.innerHTML = '';
            editQuestionCounter = 0;
            
            if (test.questions && test.questions.length > 0) {
                test.questions.forEach(q => {
                    addEditQuestion(q);
                });
            }
            
            switchTab('edit');
        } else {
            alert('Ошибка загрузки теста для редактирования');
        }
    } catch (error) {
        console.error('Ошибка:', error);
        alert('Ошибка загрузки теста');
    }
}

function addEditQuestion(questionData = null) {
    editQuestionCounter++;
    
    const q = questionData || {
        question: '',
        options: ['', '', '', ''],
        correct: 0,
        hint: ''
    };
    
    const html = `
        <div class="question-editor" style="background: #f7fafc; border-radius: 10px; padding: 20px; margin-bottom: 15px; border: 2px solid #e2e8f0; position: relative;">
            <div class="question-number" style="position: absolute; top: -12px; left: 15px; background: #667eea; color: white; padding: 2px 15px; border-radius: 20px; font-size: 12px; font-weight: 600;">
                Вопрос ${editQuestionCounter}
            </div>
            <div class="form-group">
                <input type="text" class="edit-q-text" placeholder="Введите вопрос" value="${q.question || ''}" required>
            </div>
            <div class="options-editor" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 10px 0;">
                <input type="text" class="edit-option-input" placeholder="Вариант A" value="${q.options[0] || ''}" required>
                <input type="text" class="edit-option-input" placeholder="Вариант B" value="${q.options[1] || ''}" required>
                <input type="text" class="edit-option-input" placeholder="Вариант C" value="${q.options[2] || ''}" required>
                <input type="text" class="edit-option-input" placeholder="Вариант D" value="${q.options[3] || ''}" required>
            </div>
            <div class="form-group">
                <label>Правильный ответ (0-3)</label>
                <input type="number" class="edit-correct-option" min="0" max="3" value="${q.correct || 0}" required>
            </div>
            <div class="form-group">
                <label>Подсказка (необязательно)</label>
                <input type="text" class="edit-hint-input" placeholder="Введите подсказку" value="${q.hint || ''}">
            </div>
            <button type="button" class="remove-question" onclick="this.parentElement.remove()" style="margin-top: 10px; background: #fc8181; color: white; border: none; padding: 5px 15px; border-radius: 6px; cursor: pointer;">
                ✕ Удалить вопрос
            </button>
        </div>
    `;
    
    editQuestionsList.insertAdjacentHTML('beforeend', html);
}

addEditQuestionBtn.addEventListener('click', () => {
    addEditQuestion();
});

editTestForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const testId = editTestId.value;
    const title = editTestTitle.value.trim();
    const description = editTestDescription.value.trim();
    const classNum = editTestClass.value.trim();
    
    if (!title) {
        alert('Введите название теста');
        return;
    }
    
    const questionElements = document.querySelectorAll('#editQuestionsList .question-editor');
    const questions = [];
    
    questionElements.forEach(el => {
        const qText = el.querySelector('.edit-q-text').value.trim();
        const options = [];
        const optionInputs = el.querySelectorAll('.edit-option-input');
        optionInputs.forEach(input => options.push(input.value.trim()));
        const correct = parseInt(el.querySelector('.edit-correct-option').value);
        const hint = el.querySelector('.edit-hint-input')?.value || '';
        
        if (qText && options.length === 4 && options.every(o => o)) {
            questions.push({ 
                question: qText, 
                options, 
                correct: isNaN(correct) ? 0 : correct,
                hint 
            });
        }
    });
    
    if (questions.length === 0) {
        alert('Добавьте хотя бы один вопрос с 4 вариантами ответов');
        return;
    }
    
    try {
        const response = await fetch(`/api/tests/${testId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                title, 
                description, 
                class: classNum || '7-8', 
                questions 
            })
        });
        
        if (response.ok) {
            alert('✅ Тест успешно обновлен!');
            loadTests();
            if (currentRole === 'admin') loadStats();
            loadLeaderboard();
            switchTab('tests');
        } else {
            const data = await response.json();
            alert(data.error || 'Ошибка обновления теста');
        }
    } catch (error) {
        console.error('Ошибка:', error);
        alert('Ошибка сервера');
    }
});

cancelEditBtn.addEventListener('click', () => {
    if (confirm('Отменить редактирование?')) {
        switchTab('tests');
    }
});

// ============ СТАТИСТИКА ============

async function loadStats() {
    try {
        const response = await fetch('/api/admin/stats');
        if (response.ok) {
            const stats = await response.json();
            renderStats(stats);
        }
    } catch (error) {
        console.error('Ошибка загрузки статистики:', error);
    }
}

function renderStats(stats) {
    statsContent.innerHTML = `
        <div class="stats-grid">
            <div class="stat-card">
                <div class="number">${stats.totalUsers || 0}</div>
                <div class="label">Пользователей</div>
            </div>
            <div class="stat-card">
                <div class="number">${stats.totalTests || 0}</div>
                <div class="label">Тестов</div>
            </div>
            <div class="stat-card">
                <div class="number">${stats.totalResults || 0}</div>
                <div class="label">Пройдено тестов</div>
            </div>
        </div>
        ${stats.users && stats.users.length > 0 ? `
            <h4 style="margin-top: 20px; color: #2d3748;">Пользователи:</h4>
            <ul style="list-style: none; padding: 0;">
                ${stats.users.map(u => `<li style="padding: 5px 0; color: #4a5568;">👤 ${u}</li>`).join('')}
            </ul>
        ` : ''}
    `;
}

// ============ НАВИГАЦИЯ ============

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        switchTab(tab);
    });
});

function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll(`.tab-btn[data-tab="${tab}"]`).forEach(b => b.classList.add('active'));
    
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    const content = document.getElementById(`tab-${tab}`);
    if (content) {
        content.classList.add('active');
    }
    
    if (tab === 'stats') loadStats();
    if (tab === 'myresults') loadMyResults();
    if (tab === 'tests') loadTests();
    if (tab === 'leaderboard') loadLeaderboard();
}

// ============ АУТЕНТИФИКАЦИЯ ============

async function login() {
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    
    if (!username || !password) {
        authError.textContent = 'Заполните все поля';
        return;
    }
    
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        if (response.ok) {
            const data = await response.json();
            authError.textContent = '';
            currentUser = data.username;
            currentRole = data.role;
            showMainPage();
            loadTests();
            loadMyResults();
            loadLeaderboard();
            if (currentRole === 'admin') {
                loadStats();
            }
        } else {
            const data = await response.json();
            authError.textContent = data.error || 'Ошибка входа';
        }
    } catch (error) {
        authError.textContent = 'Ошибка соединения';
    }
}

async function register() {
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    
    if (!username || !password) {
        authError.textContent = 'Заполните все поля';
        return;
    }
    
    if (username.length < 3) {
        authError.textContent = 'Имя должно быть минимум 3 символа';
        return;
    }
    
    if (password.length < 4) {
        authError.textContent = 'Пароль должен быть минимум 4 символа';
        return;
    }
    
    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        if (response.ok) {
            authError.textContent = 'Регистрация успешна! Теперь войдите.';
            authError.style.color = '#48bb78';
            usernameInput.value = '';
            passwordInput.value = '';
        } else {
            const data = await response.json();
            authError.textContent = data.error || 'Ошибка регистрации';
            authError.style.color = '#fc8181';
        }
    } catch (error) {
        authError.textContent = 'Ошибка соединения';
    }
}

async function logout() {
    try {
        await fetch('/api/logout', { method: 'POST' });
        currentUser = null;
        currentRole = null;
        showAuthPage();
    } catch (error) {
        alert('Ошибка выхода');
    }
}

// ============ СОБЫТИЯ ============

loginBtn.addEventListener('click', login);
registerBtn.addEventListener('click', register);
logoutBtn.addEventListener('click', logout);
prevBtn.addEventListener('click', prevQuestion);
nextBtn.addEventListener('click', nextQuestion);
submitBtn.addEventListener('click', submitTest);
backBtn.addEventListener('click', () => {
    showMainPage();
    loadTests();
});
backToTestsBtn.addEventListener('click', () => {
    showMainPage();
    loadTests();
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && authPage.style.display !== 'none') {
        login();
    }
});

// ============ ЗАПУСК ============
createSquares();
checkAuth();