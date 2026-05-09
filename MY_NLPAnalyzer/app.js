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
 *
 * 2026-05-04
 * 变更说明：
 *   1. Phase 3: 知识库文档管理（上传、列表、chunks 可视化）
 *
 * 2026-05-09
 * 变更说明：
 *   1. Phase 4.3+4.4: 新增 RAG 聊天功能（SSE 流式、对话管理、引用来源）
 *   2. 中栏改造为聊天输入框 + 消息流
 *   3. 左栏新增对话列表
 *   4. 新增 Markdown 渲染、流式光标、引用卡片
 *
 * 2026-05-09
 * 变更说明：
 *   1. 修复 showStatusMessage 因 message-box 缺失导致上传文档无反应
 *   2. 新增文档上传进度遮罩层（4 阶段动画：上传→解析→切分→向量化）
 *   3. showStatusMessage 增加 null 防护
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
    glm: {
        name: '智谱 GLM',
        models: ['glm-4-flash', 'glm-4-plus', 'glm-4'],
        needKey: true,
        needBotId: false,
        defaultBase: 'https://open.bigmodel.cn/api/paas/v4'
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
let currentKB = null;              // 当前选中的知识库 ID，null 表示未选中
let knowledgeBases = [];           // 知识库列表
let messages = [];                 // 消息历史
let currentUser = null;            // 当前用户
let activeProvider = '';            // 当前激活的提供商（用于跟踪切换）

// Phase 4.4: 聊天状态
let currentConvId = null;          // 当前对话 ID
let conversations = [];            // 当前知识库的对话列表
let isStreaming = false;           // 是否正在流式接收
let pendingSources = [];           // 当前回答的引用来源
let currentStreamContent = '';     // 当前流式累积的内容

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

    // 从服务器加载已有知识库列表
    loadKBList();

    // Phase 4.4: 聊天输入框事件绑定
    const chatInput = document.getElementById('chat-input');
    if (chatInput) {
        chatInput.addEventListener('input', autoResizeInput);
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }

    // 初始化左栏拖拽分隔线
    initPanelResizer();
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
        switchKB(kb.id);
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
                switchKB(data.data.id);
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
        if (currentKB === kbId) _selectFirstKB();
        renderKBList();
    } else {
        authFetch(`${API_BASE_URL}/kb/${kbId}`, { method: 'DELETE' })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                knowledgeBases = knowledgeBases.filter(k => k.id !== kbId);
                if (currentKB === kbId) _selectFirstKB();
                renderKBList();
            } else {
                showStatusMessage(data.error || '删除失败', 'error');
            }
        })
        .catch(() => showStatusMessage('网络错误', 'error'));
    }
}

async function switchKB(kbId) {
    currentKB = kbId;
    currentConvId = null;  // 重置当前对话

    // 更新 UI 高亮
    document.querySelectorAll('.kb-item').forEach(el => el.classList.remove('active'));
    const el = document.querySelector(`[data-kb-id="${kbId}"]`);
    if (el) el.classList.add('active');
    const kb = knowledgeBases.find(k => k.id === kbId);
    document.getElementById('current-kb-label').textContent = kb ? kb.name : kbId;

    // 加载文档列表和对话列表（等待完成）
    loadKBDocuments(kbId);
    await loadKBConversations(kbId);

    // 清空消息
    clearChat();
    updateStatusBar();
}

/**
 * 选中第一个知识库（删除当前知识库后回退）
 */
function _selectFirstKB() {
    currentKB = null;
    currentConvId = null;
    document.getElementById('current-kb-label').textContent = '未选择';
    if (knowledgeBases.length > 0) {
        switchKB(knowledgeBases[0].id);
    } else {
        clearChat();
        updateStatusBar();
    }
}

