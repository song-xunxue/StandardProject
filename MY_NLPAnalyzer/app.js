/**
 * 智能NLP文献解析助手 - 前端交互逻辑
 *
 * 作者: 李文煜
 * 日期: 2026-04-15
 *
 * 2026-04-15
 * 变更说明：
 *   1. 从 index.html 提取内联 JS 为独立文件
 *   2. 新增认证、知识库管理、模型配置、参数管理模块
 *   3. 支持三栏布局交互（折叠/展开/切换）
 *   4. Phase 2.2 对接真实 JWT 认证 API
 */

// ========== 配置 ==========
const API_BASE_URL = 'http://127.0.0.1:5001/api';
const MOCK_AUTH = false; // Phase 2.2: 使用真实 JWT 认证

// ========== 提供商与模型配置 ==========
const PROVIDER_CONFIG = {
    deepseek: {
        name: 'DeepSeek',
        models: ['deepseek-chat', 'deepseek-reasoner'],
        needKey: true,
        needBotId: false,
        defaultBase: 'https://api.deepseek.com/v1'
    },
    openai: {
        name: 'OpenAI',
        models: ['gpt-4o-mini', 'gpt-4o'],
        needKey: true,
        needBotId: false,
        defaultBase: 'https://api.openai.com/v1'
    },
    ollama: {
        name: 'Ollama',
        models: ['qwen2.5', 'llama3', 'gemma2'],
        needKey: false,
        needBotId: false,
        defaultBase: 'http://localhost:11434'
    },
    coze: {
        name: 'Coze 智能体',
        models: [],
        needKey: true,
        needBotId: true,
        defaultBase: ''
    }
};

// ========== 默认参数 ==========
const DEFAULT_PARAMS = {
    'temperature': 0.7,
    'top-p': 0.95,
    'top-k': 40,
    'max-tokens': 2048,
    'chunk-size': 500,
    'chunk-overlap': 50,
    'keyword-count': 5,
    'truncate-length': 1500
};

// ========== 应用状态 ==========
let currentMode = 'text';          // 'text' | 'pdf'
let currentKB = 'quick';           // 'quick' | kb_id
let knowledgeBases = [];           // 知识库列表
let messages = [];                 // 消息历史
let currentUser = null;            // 当前用户
let activeProvider = '';            // 当前激活的提供商（用于跟踪切换）

// ========== 初始化 ==========
document.addEventListener('DOMContentLoaded', () => {
    // 检查登录状态
    if (!checkAuth()) return;

    // 初始化提供商选择器（先加载已保存的配置）
    loadProviderConfigs();
    activeProvider = document.getElementById('provider-select').value;
    switchProvider();

    // 初始化文件上传交互
    initFileUpload();

    // 设置当前用户信息
    updateUserInfo();

    // 更新底部状态栏
    updateStatusBar();
});

// ========== 认证模块 ==========

function checkAuth() {
    if (MOCK_AUTH) {
        const mockUser = localStorage.getItem('mock_user');
        if (!mockUser) {
            window.location.href = '/login';
            return false;
        }
        currentUser = JSON.parse(mockUser);
        return true;
    }
    // Phase 2.2: 检查 JWT Token
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/login';
        return false;
    }
    const userStr = localStorage.getItem('user');
    if (userStr) {
        currentUser = JSON.parse(userStr);
    }
    return true;
}

function updateUserInfo() {
    if (currentUser) {
        document.getElementById('user-name').textContent = currentUser.nickname || currentUser.email;
    }
}

function handleLogout() {
    localStorage.removeItem('mock_user');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
}

// 带认证的 fetch 封装
function authFetch(url, options = {}) {
    const opts = { ...options };
    opts.headers = opts.headers || {};
    if (!MOCK_AUTH) {
        const token = localStorage.getItem('token');
        if (token) {
            opts.headers['Authorization'] = `Bearer ${token}`;
        }
    }
    return fetch(url, opts).then(response => {
        if (response.status === 401) {
            handleLogout();
            throw new Error('登录已过期，请重新登录');
        }
        return response;
    });
}

// ========== 知识库管理 ==========

function createKnowledgeBase() {
    const name = prompt('请输入知识库名称：');
    if (!name || !name.trim()) return;

    if (MOCK_AUTH) {
        // Phase 2.1: 前端 mock
        const kb = {
            id: 'kb_' + Date.now(),
            name: name.trim(),
            docs: [],
            createdAt: new Date().toISOString()
        };
        knowledgeBases.push(kb);
        renderKBList();
        showStatusMessage('知识库创建成功', 'success');
    } else {
        // Phase 2.2: 调用真实 API
        authFetch(`${API_BASE_URL}/kb`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name.trim() })
        })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                knowledgeBases.push(data.data);
                renderKBList();
                showStatusMessage('知识库创建成功', 'success');
            } else {
                showStatusMessage(data.error || '创建失败', 'error');
            }
        })
        .catch(() => showStatusMessage('网络错误', 'error'));
    }
}

