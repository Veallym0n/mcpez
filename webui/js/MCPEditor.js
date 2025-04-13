/**
 * MCP应用编辑器类
 * 负责处理所有的编辑器功能：
 * 1. 应用信息管理（创建、编辑、删除）
 * 2. 服务器配置管理（SSE和STDIO）
 * 3. JSON导入导出
 * 4. 工具模板管理
 */
class MCPEditor {
    constructor() {
        // API基础URL - 根据实际后端路径调整
        this.API_BASE = 'api';
        
        // 当前应用和配置信息
        this.currentAppId = null;
        this.currentConfig = {
            mcpServers: {}
        };
        
        // 当前正在编辑的服务器名称
        this.currentEditingServer = null;
        
        // 全局暴露实例，使HTML中的onclick事件能够访问
        window.editor = this;
        
        // 绑定this上下文
        this.bindMethods();
    }
    
    /**
     * 初始化编辑器
     */
    init() {
        // 解析URL参数
        const urlParams = new URLSearchParams(window.location.search);
        const appId = urlParams.get('id');
        
        if (appId) {
            // 加载指定的应用
            this.loadApp(appId);
        }
        
        // 设置事件监听器
        this.setupEventListeners();
        
        // 更新UI显示
        this.updateJsonPreview();
        this.updateServerTable();
    }
    
    /**
     * 绑定方法的this上下文
     */
    bindMethods() {
        // 应用管理方法
        this.handleSaveConfig = this.handleSaveConfig.bind(this);
        this.handleExportConfig = this.handleExportConfig.bind(this);
        this.handleImportConfig = this.handleImportConfig.bind(this);
        this.handleDeleteApp = this.handleDeleteApp.bind(this);
        
        // 服务器管理方法
        this.handleAddServer = this.handleAddServer.bind(this);
        this.handleServerTypeChange = this.handleServerTypeChange.bind(this);
        this.handleServerFormSubmit = this.handleServerFormSubmit.bind(this);
        this.handleEditServer = this.handleEditServer.bind(this);
        this.handleDeleteServer = this.handleDeleteServer.bind(this);
        
        // 动态字段管理方法
        this.handleAddHeader = this.handleAddHeader.bind(this);
        this.handleAddArg = this.handleAddArg.bind(this);
        this.handleAddEnv = this.handleAddEnv.bind(this);
        
        // 工具模板方法
        this.handleUseTemplate = this.handleUseTemplate.bind(this);
        this.handleToggleSelectAllTools = this.handleToggleSelectAllTools.bind(this);
        this.handleAddSelectedTools = this.handleAddSelectedTools.bind(this);
    }
    
    /**
     * 设置事件监听器
     */
    setupEventListeners() {
        // 保存和导出按钮
        document.getElementById('saveConfigBtn').addEventListener('click', this.handleSaveConfig);
        document.getElementById('exportConfigBtn').addEventListener('click', this.handleExportConfig);
        
        // JSON导入相关
        document.getElementById('importJsonBtn').addEventListener('click', () => {
            // 在打开模态框前，先填充当前的配置到文本框中
            const jsonInput = document.getElementById('jsonInput');
            if (jsonInput) {
                // 创建完整的配置对象（包括应用名称和描述）
                const currentConfig = {
                    name: document.getElementById('appName').value,
                    description: document.getElementById('appDescription').value,
                    ...this.currentConfig
                };
                jsonInput.value = JSON.stringify(currentConfig, null, 2);
            }
            
            UIkit.modal('#json-modal').show();
        });
        document.getElementById('importBtn').addEventListener('click', this.handleImportConfig);
        
        // 删除应用按钮
        document.getElementById('deleteAppBtn').addEventListener('click', this.handleDeleteApp);
        
        // 服务器管理相关
        document.getElementById('addServerBtn').addEventListener('click', this.handleAddServer);
        document.getElementById('serverForm').addEventListener('submit', this.handleServerFormSubmit);
        document.getElementById('serverType').addEventListener('change', this.handleServerTypeChange);
        
        // 动态字段添加按钮
        document.getElementById('addHeaderBtn').addEventListener('click', this.handleAddHeader);
        document.getElementById('addArgBtn').addEventListener('click', this.handleAddArg);
        document.getElementById('addEnvBtn').addEventListener('click', this.handleAddEnv);
        
        // 模板相关
        document.getElementById('useTemplateBtn').addEventListener('click', this.handleUseTemplate);
        document.getElementById('selectAllTools').addEventListener('change', this.handleToggleSelectAllTools.bind(this));
        document.getElementById('addSelectedToolsBtn').addEventListener('click', this.handleAddSelectedTools.bind(this));
        
        // 复制JSON按钮
        document.getElementById('copyJsonBtn').addEventListener('click', () => {
            const jsonPreview = document.getElementById('jsonPreview');
            navigator.clipboard.writeText(jsonPreview.textContent)
                .then(() => this.showNotification('JSON已复制到剪贴板', 'success'));
        });
        
        // 应用信息变化监听
        document.getElementById('appName').addEventListener('input', () => {this.updateJsonPreview()});
        document.getElementById('appDescription').addEventListener('input', () => this.updateJsonPreview());
    }
    