function renderKBList() {
    const list = document.getElementById('kb-list');
    if (knowledgeBases.length === 0) {
        list.innerHTML = '<p class="kb-empty">暂无知识库，点击 + 创建</p>';
        return;
    }

    list.innerHTML = knowledgeBases.map(kb => `
        <div class="kb-item ${currentKB === kb.id ? 'active' : ''}" data-kb-id="${kb.id}">
            <div class="kb-item-header" onclick="switchKB('${kb.id}')">
                <span class="kb-icon">&#128218;</span>
                <span class="kb-name" title="${kb.name}">${kb.name}</span>
                <button class="kb-upload-btn" onclick="triggerKBUpload('${kb.id}', event)" title="上传文档">&#128206;</button>
                <button class="kb-delete-btn" onclick="deleteKnowledgeBase('${kb.id}', event)" title="删除">&#10005;</button>
            </div>
            <div class="kb-docs-panel" id="kb-docs-${kb.id}" style="display:none;">
                <div class="kb-docs-loading">加载中...</div>
            </div>
            <div class="kb-conversations-panel" id="kb-convs-${kb.id}" style="display:none;">
                <div class="kb-convs-header" onclick="loadKBConversations('${kb.id}')">&#128172; 对话记录</div>
                <div id="kb-convs-list-${kb.id}" class="kb-convs-list"></div>
            </div>
            <input type="file" id="kb-file-${kb.id}" accept=".pdf" style="display:none;" onchange="handleKBUpload('${kb.id}', this)">
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
    if (!box) return;
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
    if (!dropZone) return;  // Phase 4.4 后旧分析面板已移除

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
        const resizer = document.getElementById('left-resizer');
        const isCollapsed = panel.classList.toggle('collapsed');
        expandBtn.style.display = isCollapsed ? 'flex' : 'none';
        if (resizer) resizer.style.display = isCollapsed ? 'none' : '';
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

// ========== 左栏拖拽调整宽度 ==========

function initPanelResizer() {
    const resizer = document.getElementById('left-resizer');
    const panel = document.getElementById('left-panel');
    if (!resizer || !panel) return;

    let startX = 0;
    let startWidth = 0;

    resizer.addEventListener('mousedown', (e) => {
        e.preventDefault();
        startX = e.clientX;
        startWidth = panel.offsetWidth;
        resizer.classList.add('active');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        const onMouseMove = (e) => {
            const diff = e.clientX - startX;
            const newWidth = Math.min(Math.max(startWidth + diff, 200), 500);
            panel.style.width = newWidth + 'px';
            panel.style.minWidth = newWidth + 'px';
        };

        const onMouseUp = () => {
            resizer.classList.remove('active');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });
}

// ========== 底部状态栏 ==========

function updateStatusBar() {
    const config = getModelConfig();
    const providerInfo = PROVIDER_CONFIG[config.provider];

    const kbName = currentKB
        ? (knowledgeBases.find(k => k.id === currentKB)?.name || currentKB)
        : '未选择';

    document.getElementById('status-kb').textContent = `知识库: ${kbName}`;
    document.getElementById('status-model').textContent = `模型: ${config.model || 'Coze 智能体'}`;
    document.getElementById('status-provider').textContent = `提供商: ${providerInfo.name}`;
}

// ========== 知识库列表加载 ==========

/**
 * 从服务器加载知识库列表并渲染
 */
async function loadKBList() {
    try {
        const response = await authFetch(`${API_BASE_URL}/kb`);
        const data = await response.json();
        if (data.success) {
            knowledgeBases = data.data || [];
            renderKBList();
            // 自动选中第一个知识库
            if (knowledgeBases.length > 0 && !currentKB) {
                await switchKB(knowledgeBases[0].id);
                // 恢复上次对话：选中该知识库的最新对话
                const convsPanel = document.getElementById(`kb-convs-${knowledgeBases[0].id}`);
                if (convsPanel && conversations.length > 0) {
                    switchConversation(conversations[0].id);
                }
            }
        }
    } catch (error) {
        console.error('加载知识库列表失败:', error);
    }
}

// ========== 文档管理模块（Phase 3） ==========

/**
 * 触发知识库文件上传
 */
function triggerKBUpload(kbId, event) {
    event.stopPropagation();
    document.getElementById(`kb-file-${kbId}`).click();
}

// ========== 上传进度动画控制 ==========

/**
 * 显示上传进度遮罩
 */
function showUploadProgress(fileName) {
    const overlay = document.getElementById('upload-overlay');
    if (!overlay) return;
    const title = document.getElementById('upload-progress-title');
    if (title) title.textContent = `正在处理: ${fileName}`;
    // 重置所有步骤
    ['upload', 'parse', 'chunk', 'embed'].forEach(s => {
        const el = document.getElementById(`upload-step-${s}`);
        if (el) el.className = 'upload-step';
    });
    const bar = document.getElementById('upload-progress-bar');
    if (bar) bar.style.width = '0%';
    const pct = document.getElementById('upload-progress-pct');
    if (pct) pct.textContent = '0%';
    overlay.style.display = 'flex';
}

/**
 * 更新上传进度步骤
 * @param {string} step - 'upload'|'parse'|'chunk'|'embed'
 * @param {string} status - 'active'|'done'|'error'
 * @param {number} percent - 0~100
 */
function updateUploadStep(step, status, percent) {
    const el = document.getElementById(`upload-step-${step}`);
    if (el) {
        el.className = `upload-step ${status}`;
        const icon = el.querySelector('.step-icon');
        if (icon) {
            if (status === 'active') icon.innerHTML = '&#8987;';      // ⏳ 处理中
            else if (status === 'done') icon.innerHTML = '&#10004;';  // ✔ 完成
            else if (status === 'error') icon.innerHTML = '&#10008;'; // ✘ 失败
        }
    }
    const bar = document.getElementById('upload-progress-bar');
    if (bar) bar.style.width = `${percent}%`;
    const pct = document.getElementById('upload-progress-pct');
    if (pct) pct.textContent = `${Math.round(percent)}%`;
}

/**
 * 隐藏上传进度遮罩
 */
function hideUploadProgress() {
    const overlay = document.getElementById('upload-overlay');
    if (overlay) overlay.style.display = 'none';
}

/**
 * 处理知识库文件上传（带进度动画）
 */
async function handleKBUpload(kbId, input) {
    const file = input.files[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
        showStatusMessage('仅支持 PDF 格式', 'error');
        return;
    }

    // 获取切分参数
    const chunkSize = document.getElementById('slider-chunk-size')?.value || 500;
    const chunkOverlap = document.getElementById('slider-chunk-overlap')?.value || 50;

    // 显示进度遮罩
    showUploadProgress(file.name);

    // 阶段 1：上传文件（前端估算 0~30%）
    updateUploadStep('upload', 'active', 5);
    showStatusMessage(`正在上传 ${file.name}...`, 'loading');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('chunk_size', chunkSize);
    formData.append('chunk_overlap', chunkOverlap);

    try {
        // 模拟上传进度（FormData 无法精确追踪）
        let uploadTimer = setInterval(() => {
            const bar = document.getElementById('upload-progress-bar');
            if (bar) {
                const cur = parseFloat(bar.style.width) || 0;
                if (cur < 28) bar.style.width = `${cur + 2}%`;
            }
        }, 200);

        updateUploadStep('upload', 'active', 10);
        // 标记解析阶段准备中
        updateUploadStep('parse', 'active', 15);

        const response = await authFetch(`${API_BASE_URL}/kb/${kbId}/docs`, {
            method: 'POST',
            body: formData
        });

        clearInterval(uploadTimer);
        updateUploadStep('upload', 'done', 30);
        updateUploadStep('parse', 'active', 35);

        const data = await response.json();

        if (data.success) {
            const doc = data.data;
            // 后端已同步完成解析+切分+向量化
            updateUploadStep('parse', 'done', 55);
            updateUploadStep('chunk', 'active', 60);

            setTimeout(() => {
                updateUploadStep('chunk', 'done', 80);
                updateUploadStep('embed', 'active', 85);

                setTimeout(() => {
                    if (doc.status === 'processed') {
                        updateUploadStep('embed', 'done', 100);
                        const title = document.getElementById('upload-progress-title');
                        if (title) title.textContent = `处理完成: ${doc.page_count} 页, ${doc.chunk_count || 0} 个文本块`;
                        showStatusMessage(`${file.name} 处理完成：${doc.page_count} 页，${doc.chunk_count || 0} 个文本块`, 'success');
                    } else {
                        updateUploadStep('embed', 'error', 80);
                        const title = document.getElementById('upload-progress-title');
                        if (title) title.textContent = `处理失败: ${doc.error_message || '未知错误'}`;
                        showStatusMessage(`${file.name} 已上传但处理失败：${doc.error_message || '未知错误'}`, 'error');
                    }
                    loadKBDocuments(kbId);
                    // 1.5 秒后自动关闭
                    setTimeout(hideUploadProgress, 1500);
                }, 400);
            }, 400);
        } else {
            updateUploadStep('upload', 'error', 0);
            const title = document.getElementById('upload-progress-title');
            if (title) title.textContent = `上传失败: ${data.error || '未知错误'}`;
            showStatusMessage(data.error || '上传失败', 'error');
            setTimeout(hideUploadProgress, 2000);
        }
    } catch (error) {
        updateUploadStep('upload', 'error', 0);
        const title = document.getElementById('upload-progress-title');
        if (title) title.textContent = `网络错误: ${error.message}`;
        showStatusMessage('上传失败，请检查后端服务', 'error');
        setTimeout(hideUploadProgress, 2000);
    }

    // 重置 input 以便重复上传
    input.value = '';
}

/**
 * 加载知识库文档列表
 */
async function loadKBDocuments(kbId) {
    const panel = document.getElementById(`kb-docs-${kbId}`);
    if (!panel) return;

    panel.style.display = 'block';
    panel.innerHTML = '<div class="kb-docs-loading">加载中...</div>';

    try {
        const response = await authFetch(`${API_BASE_URL}/kb/${kbId}/docs`);
        const data = await response.json();

        if (data.success && data.data.length > 0) {
            panel.innerHTML = data.data.map(doc => `
                <div class="doc-item" data-doc-id="${doc.id}">
                    <div class="doc-item-header" onclick="toggleDocChunks('${doc.id}', '${kbId}')">
                        <span class="doc-status-dot ${doc.status}"></span>
                        <span class="doc-name" title="${doc.filename}">${doc.filename}</span>
                        <span class="doc-info">${doc.chunk_count || 0} 块</span>
                        <button class="doc-delete-btn" onclick="deleteDoc('${doc.id}', '${kbId}', event)" title="删除">&times;</button>
                    </div>
                    ${doc.status === 'processed' ? `
                    <div class="doc-meta">
                        ${doc.page_count ? doc.page_count + ' 页' : ''}
                        ${doc.total_chars ? ' · ' + (doc.total_chars / 1000).toFixed(1) + 'k 字' : ''}
                    </div>` : ''}
                    ${doc.status === 'failed' && doc.error_message ? `
                    <div class="doc-error">${doc.error_message}</div>` : ''}
                    <div class="doc-chunks-panel" id="doc-chunks-${doc.id}" style="display:none;"></div>
                </div>
            `).join('');
        } else {
            panel.innerHTML = '<div class="kb-docs-empty">暂无文档，点击 &#128206; 上传</div>';
        }
    } catch (error) {
        panel.innerHTML = '<div class="kb-docs-empty">加载失败</div>';
    }
}

/**
 * 展开/收起文档的 chunks 列表
 */
async function toggleDocChunks(docId, kbId) {
    const panel = document.getElementById(`doc-chunks-${docId}`);
    if (!panel) return;

    if (panel.style.display === 'none') {
        panel.style.display = 'block';
        panel.innerHTML = '<div class="kb-docs-loading">加载中...</div>';

        try {
            const response = await authFetch(`${API_BASE_URL}/docs/${docId}/chunks?per_page=10`);
            const data = await response.json();

            if (data.success) {
                const chunks = data.data.chunks;
                const total = data.data.total;
                if (chunks.length === 0) {
                    panel.innerHTML = '<div class="chunk-empty">暂无文本块</div>';
                } else {
                    panel.innerHTML = `
                        <div class="chunks-header">
                            共 ${total} 个文本块${total > 10 ? '（显示前 10 个）' : ''}
                        </div>
                        ${chunks.map(c => `
                            <div class="chunk-card">
                                <div class="chunk-header">
                                    <span class="chunk-index">#${c.chunk_index}</span>
                                    ${c.page_start !== null ? `<span class="chunk-page">第 ${c.page_start + 1} 页</span>` : ''}
                                    <span class="chunk-size">${c.char_count} 字</span>
                                </div>
                                <div class="chunk-content">${escapeHtml(c.content.substring(0, 120))}${c.content.length > 120 ? '...' : ''}</div>
                            </div>
                        `).join('')}
                    `;
                }
            }
        } catch (error) {
            panel.innerHTML = '<div class="chunk-empty">加载失败</div>';
        }
    } else {
        panel.style.display = 'none';
    }
}

/**
 * 删除文档
 */
async function deleteDoc(docId, kbId, event) {
    event.stopPropagation();
    if (!confirm('确定删除该文档？')) return;

    try {
        const response = await authFetch(`${API_BASE_URL}/docs/${docId}`, { method: 'DELETE' });
        const data = await response.json();
        if (data.success) {
            showStatusMessage('文档已删除', 'success');
            loadKBDocuments(kbId);
        } else {
            showStatusMessage(data.error || '删除失败', 'error');
        }
    } catch (error) {
        showStatusMessage('删除失败', 'error');
    }
}

// ========== Phase 4.4: RAG 聊天模块 ==========

/**
 * 清空聊天界面
 */
function clearChat() {
    document.getElementById('welcome-state').style.display = 'flex';
    document.getElementById('message-list').style.display = 'none';
    document.getElementById('message-list').innerHTML = '';
    document.getElementById('sources-panel').style.display = 'none';
    messages = [];
    clearStatusMessage();
}

/**
 * 聊天消息发送
 */
async function sendMessage() {
    const input = document.getElementById('chat-input');
    const content = input.value.trim();
    if (!content || isStreaming) return;

    // 检查是否选中了知识库
    if (!currentKB) {
        showStatusMessage('请先选择或创建一个知识库', 'error');
        return;
    }

    // 检查是否有对话，没有则自动创建
    if (!currentConvId) {
        await createConversation(true);
        if (!currentConvId) return;
    }

    // 清空输入框
    input.value = '';
    autoResizeInput();

    // 渲染用户消息
    addUserMessage(content);

    // 显示打字指示器
    showTypingIndicator(true);

    // 获取模型配置
    const modelConfig = getModelConfig();

    const body = {
        content: content,
        model_config: modelConfig,
        stream: true,
    };

    isStreaming = true;
    pendingSources = [];
    currentStreamContent = '';

    // 创建 AI 消息占位
    const aiMsgId = 'ai-msg-' + Date.now();
    addStreamingBotMessage(aiMsgId);

    try {
        const response = await authFetch(
            `${API_BASE_URL}/conversations/${currentConvId}/messages`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            }
        );

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let currentEventType = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop(); // 保留最后不完整的行

            for (const line of lines) {
                if (line.startsWith('event: ')) {
                    currentEventType = line.slice(7).trim();
                } else if (line.startsWith('data: ')) {
                    const dataStr = line.slice(6);
                    try {
                        const data = JSON.parse(dataStr);
                        if (currentEventType === 'token') {
                            currentStreamContent += data.content;
                            updateStreamingMessage(aiMsgId, currentStreamContent);
                        } else if (currentEventType === 'sources') {
                            pendingSources = data.sources;
                            renderSources(data.sources);
                        } else if (currentEventType === 'done') {
                            // 完成
                        } else if (currentEventType === 'error') {
                            updateStreamingMessage(aiMsgId, '错误: ' + data.error);
                        }
                    } catch (e) { /* 忽略解析错误 */ }
                    currentEventType = '';
                }
            }
        }

    } catch (error) {
        updateStreamingMessage(aiMsgId, '请求失败，请检查后端服务');
        showStatusMessage('发送失败: ' + error.message, 'error');
    } finally {
        isStreaming = false;
        showTypingIndicator(false);
        finalizeStreamingMessage(aiMsgId);
    }
}

/**
 * 创建新对话
 */
async function createConversation(silent = false) {
    if (!currentKB) {
        if (!silent) showStatusMessage('请先选择或创建一个知识库', 'error');
        return;
    }

    try {
        const response = await authFetch(`${API_BASE_URL}/kb/${currentKB}/conversations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: '' }),
        });
        const data = await response.json();
        if (data.success) {
            currentConvId = data.data.id;
            if (!silent) clearChat();
            loadKBConversations(currentKB);
        } else if (!silent) {
            showStatusMessage(data.error || '创建对话失败', 'error');
        }
    } catch (error) {
        if (!silent) showStatusMessage('创建对话失败', 'error');
    }
}

