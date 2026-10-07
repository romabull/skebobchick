let adminUser = null;
let tests = [];
let questionCounter = 0;
let isEditFormOpen = false;

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

// Демонстрация экрана
let screenStream = null;
let screenSender = null;
let isSharingScreen = false;

// Индикатор говорящего
let audioAnalyzers = {};

const adminPanel = document.getElementById('adminPanel');
const adminUserEl = document.getElementById('adminUser');
const logoutBtn = document.getElementById('logoutBtn');
const testsList = document.getElementById('testsList');
const createForm = document.getElementById('createTestForm');
const addQuestionBtn = document.getElementById('addQuestionBtn');
const questionsList = document.getElementById('questionsList');
const statsContent = document.getElementById('statsContent');

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
const testMicBtn = document.getElementById('testMicBtn');
const participantsList = document.getElementById('participantsList');
const remoteAudios = document.getElementById('remoteAudios');
const callWaiting = document.getElementById('callWaiting');

// Демонстрация экрана DOM
const shareScreenBtn = document.getElementById('shareScreenBtn');
const screenShareContainer = document.getElementById('screenShareContainer');
const screenShareVideo = document.getElementById('screenShareVideo');
const screenShareInfo = document.getElementById('screenShareInfo');

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

// ============ ДОСТУП ============

async function checkAdminAccess() {
    try {
        const response = await fetch('/api/me');
        if (response.ok) {
            const data = await response.json();
            if (data.role === 'admin') {
                adminUser = data.username;
                adminUserEl.textContent = adminUser;
                adminPanel.style.display = 'block';
                loadTests();
                loadStats();
                return;
            }
        }
        window.location.href = '/';
    } catch (error) {
        window.location.href = '/';
    }
}

// ============ ТЕСТЫ ============

async function loadTests() {
    try {
        const response = await fetch('/api/tests');
        if (response.ok) {
            tests = await response.json();
            renderTests();
        }
    } catch (error) {
        console.error('Ошибка загрузки тестов:', error);
    }
}

function renderTests() {
    if (tests.length === 0) {
        testsList.innerHTML = '<p style="text-align: center; color: #718096;">Нет созданных тестов</p>';
        return;
    }
    
    testsList.innerHTML = tests.map(test => `
        <div class="test-item-admin" data-test-id="${test.id}">
            <div class="info">
                <h4>${test.title}</h4>
                <p>${test.description || 'Нет описания'}</p>
                <small style="color: #a0aec0;">
                    📚 ${test.category || 'Другое'} • 
                    ${test.questions?.length || 0} вопросов
                    ${test.timeLimit ? ` • ⏱️ ${test.timeLimit} мин` : ''}
                </small>
            </div>
            <div class="actions">
                <button class="btn-secondary btn-edit" data-test-id="${test.id}">✏️ Редактировать</button>
                <button class="btn-small btn-delete" data-test-id="${test.id}">🗑️ Удалить</button>
            </div>
        </div>
    `).join('');

    testsList.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', function() { editTest(this.dataset.testId); });
    });

    testsList.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', function() { deleteTest(this.dataset.testId); });
    });
}

async function deleteTest(testId) {
    if (!confirm('Удалить этот тест?')) return;
    try {
        const response = await fetch(`/api/tests/${testId}`, { method: 'DELETE' });
        if (response.ok) {
            loadTests();
            loadStats();
        }
    } catch (error) {
        alert('Ошибка удаления');
    }
}

// ============ РЕДАКТИРОВАНИЕ ============

async function editTest(testId) {
    if (isEditFormOpen) {
        alert('⚠️ Сначала закройте текущий редактор!');
        return;
    }
    try {
        const response = await fetch(`/api/admin/tests/${testId}/edit`);
        if (response.ok) {
            const test = await response.json();
            const testItem = document.querySelector(`.test-item-admin[data-test-id="${testId}"]`);
            if (testItem) {
                showEditForm(test, testItem);
                isEditFormOpen = true;
            }
        }
    } catch (error) {
        alert('Ошибка загрузки');
    }
}

