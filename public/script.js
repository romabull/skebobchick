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

// Звонки
let localStream = null;
let peerConnections = {};
let pendingCandidates = {};
let processedSignals = new Set();
let makingOffer = {};
let currentRoom = null;
let signalPollingInterval = null;
let lastSignalTime = 0;
let micEnabled = true;
let isCallActive = false;
let activeParticipants = new Set();
let peerMicStatus = {};

// ✅ Новые переменные для оптимизации polling
let isCallConnected = false;
let pollCount = 0;

// Демонстрация экрана
let screenStream = null;
let screenSender = null;
let isSharingScreen = false;

// Видео с камеры
let cameraStream = null;
let cameraSender = null;
let isCameraOn = false;

// Индикатор говорящего
let audioAnalyzers = {};

// Обучение
let lessons = [];
let currentLessonId = null;

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

// Звонки DOM
const createRoomBtn = document.getElementById('createRoomBtn');
const roomsContainer = document.getElementById('roomsContainer');
const callsListView = document.getElementById('callsListView');
const callRoomView = document.getElementById('callRoomView');
const callRoomName = document.getElementById('callRoomName');
const callRoomStatus = document.getElementById('callRoomStatus');
const leaveRoomBtn = document.getElementById('leaveRoomBtn');
const leaveRoomBtnMobile = document.getElementById('leaveRoomBtnMobile');
const toggleMicBtn = document.getElementById('toggleMicBtn');
const toggleCamBtn = document.getElementById('toggleCamBtn');
const participantsList = document.getElementById('participantsList');
const remoteAudios = document.getElementById('remoteAudios');
const callWaiting = document.getElementById('callWaiting');
const myVideoContainer = document.getElementById('myVideoContainer');
const myVideo = document.getElementById('myVideo');

// Демонстрация экрана DOM
const shareScreenBtn = document.getElementById('shareScreenBtn');
const screenShareContainer = document.getElementById('screenShareContainer');
const screenShareVideo = document.getElementById('screenShareVideo');
const screenShareInfo = document.getElementById('screenShareInfo');

