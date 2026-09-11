let currentUser = null;
let currentRole = null;
let tests = [];
let currentTest = null;
let currentQuestionIndex = 0;
let userAnswers = {};
let currentTestId = null;
let questionCounterAdmin = 0;
let isEditFormOpen = false;

// Таймер
let timerInterval = null;
let timeLeft = 0;
let totalTimeSpent = 0;
let testStartTime = 0;

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
const timerDisplay = document.getElementById('timerDisplay');
const timerValue = document.getElementById('timerValue');
const categoryFilter = document.getElementById('categoryFilter');

// Подсказка
const hintBtn = document.getElementById('hintBtn');
const hintContainer = document.getElementById('hintContainer');
const hintText = document.getElementById('hintText');
let hintUsed = false;

// ============ 🎨 ФОН С КВАДРАТИКАМИ ============
function createSquares() {
    const container = document.getElementById('background-squares');
    if (!container) return;
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
        if (!animationId) updateSquares();
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
            if (currentRole === 'admin') loadStats();
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
    
    // Восстанавливаем прогресс, если есть
    const saved = loadProgress(test.id);
    if (saved) {
        userAnswers = saved.answers || {};
        currentQuestionIndex = saved.currentIndex || 0;
    } else {
        userAnswers = {};
        currentQuestionIndex = 0;
    }
    
    testTitle.textContent = test.title;
    
    // Запускаем таймер
    if (test.timeLimit && test.timeLimit > 0) {
        startTimer(test.timeLimit);
    } else {
        timerDisplay.style.display = 'none';
    }
    
    renderQuestion();
    updateNavigation();
}

function showResultsPage() {
    authPage.style.display = 'none';
    mainPage.style.display = 'none';
    testPage.style.display = 'none';
    resultsPage.style.display = 'block';
}

// ============ ⏱️ ТАЙМЕР ============

function startTimer(minutes) {
    timeLeft = minutes * 60;
    testStartTime = Date.now();
    timerDisplay.style.display = 'block';
    updateTimerDisplay();
    
    if (timerInterval) clearInterval(timerInterval);
    
    timerInterval = setInterval(() => {
        timeLeft--;
        totalTimeSpent++;
        updateTimerDisplay();
        
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            alert('⏰ Время вышло! Тест будет отправлен автоматически.');
            submitTest(true);
        }
    }, 1000);
}

function updateTimerDisplay() {
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    timerValue.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    
    // Меняем цвет, когда время заканчивается
    if (timeLeft <= 30) {
        timerDisplay.style.background = '#fc8181';
        timerDisplay.style.color = 'white';
    } else if (timeLeft <= 60) {
        timerDisplay.style.background = '#fefcbf';
        timerDisplay.style.color = '#744210';
    } else {
        timerDisplay.style.background = '#bee3f8';
        timerDisplay.style.color = '#2b6cb0';
    }
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    timerDisplay.style.display = 'none';
}

// ============ 💾 СОХРАНЕНИЕ ПРОГРЕССА ============

function saveProgress() {
    if (!currentTestId) return;
    const progress = {
        testId: currentTestId,
        answers: userAnswers,
        currentIndex: currentQuestionIndex,
        savedAt: Date.now()
    };
    localStorage.setItem(`test_progress_${currentTestId}`, JSON.stringify(progress));
}

function loadProgress(testId) {
    try {
        const saved = localStorage.getItem(`test_progress_${testId}`);
        if (saved) {
            const progress = JSON.parse(saved);
            // Проверяем, что прогресс не старше 24 часов
            if (Date.now() - progress.savedAt < 24 * 60 * 60 * 1000) {
                return progress;
            } else {
                localStorage.removeItem(`test_progress_${testId}`);
            }
        }
    } catch (error) {
        console.error('Ошибка загрузки прогресса:', error);
    }
    return null;
}

function clearProgress(testId) {
    localStorage.removeItem(`test_progress_${testId}`);
}

