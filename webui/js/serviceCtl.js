/**
 * MCP服务状态管理控制器类
 * 负责处理所有的服务管理功能：
 * 1. 加载应用和服务列表
 * 2. 过滤和显示应用
 * 3. 启动和停止服务
 * 4. 查看应用和服务详情
 */
class ServiceController {
    constructor() {
        // API基础URL - 根据实际后端路径调整
        this.API_BASE = 'api';
        
        // 当前选中的应用ID
        this.selectedAppId = null;
        this.runningServices = [];
        this.allApps = [];
        
        // 全局暴露实例，使HTML中的事件能够访问
        window.serviceCtl = this;
        
        // 绑定this上下文
        this.bindMethods();
    }
    
    /**
     * 初始化控制器
     */
    init() {
        // 初始化加载应用和服务状态
        this.loadAllData();
        
        // 设置事件监听器
        this.setupEventListeners();
    }
    
    /**
     * 绑定方法的this上下文
     */
    bindMethods() {
        this.loadAllData = this.loadAllData.bind(this);
        this.filterApps = this.filterApps.bind(this);
        this.startSelectedService = this.startSelectedService.bind(this);
        this.stopServiceFromDetails = this.stopServiceFromDetails.bind(this);
        this.refreshServiceDetails = this.refreshServiceDetails.bind(this);
        this.updateAppServiceTable = this.updateAppServiceTable.bind(this);
        this.startService = this.startService.bind(this);
        this.stopService = this.stopService.bind(this);
        this.showServiceDetails = this.showServiceDetails.bind(this);
        this.showAppDetails = this.showAppDetails.bind(this);
    }
    