// Обучение DOM
const createLessonBtn = document.getElementById('createLessonBtn');
const lessonsListView = document.getElementById('lessonsListView');
const lessonsList = document.getElementById('lessonsList');
const lessonView = document.getElementById('lessonView');
const lessonContent = document.getElementById('lessonContent');
const backToLessonsBtn = document.getElementById('backToLessonsBtn');
const lessonEditor = document.getElementById('lessonEditor');
const backFromEditorBtn = document.getElementById('backFromEditorBtn');
const lessonForm = document.getElementById('lessonForm');
const editorTitle = document.getElementById('editorTitle');
const lessonSearch = document.getElementById('lessonSearch');
const lessonCategoryFilter = document.getElementById('lessonCategoryFilter');

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
    
    const saved = loadProgress(test.id);
    if (saved) {
        userAnswers = saved.answers || {};
        currentQuestionIndex = saved.currentIndex || 0;
    } else {
        userAnswers = {};
        currentQuestionIndex = 0;
    }
    
    testTitle.textContent = test.title;
    
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
    totalTimeSpent = 0;
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
                            ${hasProgress ? ' • 💾 Есть прогресс' : ''}
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
        const response = await fetch(`/api/tests/${testId}`, { method: 'DELETE' });
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
        alert('⚠️ Сначала закройте текущий редактор!');
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
                    <label>⏱️ Время (мин, 0 = без ограничения)</label>
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
        test.questions.forEach((q, index) => addEditQuestion(q, index + 1));
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
        type: 'choice', question: '', options: ['', '', '', ''],
        correct: 0, correctText: '', hint: ''
    };
    
    const type = q.type || 'choice';
    const isInput = type === 'input';
    
    const html = `
        <div class="question-editor" style="background: white; border-radius: 10px; padding: 15px; margin-bottom: 15px; border: 1px solid #e2e8f0; position: relative;">
            <div class="question-number" style="position: absolute; top: -10px; left: 15px; background: #667eea; color: white; padding: 2px 12px; border-radius: 20px; font-size: 12px; font-weight: 600;">
                Вопрос ${number}
            </div>
            <div class="form-group" style="margin-top: 10px;">
                <label>Тип</label>
                <select class="edit-q-type" style="width: 100%; padding: 8px; border: 1px solid #e2e8f0; border-radius: 6px;">
                    <option value="choice" ${!isInput ? 'selected' : ''}>📝 С выбором</option>
                    <option value="input" ${isInput ? 'selected' : ''}>✍️ С вводом</option>
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
                    <label>Правильный (0-3)</label>
                    <input type="number" class="edit-correct-option" min="0" max="3" value="${q.correct || 0}">
                </div>
            </div>
            <div class="edit-input-block" style="display: ${isInput ? 'block' : 'none'};">
                <div class="form-group">
                    <label>✍️ Правильный ответ</label>
                    <input type="text" class="edit-correct-text" placeholder="Например: 12 или м/с" value="${q.correctText || ''}">
                </div>
            </div>
            <div class="form-group">
                <label>Подсказка</label>
                <input type="text" class="edit-hint-input" placeholder="Подсказка" value="${q.hint || ''}">
            </div>
            <button type="button" class="remove-question" style="margin-top: 10px; background: #fc8181; color: white; border: none; padding: 5px 15px; border-radius: 6px; cursor: pointer;">
                ✕ Удалить
            </button>
        </div>
    `;
    
    list.insertAdjacentHTML('beforeend', html);
    
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
        alert('Введите название');
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
            alert('Ошибка обновления');
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
                    <small style="color: #718096; font-size: 13px; display: block; margin-top: 8px;">✍️ Введите ответ и нажмите Enter</small>
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
                    } else if (allQuestionsAnswered()) {
                        submitTest();
                    }
                }
            });
        }
    }
    
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
                  results.percentage >= 50 ? '📚 Хорошо, но стоит повторить' : 
                  '💪 Нужно больше практики!'}
            </div>
        </div>
        <div class="result-details">
            <h3 style="margin-bottom: 15px; color: #2d3748;">Детальный разбор:</h3>
    `;
    
    results.results.forEach((r, index) => {
        const hintHtml = r.hint ? `<div style="font-size: 12px; color: #d69e2e; margin-top: 4px;">💡 ${r.hint}</div>` : '';
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
                        ${r.correct} из ${r.total} (${r.percentage}%)
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
                    <div class="details">Лучший: ${item.bestTest} • Тестов: ${item.totalTests}</div>
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
                <label>Тип</label>
                <select class="q-type" style="width: 100%; padding: 8px; border: 1px solid #e2e8f0; border-radius: 6px;">
                    <option value="choice">📝 С выбором</option>
                    <option value="input">✍️ С вводом</option>
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
                    <label>Правильный (0-3)</label>
                    <input type="number" class="correct-option" min="0" max="3" value="0">
                </div>
            </div>
            <div class="input-block" style="display: none;">
                <div class="form-group">
                    <label>✍️ Правильный ответ</label>
                    <input type="text" class="correct-text" placeholder="Например: 12 или м/с">
                </div>
            </div>
            <div class="form-group">
                <label>Подсказка</label>
                <input type="text" class="hint-input" placeholder="Подсказка">
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
    if (tab === 'calls') loadRooms();
    if (tab === 'lessons') loadLessons();
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
        if (currentRoom) leaveRoom();
        await fetch('/api/logout', { method: 'POST' });
        currentUser = null;
        currentRole = null;
        showAuthPage();
    } catch (error) {
        alert('Ошибка выхода');
    }
}

// ============ 📞 АУДИОЗВОНКИ ============

const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        {
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        },
        {
            urls: 'turn:openrelay.metered.ca:443',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        }
    ]
};

// ============ ИНДИКАТОР ГОВОРЯЩЕГО ============

function startSpeakingDetection(username, stream) {
    if (audioAnalyzers[username]) return;
    
    try {
        const audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.8;
        source.connect(analyser);
        
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        let silenceCount = 0;
        
        const interval = setInterval(() => {
            analyser.getByteFrequencyData(dataArray);
            const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
            
            const participantEl = document.querySelector(`.participant-item[data-username="${username}"]`);
            if (!participantEl) return;
            
            if (avg > 30) {
                silenceCount = 0;
                participantEl.classList.add('speaking');
            } else {
                silenceCount++;
                if (silenceCount > 5) {
                    participantEl.classList.remove('speaking');
                }
            }
        }, 100);
        
        audioAnalyzers[username] = { audioContext, analyser, dataArray, interval };
    } catch (err) {
        console.warn('Ошибка определения говорящего:', err);
    }
}

function stopSpeakingDetection(username) {
    if (audioAnalyzers[username]) {
        clearInterval(audioAnalyzers[username].interval);
        try { audioAnalyzers[username].audioContext.close(); } catch (e) {}
        delete audioAnalyzers[username];
    }
}

// ============ КОМНАТЫ ============

async function loadRooms() {
    try {
        const response = await fetch('/api/calls/rooms');
        if (response.ok) {
            const rooms = await response.json();
            renderRooms(rooms);
        }
    } catch (error) {
        console.error('Ошибка загрузки комнат:', error);
    }
}

function renderRooms(rooms) {
    if (!roomsContainer) return;
    
    if (!rooms || rooms.length === 0) {
        roomsContainer.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #718096;">
                <p>📭 Нет активных комнат</p>
                <p style="font-size: 14px;">Создайте комнату, чтобы начать звонок</p>
            </div>
        `;
        return;
    }
    
    let html = '';
    rooms.forEach(room => {
        const canDelete = room.createdBy === currentUser || currentRole === 'admin';
        html += `
            <div class="test-card" style="cursor: default;">
                <div class="test-card-header">
                    <div>
                        <h3>📞 ${room.name}</h3>
                        <div class="meta">
                            Создал: ${room.createdBy} • 
                            ${new Date(room.createdAt).toLocaleString()}
                        </div>
                    </div>
                    <div class="actions">
                        <button class="btn-primary btn-join" data-room-id="${room.id}" data-room-name="${room.name}">
                            🎧 Войти
                        </button>
                        ${canDelete ? `
                            <button class="btn-small btn-danger btn-delete-room" data-room-id="${room.id}">
                                🗑️
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    });
    
    roomsContainer.innerHTML = html;
    
    roomsContainer.querySelectorAll('.btn-join').forEach(btn => {
        btn.addEventListener('click', function() {
            joinRoom(this.dataset.roomId, this.dataset.roomName);
        });
    });
    
    roomsContainer.querySelectorAll('.btn-delete-room').forEach(btn => {
        btn.addEventListener('click', async function() {
            if (!confirm('Удалить комнату?')) return;
            try {
                const response = await fetch(`/api/calls/rooms/${this.dataset.roomId}`, { method: 'DELETE' });
                if (response.ok) loadRooms();
            } catch (error) {
                alert('Ошибка удаления');
            }
        });
    });
}