function deleteKnowledgeBase(kbId, event) {
    event.stopPropagation();
    const kb = knowledgeBases.find(k => k.id === kbId);
    if (!confirm(`确定删除知识库「${kb ? kb.name : kbId}」吗？`)) return;

    if (MOCK_AUTH) {
        knowledgeBases = knowledgeBases.filter(k => k.id !== kbId);
        if (currentKB === kbId) switchKB('quick');
        renderKBList();
    } else {
        authFetch(`${API_BASE_URL}/kb/${kbId}`, { method: 'DELETE' })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                knowledgeBases = knowledgeBases.filter(k => k.id !== kbId);
                if (currentKB === kbId) switchKB('quick');
                renderKBList();
            } else {
                showStatusMessage(data.error || '删除失败', 'error');
            }
        })
        .catch(() => showStatusMessage('网络错误', 'error'));
    }
}

function switchKB(kbId) {
    currentKB = kbId;

    // 更新 UI 高亮
    document.querySelectorAll('.kb-item').forEach(el => el.classList.remove('active'));
    if (kbId === 'quick') {
        document.getElementById('kb-quick').classList.add('active');
        document.getElementById('current-kb-label').textContent = '快速分析';
    } else {
        const el = document.querySelector(`[data-kb-id="${kbId}"]`);
        if (el) el.classList.add('active');
        const kb = knowledgeBases.find(k => k.id === kbId);
        document.getElementById('current-kb-label').textContent = kb ? kb.name : kbId;
    }

    // 清空消息
    clearResult();
    updateStatusBar();
}

function renderKBList() {
    const list = document.getElementById('kb-list');
    if (knowledgeBases.length === 0) {
        list.innerHTML = '<p class="kb-empty">暂无知识库，点击 + 创建</p>';
        return;
    }

    list.innerHTML = knowledgeBases.map(kb => `
        <div class="kb-item ${currentKB === kb.id ? 'active' : ''}" data-kb-id="${kb.id}" onclick="switchKB('${kb.id}')">
            <span class="kb-icon">&#128218;</span>
            <span class="kb-name">${kb.name}</span>
            <button class="kb-delete-btn" onclick="deleteKnowledgeBase('${kb.id}', event)" title="删除">&#10005;</button>
        </div>
    `).join('');
}

// ========== 输入模式切换 ==========

function switchTab(type) {
    currentMode = type;
    document.getElementById('tab-text').classList.toggle('active', type === 'text');
    document.getElementById('tab-pdf').classList.toggle('active', type === 'pdf');
    document.getElementById('panel-text').classList.toggle('active', type === 'text');
    document.getElementById('panel-pdf').classList.toggle('active', type === 'pdf');
}

// ========== 分析功能 ==========

function analyze() {
    if (currentMode === 'text') {
        analyzeText();
    } else {
        analyzePDF();
    }
}

function showStatusMessage(msg, type) {
    const box = document.getElementById('message-box');
    box.textContent = msg;
    box.className = `status-message ${type}`;
}

function clearStatusMessage() {
    const box = document.getElementById('message-box');
    box.textContent = '';
    box.className = 'status-message';
}

function clearResult() {
    document.getElementById('welcome-state').style.display = 'flex';
    document.getElementById('message-list').style.display = 'none';
    document.getElementById('message-list').innerHTML = '';
    messages = [];
    clearStatusMessage();
}

// 添加用户消息气泡
function addUserMessage(text) {
    messages.push({ role: 'user', content: text });
    renderMessages();
}

// 添加 AI 消息气泡
function addBotMessage(content) {
    messages.push({ role: 'assistant', content: content });
    renderMessages();
}