/**
 * 切换到指定对话
 */
async function switchConversation(convId) {
    try {
        const response = await authFetch(`${API_BASE_URL}/conversations/${convId}`);
        const data = await response.json();
        if (data.success) {
            currentConvId = convId;
            renderHistoryMessages(data.data.messages || []);
            renderConversationList(currentKB);
        }
    } catch (error) {
        showStatusMessage('加载对话失败', 'error');
    }
}

/**
 * 删除对话
 */
async function deleteConversation(convId, event) {
    event.stopPropagation();
    if (!confirm('确定删除该对话？')) return;

    try {
        const response = await authFetch(`${API_BASE_URL}/conversations/${convId}`, { method: 'DELETE' });
        const data = await response.json();
        if (data.success) {
            if (currentConvId === convId) {
                currentConvId = null;
                clearChat();
            }
            loadKBConversations(currentKB);
        } else {
            showStatusMessage(data.error || '删除失败', 'error');
        }
    } catch (error) {
        showStatusMessage('删除失败', 'error');
    }
}

/**
 * 加载知识库的对话列表
 */
async function loadKBConversations(kbId) {
    const convsPanel = document.getElementById(`kb-convs-${kbId}`);
    if (!convsPanel) return;

    convsPanel.style.display = 'block';

    try {
        const response = await authFetch(`${API_BASE_URL}/kb/${kbId}/conversations`);
        const data = await response.json();
        if (data.success) {
            conversations = data.data;
            renderConversationList(kbId);
        }
    } catch (error) { /* 静默失败 */ }
}