createRoomBtn?.addEventListener('click', async () => {
    const name = prompt('Название комнаты:', `Звонок ${currentUser}`);
    if (!name) return;
    
    try {
        const response = await fetch('/api/calls/rooms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        
        if (response.ok) {
            const data = await response.json();
            loadRooms();
            setTimeout(() => joinRoom(data.room.id, data.room.name), 500);
        }
    } catch (error) {
        alert('Ошибка создания комнаты');
    }
});

async function joinRoom(roomId, roomName) {
    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            alert('Ваш браузер не поддерживает микрофон.');
            return;
        }
        
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }, 
                video: false 
            });
        } catch (mediaError) {
            console.error('Ошибка доступа к микрофону:', mediaError);
            if (mediaError.name === 'NotFoundError') {
                alert('❌ Микрофон не найден.');
            } else if (mediaError.name === 'NotAllowedError') {
                alert('❌ Доступ к микрофону запрещён.');
            } else if (mediaError.name === 'NotReadableError') {
                alert('❌ Микрофон занят другой программой.');
            } else {
                alert('❌ Ошибка: ' + mediaError.message);
            }
            return;
        }
        
        currentRoom = { id: roomId, name: roomName };
        isCallActive = true;
        micEnabled = true;
        isCameraOn = false;
        lastSignalTime = 0;
        peerConnections = {};
        pendingCandidates = {};
        makingOffer = {};
        processedSignals.clear();
        activeParticipants.clear();
        peerMicStatus = {};
        isCallConnected = false;  // ✅ Сброс флага
        pollCount = 0;             // ✅ Сброс счётчика
        
        callsListView.style.display = 'none';
        callRoomView.style.display = 'flex';
        document.body.classList.add('in-call');
        const appEl = document.getElementById('app');
        if (appEl) appEl.style.display = 'none';
        
        callRoomName.textContent = `📞 ${roomName}`;
        callRoomStatus.textContent = 'Ожидание собеседника...';
        
        toggleMicBtn.disabled = false;
        toggleMicBtn.textContent = '🎤';
        toggleMicBtn.classList.add('active');
        toggleMicBtn.classList.remove('muted');
        
        if (toggleCamBtn) {
            toggleCamBtn.textContent = '📹';
            toggleCamBtn.classList.remove('active');
            toggleCamBtn.setAttribute('data-label', 'Камера');
        }
        
        if (myVideoContainer) myVideoContainer.classList.remove('active');
        
        if (callWaiting) callWaiting.style.display = 'flex';
        
        updateParticipants();
        startSpeakingDetection(currentUser, localStream);
        await sendSignal('join', { username: currentUser });
        startSignalPolling();
        
        console.log('✅ Вошли в комнату:', roomName);
    } catch (error) {
        console.error('Ошибка входа:', error);
        alert('Не удалось войти в комнату: ' + error.message);
    }
}

function leaveRoom() {
    if (isSharingScreen) stopScreenShare();
    if (isCameraOn) stopCamera();
    
    isCallActive = false;
    
    if (signalPollingInterval) {
        clearInterval(signalPollingInterval);
        signalPollingInterval = null;
    }
    
    Object.values(peerConnections).forEach(pc => {
        try { pc.close(); } catch (e) {}
    });
    peerConnections = {};
    pendingCandidates = {};
    makingOffer = {};
    processedSignals.clear();
    activeParticipants.clear();
    peerMicStatus = {};
    isCallConnected = false;  // ✅ Сброс
    pollCount = 0;             // ✅ Сброс
    
    Object.keys(audioAnalyzers).forEach(username => stopSpeakingDetection(username));
    
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    if (currentRoom) {
        sendSignal('leave', { username: currentUser }).catch(() => {});
    }
    
    currentRoom = null;
    if (callRoomView) callRoomView.style.display = 'none';
    if (callsListView) callsListView.style.display = 'block';
    const appEl = document.getElementById('app');
    if (appEl) appEl.style.display = '';
    if (remoteAudios) remoteAudios.innerHTML = '';
    if (participantsList) participantsList.innerHTML = '';
    if (screenShareContainer) screenShareContainer.classList.remove('active');
    if (myVideoContainer) myVideoContainer.classList.remove('active');
    
    document.body.classList.remove('in-call');
    
    loadRooms();
    console.log('📵 Вышли из комнаты');
}

leaveRoomBtn?.addEventListener('click', () => {
    if (confirm('Выйти из комнаты?')) leaveRoom();
});

leaveRoomBtnMobile?.addEventListener('click', () => {
    if (confirm('Выйти из комнаты?')) leaveRoom();
});

toggleMicBtn?.addEventListener('click', () => {
    if (!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
        micEnabled = !micEnabled;
        audioTrack.enabled = micEnabled;
        
        toggleMicBtn.textContent = micEnabled ? '🎤' : '🔇';
        toggleMicBtn.classList.toggle('active', micEnabled);
        toggleMicBtn.classList.toggle('muted', !micEnabled);
        
        sendSignal('mic-status', { username: currentUser, enabled: micEnabled }).catch(() => {});
        
        updateParticipants();
    }
});

// ============ 📹 КАМЕРА ============

async function startCamera() {
    if (!currentRoom) {
        alert('Сначала войдите в комнату');
        return;
    }
    
    if (isCameraOn) {
        stopCamera();
        return;
    }
    
    // ✅ Ускоряем polling на время пересогласования
    isCallConnected = false;
    pollCount = 0;
    
    try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: 'user'
            },
            audio: false
        });
        
        isCameraOn = true;
        
        if (myVideoContainer && myVideo) {
            myVideoContainer.classList.add('active');
            myVideo.srcObject = cameraStream;
            myVideo.play().catch(() => {});
        }
        
        if (toggleCamBtn) {
            toggleCamBtn.textContent = '📹';
            toggleCamBtn.classList.add('active');
            toggleCamBtn.setAttribute('data-label', 'Выкл. камеру');
        }
        
        const videoTrack = cameraStream.getVideoTracks()[0];
        
        for (const peerUsername of Object.keys(peerConnections)) {
            const pc = peerConnections[peerUsername];
            
            let sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
            
            if (sender) {
                await sender.replaceTrack(videoTrack);
            } else {
                cameraSender = pc.addTrack(videoTrack, cameraStream);
                
                try {
                    const offer = await pc.createOffer();
                    await pc.setLocalDescription(offer);
                    await sendSignal('offer', { offer: pc.localDescription, to: peerUsername });
                } catch (err) {
                    console.error('Ошибка пересогласования:', err);
                }
            }
        }
        
        console.log('📹 Камера включена');
    } catch (error) {
        console.error('Ошибка камеры:', error);
        if (error.name === 'NotFoundError') {
            alert('❌ Камера не найдена. Подключите веб-камеру.');
        } else if (error.name === 'NotAllowedError') {
            alert('❌ Доступ к камере запрещён. Разрешите доступ в браузере.');
        } else if (error.name === 'NotReadableError') {
            alert('❌ Камера занята другой программой.');
        } else {
            alert('❌ Ошибка камеры: ' + error.message);
        }
    }
}

