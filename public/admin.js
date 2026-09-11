let adminUser = null;
let tests = [];
let questionCounter = 0;
let isEditFormOpen = false;

const adminPanel = document.getElementById('adminPanel');
const adminUserEl = document.getElementById('adminUser');
const logoutBtn = document.getElementById('logoutBtn');
const testsList = document.getElementById('testsList');
const createForm = document.getElementById('createTestForm');
const addQuestionBtn = document.getElementById('addQuestionBtn');
const questionsList = document.getElementById('questionsList');
const statsContent = document.getElementById('statsContent');

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
                    ${test.updatedAt ? ` • Обновлен: ${new Date(test.updatedAt).toLocaleDateString()}` : ''}
                </small>
            </div>
            <div class="actions">
                <button class="btn-secondary btn-edit" data-test-id="${test.id}">✏️ Редактировать</button>
                <button class="btn-small btn-delete" data-test-id="${test.id}">🗑️ Удалить</button>
            </div>
        </div>
    `).join('');

    testsList.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', function() {
            editTest(this.dataset.testId);
        });
    });

    testsList.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', function() {
            deleteTest(this.dataset.testId);
        });
    });
}

async function deleteTest(testId) {
    if (!confirm('Удалить этот тест?')) return;
    
    try {
        const response = await fetch(`/api/tests/${testId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            loadTests();
            loadStats();
        }
    } catch (error) {
        alert('Ошибка удаления');
    }
}

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
    
    lastEditor.querySelector('.remove-question').addEventListener('click', function() {
        this.parentElement.remove();
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

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        switchTab(tab);
    });
});

function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
    
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById(`tab-${tab}`).classList.add('active');
    
    if (tab === 'stats') loadStats();
}

logoutBtn.addEventListener('click', async () => {
    try {
        await fetch('/api/logout', { method: 'POST' });
        window.location.href = '/';
    } catch (error) {
        alert('Ошибка выхода');
    }
});

checkAdminAccess();