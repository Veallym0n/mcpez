(function(global) {
class MCPCli {
    constructor(server, {fetcher=fetch, timeout=60000, format='openai'}={}) {
        this.server = server||'https://mcp-main.toai.chat/sse';
        this.endpoint = null;
        this.jsonrpc_id = 0;
        this.responses = {}
        this._tools = null
        this._format = format
        this.tools = []
        this.timeout = timeout
        this.fetcher = fetcher
        this.stream = null
    }

    eventLoop(options) {
        const { resolve, reject, timeout } = options;
        const Stream = new EventSource(this.server);
        this.stream = Stream

        setTimeout(()=>{
            if(!this.endpoint) { reject('timeout');Stream.close()}
        }, timeout||this.timeout||60000)

        Stream.addEventListener('message', (event) => {
            const data = JSON.parse(event.data);
            this.responses[data.id] && this.responses[data.id](data)
        });

        Stream.addEventListener('endpoint', (event) => {
            this.endpoint = event.data.startsWith('/') ? new URL(event.data, new URL(this.server)).toString() : event.data;
            resolve(this.endpoint)
        });
    }

    async connect(timeout) {
        await (new Promise((resolve, reject) => { this.eventLoop({resolve, reject, timeout});}))
        await this.send('initialize', {'protocolVersion':'2024-11-05', 'capabilities': {}, 'clientInfo': {'name': 'JSMCPCli', 'version': '0.1.0'}})
        this.send('notifications/initialized', {}, {idpp:false})
        this._tools = await this.send('tools/list')
        this.tools = this.transform(this._format)
        return this
    }

    close() {
        this.stream.close()
    }

    send(method, params={}, args={}) {
        const { idpp=true, timeout=this.timeout } = args;
        return new Promise((resolve, reject) => {
            idpp ? this.jsonrpc_id++ : null
            const bodyObject = { jsonrpc: '2.0', id: this.jsonrpc_id, method: method, params: params }
            setTimeout(()=>{
                if (!this.responses[this.jsonrpc_id]) return
                delete this.responses[this.jsonrpc_id]
                reject('timeout')
            }, timeout);
            this.responses[this.jsonrpc_id] = (data) => {
                if (!this.responses[this.jsonrpc_id]) return
                delete this.responses[this.jsonrpc_id]
                resolve(data.result)
            }
            fetch(this.endpoint, {method: 'POST', body: JSON.stringify(bodyObject),headers: { 'Content-Type': 'application/json' }})
        })
    }

    transform (format) {
        if (!this._tools) return []
        if (format === 'claude') return this._tools.tools
        if (format === 'openai') {
            return this._tools.tools.map(tool => {
                return {
                    type: 'function',
                    function: {
                        name: tool.name,
                        description: tool.description,
                        parameters: {
                            type: 'object',
                            properties: tool.inputSchema.properties,
                            required: tool.inputSchema.required,
                            additionalProperties: false
                        },
                        strict: true
                    },
                }
            })
        }
    }

    execute(name, args) {
        return this.send('tools/call', {name:name, arguments:args})
    }

  }

  global.MCPCli = MCPCli;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MCPCli };
  } else if (typeof define === 'function' && define.amd) {
    define(function() { return { MCPCli }; });
  }
  
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);

//(new MCPCli()).connect().then(cli=>cli.execute('get_stock_price', {symbol:'AAPL'})).then(console.log).catch(console.error)