function stopCamera() {
    if (!isCameraOn && !cameraStream) return;
    
    console.log('⏹️ Выключаем камеру');
    
    // ✅ Ускоряем polling на время пересогласования
    isCallConnected = false;
    pollCount = 0;
    
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
    
    isCameraOn = false;
    
    if (myVideoContainer) {
        myVideoContainer.classList.remove('active');
        if (myVideo) myVideo.srcObject = null;
    }
    
    if (toggleCamBtn) {
        toggleCamBtn.textContent = '📹';
        toggleCamBtn.classList.remove('active');
        toggleCamBtn.setAttribute('data-label', 'Камера');
    }
    
    for (const peerUsername of Object.keys(peerConnections)) {
        const pc = peerConnections[peerUsername];
        const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
        
        if (sender) {
            try {
                pc.removeTrack(sender);
                
                (async () => {
                    try {
                        const offer = await pc.createOffer();
                        await pc.setLocalDescription(offer);
                        await sendSignal('offer', { offer: pc.localDescription, to: peerUsername });
                    } catch (err) {
                        console.error('Ошибка пересогласования:', err);
                    }
                })();
            } catch (err) {}
        }
    }
    
    cameraSender = null;
}

toggleCamBtn?.addEventListener('click', startCamera);

// ============ 🖥️ ДЕМОНСТРАЦИЯ ЭКРАНА ============

async function startScreenShare() {
    if (!currentRoom) {
        alert('Сначала войдите в комнату');
        return;
    }
    
    if (isSharingScreen) {
        stopScreenShare();
        return;
    }
    
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        alert('Ваш браузер не поддерживает демонстрацию экрана.');
        return;
    }
    
    // ✅ Ускоряем polling на время пересогласования
    isCallConnected = false;
    pollCount = 0;
    
    try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: { cursor: 'always', frameRate: { ideal: 30, max: 60 } },
            audio: false
        });
        
        isSharingScreen = true;
        
        if (screenShareContainer) {
            screenShareContainer.classList.add('active');
            const videoOnlyStream = new MediaStream([screenStream.getVideoTracks()[0]]);
            screenShareVideo.srcObject = videoOnlyStream;
            screenShareVideo.muted = true;
            screenShareInfo.textContent = '📺 Вы показываете свой экран';
            screenShareVideo.play().catch(() => {});
            
            if (callWaiting) callWaiting.style.display = 'none';
        }
        
        if (shareScreenBtn) {
            shareScreenBtn.textContent = '⏹️';
            shareScreenBtn.classList.remove('primary');
            shareScreenBtn.classList.add('danger');
            shareScreenBtn.setAttribute('data-label', 'Остановить');
        }
        
        screenStream.getVideoTracks()[0].onended = () => stopScreenShare();
        
        for (const peerUsername of Object.keys(peerConnections)) {
            const pc = peerConnections[peerUsername];
            const videoTrack = screenStream.getVideoTracks()[0];
            
            let sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
            
            if (sender) {
                await sender.replaceTrack(videoTrack);
            } else {
                sender = pc.addTrack(videoTrack, screenStream);
                screenSender = sender;
                
                try {
                    const offer = await pc.createOffer();
                    await pc.setLocalDescription(offer);
                    await sendSignal('offer', { offer: pc.localDescription, to: peerUsername });
                } catch (err) {
                    console.error('Ошибка пересогласования:', err);
                }
            }
        }
        
        console.log('🖥️ Начали трансляцию экрана');
    } catch (error) {
        console.error('Ошибка демонстрации:', error);
        if (error.name !== 'NotAllowedError') {
            alert('Ошибка демонстрации: ' + error.message);
        }
    }
}

function stopScreenShare() {
    if (!isSharingScreen && !screenStream) return;
    
    console.log('⏹️ Останавливаем трансляцию');
    
    // ✅ Ускоряем polling на время пересогласования
    isCallConnected = false;
    pollCount = 0;
    
    if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
        screenStream = null;
    }
    
    isSharingScreen = false;
    
    if (screenShareContainer) {
        screenShareContainer.classList.remove('active');
        screenShareVideo.srcObject = null;
        screenShareInfo.textContent = '';
    }
    
    if (shareScreenBtn) {
        shareScreenBtn.textContent = '🖥️';
        shareScreenBtn.classList.remove('danger');
        shareScreenBtn.classList.add('primary');
        shareScreenBtn.setAttribute('data-label', 'Экран');
    }
    
    for (const peerUsername of Object.keys(peerConnections)) {
        const pc = peerConnections[peerUsername];
        const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
        
        if (sender) {
            try {
                pc.removeTrack(sender);
                
                (async () => {
                    try {
                        const offer = await pc.createOffer();
                        await pc.setLocalDescription(offer);
                        await sendSignal('offer', { offer: pc.localDescription, to: peerUsername });
                    } catch (err) {
                        console.error('Ошибка пересогласования:', err);
                    }
                })();
            } catch (err) {}
        }
    }
    
    screenSender = null;
    
    updateParticipants();
}

shareScreenBtn?.addEventListener('click', startScreenShare);

// ============ PEER CONNECTION ============