// 渲染消息列表
function renderMessages() {
    document.getElementById('welcome-state').style.display = 'none';
    const list = document.getElementById('message-list');
    list.style.display = 'flex';

    list.innerHTML = messages.map(msg => {
        if (msg.role === 'user') {
            return `<div class="chat-msg user-msg"><div class="msg-content">${escapeHtml(msg.content)}</div></div>`;
        } else {
            return `<div class="chat-msg bot-msg"><div class="msg-content">${msg.content.replace(/\n/g, '<br>')}</div></div>`;
        }
    }).join('');

    // 滚动到底部
    document.getElementById('result-area').scrollTop = document.getElementById('result-area').scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 获取当前模型配置
function getModelConfig() {
    const provider = document.getElementById('provider-select').value;
    const apiKey = document.getElementById('api-key-input').value;
    const botId = document.getElementById('bot-id-input').value;
    const model = document.getElementById('model-select').value;
    const baseUrl = document.getElementById('base-url-input').value;

    const params = {};
    Object.keys(DEFAULT_PARAMS).forEach(key => {
        params[key] = parseFloat(document.getElementById(`slider-${key}`).value);
    });

    return { provider, apiKey, botId, model, baseUrl, params };
}

// 文本分析
async function analyzeText() {
    const text = document.getElementById('user-text').value.trim();
    if (!text) {
        showStatusMessage('请输入文本内容！', 'error');
        return;
    }

    const btn = document.getElementById('btn-analyze');
    btn.disabled = true;
    btn.innerHTML = '<span class="btn-icon">&#9203;</span> AI 分析中...';
    showStatusMessage('正在调用大模型，请稍候...', 'loading');

    addUserMessage(text);

    // 截断
    const config = getModelConfig();
    const truncatedText = text.substring(0, config.params['truncate-length'] || 1500);

    try {
        const response = await authFetch(`${API_BASE_URL}/analyze_text`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: truncatedText,
                params: config
            })
        });
        const data = await response.json();

        if (data.success) {
            showStatusMessage('分析完成！', 'success');
            addBotMessage(data.result);
        } else {
            showStatusMessage(data.error || '分析失败', 'error');
        }
    } catch (error) {
        showStatusMessage('请求失败，请检查后端服务是否启动', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span class="btn-icon">&#128640;</span> 开始分析';
    }
}

// PDF 分析
async function analyzePDF() {
    const fileInput = document.getElementById('pdf-file');
    const file = fileInput.files[0];

    if (!file) {
        showStatusMessage('请先选择一个 PDF 文件！', 'error');
        return;
    }

    const btn = document.getElementById('btn-analyze');
    btn.disabled = true;
    btn.innerHTML = '<span class="btn-icon">&#9203;</span> 解析 PDF 中...';
    showStatusMessage('正在提取 PDF 文本并调用大模型...', 'loading');

    addUserMessage(`[PDF 文件] ${file.name}`);

    const config = getModelConfig();
    const formData = new FormData();
    formData.append('file', file);
    // 将 params 作为 JSON 字符串传到 form data
    formData.append('params', JSON.stringify(config));

    try {
        const response = await authFetch(`${API_BASE_URL}/analyze_pdf`, {
            method: 'POST',
            body: formData
        });
        const data = await response.json();

        if (data.success) {
            showStatusMessage('PDF 提取与分析完成！', 'success');
            addBotMessage(data.result);
        } else {
            showStatusMessage(data.error || '解析失败', 'error');
        }
    } catch (error) {
        showStatusMessage('请求失败，请检查后端服务是否启动', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span class="btn-icon">&#128640;</span> 开始分析';
    }
}

// ========== 文件上传交互 ==========

function initFileUpload() {
    const dropZone = document.getElementById('drop-zone');

    dropZone.addEventListener('click', () => {
        document.getElementById('pdf-file').click();
    });

    document.getElementById('pdf-file').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            document.getElementById('file-name').textContent = file.name;
            document.getElementById('file-info').style.display = 'flex';
            document.getElementById('drop-zone').style.display = 'none';
        }
    });

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file && file.type === 'application/pdf') {
            document.getElementById('pdf-file').files = e.dataTransfer.files;
            document.getElementById('file-name').textContent = file.name;
            document.getElementById('file-info').style.display = 'flex';
            document.getElementById('drop-zone').style.display = 'none';
        } else {
            showStatusMessage('仅支持 PDF 文件', 'error');
        }
    });
}

function removeFile() {
    document.getElementById('pdf-file').value = '';
    document.getElementById('file-info').style.display = 'none';
    document.getElementById('drop-zone').style.display = 'flex';
}

// ========== 模型配置模块 ==========

// 提供商配置缓存：{ provider: { apiKey, botId, model, baseUrl } }
let providerConfigs = {};

// 从 localStorage 加载已保存的提供商配置
function loadProviderConfigs() {
    try {
        const saved = localStorage.getItem('provider_configs');
        if (saved) providerConfigs = JSON.parse(saved);
    } catch (e) { providerConfigs = {}; }
}

// 保存提供商配置到 localStorage
function persistProviderConfigs() {
    localStorage.setItem('provider_configs', JSON.stringify(providerConfigs));
}

// 保存当前提供商的配置到缓存
function cacheCurrentProvider() {
    const provider = document.getElementById('provider-select').value;
    const apiKey = document.getElementById('api-key-input').value;
    const botId = document.getElementById('bot-id-input').value;
    const model = document.getElementById('model-select').value;
    const baseUrl = document.getElementById('base-url-input').value;

    // 始终更新缓存（包括空值），确保清空操作也能被记住
    providerConfigs[provider] = { apiKey, botId, model, baseUrl };
    persistProviderConfigs();
}