    /**
     * 加载应用配置
     * @param {string} appId 应用ID
     */
    async loadApp(appId) {
        try {
            const response = await fetch(`${this.API_BASE}/app/${appId}`);
            if (!response.ok) throw new Error('加载应用失败');
            
            const app = await response.json();
            this.currentAppId = app.id;
            
            // 更新表单
            document.getElementById('appName').value = app.name || '';
            document.getElementById('appDescription').value = app.description || '';
            
            // 解析配置
            try {
                this.currentConfig = JSON.parse(app.config);
                if (!this.currentConfig.mcpServers) {
                    this.currentConfig.mcpServers = {};
                }
            } catch (e) {
                console.error('解析配置失败:', e);
                this.currentConfig = { mcpServers: {} };
            }
            
            // 更新UI
            this.updateServerTable();
            this.updateJsonPreview();
            
        } catch (error) {
            console.error('加载应用失败:', error);
            this.showNotification('加载应用失败', 'danger');
        }
    }
    
    /**
     * 处理配置保存
     */
    async handleSaveConfig() {
        try {
            const appName = document.getElementById('appName').value;
            const appDescription = document.getElementById('appDescription').value;
            
            const submitData = {
                ...this.currentConfig,
                name: appName,
                description: appDescription
            };

            if (this.currentAppId) { submitData.id = this.currentAppId }
            
            let url = `${this.API_BASE}/app/submit`;
            let method = 'POST';
            
            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(submitData)
            });
            
            if (!response.ok) throw new Error('保存配置失败');
            
            const result = await response.json();
            this.currentAppId = result.id;
            