function createPeerConnection(peerUsername) {
    if (peerConnections[peerUsername]) return peerConnections[peerUsername];
    
    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnections[peerUsername] = pc;
    pendingCandidates[peerUsername] = [];
    makingOffer[peerUsername] = false;
    
    if (localStream) {
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    }
    
    try {
        pc.addTransceiver('video', { direction: 'sendrecv' });
    } catch (e) {}
    
    pc.ontrack = (event) => {
        const track = event.track;
        console.log(`📺 Получен ${track.kind} трек от ${peerUsername}`);
        
        if (track.kind === 'audio') {
            let audioEl = document.getElementById(`audio-${peerUsername}`);
            if (!audioEl) {
                audioEl = document.createElement('audio');
                audioEl.id = `audio-${peerUsername}`;
                audioEl.autoplay = true;
                audioEl.playsInline = true;
                remoteAudios.appendChild(audioEl);
            }
            
            const audioOnlyStream = new MediaStream([track]);
            audioEl.srcObject = audioOnlyStream;
            audioEl.volume = 1.0;
            
            audioEl.play()
                .then(() => {
                    console.log(`🔊 Аудио от ${peerUsername} воспроизводится`);
                    callRoomStatus.textContent = `🔊 Говорите с ${peerUsername}`;
                    startSpeakingDetection(peerUsername, audioOnlyStream);
                })
                .catch(err => {
                    console.error(`❌ Ошибка воспроизведения:`, err);
                    callRoomStatus.innerHTML = `
                        🔊 Аудио получено. 
                        <button onclick="document.getElementById('audio-${peerUsername}').play()" 
                                style="margin-left:10px; padding:5px 15px; background:#48bb78; color:white; border:none; border-radius:6px; cursor:pointer;">
                            ▶️ Включить звук
                        </button>
                    `;
                });
        } else if (track.kind === 'video') {
            screenShareVideo.dataset.fromUser = peerUsername;
            
            const clearVideo = () => {
                console.log(`⏹️ ${peerUsername} выключил видео`);
                screenShareContainer.classList.remove('active');
                screenShareVideo.srcObject = null;
                screenShareVideo.dataset.fromUser = '';
                screenShareInfo.textContent = '';
                updateParticipants();
            };
            
            if (screenShareContainer) {
                screenShareContainer.classList.add('active');
                
                const videoOnlyStream = new MediaStream([track]);
                screenShareVideo.srcObject = videoOnlyStream;
                screenShareVideo.muted = false;
                
                const isScreenShare = track.label && 
                    (track.label.toLowerCase().includes('screen') || 
                     track.label.toLowerCase().includes('display') ||
                     track.label.toLowerCase().includes('window'));
                
                screenShareInfo.textContent = isScreenShare 
                    ? `🖥️ ${peerUsername} показывает экран`
                    : `📹 ${peerUsername}`;
                
                screenShareVideo.play()
                    .then(() => console.log(`🎥 Видео от ${peerUsername} воспроизводится`))
                    .catch(err => console.warn('Autoplay видео:', err));
                
                if (callWaiting) callWaiting.style.display = 'none';
                
                track.onended = clearVideo;
                track.onmute = () => {
                    console.log(`🔇 Видео от ${peerUsername} заглушено`);
                    clearVideo();
                };
                track.onunmute = () => {
                    console.log(`🔊 Видео от ${peerUsername} восстановлено`);
                    const stream = new MediaStream([track]);
                    screenShareVideo.srcObject = stream;
                    screenShareContainer.classList.add('active');
                    screenShareVideo.play().catch(() => {});
                };
            }
        }
    };
    
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            sendSignal('candidate', { candidate: event.candidate, to: peerUsername });
        }
    };
    
    // ✅ Оптимизация polling после соединения
    pc.onconnectionstatechange = () => {
        console.log(`Соединение с ${peerUsername}: ${pc.connectionState}`);
        
        if (pc.connectionState === 'connected') {
            callRoomStatus.textContent = `✅ Соединено с ${peerUsername}`;
            if (callWaiting) callWaiting.style.display = 'none';
            
            // Проверяем, все ли соединения установлены
            const allConnected = Object.values(peerConnections).every(
                conn => conn.connectionState === 'connected'
            );
            
            if (allConnected && Object.keys(peerConnections).length > 0) {
                isCallConnected = true;
                console.log('🐢 Все соединения установлены, замедляем polling до 5 сек');
            }
        } else if (pc.connectionState === 'disconnected') {
            callRoomStatus.textContent = `⚠️ Соединение потеряно`;
            isCallConnected = false; // Возобновляем быстрый polling
        } else if (pc.connectionState === 'failed') {
            callRoomStatus.textContent = `❌ Соединение не удалось`;
            isCallConnected = false;
            try { pc.restartIce(); } catch (e) {}
        }
    };
    
    return pc;
}

// ============ СИГНАЛИНГ (ОПТИМИЗИРОВАННЫЙ) ============

async function sendSignal(type, data) {
    if (!currentRoom) return;
    try {
        await fetch('/api/calls/signal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomId: currentRoom.id, type, data })
        });
    } catch (error) {
        console.error('Ошибка отправки сигнала:', error);
    }
}

function startSignalPolling() {
    if (signalPollingInterval) clearInterval(signalPollingInterval);
    
    pollCount = 0;
    
    signalPollingInterval = setInterval(async () => {
        if (!currentRoom || !isCallActive) return;
        
        pollCount++;
        
        // ✅ Если соединение установлено — опрашиваем реже
        if (isCallConnected) {
            // Проверяем каждый 5-й тик = 5 секунд
            if (pollCount % 5 !== 0) return;
        }
        
        try {
            const response = await fetch(`/api/calls/signal/${currentRoom.id}?lastTime=${lastSignalTime}`);
            if (response.ok) {
                const signals = await response.json();
                for (const signal of signals) {
                    const signalKey = signal.id || `${signal.from}_${signal.type}_${signal.createdAt}`;
                    if (processedSignals.has(signalKey)) continue;
                    processedSignals.add(signalKey);
                    
                    // Если пришёл новый сигнал — ускоряем polling
                    if (isCallConnected) {
                        console.log('⚡ Новый сигнал, ускоряем polling');
                        isCallConnected = false;
                        pollCount = 0;
                    }
                    
                    await handleSignal(signal);
                    
                    const t = typeof signal.createdAt === 'number' 
                        ? signal.createdAt 
                        : new Date(signal.createdAt).getTime();
                    if (!isNaN(t)) {
                        lastSignalTime = Math.max(lastSignalTime, t);
                    }
                }
            }
        } catch (error) {
            console.error('Ошибка polling:', error);
        }
    }, 1000);
}