function showEditForm(test, testItem) {
    const categories = ['Механика', 'Термодинамика', 'Электричество', 'Оптика', 'Квантовая физика', 'Астрономия', 'Другое'];
    const categoryOptions = categories.map(c => 
        `<option value="${c}" ${(test.category || 'Другое') === c ? 'selected' : ''}>${c}</option>`
    ).join('');
    
    const editHtml = `
        <div id="editFormContainer" style="margin: 15px 0; padding: 20px; background: #f7fafc; border-radius: 10px; border: 2px solid #667eea;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <h4 style="margin: 0; color: #2d3748;">✏️ Редактирование: ${test.title}</h4>
                <button id="closeEditFormBtn" style="background: #fc8181; color: white; border: none; padding: 5px 15px; border-radius: 6px; cursor: pointer; font-size: 16px;">✕</button>
            </div>
            <form id="editTestForm">
                <input type="hidden" id="editTestId" value="${test.id}">
                <div class="form-group">
                    <label>Название</label>
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
                    <label>⏱️ Время (мин)</label>
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
    
    testItem.insertAdjacentHTML('afterend', editHtml);
    
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
            loadStats();
        } else {
            alert('Ошибка обновления');
        }
    } catch (error) {
        alert('Ошибка сервера');
    }
}

// ============ СОЗДАНИЕ ТЕСТА ============

createForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const title = document.getElementById('testTitle').value;
    const description = document.getElementById('testDescription').value;
    const classNum = document.getElementById('testClass').value;
    const category = document.getElementById('testCategory').value;
    const timeLimit = document.getElementById('testTimeLimit').value;
    
    const questionElements = document.querySelectorAll('.question-editor');
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
            questionCounter = 0;
            loadTests();
            loadStats();
            switchTab('tests');
        }
    } catch (error) {
        alert('Ошибка сервера');
    }
});

addQuestionBtn.addEventListener('click', () => {
    questionCounter++;
    const html = `
        <div class="question-editor">
            <div class="question-number">Вопрос ${questionCounter}</div>
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
            <button type="button" class="remove-question">✕ Удалить</button>
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
    
    lastEditor.querySelector('.remove-question').addEventListener('click', function() {
        this.parentElement.remove();
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
        switchTab(btn.dataset.tab);
    });
});

function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
    
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById(`tab-${tab}`).classList.add('active');
    
    if (tab === 'stats') loadStats();
    if (tab === 'calls') loadRooms();
}

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

