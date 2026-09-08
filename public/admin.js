let adminUser = null;
let tests = [];
let questionCounter = 0;
let isEditFormOpen = false; // Флаг, открыт ли редактор

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
                <p>${test.description || 'Нет описания'} • ${test.questions?.length || 0} вопросов</p>
                <small style="color: #a0aec0;">
                    Создан: ${test.createdAt ? new Date(test.createdAt).toLocaleDateString() : 'недавно'}
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
            const testId = this.dataset.testId;
            editTest(testId);
        });
    });

    testsList.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', function() {
            const testId = this.dataset.testId;
            deleteTest(testId);
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
        } else {
            alert('Ошибка удаления теста');
        }
    } catch (error) {
        alert('Ошибка удаления');
    }
}

// ============ РЕДАКТИРОВАНИЕ ============

async function editTest(testId) {
    // Проверяем, не открыт ли уже редактор
    if (isEditFormOpen) {
        alert('⚠️ Сначала закройте текущий редактор теста!');
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/tests/${testId}/edit`);
        if (response.ok) {
            const test = await response.json();
            
            const testItem = document.querySelector(`.test-item-admin[data-test-id="${testId}"]`);
            if (testItem) {
                // Проверяем, нет ли уже формы редактирования
                const existingForm = document.getElementById('editFormContainer');
                if (existingForm) {
                    existingForm.remove();
                    isEditFormOpen = false;
                }
                
                const editHtml = `
                    <div id="editFormContainer" style="margin: 15px 0; padding: 20px; background: #f7fafc; border-radius: 10px; border: 2px solid #667eea;">
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
                isEditFormOpen = true;
                
                // Заполняем вопросы
                const editQuestionsList = document.getElementById('editQuestionsList');
                if (test.questions && test.questions.length > 0) {
                    test.questions.forEach((q, index) => {
                        addEditQuestion(q, index + 1);
                    });
                }
                
                // Обработчики
                document.getElementById('addEditQuestionBtn')?.addEventListener('click', function() {
                    const count = editQuestionsList.querySelectorAll('.question-editor').length + 1;
                    addEditQuestion(null, count);
                });
                
                document.getElementById('editTestForm')?.addEventListener('submit', async function(e) {
                    e.preventDefault();
                    await saveEditedTest(test.id);
                });
                
                document.getElementById('cancelEditBtn')?.addEventListener('click', function() {
                    closeEditForm();
                });
                
                document.getElementById('closeEditFormBtn')?.addEventListener('click', function() {
                    closeEditForm();
                });
            }
        } else {
            alert('Ошибка загрузки теста для редактирования');
        }
    } catch (error) {
        console.error('Ошибка:', error);
        alert('Ошибка загрузки теста');
    }
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
        question: '',
        options: ['', '', '', ''],
        correct: 0,
        hint: ''
    };
    
    const html = `
        <div class="question-editor" style="background: white; border-radius: 10px; padding: 15px; margin-bottom: 15px; border: 1px solid #e2e8f0; position: relative;">
            <div class="question-number" style="position: absolute; top: -10px; left: 15px; background: #667eea; color: white; padding: 2px 12px; border-radius: 20px; font-size: 12px; font-weight: 600;">
                Вопрос ${number}
            </div>
            <div class="form-group" style="margin-top: 10px;">
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
    
    list.insertAdjacentHTML('beforeend', html);
}

async function saveEditedTest(testId) {
    const title = document.getElementById('editTestTitle').value.trim();
    const description = document.getElementById('editTestDescription').value.trim();
    const classNum = document.getElementById('editTestClass').value.trim();
    
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
            closeEditForm();
            loadTests();
            loadStats();
        } else {
            const data = await response.json();
            alert(data.error || 'Ошибка обновления теста');
        }
    } catch (error) {
        console.error('Ошибка:', error);
        alert('Ошибка сервера');
    }
}

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
            questionCounter = 0;
            loadTests();
            loadStats();
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
    questionCounter++;
    const html = `
        <div class="question-editor">
            <div class="question-number">Вопрос ${questionCounter}</div>
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
            <button type="button" class="remove-question">✕ Удалить вопрос</button>
        </div>
    `;
    questionsList.insertAdjacentHTML('beforeend', html);
    
    const lastEditor = questionsList.lastElementChild;
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