async function handleSignal(signal) {
    let data;
    try {
        data = JSON.parse(signal.data);
    } catch (e) {
        console.error('Ошибка парсинга сигнала:', e);
        return;
    }
    const from = signal.from;
    
    console.log(`📨 Сигнал от ${from}: ${signal.type}`);
    
    try {
        switch (signal.type) {
            case 'join': await handleJoin(from); break;
            case 'offer': await handleOffer(from, data); break;
            case 'answer': await handleAnswer(from, data); break;
            case 'candidate': await handleCandidate(from, data); break;
            case 'leave': handleLeave(from); break;
            case 'mic-status': handleMicStatus(from, data); break;
        }
    } catch (error) {
        console.error(`Ошибка обработки "${signal.type}":`, error);
    }
}

async function handleJoin(peerUsername) {
    console.log(`👋 ${peerUsername} вошёл`);
    
    const wasAlreadyIn = activeParticipants.has(peerUsername);
    activeParticipants.add(peerUsername);
    updateParticipants();
    
    if (!wasAlreadyIn) {
        sendSignal('join', { username: currentUser }).catch(() => {});
        sendSignal('mic-status', { username: currentUser, enabled: micEnabled }).catch(() => {});
    }
    
    if (peerConnections[peerUsername] && 
        peerConnections[peerUsername].connectionState !== 'closed') {
        console.log(`Соединение с ${peerUsername} уже существует`);
        return;
    }
    
    const shouldInitiate = currentUser < peerUsername;
    
    if (!shouldInitiate) {
        console.log(`⏸️ Ждём offer от ${peerUsername}`);
        return;
    }
    
    const pc = createPeerConnection(peerUsername);
    makingOffer[peerUsername] = true;
    
    try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await sendSignal('offer', { offer: pc.localDescription, to: peerUsername });
        updateParticipants();
        callRoomStatus.textContent = `🔗 Подключение к ${peerUsername}...`;
    } finally {
        makingOffer[peerUsername] = false;
    }
}

function handleMicStatus(peerUsername, data) {
    console.log(`🎤 ${peerUsername} микрофон: ${data.enabled ? 'включён' : 'выключен'}`);
    peerMicStatus[peerUsername] = data.enabled;
    updateParticipants();
}

async function handleOffer(from, data) {
    console.log(`📥 Offer от ${from}`);
    
    const pc = createPeerConnection(from);
    
    const offerCollision = makingOffer[from] || pc.signalingState !== 'stable';
    const isPolite = currentUser > from;
    
    if (offerCollision && !isPolite) {
        console.log(`⏭️ Игнорируем offer (мы инициатор)`);
        return;
    }
    
    if (offerCollision && isPolite) {
        console.log(`🔄 Откатываем локальное состояние (collision)`);
        try {
            await pc.setLocalDescription({ type: 'rollback' });
        } catch (e) {
            console.warn('Rollback не удался:', e);
        }
    }
    
    try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        await flushPendingCandidates(from);
        
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await sendSignal('answer', { answer: pc.localDescription, to: from });
        updateParticipants();
    } catch (e) {
        console.error('Ошибка в handleOffer:', e);
    }
}

async function handleAnswer(from, data) {
    const pc = peerConnections[from];
    if (!pc) {
        console.warn(`Нет pc для ${from}`);
        return;
    }
    
    if (pc.signalingState !== 'have-local-offer') {
        console.warn(`Игнорируем answer: signalingState=${pc.signalingState}`);
        return;
    }
    
    try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        await flushPendingCandidates(from);
    } catch (e) {
        console.error('Ошибка в handleAnswer:', e);
    }
}

async function handleCandidate(from, data) {
    const pc = peerConnections[from];
    if (!pc) {
        if (!pendingCandidates[from]) pendingCandidates[from] = [];
        pendingCandidates[from].push(data.candidate);
        return;
    }
    
    if (!pc.remoteDescription || !pc.remoteDescription.type) {
        if (!pendingCandidates[from]) pendingCandidates[from] = [];
        pendingCandidates[from].push(data.candidate);
        console.log(`⏸️ Буферизован ICE от ${from} (${pendingCandidates[from].length})`);
        return;
    }
    
    try {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        console.log(`✅ ICE от ${from} добавлен`);
    } catch (error) {
        console.error('Ошибка ICE:', error);
    }
}

async function flushPendingCandidates(from) {
    const pc = peerConnections[from];
    if (!pc || !pendingCandidates[from]) return;
    
    console.log(`🔄 Применяем ${pendingCandidates[from].length} отложенных ICE от ${from}`);
    
    for (const candidate of pendingCandidates[from]) {
        try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
            console.warn('Ошибка применения ICE:', e);
        }
    }
    pendingCandidates[from] = [];
}

function handleLeave(peerUsername) {
    console.log(`👋 ${peerUsername} вышел`);
    
    activeParticipants.delete(peerUsername);
    delete peerMicStatus[peerUsername];
    
    if (peerConnections[peerUsername]) {
        try { peerConnections[peerUsername].close(); } catch (e) {}
        delete peerConnections[peerUsername];
    }
    delete pendingCandidates[peerUsername];
    delete makingOffer[peerUsername];
    
    stopSpeakingDetection(peerUsername);
    
    const audioEl = document.getElementById(`audio-${peerUsername}`);
    if (audioEl) audioEl.remove();
    
    if (screenShareVideo && screenShareVideo.dataset.fromUser === peerUsername) {
        screenShareContainer.classList.remove('active');
        screenShareVideo.srcObject = null;
        screenShareVideo.dataset.fromUser = '';
        screenShareInfo.textContent = '';
    }
    
    // Если кто-то вышел — сбрасываем флаг, polling снова быстрый
    if (Object.keys(peerConnections).length === 0) {
        isCallConnected = false;
    }
    
    updateParticipants();
    
    if (Object.keys(peerConnections).length === 0 && activeParticipants.size === 0) {
        callRoomStatus.textContent = 'Ожидание собеседника...';
        if (callWaiting) callWaiting.style.display = 'flex';
    }
}