/**
 * 渲染左栏对话列表
 */
function renderConversationList(kbId) {
    const container = document.getElementById(`kb-convs-list-${kbId}`);
    if (!container) return;

    if (conversations.length === 0) {
        container.innerHTML = '<div class="conv-empty">暂无对话</div>';
        return;
    }

    container.innerHTML = conversations.map(conv => `
        <div class="conv-item ${currentConvId === conv.id ? 'active' : ''}"
             onclick="switchConversation('${conv.id}')">
            <span class="conv-title">${escapeHtml(conv.title)}</span>
            <span class="conv-count">${conv.message_count} 条</span>
            <button class="conv-delete" onclick="deleteConversation('${conv.id}', event)">&times;</button>
        </div>
    `).join('');
}

/**
 * 渲染历史消息
 */
function renderHistoryMessages(msgs) {
    document.getElementById('welcome-state').style.display = 'none';
    const list = document.getElementById('message-list');
    list.style.display = 'flex';
    list.innerHTML = '';

    msgs.forEach(msg => {
        if (msg.role === 'user') {
            list.innerHTML += `<div class="chat-msg user-msg"><div class="msg-content">${escapeHtml(msg.content)}</div></div>`;
        } else {
            list.innerHTML += `<div class="chat-msg bot-msg"><div class="msg-content">${renderMarkdown(msg.content)}</div></div>`;
        }
    });

    document.getElementById('sources-panel').style.display = 'none';
    scrollToBottom();
}