function switchProvider() {
    const newProvider = document.getElementById('provider-select').value;

    // 1. 先把 activeProvider（旧的）的输入值缓存起来
    if (activeProvider && activeProvider !== newProvider) {
        const oldApiKey = document.getElementById('api-key-input').value;
        const oldBotId = document.getElementById('bot-id-input').value;
        const oldBaseUrl = document.getElementById('base-url-input').value;
        const oldModel = document.getElementById('model-select').value;
        providerConfigs[activeProvider] = { apiKey: oldApiKey, botId: oldBotId, model: oldModel, baseUrl: oldBaseUrl };
        persistProviderConfigs();
    }

    const config = PROVIDER_CONFIG[newProvider];

    // 2. 清空所有输入框
    document.getElementById('api-key-input').value = '';
    document.getElementById('bot-id-input').value = '';
    document.getElementById('base-url-input').value = '';

    // 3. 切换 UI 显示
    document.getElementById('row-api-key').style.display = config.needKey ? 'flex' : 'none';
    document.getElementById('row-bot-id').style.display = config.needBotId ? 'flex' : 'none';

    const modelSelect = document.getElementById('model-select');
    modelSelect.innerHTML = '';
    if (config.models.length > 0) {
        config.models.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m;
            opt.textContent = m;
            modelSelect.appendChild(opt);
        });
        document.getElementById('row-model').style.display = 'flex';
    } else {
        document.getElementById('row-model').style.display = config.needBotId ? 'none' : 'flex';
    }

    document.getElementById('row-base-url').style.display =
        (!config.needBotId && config.defaultBase) ? 'flex' : 'none';

    // 4. 从缓存加载新提供商的配置
    const saved = providerConfigs[newProvider] || {};
    document.getElementById('api-key-input').value = saved.apiKey || '';
    document.getElementById('bot-id-input').value = saved.botId || '';
    document.getElementById('base-url-input').value = saved.baseUrl || '';
    if (saved.model && modelSelect.querySelector(`option[value="${saved.model}"]`)) {
        modelSelect.value = saved.model;
    }

    // 5. 更新 activeProvider
    activeProvider = newProvider;
    updateStatusBar();
}

// 保存配置按钮
function saveProviderConfig() {
    cacheCurrentProvider();
    showStatusMessage('模型配置已保存', 'success');
}

function toggleAPIKeyVisibility() {
    const input = document.getElementById('api-key-input');
    input.type = input.type === 'password' ? 'text' : 'password';
}

// 设置面板展开/折叠
function toggleSettings() {
    const panel = document.getElementById('settings-panel');
    const arrow = document.getElementById('settings-arrow');
    const isCollapsed = panel.classList.toggle('collapsed');
    arrow.textContent = isCollapsed ? '\u25B2' : '\u25BC';
}

// ========== 参数管理模块 ==========

function updateSlider(paramName, value) {
    document.getElementById(`val-${paramName}`).textContent = value;
}

function resetParams() {
    Object.keys(DEFAULT_PARAMS).forEach(key => {
        const slider = document.getElementById(`slider-${key}`);
        if (slider) {
            slider.value = DEFAULT_PARAMS[key];
            document.getElementById(`val-${key}`).textContent = DEFAULT_PARAMS[key];
        }
    });
    showStatusMessage('参数已重置为默认值', 'success');
}

// ========== 面板折叠/展开 ==========

function togglePanel(side) {
    if (side === 'left') {
        const panel = document.getElementById('left-panel');
        const expandBtn = document.getElementById('left-expand');
        const isCollapsed = panel.classList.toggle('collapsed');
        expandBtn.style.display = isCollapsed ? 'flex' : 'none';
    } else if (side === 'right') {
        const panel = document.getElementById('right-panel');
        const expandBtn = document.getElementById('right-expand');
        const isCollapsed = panel.classList.toggle('collapsed');
        expandBtn.style.display = isCollapsed ? 'flex' : 'none';
    }
}

function toggleSection(sectionId) {
    const body = document.getElementById(`section-${sectionId}`);
    const arrow = document.getElementById(`arrow-${sectionId}`);
    const isCollapsed = body.classList.toggle('collapsed');
    arrow.textContent = isCollapsed ? '\u25B6' : '\u25BC';
}

// ========== 底部状态栏 ==========

function updateStatusBar() {
    const config = getModelConfig();
    const providerInfo = PROVIDER_CONFIG[config.provider];

    const kbName = currentKB === 'quick' ? '快速分析' :
        (knowledgeBases.find(k => k.id === currentKB)?.name || currentKB);

    document.getElementById('status-kb').textContent = `知识库: ${kbName}`;
    document.getElementById('status-model').textContent = `模型: ${config.model || 'Coze 智能体'}`;
    document.getElementById('status-provider').textContent = `提供商: ${providerInfo.name}`;
}