function updateParticipants() {
    if (!participantsList) return;
    
    const othersInRoom = new Set([
        ...activeParticipants,
        ...Object.keys(peerConnections)
    ]);
    
    const allParticipants = [currentUser, ...othersInRoom];
    
    participantsList.innerHTML = allParticipants.map(p => {
        const isMe = p === currentUser;
        const initial = p.charAt(0).toUpperCase();
        
        // Реальный статус микрофона
        const micStatus = isMe 
            ? (micEnabled ? '🎤' : '🔇')
            : (peerMicStatus[p] === false ? '🔇' : '🎤');
        
        return `
            <div class="participant-item ${isMe ? 'is-me' : ''}" data-username="${p}">
                <div class="participant-avatar">${initial}</div>
                <div class="participant-name" title="${p}">${p}${isMe ? ' (вы)' : ''}</div>
                <div class="participant-speaking"></div>
                <div class="participant-mic ${micStatus === '🔇' ? 'muted' : ''}">${micStatus}</div>
            </div>
        `;
    }).join('');
    
    const waiting = document.getElementById('callWaiting');
    if (waiting) {
        const hasAnyone = othersInRoom.size > 0;
        const hasActiveVideo = screenShareContainer?.classList.contains('active') 
            && screenShareVideo?.srcObject;
        
        if (hasAnyone || hasActiveVideo || isSharingScreen || isCameraOn) {
            waiting.style.display = 'none';
        } else {
            waiting.style.display = 'flex';
        }
    }
}

// ============ 📚 ОБУЧЕНИЕ ============

async function loadLessons() {
    try {
        const response = await fetch('/api/lessons');
        if (response.ok) {
            lessons = await response.json();
            renderLessonCategoryFilter();
            renderLessons();
            
            if (createLessonBtn) {
                createLessonBtn.style.display = currentRole === 'admin' ? 'inline-block' : 'none';
            }
        }
    } catch (error) {
        console.error('Ошибка загрузки статей:', error);
    }
}

function renderLessonCategoryFilter() {
    if (!lessonCategoryFilter) return;
    const categories = [...new Set(lessons.map(l => l.category || 'Другое'))];
    lessonCategoryFilter.innerHTML = '<option value="">📚 Все категории</option>' +
        categories.map(c => `<option value="${c}">${c}</option>`).join('');
}