// ============ ТЕСТЫ ============

async function loadTests() {
    try {
        const response = await fetch('/api/tests');
        if (response.ok) {
            tests = await response.json();
            renderCategoryFilter();
            renderTests();
        }
    } catch (error) {
        console.error('Ошибка загрузки тестов:', error);
    }
}

function renderCategoryFilter() {
    if (!categoryFilter) return;
    const categories = [...new Set(tests.map(t => t.category || 'Другое'))];
    categoryFilter.innerHTML = '<option value="">📚 Все категории</option>' +
        categories.map(c => `<option value="${c}">${c}</option>`).join('');
}

function renderTests() {
    const filter = categoryFilter ? categoryFilter.value : '';
    const filteredTests = filter ? tests.filter(t => (t.category || 'Другое') === filter) : tests;
    
    if (!filteredTests || filteredTests.length === 0) {
        testsList.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #718096;">
                <p>📭 Нет доступных тестов</p>
            </div>
        `;
        return;
    }
    
    let html = '';
    filteredTests.forEach((test) => {
        const testId = test.id;
        const savedProgress = loadProgress(testId);
        const hasProgress = savedProgress && Object.keys(savedProgress.answers || {}).length > 0;
        
        html += `
            <div class="test-card">
                <div class="test-card-header">
                    <div>
                        <h3>${test.title || 'Без названия'}</h3>
                        <p>${test.description || 'Нет описания'}</p>
                        <div class="meta">
                            <span style="background: #ebf4ff; color: #2b6cb0; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 600;">
                                ${test.category || 'Другое'}
                            </span>
                            • ${test.class || '7-8'} класс • ${test.questions?.length || 0} вопросов
                            ${test.timeLimit ? ` • ⏱️ ${test.timeLimit} мин` : ''}
                            ${test.createdBy ? ` • Создал: ${test.createdBy}` : ''}
                            ${hasProgress ? ' • 💾 Есть сохранённый прогресс' : ''}
                        </div>
                    </div>
                    <div class="actions">
                        <button class="btn-primary" data-test-id="${testId}">
                            ${hasProgress ? '▶️ Продолжить' : 'Пройти тест'}
                        </button>
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
    try {
        const response = await fetch(`/api/tests/${testId}`);
        if (response.ok) {
            const test = await response.json();
            showTestPage(test);
        } else {
            alert('Ошибка загрузки теста');
        }
    } catch (error) {
        alert('Ошибка загрузки теста');
    }
}

async function deleteTest(testId) {
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
        }
    } catch (error) {
        alert('Ошибка удаления');
    }
}

// ============ РЕДАКТИРОВАНИЕ ТЕСТА ============

