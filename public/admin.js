let adminUser = null;
let tests = [];

const adminPanel = document.getElementById('adminPanel');
const adminUserEl = document.getElementById('adminUser');
const logoutBtn = document.getElementById('logoutBtn');
const testsList = document.getElementById('testsList');
const createForm = document.getElementById('createTestForm');
const addQuestionBtn = document.getElementById('addQuestionBtn');
const questionsList = document.getElementById('questionsList');
const statsContent = document.getElementById('statsContent');
let questionCounter = 0;

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
        // Если не админ, перенаправляем на главную
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
        <div class="test-item-admin">
            <div class="info">
                <h4>${test.title}</h4>
                <p>${test.description || 'Нет описания'} • ${test.questionCount} вопросов</p>
                <small style="color: #a0aec0;">Создан: ${new Date(test.createdAt).toLocaleDateString()}</small>
            </div>
            <div class="actions">
                <button class="btn-small" onclick="deleteTest(${test.id})">🗑️ Удалить</button>
            </div>
        </div>
    `).join('');
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
        
        if (qText && options.length === 4 && options.every(o => o.trim())) {
            questions.push({ question: qText, options, correct });
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
            <button type="button" class="remove-question" onclick="this.parentElement.remove()">✕ Удалить вопрос</button>
        </div>
    `;
    questionsList.insertAdjacentHTML('beforeend', html);
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
                <div class="number">${stats.totalUsers}</div>
                <div class="label">Пользователей</div>
            </div>
            <div class="stat-card">
                <div class="number">${stats.totalTests}</div>
                <div class="label">Тестов</div>
            </div>
            <div class="stat-card">
                <div class="number">${stats.totalResults}</div>
                <div class="label">Пройдено тестов</div>
            </div>
        </div>
        ${stats.totalUsers > 0 ? `
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