function renderLessons() {
    if (!lessonsList) return;
    
    const searchText = (lessonSearch?.value || '').toLowerCase();
    const filterCat = lessonCategoryFilter?.value || '';
    
    let filtered = lessons;
    if (searchText) {
        filtered = filtered.filter(l => 
            (l.title || '').toLowerCase().includes(searchText) ||
            (l.content || '').toLowerCase().includes(searchText)
        );
    }
    if (filterCat) {
        filtered = filtered.filter(l => (l.category || 'Другое') === filterCat);
    }
    
    if (filtered.length === 0) {
        lessonsList.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #718096;">
                <p>📭 Пока нет материалов</p>
                ${currentRole === 'admin' ? '<p style="font-size: 14px;">Нажмите "Создать статью" чтобы добавить первую тему</p>' : ''}
            </div>
        `;
        return;
    }
    
    let html = '';
    filtered.forEach(lesson => {
        const dateStr = lesson.createdAt ? new Date(lesson.createdAt).toLocaleDateString() : '';
        html += `
            <div class="test-card" style="cursor: pointer;" onclick="openLesson('${lesson.id}')">
                <div class="test-card-header">
                    <div style="flex: 1;">
                        <h3>📖 ${lesson.title}</h3>
                        <div class="meta">
                            <span style="background: #ebf4ff; color: #2b6cb0; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 600;">
                                ${lesson.category || 'Другое'}
                            </span>
                            ${lesson.createdBy ? ` • Автор: ${lesson.createdBy}` : ''}
                            ${dateStr ? ` • ${dateStr}` : ''}
                        </div>
                    </div>
                    ${currentRole === 'admin' ? `
                        <div class="actions" onclick="event.stopPropagation();">
                            <button class="btn-secondary btn-edit-lesson" data-id="${lesson.id}" style="padding: 6px 12px;">✏️</button>
                            <button class="btn-small btn-danger btn-delete-lesson" data-id="${lesson.id}">🗑️</button>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    });
    
    lessonsList.innerHTML = html;
    
    lessonsList.querySelectorAll('.btn-edit-lesson').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            editLesson(this.dataset.id);
        });
    });
    
    lessonsList.querySelectorAll('.btn-delete-lesson').forEach(btn => {
        btn.addEventListener('click', async function(e) {
            e.stopPropagation();
            if (!confirm('Удалить статью?')) return;
            try {
                const response = await fetch(`/api/lessons/${this.dataset.id}`, { method: 'DELETE' });
                if (response.ok) {
                    alert('Статья удалена!');
                    loadLessons();
                }
            } catch (error) {
                alert('Ошибка удаления');
            }
        });
    });
}

async function openLesson(id) {
    try {
        const response = await fetch(`/api/lessons/${id}`);
        if (response.ok) {
            const lesson = await response.json();
            showLesson(lesson);
        }
    } catch (error) {
        alert('Ошибка загрузки статьи');
    }
}

function formatLessonContent(content) {
    if (!content) return '';
    
    let html = content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    
    html = html.replace(/^### (.+)$/gm, '<h3 style="color: #2d3748; margin: 25px 0 12px; font-size: 1.3em;">$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2 style="color: #2d3748; margin: 30px 0 15px; font-size: 1.5em;">$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1 style="color: #2d3748; margin: 35px 0 20px; font-size: 1.8em;">$1</h1>');
    
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong style="color: #1a202c;">$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    
    html = html.replace(/\n\n/g, '</p><p style="margin: 15px 0;">');
    html = html.replace(/\n/g, '<br>');
    
    return `<p style="margin: 15px 0;">${html}</p>`;
}

function showLesson(lesson) {
    lessonsListView.style.display = 'none';
    lessonView.style.display = 'block';
    lessonEditor.style.display = 'none';
    currentLessonId = lesson.id;
    
    const formattedContent = formatLessonContent(lesson.content || '');
    
    let formulasHtml = '';
    if (lesson.formulas && lesson.formulas.length > 0) {
        formulasHtml = `
            <div style="background: linear-gradient(135deg, #fefcbf 0%, #faf089 100%); border-left: 5px solid #d69e2e; padding: 25px; border-radius: 15px; margin: 30px 0;">
                <h3 style="color: #744210; margin: 0 0 18px; font-size: 1.3em;">🧮 Формулы</h3>
                ${lesson.formulas.map(f => `
                    <div style="font-family: 'Courier New', monospace; font-size: 18px; padding: 12px 18px; background: white; border-radius: 8px; margin-bottom: 10px; color: #744210; font-weight: 600; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
                        ${f}
                    </div>
                `).join('')}
            </div>
        `;
    }
    
    let examplesHtml = '';
    if (lesson.examples && lesson.examples.length > 0) {
        examplesHtml = `
            <div style="background: linear-gradient(135deg, #e6fffa 0%, #b2f5ea 100%); border-left: 5px solid #38b2ac; padding: 25px; border-radius: 15px; margin: 30px 0;">
                <h3 style="color: #234e52; margin: 0 0 18px; font-size: 1.3em;">💡 Примеры решения задач</h3>
                ${lesson.examples.map((ex, i) => `
                    <div style="padding: 15px; background: white; border-radius: 10px; margin-bottom: 10px; color: #234e52; line-height: 1.6; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
                        <strong style="color: #2c7a7b;">Пример ${i + 1}.</strong> ${ex}
                    </div>
                `).join('')}
            </div>
        `;
    }
    
    lessonContent.innerHTML = `
        <div style="background: white; padding: 40px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.08);">
            <div style="border-bottom: 3px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 30px;">
                <h1 style="color: #2d3748; margin: 0 0 15px; font-size: 2em;">📖 ${lesson.title}</h1>
                <div style="color: #718096; font-size: 14px;">
                    <span style="background: #ebf4ff; color: #2b6cb0; padding: 4px 14px; border-radius: 14px; font-size: 13px; font-weight: 600;">
                        ${lesson.category || 'Другое'}
                    </span>
                    ${lesson.createdBy ? ` • Автор: ${lesson.createdBy}` : ''}
                </div>
            </div>
            
            <div style="line-height: 1.85; color: #2d3748; font-size: 16px;">
                ${formattedContent}
            </div>
            
            ${formulasHtml}
            ${examplesHtml}
            
            <div style="margin-top: 40px; padding-top: 25px; border-top: 2px solid #e2e8f0; text-align: center;">
                <button onclick="goToTestsByCategory('${lesson.category || 'Другое'}')" class="btn-primary" style="background: linear-gradient(135deg, #48bb78 0%, #38a169 100%); font-size: 16px; padding: 14px 30px;">
                    🎯 Пройти тесты по теме "${lesson.category || 'Другое'}"
                </button>
            </div>
        </div>
    `;
    
    window.scrollTo(0, 0);
}

function goToTestsByCategory(category) {
    switchTab('tests');
    setTimeout(() => {
        if (categoryFilter) {
            categoryFilter.value = category;
            renderTests();
        }
    }, 100);
}

function editLesson(id) {
    const lesson = lessons.find(l => l.id === id);
    if (!lesson) return;
    
    lessonsListView.style.display = 'none';
    lessonView.style.display = 'none';
    lessonEditor.style.display = 'block';
    
    editorTitle.textContent = `✏️ Редактирование: ${lesson.title}`;
    document.getElementById('lessonId').value = lesson.id;
    document.getElementById('lessonTitle').value = lesson.title || '';
    document.getElementById('lessonCategory').value = lesson.category || 'Другое';
    document.getElementById('lessonContentInput').value = lesson.content || '';
    document.getElementById('lessonFormulas').value = (lesson.formulas || []).join('\n');
    document.getElementById('lessonExamples').value = (lesson.examples || []).join('\n');
    
    window.scrollTo(0, 0);
}

function showLessonEditor() {
    lessonsListView.style.display = 'none';
    lessonView.style.display = 'none';
    lessonEditor.style.display = 'block';
    
    editorTitle.textContent = '📝 Создать статью';
    lessonForm.reset();
    document.getElementById('lessonId').value = '';
    
    window.scrollTo(0, 0);
}

function backToLessonsList() {
    lessonsListView.style.display = 'block';
    lessonView.style.display = 'none';
    lessonEditor.style.display = 'none';
    loadLessons();
}

// Обработчики обучения
createLessonBtn?.addEventListener('click', showLessonEditor);
backToLessonsBtn?.addEventListener('click', backToLessonsList);
backFromEditorBtn?.addEventListener('click', backToLessonsList);
document.getElementById('cancelLessonBtn')?.addEventListener('click', backToLessonsList);

lessonSearch?.addEventListener('input', renderLessons);
lessonCategoryFilter?.addEventListener('change', renderLessons);

lessonForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const id = document.getElementById('lessonId').value;
    const title = document.getElementById('lessonTitle').value.trim();
    const category = document.getElementById('lessonCategory').value;
    const content = document.getElementById('lessonContentInput').value.trim();
    const formulas = document.getElementById('lessonFormulas').value
        .split('\n').map(f => f.trim()).filter(f => f);
    const examples = document.getElementById('lessonExamples').value
        .split('\n').map(ex => ex.trim()).filter(ex => ex);
    
    if (!title || !content) {
        alert('Заполните заголовок и содержание');
        return;
    }
    
    try {
        const url = id ? `/api/lessons/${id}` : '/api/lessons';
        const method = id ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, category, content, formulas, examples })
        });
        
        if (response.ok) {
            alert(id ? '✅ Статья обновлена!' : '✅ Статья создана!');
            backToLessonsList();
        } else {
            const data = await response.json();
            alert(data.error || 'Ошибка сохранения');
        }
    } catch (error) {
        console.error('Ошибка:', error);
        alert('Ошибка сервера');
    }
});

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

if (categoryFilter) categoryFilter.addEventListener('change', renderTests);

document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && authPage.style.display !== 'none') login();
});

window.addEventListener('beforeunload', () => {
    if (currentRoom) leaveRoom();
});

// ============ ЗАПУСК ============
createSquares();
checkAuth();