// ============ 📞 ЗВОНКИ ============

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
            </div>
        `;
        return;
    }
    
    let html = '';
    rooms.forEach(room => {
        const canDelete = room.createdBy === adminUser;
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
    const name = prompt('Название комнаты:', `Звонок ${adminUser}`);
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
        lastSignalTime = 0;
        peerConnections = {};
        pendingCandidates = {};
        makingOffer = {};
        processedSignals.clear();
        
        callsListView.style.display = 'none';
        callRoomView.style.display = 'block';
        document.body.classList.add('in-call');
        
        callRoomName.textContent = `📞 ${roomName}`;
        callRoomStatus.textContent = 'Ожидание собеседника...';
        
        toggleMicBtn.disabled = false;
        toggleMicBtn.textContent = '🎤';
        toggleMicBtn.classList.add('active');
        toggleMicBtn.classList.remove('muted');
        
        if (callWaiting) callWaiting.style.display = 'flex';
        
        updateParticipants();
        startSpeakingDetection(adminUser, localStream);
        await sendSignal('join', { username: adminUser });
        startSignalPolling();
        
        console.log('✅ Вошли в комнату:', roomName);
    } catch (error) {
        console.error('Ошибка входа:', error);
        alert('Не удалось войти в комнату: ' + error.message);
    }
}

function leaveRoom() {
    if (isSharingScreen) {
        stopScreenShare();
    }
    
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
    
    Object.keys(audioAnalyzers).forEach(username => stopSpeakingDetection(username));
    
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    if (currentRoom) {
        sendSignal('leave', { username: adminUser }).catch(() => {});
    }
    
    currentRoom = null;
    if (callRoomView) callRoomView.style.display = 'none';
    if (callsListView) callsListView.style.display = 'block';
    if (remoteAudios) remoteAudios.innerHTML = '';
    if (participantsList) participantsList.innerHTML = '';
    if (screenShareContainer) screenShareContainer.classList.remove('active');
    
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
        
        updateParticipants();
    }
});

testMicBtn?.addEventListener('click', () => {
    if (!localStream) {
        alert('Сначала войдите в комнату');
        return;
    }
    
    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(localStream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    let testCount = 0;
    
    const testInterval = setInterval(() => {
        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        
        if (avg > 20) {
            testMicBtn.style.transform = `scale(${1 + avg / 200})`;
            testMicBtn.textContent = '🔊';
        } else {
            testMicBtn.style.transform = 'scale(1)';
            testMicBtn.textContent = '🎧';
        }
        
        testCount++;
        if (testCount > 50) {
            clearInterval(testInterval);
            audioContext.close();
            testMicBtn.style.transform = 'scale(1)';
            testMicBtn.textContent = '🎧';
        }
    }, 100);
    
    alert('Говорите — иконка будет реагировать');
});

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
    
    if (Object.keys(peerConnections).length === 0) {
        if (callWaiting) callWaiting.style.display = 'flex';
    }
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
            if (screenShareContainer) {
                screenShareContainer.classList.add('active');
                
                const videoOnlyStream = new MediaStream([track]);
                screenShareVideo.srcObject = videoOnlyStream;
                screenShareInfo.textContent = `📺 ${peerUsername} показывает экран`;
                
                screenShareVideo.play()
                    .then(() => console.log(`🖥️ Видео от ${peerUsername} воспроизводится`))
                    .catch(err => console.warn('Autoplay видео:', err));
                
                if (callWaiting) callWaiting.style.display = 'none';
                
                track.onended = () => {
                    console.log(`⏹️ ${peerUsername} остановил трансляцию`);
                    screenShareContainer.classList.remove('active');
                    screenShareVideo.srcObject = null;
                    screenShareInfo.textContent = '';
                    updateParticipants();
                };
            }
        }
    };
    
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            sendSignal('candidate', { candidate: event.candidate, to: peerUsername });
        }
    };
    
    pc.onconnectionstatechange = () => {
        console.log(`Соединение с ${peerUsername}: ${pc.connectionState}`);
        if (pc.connectionState === 'connected') {
            callRoomStatus.textContent = `✅ Соединено с ${peerUsername}`;
            if (callWaiting) callWaiting.style.display = 'none';
        } else if (pc.connectionState === 'disconnected') {
            callRoomStatus.textContent = `⚠️ Соединение потеряно`;
        } else if (pc.connectionState === 'failed') {
            callRoomStatus.textContent = `❌ Соединение не удалось`;
            try { pc.restartIce(); } catch (e) {}
        }
    };
    
    return pc;
}

// ============ СИГНАЛИНГ ============

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
    
    signalPollingInterval = setInterval(async () => {
        if (!currentRoom || !isCallActive) return;
        
        try {
            const response = await fetch(`/api/calls/signal/${currentRoom.id}?lastTime=${lastSignalTime}`);
            if (response.ok) {
                const signals = await response.json();
                for (const signal of signals) {
                    const signalKey = signal.id || `${signal.from}_${signal.type}_${signal.createdAt}`;
                    if (processedSignals.has(signalKey)) continue;
                    processedSignals.add(signalKey);
                    
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
        }
    } catch (error) {
        console.error(`Ошибка обработки "${signal.type}":`, error);
    }
}

async function handleJoin(peerUsername) {
    console.log(`👋 ${peerUsername} вошёл`);
    
    if (peerConnections[peerUsername] && 
        peerConnections[peerUsername].connectionState !== 'closed') {
        console.log(`Соединение с ${peerUsername} уже существует`);
        return;
    }
    
    const shouldInitiate = adminUser < peerUsername;
    
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

async function handleOffer(from, data) {
    console.log(`📥 Offer от ${from}`);
    
    const pc = createPeerConnection(from);
    
    const offerCollision = makingOffer[from] || pc.signalingState !== 'stable';
    const isPolite = adminUser > from;
    
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
    if (peerConnections[peerUsername]) {
        try { peerConnections[peerUsername].close(); } catch (e) {}
        delete peerConnections[peerUsername];
    }
    delete pendingCandidates[peerUsername];
    delete makingOffer[peerUsername];
    
    stopSpeakingDetection(peerUsername);
    
    const audioEl = document.getElementById(`audio-${peerUsername}`);
    if (audioEl) audioEl.remove();
    
    if (screenShareContainer) {
        screenShareContainer.classList.remove('active');
        screenShareVideo.srcObject = null;
        screenShareInfo.textContent = '';
    }
    
    updateParticipants();
    
    if (Object.keys(peerConnections).length === 0) {
        callRoomStatus.textContent = 'Ожидание собеседника...';
        if (callWaiting) callWaiting.style.display = 'flex';
    }
}

function updateParticipants() {
    if (!participantsList) return;
    
    const allParticipants = [adminUser, ...Object.keys(peerConnections)];
    
    participantsList.innerHTML = allParticipants.map(p => {
        const isMe = p === adminUser;
        const initial = p.charAt(0).toUpperCase();
        const micStatus = isMe 
            ? (micEnabled ? '🎤' : '🔇')
            : '🎤';
        
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
        if (Object.keys(peerConnections).length > 0 || isSharingScreen) {
            waiting.style.display = 'none';
        } else {
            waiting.style.display = 'flex';
        }
    }
}

// ============ СОБЫТИЯ ============

logoutBtn.addEventListener('click', async () => {
    try {
        if (currentRoom) leaveRoom();
        await fetch('/api/logout', { method: 'POST' });
        window.location.href = '/';
    } catch (error) {
        alert('Ошибка выхода');
    }
});

window.addEventListener('beforeunload', () => {
    if (currentRoom) leaveRoom();
});

checkAdminAccess();