            this.showNotification('配置已保存', 'success');
            
        } catch (error) {
            console.error('保存配置失败:', error);
            this.showNotification('保存失败: ' + error.message, 'danger');
        }
    }
    
    /**
     * 处理配置导出
     */
    handleExportConfig() {
        const jsonString = JSON.stringify(this.currentConfig, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `mcp-config-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    
    /**
     * 处理JSON导入
     */
    handleImportConfig() {
        const jsonInput = document.getElementById('jsonInput');
        if (!jsonInput.value) return;
        
        try {
            const config = JSON.parse(jsonInput.value);
            
            // 提取name和description，并从config对象中删除
            const appName = config.name || '';
            const appDescription = config.description || '';
            
            // 删除顶层的name和description，剩下的内容作为配置
            delete config.name;
            delete config.description;
            
            // 更新配置
            this.currentConfig = config;
            
            // 更新应用名称和描述的输入框
            document.getElementById('appName').value = appName;
            document.getElementById('appDescription').value = appDescription;
            
            // 更新UI
            this.updateServerTable();
            this.updateJsonPreview();
            
            UIkit.modal('#json-modal').hide();
            this.showNotification('配置已导入', 'success');
            
        } catch (error) {
            console.error('解析JSON失败:', error);
            this.showNotification('JSON格式错误', 'danger');
        }
    }

    /**
     * 处理添加MCP服务模板
     */
    async handleAddTool(name) {
        this.currentEditingServer = name;
        const config = this.currentConfig.mcpServers[name];
        const submitData = {name:name, config:config, description: config.description||''}
        try {
            const response = await fetch(`${this.API_BASE}/tool/add`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(submitData)
            });
            this.showNotification('工具添加成功', 'success')
        }catch(e){
            this.showNotification('工具添加失败', 'error')
        }

    }
    
    /**
     * 处理添加服务器
     */
    handleAddServer() {
        this.currentEditingServer = null;
        document.getElementById('serverModalTitle').textContent = '添加服务器';
        document.getElementById('serverForm').reset();
        
        // 清空动态字段容器
        document.getElementById('headersContainer').innerHTML = '';
        document.getElementById('argsContainer').innerHTML = '';
        document.getElementById('envContainer').innerHTML = '';
        
        // 显示SSE配置（默认）
        this.handleServerTypeChange();
        
        UIkit.modal('#server-modal').show();
    }
    
    /**
     * 处理服务器类型切换
     */
    handleServerTypeChange() {
        const serverType = document.getElementById('serverType').value;
        
        // 切换配置区域显示
        document.getElementById('sseConfig').classList.toggle('hidden', serverType !== 'sse');
        document.getElementById('stdioConfig').classList.toggle('hidden', serverType !== 'stdio');
    }
    
    /**
     * 处理服务器表单提交
     * @param {Event} e 表单提交事件
     */
    handleServerFormSubmit(e) {
        e.preventDefault();
        
        const serverName = document.getElementById('serverName').value;
        if (!serverName) return;
        
        const serverConfig = {
            type: document.getElementById('serverType').value,
            description: document.getElementById('serverDescription').value || ''
        };
        
        if (serverConfig.type === 'sse') {
            serverConfig.baseUrl = document.getElementById('baseUrl').value;
            
            // 收集headers
            const headers = {};
            const headerKeys = document.querySelectorAll('#headersContainer input[data-type="headerKey"]');
            const headerValues = document.querySelectorAll('#headersContainer input[data-type="headerValue"]');
            
            for (let i = 0; i < headerKeys.length; i++) {
                const key = headerKeys[i].value.trim();
                const value = headerValues[i].value.trim();
                if (key) {
                    headers[key] = value;
                }
            }
            
            if (Object.keys(headers).length > 0) {
                serverConfig.headers = headers;
            }
            
        } else {
            serverConfig.command = document.getElementById('command').value;
            
            // 收集参数
            const args = [];
            document.querySelectorAll('#argsContainer input[data-type="arg"]').forEach(input => {
                if (input.value.trim()) {
                    args.push(input.value.trim());
                }
            });
            
            if (args.length > 0) {
                serverConfig.args = args;
            }
            
            // 收集环境变量
            const env = {};
            const envKeys = document.querySelectorAll('#envContainer input[data-type="envKey"]');
            const envValues = document.querySelectorAll('#envContainer input[data-type="envValue"]');
            
            for (let i = 0; i < envKeys.length; i++) {
                const key = envKeys[i].value.trim();
                const value = envValues[i].value.trim();
                if (key) {
                    env[key] = value;
                }
            }
            
            if (Object.keys(env).length > 0) {
                serverConfig.env = env;
            }
        }
        
        // 更新配置
        this.currentConfig.mcpServers[serverName] = serverConfig;
        
        // 更新UI
        this.updateServerTable();
        this.updateJsonPreview();
        
        // 关闭模态框
        UIkit.modal('#server-modal').hide();
        this.showNotification('数据已更新', 'success');
    }
    
    /**
     * 处理编辑服务器
     * @param {string} name 服务器名称
     */
    handleEditServer(name) {
        this.currentEditingServer = name;
        const config = this.currentConfig.mcpServers[name];
        
        // 设置表单标题
        document.getElementById('serverModalTitle').textContent = '编辑服务器';
        
        // 填充基本信息
        document.getElementById('serverName').value = name;
        document.getElementById('serverDescription').value = config.description || ''
        document.getElementById('serverType').value = config.type;
        
        // 切换并填充对应类型的配置
        this.handleServerTypeChange();
        
        if (config.type === 'sse') {
            document.getElementById('baseUrl').value = config.baseUrl || '';
            
            // 填充headers
            document.getElementById('headersContainer').innerHTML = '';
            if (config.headers) {
                Object.entries(config.headers).forEach(([key, value]) => {
                    this.addHeaderField(key, value);
                });
            }
            
        } else {
            document.getElementById('command').value = config.command || '';
            
            // 填充参数
            document.getElementById('argsContainer').innerHTML = '';
            if (config.args) {
                config.args.forEach(arg => {
                    this.addDynamicField('argsContainer', 'arg', arg);
                });
            }
            
            // 填充环境变量
            document.getElementById('envContainer').innerHTML = '';
            if (config.env) {
                Object.entries(config.env).forEach(([key, value]) => {
                    this.addEnvField(key, value);
                });
            }
        }
        
        UIkit.modal('#server-modal').show();
    }
    
    /**
     * 处理删除服务器
     * @param {string} name 服务器名称
     */
    handleDeleteServer(name) {
        if (confirm(`确定要删除服务器 "${name}" 吗？`)) {
            delete this.currentConfig.mcpServers[name];
            this.updateServerTable();
            this.updateJsonPreview();
            this.showNotification('服务器已删除', 'success');
        }
    }
    
    /**
     * 添加Header字段
     * @param {string} key header键
     * @param {string} value header值
     */
    addHeaderField(key = '', value = '') {
        const container = document.getElementById('headersContainer');
        const field = this.createKeyValueField('header', key, value);
        container.appendChild(field);
    }
    
    /**
     * 处理添加Header字段的按钮点击
     */
    handleAddHeader() {
        this.addHeaderField();
    }
    
    /**
     * 添加参数字段
     */
    addDynamicField(containerId, type, value = '') {
        const container = document.getElementById(containerId);
        
        const fieldGroup = document.createElement('div');
        fieldGroup.className = 'flex items-center';
        
        const input = document.createElement('input');
        input.className = 'border flex-1 h-9 px-3 rounded-lg border-gray-200 focus:border-primary-500 focus:ring focus:ring-primary-500 focus:ring-opacity-20 mr-2';
        input.type = 'text';
        input.value = value;
        input.dataset.type = type;
        
        const removeBtn = document.createElement('button');
        removeBtn.className = 'p-2 rounded-lg text-red-600 hover:bg-red-50 transition-colors';
        removeBtn.type = 'button';
        removeBtn.innerHTML = `
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none">
                <path d="M6 18L18 6M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
        `;
        removeBtn.onclick = () => container.removeChild(fieldGroup);
        
        fieldGroup.appendChild(input);
        fieldGroup.appendChild(removeBtn);
        container.appendChild(fieldGroup);
    }
    
    /**
     * 处理添加参数的按钮点击
     */
    handleAddArg() {
        this.addDynamicField('argsContainer', 'arg');
    }
    
    /**
     * 添加环境变量字段
     * @param {string} key 环境变量键
     * @param {string} value 环境变量值
     */
    addEnvField(key = '', value = '') {
        const container = document.getElementById('envContainer');
        const field = this.createKeyValueField('env', key, value);
        container.appendChild(field);
    }
    
    /**
     * 处理添加环境变量的按钮点击
     */
    handleAddEnv() {
        this.addEnvField();
    }
    
    /**
     * 创建键值对字段
     * @param {string} type 字段类型
     * @param {string} key 键
     * @param {string} value 值
     */
    createKeyValueField(type, key = '', value = '') {
        const fieldGroup = document.createElement('div');
        fieldGroup.className = 'flex items-center space-x-2';
        
        const keyInput = document.createElement('input');
        keyInput.className = 'border flex-1 h-9 px-3 rounded-lg border-gray-200 focus:border-primary-500 focus:ring focus:ring-primary-500 focus:ring-opacity-20';
        keyInput.type = 'text';
        keyInput.placeholder = '键';
        keyInput.value = key;
        keyInput.dataset.type = `${type}Key`;
        
        const valueInput = document.createElement('input');
        valueInput.className = 'border flex-1 h-9 px-3 rounded-lg border-gray-200 focus:border-primary-500 focus:ring focus:ring-primary-500 focus:ring-opacity-20';
        valueInput.type = 'text';
        valueInput.placeholder = '值';
        valueInput.value = value;
        valueInput.dataset.type = `${type}Value`;
        
        const removeBtn = document.createElement('button');
        removeBtn.className = 'p-2 rounded-lg text-red-600 hover:bg-red-50 transition-colors flex-shrink-0';
        removeBtn.type = 'button';
        removeBtn.innerHTML = `
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none">
                <path d="M6 18L18 6M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
        `;
        removeBtn.onclick = () => fieldGroup.remove();
        
        fieldGroup.appendChild(keyInput);
        fieldGroup.appendChild(valueInput);
        fieldGroup.appendChild(removeBtn);
        
        return fieldGroup;
    }
    
    /**
     * 更新服务器表格
     */
    updateServerTable() {
        const tableBody = document.getElementById('serverTableBody');
        const emptyMessage = document.getElementById('emptyServerMessage');
        
        tableBody.innerHTML = '';
        
        const servers = Object.entries(this.currentConfig.mcpServers);
        
        if (servers.length === 0) {
            emptyMessage.classList.remove('hidden');
            return;
        }
        
        emptyMessage.classList.add('hidden');
        
        servers.forEach(([name, config]) => {
            // 确保 config.type 存在，如果不存在默认为 'stdio'
            const serverType = config.type || 'stdio';
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="px-4 py-4">
                    <span class="font-medium text-gray-900">${name}</span>
                </td>
                <td class="px-4 py-4">
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        serverType === 'sse' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                    }">
                        ${serverType.toUpperCase()}
                    </span>
                </td>
                <td class="px-4 py-4">
                    ${serverType === 'sse' ? 
                        `<span class="text-sm text-gray-500">${config.baseUrl || '-'}</span>` :
                        `<span class="text-sm text-gray-500">${config.command || '-'}</span>`
                    }
                </td>
                <td class="px-4 py-4 text-right space-x-2">
                    <button class="hover:text-gray-400 text-xs border bg-green-100 p-1 rounded-lg" onclick="editor.handleAddTool('${name}')">保存工具</button>
                    <button class="text-white hover:bg-gray-500 text-xs border bg-gray-800 px-2 py-1 rounded-lg" onclick="editor.handleEditServer('${name}')">
                        编辑
                    </button>
                    <button class="text-white hover:text-gray-200 text-xs border bg-rose-800 px-2 py-1 rounded-lg" onclick="editor.handleDeleteServer('${name}')">
                        删除
                    </button>
                </td>
            `;
            tableBody.appendChild(tr);
        });
    }
    
    /**
     * 更新JSON预览
     */
    updateJsonPreview() {
        const appName = document.getElementById('appName').value;
        const appDescription = document.getElementById('appDescription').value;
        const previewConfig = {
            ...this.currentConfig,
            name: appName,
            description: appDescription
        };
        document.getElementById('jsonPreview').textContent = JSON.stringify(previewConfig, null, 2);
    }
    
    /**
     * 显示通知消息
     * @param {string} message 消息内容
     * @param {string} status 消息状态
     */
    showNotification(message, status = 'primary') {
        UIkit.notification({
            message: message,
            status: status,
            pos: 'top-right',
            timeout: 3000
        });
    }
    
    /**
     * 删除应用
     */
    async handleDeleteApp() {
        if (!this.currentAppId) {
            this.showNotification('没有选择应用', 'warning');
            return;
        }
        
        if (!confirm(`确定要删除应用吗？此操作不可撤销！`)) {
            return;
        }
        
        try {
            const response = await fetch(`${this.API_BASE}/app/${this.currentAppId}`, {
                method: 'DELETE'
            });
            
            if (!response.ok) throw new Error('删除应用失败');
            
            this.showNotification('应用已删除', 'success');
            this.currentAppId = null;
            this.currentConfig = { mcpServers: {} };
            
            // 重置应用信息
            document.getElementById('appName').value = '';
            document.getElementById('appDescription').value = '';
            
            // 更新UI
            this.updateServerTable();
            this.updateJsonPreview();
            
            // 可选：跳转到首页
            // window.location.href = 'index.html';
            
        } catch (error) {
            console.error('删除应用失败:', error);
            this.showNotification('删除失败: ' + error.message, 'danger');
        }
    }
    
    /**
     * 处理使用模板
     */
    async handleUseTemplate() {
        try {
            document.getElementById('templateLoading').classList.remove('hidden');
            document.getElementById('templateTableContainer').classList.add('hidden');
            document.getElementById('noTemplatesMessage').classList.add('hidden');
            
            UIkit.modal('#template-modal').show();
            
            const response = await fetch(`${this.API_BASE}/tool/list`);
            if (!response.ok) throw new Error('获取模板列表失败');
            
            const templates = await response.json();
            
            if (templates.length === 0) {
                document.getElementById('templateLoading').classList.add('hidden');
                document.getElementById('noTemplatesMessage').classList.remove('hidden');
                return;
            }
            
            const templateTableBody = document.getElementById('templateTableBody');
            templateTableBody.innerHTML = '';
            
            templates.forEach(template => {
                try {
                    const templateConfig = JSON.parse(template.config);
                    const serverType = templateConfig.type || 'stdio';
                    
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td class="px-4 py-3">
                            <input type="checkbox" class="h-4 w-4 rounded text-primary-600 template-checkbox" 
                                data-template-id="${template.id}"
                                data-template-name="${template.name}"
                                data-template-config='${JSON.stringify(templateConfig)}'>
                        </td>
                        <td class="px-4 py-3">
                            <span class="font-medium text-gray-900">${template.name}</span>
                        </td>
                        <td class="px-4 py-3">
                            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                serverType === 'sse' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                            }">
                                ${serverType.toUpperCase()}
                            </span>
                        </td>
                        <td class="px-4 py-3">
                            <span class="text-sm text-gray-500">${template.description || '无描述'}</span>
                        </td>
                        <td class="px-4 py-3">
                            <button class="uk-button-small uk-button-danger rounded-lg text-xs py-1" onclick="fetch('${this.API_BASE}/tool/${template.id}', {method:'DELETE'}).then(editor.handleUseTemplate)">删除</span>
                        </td>
                    `;
                    
                    templateTableBody.appendChild(tr);
                } catch (e) {
                    console.error(`解析模板配置失败 ${template.name}:`, e);
                }
            });
            
            document.getElementById('templateLoading').classList.add('hidden');
            document.getElementById('templateTableContainer').classList.remove('hidden');
            
            // 重置全选复选框
            document.getElementById('selectAllTools').checked = false;
            
        } catch (error) {
            console.error('加载模板列表失败:', error);
            document.getElementById('templateLoading').classList.add('hidden');
            document.getElementById('noTemplatesMessage').textContent = '加载模板列表失败';
            document.getElementById('noTemplatesMessage').classList.remove('hidden');
        }
    }
    
    /**
     * 处理全选/取消全选工具模板
     * @param {Event} e 事件对象
     */
    handleToggleSelectAllTools(e) {
        const isChecked = e.target.checked;
        const checkboxes = document.querySelectorAll('#templateTableBody input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.checked = isChecked;
        });
    }
    
    /**
     * 处理添加选中的工具模板
     */
    handleAddSelectedTools() {
        const selectedCheckboxes = document.querySelectorAll('#templateTableBody input[type="checkbox"]:checked');
        if (selectedCheckboxes.length === 0) {
            this.showNotification('请至少选择一个模板', 'warning');
            return;
        }
        
        let addedCount = 0;
        selectedCheckboxes.forEach(checkbox => {
            const templateId = checkbox.dataset.templateId;
            const templateConfig = JSON.parse(checkbox.dataset.templateConfig);
            const templateName = checkbox.dataset.templateName;
            
            if (templateName && templateConfig) {
                this.currentConfig.mcpServers[templateName] = templateConfig;
                addedCount++;
            }
        });
        
        // 更新UI
        this.updateServerTable();
        this.updateJsonPreview();
        
        // 关闭模态框并显示通知
        UIkit.modal('#template-modal').hide();
        this.showNotification(`成功添加了 ${addedCount} 个模板`, 'success');
    }
}