async function editTest(testId) {
    if (isEditFormOpen) {
        alert('⚠️ Сначала закройте текущий редактор теста!');
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/tests/${testId}/edit`);
        if (response.ok) {
            const test = await response.json();
            const testCard = document.querySelector(`.btn-edit[data-test-id="${testId}"]`)?.closest('.test-card');
            if (testCard) {
                showEditForm(test, testCard);
                isEditFormOpen = true;
            }
        } else {
            alert('Ошибка загрузки теста');
        }
    } catch (error) {
        alert('Ошибка загрузки теста');
    }
}

function showEditForm(test, testCard) {
    const categories = ['Механика', 'Термодинамика', 'Электричество', 'Оптика', 'Квантовая физика', 'Астрономия', 'Другое'];
    const categoryOptions = categories.map(c => 
        `<option value="${c}" ${(test.category || 'Другое') === c ? 'selected' : ''}>${c}</option>`
    ).join('');
    
    const editHtml = `
        <div id="editFormContainer" style="margin-top: 15px; padding: 20px; background: #f7fafc; border-radius: 10px; border: 2px solid #667eea;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <h4 style="margin: 0; color: #2d3748;">✏️ Редактирование: ${test.title}</h4>
                <button id="closeEditFormBtn" style="background: #fc8181; color: white; border: none; padding: 5px 15px; border-radius: 6px; cursor: pointer; font-size: 16px;">✕</button>
            </div>
            <form id="editTestForm">
                <input type="hidden" id="editTestId" value="${test.id}">
                <div class="form-group">
                    <label>Название теста</label>
                    <input type="text" id="editTestTitle" value="${test.title || ''}" required>
                </div>
                <div class="form-group">
                    <label>Описание</label>
                    <textarea id="editTestDescription">${test.description || ''}</textarea>
                </div>
                <div class="form-group">
                    <label>Класс</label>
                    <input type="text" id="editTestClass" value="${test.class || '7-8'}">
                </div>
                <div class="form-group">
                    <label>📚 Категория</label>
                    <select id="editTestCategory" style="width: 100%; padding: 12px; border: 2px solid #e2e8f0; border-radius: 10px; font-size: 16px;">
                        ${categoryOptions}
                    </select>
                </div>
                <div class="form-group">
                    <label>⏱️ Ограничение времени (минут, 0 = без ограничения)</label>
                    <input type="number" id="editTestTimeLimit" min="0" max="180" value="${test.timeLimit || 0}">
                </div>
                <div id="editQuestionsEditor">
                    <h4>Вопросы</h4>
                    <div id="editQuestionsList"></div>
                    <button type="button" id="addEditQuestionBtn" class="btn-secondary" style="margin-top: 10px;">+ Добавить вопрос</button>
                </div>
                <div style="display: flex; gap: 10px; margin-top: 20px;">
                    <button type="submit" class="btn-primary">💾 Сохранить</button>
                    <button type="button" id="cancelEditBtn" class="btn-secondary">❌ Отмена</button>
                </div>
            </form>
        </div>
    `;
    
    testCard.insertAdjacentHTML('afterend', editHtml);
    
    const editQuestionsList = document.getElementById('editQuestionsList');
    if (test.questions && test.questions.length > 0) {
        test.questions.forEach((q, index) => {
            addEditQuestion(q, index + 1);
        });
    }
    
    document.getElementById('addEditQuestionBtn')?.addEventListener('click', function() {
        const count = editQuestionsList.querySelectorAll('.question-editor').length + 1;
        addEditQuestion(null, count);
    });
    
    document.getElementById('editTestForm')?.addEventListener('submit', async function(e) {
        e.preventDefault();
        await saveEditedTest(test.id);
    });
    
    document.getElementById('cancelEditBtn')?.addEventListener('click', closeEditForm);
    document.getElementById('closeEditFormBtn')?.addEventListener('click', closeEditForm);
}

function closeEditForm() {
    const form = document.getElementById('editFormContainer');
    if (form) {
        form.remove();
        isEditFormOpen = false;
        loadTests();
    }
}

function addEditQuestion(questionData, number) {
    const list = document.getElementById('editQuestionsList');
    if (!list) return;
    
    const q = questionData || {
        type: 'choice',
        question: '',
        options: ['', '', '', ''],
        correct: 0,
        correctText: '',
        hint: ''
    };
    
    const type = q.type || 'choice';
    const isInput = type === 'input';
    
    const html = `
        <div class="question-editor" data-type="${type}" style="background: white; border-radius: 10px; padding: 15px; margin-bottom: 15px; border: 1px solid #e2e8f0; position: relative;">
            <div class="question-number" style="position: absolute; top: -10px; left: 15px; background: #667eea; color: white; padding: 2px 12px; border-radius: 20px; font-size: 12px; font-weight: 600;">
                Вопрос ${number}
            </div>
            <div class="form-group" style="margin-top: 10px;">
                <label>Тип вопроса</label>
                <select class="edit-q-type" style="width: 100%; padding: 8px; border: 1px solid #e2e8f0; border-radius: 6px;">
                    <option value="choice" ${!isInput ? 'selected' : ''}>📝 С выбором ответа</option>
                    <option value="input" ${isInput ? 'selected' : ''}>✍️ С вводом ответа</option>
                </select>
            </div>
            <div class="form-group">
                <input type="text" class="edit-q-text" placeholder="Введите вопрос" value="${q.question || ''}" required>
            </div>
            <div class="edit-options-block" style="display: ${isInput ? 'none' : 'block'};">
                <div class="options-editor" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 10px 0;">
                    <input type="text" class="edit-option-input" placeholder="Вариант A" value="${q.options?.[0] || ''}">
                    <input type="text" class="edit-option-input" placeholder="Вариант B" value="${q.options?.[1] || ''}">
                    <input type="text" class="edit-option-input" placeholder="Вариант C" value="${q.options?.[2] || ''}">
                    <input type="text" class="edit-option-input" placeholder="Вариант D" value="${q.options?.[3] || ''}">
                </div>
                <div class="form-group">
                    <label>Правильный ответ (0-3)</label>
                    <input type="number" class="edit-correct-option" min="0" max="3" value="${q.correct || 0}">
                </div>
            </div>
            <div class="edit-input-block" style="display: ${isInput ? 'block' : 'none'};">
                <div class="form-group">
                    <label>✍️ Правильный текстовый ответ</label>
                    <input type="text" class="edit-correct-text" placeholder="Например: 12 или м/с" value="${q.correctText || ''}">
                    <small style="color: #718096; font-size: 12px;">Регистр не важен. Пробелы в начале/конце игнорируются.</small>
                </div>
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
    
    list.insertAdjacentHTML('beforeend', html);
    
    // Обработчик переключения типа
    const lastEditor = list.lastElementChild;
    const typeSelect = lastEditor.querySelector('.edit-q-type');
    const optionsBlock = lastEditor.querySelector('.edit-options-block');
    const inputBlock = lastEditor.querySelector('.edit-input-block');
    
    typeSelect.addEventListener('change', function() {
        if (this.value === 'input') {
            optionsBlock.style.display = 'none';
            inputBlock.style.display = 'block';
        } else {
            optionsBlock.style.display = 'block';
            inputBlock.style.display = 'none';
        }
    });
}

async function saveEditedTest(testId) {
    const title = document.getElementById('editTestTitle').value.trim();
    const description = document.getElementById('editTestDescription').value.trim();
    const classNum = document.getElementById('editTestClass').value.trim();
    const category = document.getElementById('editTestCategory').value;
    const timeLimit = document.getElementById('editTestTimeLimit').value;
    
    if (!title) {
        alert('Введите название теста');
        return;
    }
    
    const questionElements = document.querySelectorAll('#editQuestionsList .question-editor');
    const questions = [];
    
    questionElements.forEach(el => {
        const type = el.querySelector('.edit-q-type').value;
        const qText = el.querySelector('.edit-q-text').value.trim();
        const hint = el.querySelector('.edit-hint-input')?.value || '';
        
        if (type === 'input') {
            const correctText = el.querySelector('.edit-correct-text').value.trim();
            if (qText && correctText) {
                questions.push({ type: 'input', question: qText, correctText, hint });
            }
        } else {
            const options = [];
            const optionInputs = el.querySelectorAll('.edit-option-input');
            optionInputs.forEach(input => options.push(input.value.trim()));
            const correct = parseInt(el.querySelector('.edit-correct-option').value);
            
            if (qText && options.length === 4 && options.every(o => o)) {
                questions.push({ type: 'choice', question: qText, options, correct, hint });
            }
        }
    });
    
    if (questions.length === 0) {
        alert('Добавьте хотя бы один вопрос');
        return;
    }
    
    try {
        const response = await fetch(`/api/tests/${testId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, description, class: classNum, category, timeLimit, questions })
        });
        
        if (response.ok) {
            alert('✅ Тест обновлен!');
            closeEditForm();
        } else {
            alert('Ошибка обновления теста');
        }
    } catch (error) {
        alert('Ошибка сервера');
    }
}

// ============ ОТОБРАЖЕНИЕ ВОПРОСОВ ============

function renderQuestion() {
    if (!currentTest) return;
    
    const q = currentTest.questions[currentQuestionIndex];
    const total = currentTest.questions.length;
    const isInput = q.type === 'input';
    
    questionCounter.textContent = `Вопрос ${currentQuestionIndex + 1} из ${total}`;
    
    // Подсказка
    const hasHint = q.hint && q.hint.trim().length > 0;
    hintBtn.style.display = hasHint ? 'inline-block' : 'none';
    hintContainer.style.display = 'none';
    hintUsed = false;
    
    let html = `
        <div class="question-item">
            <div class="question-text">${q.question}</div>
            ${isInput ? `
                <div class="input-answer-block" style="margin: 20px 0;">
                    <input type="text" id="textAnswerInput" class="text-answer-input" 
                           placeholder="Введите ваш ответ..." 
                           value="${userAnswers[currentQuestionIndex] || ''}"
                           autocomplete="off"
                           style="width: 100%; padding: 15px 20px; font-size: 18px; border: 2px solid #e2e8f0; border-radius: 12px; background: white; transition: all 0.3s;">
                    <small style="color: #718096; font-size: 13px; display: block; margin-top: 8px;">✍️ Введите ответ и нажмите Enter или кнопку "Далее"</small>
                </div>
            ` : `
                <div class="options">
                    ${q.options.map((option, index) => {
                        const isSelected = userAnswers[currentQuestionIndex] === index;
                        const checked = isSelected ? 'checked' : '';
                        return `
                            <div class="option ${isSelected ? 'selected' : ''}" onclick="selectOption(${index})">
                                <input type="radio" name="question" value="${index}" ${checked}>
                                <label>${option}</label>
                            </div>
                        `;
                    }).join('')}
                </div>
            `}
        </div>
    `;
    
    questionContainer.innerHTML = html;
    
    // Обработчик для текстового поля
    if (isInput) {
        const input = document.getElementById('textAnswerInput');
        if (input) {
            input.focus();
            input.addEventListener('input', function() {
                userAnswers[currentQuestionIndex] = this.value;
                saveProgress();
                updateNavigation();
            });
            input.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    userAnswers[currentQuestionIndex] = this.value;
                    saveProgress();
                    if (currentQuestionIndex < currentTest.questions.length - 1) {
                        nextQuestion();
                    } else {
                        if (allQuestionsAnswered()) submitTest();
                    }
                }
            });
        }
    }
    
    // Обработчик подсказки
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
    saveProgress();
    
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

function allQuestionsAnswered() {
    return currentTest.questions.every((_, index) => {
        const answer = userAnswers[index];
        return answer !== undefined && answer !== '';
    });
}

function updateNavigation() {
    const total = currentTest.questions.length;
    const answer = userAnswers[currentQuestionIndex];
    const hasAnswer = answer !== undefined && answer !== '';
    
    prevBtn.disabled = currentQuestionIndex === 0;
    
    if (currentQuestionIndex === total - 1) {
        nextBtn.style.display = 'none';
        submitBtn.style.display = 'block';
        submitBtn.disabled = !allQuestionsAnswered();
    } else {
        nextBtn.style.display = 'block';
        submitBtn.style.display = 'none';
    }
}

function nextQuestion() {
    if (currentQuestionIndex < currentTest.questions.length - 1) {
        currentQuestionIndex++;
        saveProgress();
        renderQuestion();
        updateNavigation();
    }
}

function prevQuestion() {
    if (currentQuestionIndex > 0) {
        currentQuestionIndex--;
        saveProgress();
        renderQuestion();
        updateNavigation();
    }
}

async function submitTest(autoSubmit = false) {
    if (!autoSubmit && !allQuestionsAnswered()) {
        alert('Ответьте на все вопросы!');
        return;
    }
    
    stopTimer();
    
    const answers = currentTest.questions.map((_, index) => userAnswers[index]);
    
    try {
        const response = await fetch(`/api/tests/${currentTestId}/check`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ answers, timeSpent: totalTimeSpent })
        });
        
        if (response.ok) {
            const results = await response.json();
            clearProgress(currentTestId);
            showResults(results);
            loadMyResults();
            loadLeaderboard();
        }
    } catch (error) {
        alert('Ошибка проверки теста');
    }
}

// ============ ОТОБРАЖЕНИЕ РЕЗУЛЬТАТОВ ============

function showResults(results) {
    showResultsPage();
    
    const timeStr = results.timeSpent ? 
        `${Math.floor(results.timeSpent / 60)} мин ${results.timeSpent % 60} сек` : '';
    
    let html = `
        <div class="result-card">
            <h3>${results.testTitle}</h3>
            <div class="result-score">${results.correct} / ${results.total}</div>
            <p style="font-size: 1.2em; color: #4a5568; margin: 10px 0;">
                ${results.percentage}% правильных ответов
            </p>
            ${timeStr ? `<p style="color: #718096; font-size: 14px;">⏱️ Время: ${timeStr}</p>` : ''}
            <div style="font-size: 0.9em; color: #718096; margin-top: 10px;">
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
        const typeIcon = r.type === 'input' ? '✍️' : '📝';
        
        html += `
            <div class="answer-detail ${r.isCorrect ? 'correct' : 'wrong'}">
                <div style="flex: 1;">
                    <div>${typeIcon} ${index + 1}. ${r.question}</div>
                    ${hintHtml}
                </div>
                <div style="text-align: right; min-width: 150px;">
                    ${r.isCorrect ? '✅' : '❌'} 
                    ${r.isCorrect ? r.userAnswer : `<span style="color: #fc8181;">${r.userAnswer}</span> → <span style="color: #48bb78;">${r.correctAnswer}</span>`}
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
                        ${r.category ? ` • ${r.category}` : ''}
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
        console.error('Ошибка загрузки лидеров:', error);
    }
}

function renderLeaderboard(leaderboard) {
    if (!leaderboard || leaderboard.length === 0) {
        leaderboardContent.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #718096;">
                <p>🏆 Пока нет результатов</p>
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
                        Лучший: ${item.bestTest} • Тестов: ${item.totalTests}
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
    const category = document.getElementById('testCategory')?.value || 'Другое';
    const timeLimit = document.getElementById('testTimeLimit')?.value || 0;
    
    const questionElements = document.querySelectorAll('#questionsList .question-editor');
    const questions = [];
    
    questionElements.forEach(el => {
        const type = el.querySelector('.q-type')?.value || 'choice';
        const qText = el.querySelector('.q-text').value.trim();
        const hint = el.querySelector('.hint-input')?.value || '';
        
        if (type === 'input') {
            const correctText = el.querySelector('.correct-text')?.value.trim();
            if (qText && correctText) {
                questions.push({ type: 'input', question: qText, correctText, hint });
            }
        } else {
            const options = [];
            const optionInputs = el.querySelectorAll('.option-input');
            optionInputs.forEach(input => options.push(input.value.trim()));
            const correct = parseInt(el.querySelector('.correct-option').value);
            
            if (qText && options.length === 4 && options.every(o => o)) {
                questions.push({ type: 'choice', question: qText, options, correct, hint });
            }
        }
    });
    
    if (questions.length === 0) {
        alert('Добавьте хотя бы один вопрос');
        return;
    }
    
    try {
        const response = await fetch('/api/tests', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, description, class: classNum, category, timeLimit, questions })
        });
        
        if (response.ok) {
            alert('Тест создан!');
            createForm.reset();
            questionsList.innerHTML = '';
            questionCounterAdmin = 0;
            loadTests();
            if (currentRole === 'admin') loadStats();
            switchTab('tests');
        } else {
            alert('Ошибка создания теста');
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
                <label>Тип вопроса</label>
                <select class="q-type" style="width: 100%; padding: 8px; border: 1px solid #e2e8f0; border-radius: 6px;">
                    <option value="choice">📝 С выбором ответа</option>
                    <option value="input">✍️ С вводом ответа</option>
                </select>
            </div>
            <div class="form-group">
                <input type="text" class="q-text" placeholder="Введите вопрос" required>
            </div>
            <div class="options-block">
                <div class="options-editor">
                    <input type="text" class="option-input" placeholder="Вариант A">
                    <input type="text" class="option-input" placeholder="Вариант B">
                    <input type="text" class="option-input" placeholder="Вариант C">
                    <input type="text" class="option-input" placeholder="Вариант D">
                </div>
                <div class="form-group">
                    <label>Правильный ответ (0-3)</label>
                    <input type="number" class="correct-option" min="0" max="3" value="0">
                </div>
            </div>
            <div class="input-block" style="display: none;">
                <div class="form-group">
                    <label>✍️ Правильный текстовый ответ</label>
                    <input type="text" class="correct-text" placeholder="Например: 12 или м/с">
                </div>
            </div>
            <div class="form-group">
                <label>Подсказка (необязательно)</label>
                <input type="text" class="hint-input" placeholder="Введите подсказку">
            </div>
            <button type="button" class="remove-question" onclick="this.parentElement.remove()">✕ Удалить</button>
        </div>
    `;
    questionsList.insertAdjacentHTML('beforeend', html);
    
    const lastEditor = questionsList.lastElementChild;
    const typeSelect = lastEditor.querySelector('.q-type');
    const optionsBlock = lastEditor.querySelector('.options-block');
    const inputBlock = lastEditor.querySelector('.input-block');
    
    typeSelect.addEventListener('change', function() {
        if (this.value === 'input') {
            optionsBlock.style.display = 'none';
            inputBlock.style.display = 'block';
        } else {
            optionsBlock.style.display = 'block';
            inputBlock.style.display = 'none';
        }
    });
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
    let categoryHtml = '';
    if (stats.categoryStats && Object.keys(stats.categoryStats).length > 0) {
        categoryHtml = `
            <h4 style="margin-top: 20px; color: #2d3748;">📚 По категориям:</h4>
            <ul style="list-style: none; padding: 0;">
                ${Object.entries(stats.categoryStats).map(([cat, data]) => `
                    <li style="padding: 8px 12px; background: #f7fafc; border-radius: 8px; margin-bottom: 5px;">
                        <strong>${cat}</strong> — ${data.tests} тестов, ${data.completions} прохождений
                    </li>
                `).join('')}
            </ul>
        `;
    }
    
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
                <div class="label">Пройдено</div>
            </div>
        </div>
        ${categoryHtml}
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
    if (content) content.classList.add('active');
    
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
            if (currentRole === 'admin') loadStats();
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
        authError.textContent = 'Имя минимум 3 символа';
        return;
    }
    
    if (password.length < 4) {
        authError.textContent = 'Пароль минимум 4 символа';
        return;
    }
    
    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        if (response.ok) {
            authError.textContent = 'Регистрация успешна! Войдите.';
            authError.style.color = '#48bb78';
            usernameInput.value = '';
            passwordInput.value = '';
        } else {
            const data = await response.json();
            authError.textContent = data.error || 'Ошибка';
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
submitBtn.addEventListener('click', () => submitTest(false));
backBtn.addEventListener('click', () => {
    stopTimer();
    showMainPage();
    loadTests();
});
backToTestsBtn.addEventListener('click', () => {
    stopTimer();
    showMainPage();
    loadTests();
});

if (categoryFilter) {
    categoryFilter.addEventListener('change', renderTests);
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && authPage.style.display !== 'none') {
        login();
    }
});

// ============ ЗАПУСК ============
createSquares();
checkAuth();