// ========== 流式渲染函数 ==========

/**
 * 创建 AI 流式消息占位
 */
function addStreamingBotMessage(msgId) {
    document.getElementById('welcome-state').style.display = 'none';
    const list = document.getElementById('message-list');
    list.style.display = 'flex';

    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-msg bot-msg streaming';
    msgDiv.id = msgId;
    msgDiv.innerHTML = '<div class="msg-content"><span class="streaming-cursor">|</span></div>';
    list.appendChild(msgDiv);
    scrollToBottom();
}

/**
 * 更新流式消息内容
 */
function updateStreamingMessage(msgId, content) {
    const el = document.getElementById(msgId);
    if (!el) return;
    const contentEl = el.querySelector('.msg-content');
    contentEl.innerHTML = renderMarkdown(content) + '<span class="streaming-cursor">|</span>';
    scrollToBottom();
}

/**
 * 完成流式消息
 */
function finalizeStreamingMessage(msgId) {
    const el = document.getElementById(msgId);
    if (!el) return;
    el.classList.remove('streaming');
    const cursor = el.querySelector('.streaming-cursor');
    if (cursor) cursor.remove();

    // 追加引用来源标签
    if (pendingSources.length > 0) {
        const sourcesHtml = buildSourcesHtml(pendingSources);
        const contentEl = el.querySelector('.msg-content');
        contentEl.insertAdjacentHTML('beforeend', sourcesHtml);
    }
}