    /**
     * 设置事件监听器
     */
    setupEventListeners() {
        document.getElementById('refreshStatusBtn').addEventListener('click', this.loadAllData);
        document.getElementById('searchApp').addEventListener('input', this.filterApps);
        document.getElementById('startServiceBtn').addEventListener('click', this.startSelectedService);
        document.getElementById('stopServiceDetailsBtn').addEventListener('click', this.stopServiceFromDetails);
        document.getElementById('refreshServiceDetailsBtn').addEventListener('click', this.refreshServiceDetails);
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
     * 加载所有数据（应用列表和运行中的服务）
     */
    loadAllData() {
        document.getElementById('statusLoading').classList.remove('hidden');
        document.getElementById('serviceTableBody').innerHTML = '';
        document.getElementById('noServicesMessage').classList.add('hidden');
        
        // 同时请求应用列表和服务状态
        Promise.all([
            fetch(`${this.API_BASE}/app/list`).then(resp => resp.json()),
            fetch(`${this.API_BASE}/service/status`).then(resp => resp.json())
        ])
        .then(([apps, serviceData]) => {
            document.getElementById('statusLoading').classList.add('hidden');
            
            // 保存数据
            this.allApps = apps || [];
            this.runningServices = serviceData.services || [];
            
            // 更新表格
            this.updateAppServiceTable();
        })
        .catch(error => {
            console.error('Error loading data:', error);
            document.getElementById('statusLoading').classList.add('hidden');
            document.getElementById('noServicesMessage').textContent = '加载数据失败';
            document.getElementById('noServicesMessage').classList.remove('hidden');
        });
    }
    
    /**
     * 更新应用服务表格
     */
    updateAppServiceTable() {
        const tableBody = document.getElementById('serviceTableBody');
        tableBody.innerHTML = '';
        
        if (this.allApps.length === 0) {
            document.getElementById('noServicesMessage').classList.remove('hidden');
            return;
        }
        
        this.allApps.forEach(app => {
            const isRunning = this.runningServices.includes(app.id.toString());
            
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="px-4 py-4">
                    <span class="font-medium text-gray-900">${app.id}</span>
                </td>
                <td class="px-4 py-4">${app.name || `应用 #${app.id}`}</td>
                <td class="px-4 py-4 max-w-xs truncate">${app.description || '无描述'}</td>
                <td class="px-4 py-4">
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${isRunning ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}">
                        ${isRunning ? '运行中' : '未运行'}
                    </span>
                </td>
                <td class="px-4 py-4">
                    <button class="text-primary-600 hover:text-primary-800 view-app-details" data-app-id="${app.id}">
                        编辑服务
                    </button>
                    ${isRunning ? `
                    <button class="text-primary-600 hover:text-primary-800 ml-4 view-details" data-service-id="${app.id}">
                        查看服务状态
                    </button>` : ''}
                </td>
                <td class="px-4 py-4 text-right">
                    ${isRunning ? 
                        `<button class="inline-flex items-center px-2.5 py-1.5 bg-red-50 text-red-700 hover:bg-red-100 text-xs font-medium rounded transition-colors stop-service" data-service-id="${app.id}">
                            <svg class="w-3 h-3 mr-1" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M6 6h12v12H6z" fill="currentColor"/>
                            </svg>
                            停止
                        </button>` : 
                        `<button class="inline-flex items-center px-2.5 py-1.5 bg-green-50 text-green-700 hover:bg-green-100 text-xs font-medium rounded transition-colors start-service" data-app-id="${app.id}">
                            <svg class="w-3 h-3 mr-1" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M8 5v14l11-7-11-7z" fill="currentColor"/>
                            </svg>
                            启动
                        </button>`
                    }
                </td>
            `;
            tableBody.appendChild(row);
        });
        
        // 添加事件监听器
        document.querySelectorAll('.stop-service').forEach(btn => {
            btn.addEventListener('click', event => {
                const serviceId = event.currentTarget.getAttribute('data-service-id');
                this.stopService(serviceId);
            });
        });
        
        document.querySelectorAll('.start-service').forEach(btn => {
            btn.addEventListener('click', event => {
                const appId = event.currentTarget.getAttribute('data-app-id');
                this.startService(appId);
            });
        });
        
        document.querySelectorAll('.view-details').forEach(btn => {
            btn.addEventListener('click', event => {
                const serviceId = event.currentTarget.getAttribute('data-service-id');
                this.showServiceDetails(serviceId);
            });
        });
        
        document.querySelectorAll('.view-app-details').forEach(btn => {
            btn.addEventListener('click', event => {
                const appId = event.currentTarget.getAttribute('data-app-id');
                window.open(`edit.html?id=${appId}`)
            });
        });
        
        // 更新显示
        document.getElementById('noServicesMessage').classList.add('hidden');
    }
    
    /**
     * 过滤应用
     */
    filterApps() {
        const searchValue = document.getElementById('searchApp').value.toLowerCase();
        const rows = document.getElementById('serviceTableBody').querySelectorAll('tr');
        
        let visibleCount = 0;
        
        for (let row of rows) {
            const appId = row.cells[0].textContent.trim().toLowerCase();
            const appName = row.cells[1].textContent.trim().toLowerCase();
            const appDesc = row.cells[2].textContent.trim().toLowerCase();
            
            if (appId.includes(searchValue) || appName.includes(searchValue) || appDesc.includes(searchValue)) {
                row.style.display = '';
                visibleCount++;
            } else {
                row.style.display = 'none';
            }
        }
        
        // 显示或隐藏"没有找到应用"消息
        if (visibleCount === 0 && this.allApps.length > 0) {
            document.getElementById('noServicesMessage').textContent = '没有匹配的应用';
            document.getElementById('noServicesMessage').classList.remove('hidden');
        } else if (this.allApps.length === 0) {
            document.getElementById('noServicesMessage').textContent = '没有找到应用';
            document.getElementById('noServicesMessage').classList.remove('hidden');
        } else {
            document.getElementById('noServicesMessage').classList.add('hidden');
        }
    }
    
    /**
     * 停止服务
     * @param {string} serviceId 服务ID
     */
    stopService(serviceId) {
        if (!confirm(`确定要停止服务 #${serviceId} 吗？`)) return;
        
        fetch(`${this.API_BASE}/service/stop`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ id: serviceId })
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                this.showNotification(`服务 #${serviceId} 已停止`, 'success');
                // 重新加载数据
                setTimeout(this.loadAllData, 1000);
            } else {
                throw new Error(data.message || '停止服务失败');
            }
        })
        .catch(error => {
            console.error('Error stopping service:', error);
            this.showNotification(`停止服务失败: ${error.message}`, 'danger');
        });
    }
    
    /**
     * 从详情模态框停止服务
     */
    stopServiceFromDetails() {
        const serviceId = document.getElementById('serviceModalId').textContent;
        if (serviceId !== '-') {
            this.stopService(serviceId);
            UIkit.modal('#service-details-modal').hide();
        }
    }
    
    /**
     * 显示服务详情
     * @param {string} serviceId 服务ID
     */
    showServiceDetails(serviceId) {
        // 重置详情模态框
        document.getElementById('serviceStatusLoading').classList.remove('hidden');
        document.getElementById('serviceStatusContent').classList.add('hidden');
        document.getElementById('serviceStatusError').classList.add('hidden');
        document.getElementById('serviceModalId').textContent = serviceId;
        
        // 设置服务地址
        document.getElementById('serviceModalAddress').textContent = `http://${location.host}/mcp/${serviceId}/sse`;
        
        // 打开模态框
        UIkit.modal('#service-details-modal').show();
        
        // 预先设置状态 - 因为我们已经知道服务在运行
        const statusEl = document.getElementById('serviceModalStatus');
        statusEl.innerHTML = `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">运行中</span>`;
        
        // 加载服务详情
        fetch(`${this.API_BASE}/service/status/${serviceId}`)
            .then(response => {
                if (!response.ok) throw new Error('无法获取服务状态');
                return response.json();
            })
            .then(data => {
                document.getElementById('serviceStatusLoading').classList.add('hidden');
                document.getElementById('serviceStatusContent').classList.remove('hidden');
                
                // 无需重新设置状态，我们已经知道它是运行的
                // 否则就不会显示这个详情模态框
                
                // 更新详细信息
                document.getElementById('serviceModalDetails').textContent = JSON.stringify(data, null, 2);
            })
            .catch(error => {
                console.error('Error fetching service details:', error);
                document.getElementById('serviceStatusLoading').classList.add('hidden');
                document.getElementById('serviceStatusError').classList.remove('hidden');
                document.getElementById('serviceStatusError').textContent = error.message;
            });
    }
    
    /**
     * 刷新服务详情
     */
    refreshServiceDetails() {
        const serviceId = document.getElementById('serviceModalId').textContent;
        if (serviceId !== '-') {
            this.showServiceDetails(serviceId);
        }
    }
    
    /**
     * 显示应用详情
     * @param {string} appId 应用ID
     */
    showAppDetails(appId) {
        this.selectedAppId = appId;
        
        // 重置详情模态框
        document.getElementById('appModalTitle').textContent = '应用详情';
        document.getElementById('appModalDescription').textContent = '加载中...';
        document.getElementById('appModalConfig').textContent = '加载中...';
        
        // 打开模态框
        UIkit.modal('#app-details-modal').show();
        
        // 加载应用详情
        fetch(`${this.API_BASE}/app/${appId}`)
            .then(response => response.json())
            .then(app => {
                document.getElementById('appModalTitle').textContent = app.name || `应用 #${app.id}`;
                document.getElementById('appModalDescription').textContent = app.description || '无描述';
                document.getElementById('appModalConfig').textContent = JSON.stringify(JSON.parse(app.config), null, 2);
                
                // 判断服务是否已运行
                const isRunning = this.runningServices.includes(appId.toString());
                const startBtn = document.getElementById('startServiceBtn');
                
                if (isRunning) {
                    startBtn.classList.add('bg-gray-400', 'cursor-not-allowed');
                    startBtn.classList.remove('bg-green-600', 'hover:bg-green-700');
                    startBtn.textContent = '服务已运行';
                    startBtn.disabled = true;
                } else {
                    startBtn.classList.remove('bg-gray-400', 'cursor-not-allowed');
                    startBtn.classList.add('bg-green-600', 'hover:bg-green-700');
                    startBtn.innerHTML = `
                        <svg class="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M8 5v14l11-7-11-7z" fill="currentColor"/>
                        </svg>
                        启动服务
                    `;
                    startBtn.disabled = false;
                }
            })
            .catch(error => {
                console.error('Error fetching app details:', error);
                document.getElementById('appModalTitle').textContent = '加载失败';
                document.getElementById('appModalDescription').textContent = '无法获取应用详情';
                document.getElementById('appModalConfig').textContent = '加载失败';
            });
    }
    
    /**
     * 启动服务
     * @param {string} appId 应用ID
     */
    startService(appId) {
        fetch(`${this.API_BASE}/service/start`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ id: appId })
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('启动服务失败');
            }
            return response.json();
        })
        .then(data => {
            this.showNotification(`服务 #${appId} 正在启动`, 'success');
            
            // 1秒后重新加载数据
            setTimeout(this.loadAllData, 1000);
        })
        .catch(error => {
            console.error('Error starting service:', error);
            this.showNotification(`启动服务失败: ${error.message}`, 'danger');
        });
    }
    
    /**
     * 启动当前选中的服务
     */
    startSelectedService() {
        if (this.selectedAppId) {
            this.startService(this.selectedAppId);
            UIkit.modal('#app-details-modal').hide();
        }
    }
}