// ========== 辅助函数 ==========

/**
 * 简易 Markdown 渲染
 */
function renderMarkdown(text) {
    if (!text) return '';
    let html = escapeHtml(text);
    // 加粗 **text**
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // 行内代码 `code`
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    // 标题
    html = html.replace(/^### (.+)$/gm, '<h4 class="md-h4">$1</h4>');
    html = html.replace(/^## (.+)$/gm, '<h3 class="md-h3">$1</h3>');
    // 无序列表
    html = html.replace(/^- (.+)$/gm, '<li class="md-li">$1</li>');
    // 有序列表
    html = html.replace(/^\d+\. (.+)$/gm, '<li class="md-li">$1</li>');
    // 换行
    html = html.replace(/\n/g, '<br>');
    return html;
}

/**
 * 聊天输入框自适应高度
 */
function autoResizeInput() {
    const input = document.getElementById('chat-input');
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 150) + 'px';
}

/**
 * 显示/隐藏打字指示器
 */
function showTypingIndicator(show) {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) indicator.style.display = show ? 'flex' : 'none';
}

/**
 * 滚动到底部
 */
function scrollToBottom() {
    const area = document.getElementById('result-area');
    if (area) area.scrollTop = area.scrollHeight;
}

/**
 * 渲染引用来源面板
 */
function renderSources(sources) {
    const panel = document.getElementById('sources-panel');
    const list = document.getElementById('sources-list');
    if (!sources || sources.length === 0) {
        panel.style.display = 'none';
        return;
    }
    panel.style.display = 'block';
    list.innerHTML = sources.map((s, i) => `
        <div class="source-card">
            <div class="source-header">
                <span class="source-index">#${i + 1}</span>
                <span class="source-filename">${escapeHtml(s.doc_filename)}</span>
                ${s.page_start ? `<span class="source-page">第 ${s.page_start} 页</span>` : ''}
                <span class="source-score">相似度: ${s.score}</span>
            </div>
            <div class="source-snippet">${escapeHtml(s.snippet)}</div>
        </div>
    `).join('');
}

/**
 * 切换引用来源面板显隐
 */
function toggleSources() {
    const panel = document.getElementById('sources-panel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

/**
 * 消息内引用来源标签 HTML
 */
function buildSourcesHtml(sources) {
    return `
        <div class="inline-sources">
            <div class="inline-sources-header">&#128218; 引用来源</div>
            ${sources.map((s, i) => `
                <span class="source-badge" title="${escapeHtml(s.doc_filename)} 第${s.page_start || '?'}页">[${i + 1}]</span>
            `).join(' ')}
        </div>
    `;
}
