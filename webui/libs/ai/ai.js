// Version: 1.1.0
(function(global) {
  class AI {
    constructor(options = {}) {
      this.api_key = options.api_key || options.apiKey || '';
      this.baseURL = options.baseURL || options.endpoint || 'https://porky.toai.chat/to/openrouter';
      this.completionsURI = options.completionsURI === undefined ? '/chat/completions' : '';
      this.model = options.model || 'deepseek/deepseek-r1-distill-qwen-32b:free';
      this.messages = options.messages || [];
      this.system_prompt = options.system_prompt || options.sysprompt || '';
      this.abortController = null;
      this.toolFn = options.tool_fn || options.mcpserver || null;
      this.opts = { temperature: 0.7, max_tokens: 128000, top_p: 1, stream: true, ...options.opts };
      this.completions = { create: this.create.bind(this) };
      this.filters = {}; 

      this.add_response_filter('reasoning', data=>!!data.choices?.[0]?.delta?.reasoning);
      
      return this;
    }
    
    add_response_filter(queue_name, filterFn) {
      if (!this.filters[queue_name]) this.filters[queue_name] = [];
      this.filters[queue_name].push(filterFn);
      return this;
    }
    
    cancel() { 
      if (this.abortController) {
        this.abortController.abort();
        this.abortController = null;
      }
    }
    
    async create(prompt, args) {
      const { options={}, images=[], audio=[], files=[] } = args || {};

      const messages = [...(options.messages || this.messages || [])];
      if (this.system_prompt) messages.unshift({ role: 'system', content: this.system_prompt });
      if (prompt || images?.length || audio?.length || files?.length) 
        messages.push(this.prepareUserMessage(prompt, { images, audio, files }));
      
      const reqOptions = {
        model: options.model || this.model,
        messages,
        temperature: options.temperature || this.opts.temperature,
        max_tokens: options.max_tokens || this.opts.max_tokens,
        top_p: options.top_p || this.opts.top_p,
        stream: options.stream !== undefined ? options.stream : this.opts.stream,
        ...(this.toolFn?.tools && { tools: this.toolFn.tools, tool_choice: options.tool_choice || "auto" })
      };
      
      this.abortController = new AbortController();
      
      try {
        const response = await fetch(`${this.baseURL}${this.completionsURI}`, {
          method: 'POST', 
          headers: {
            'Content-Type': 'application/json',
            ...(this.api_key ? { 'Authorization': `Bearer ${this.api_key}` } : {})
          },
          body: JSON.stringify(reqOptions),
          signal: this.abortController.signal
        });
        
        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          throw new Error(`API错误: ${response.status} ${error.error?.message || ''}`);
        }
        
        if (!reqOptions.stream) {
          const result = await response.json();
          return new ResponseIterator({ 
            type: 'final', 
            message: result.choices?.[0]?.message || { role: 'assistant', content: '' }, 
            ai: this, final: true,
            filters: this.filters
          });
        }
        
        const iter = new ResponseIterator({ ai: this, reqOptions, filters: this.filters });
        this.processStream(response, iter);
        return iter;
      } catch (error) { throw error; }
    }
    
    async processStream(response, iter) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const msg = { role: 'assistant', content: '' }; // 移除 reasoning_content 字段
      const toolCalls = [];
      let buffer = '';
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          
          for (const line of lines) {
            const event = this.parseSSELine(line);
            if (!event) continue;
            
            if (event.isDone) {
              await this.finalizeResponse(msg, toolCalls, iter);
              return;
            }
            
            await this.processEvent(event, msg, toolCalls, iter);
          }
        }
        
        // 处理最后可能的缓冲数据
        if (buffer.trim()) {
          const event = this.parseSSELine(buffer);
          if (event && !event.isDone) {
            await this.processEvent(event, msg, toolCalls, iter);
          }
        }
        
        await this.finalizeResponse(msg, toolCalls, iter);
      } catch (error) {
        iter.error(error);
      } finally {
        reader.releaseLock();
        this.abortController = null;
      }
    }
    
    parseSSELine(line) {
      line = line.trim();
      if (!line) return null;
      
      // 检测[DONE]标记
      if (line === 'data: [DONE]') {
        return { isDone: true };
      }
      
      // 解析数据
      let eventType = '';
      let data = '';
      
      if (line.startsWith('event:')) {
        eventType = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        data = line.slice(5).trim();
        try {
          return { type: eventType || 'content', data: JSON.parse(data), isDone: false };
        } catch (e) {
          return { type: eventType || 'content', data, isDone: false, raw: true };
        }
      } else {
        try {
          return { type: 'content', data: JSON.parse(line), isDone: false };
        } catch (e) {
          return { type: 'content', data: line, isDone: false, raw: true };
        }
      }
      
      return null;
    }
    
    async processEvent(event, msg, toolCalls, iter) {
      const { type, data, raw } = event;

      // 应用过滤器并推送到队列
      Object.keys(this.filters).forEach((filter_name)=>{
        const filter = this.filters[filter_name];
        const shouldpush = filter.some(f=>f(data))
        if (shouldpush) {
          iter.push(filter_name, { type: filter_name, message: {...msg}, delta: data });
        }
      })

      // 处理对象数据
      if (!raw && typeof data === 'object') {
        // 处理工具调用
        if (data.choices && data.choices[0]?.delta?.tool_calls) {
          this.updateToolCalls(data.choices[0].delta.tool_calls, toolCalls);
          iter.push('tool_calls', { type: 'tool_calls', toolCalls: [...toolCalls], message: {...msg}, delta: data });

          if (data.choices[0].finish_reason === 'tool_calls') {
            msg.tool_calls = [...toolCalls];
            iter.push('tool_request', { type: 'tool_request', toolCalls: [...toolCalls], message: {...msg} });
            return await this.handleToolCalls(msg, toolCalls, iter);
          }
          return;
        }

        // 处理内容更新
        const content = data.choices?.[0]?.delta?.content || '';
        if (content) {
          msg.content += content;
          iter.push('content', { type: 'content', content, message: {...msg}, delta: content });
          return;
        }
      } else {
        // 处理字符串和其他类型的数据
        switch (type) {
          case 'tool_calls':
            if (Array.isArray(data)) {
              this.updateToolCalls(data, toolCalls);
              iter.push('tool_calls', { type, toolCalls: [...toolCalls], message: {...msg}, delta: data });

              if (toolCalls.every(t => t.function?.arguments)) {
                msg.tool_calls = [...toolCalls];
                iter.push('tool_request', { type: 'tool_request', toolCalls: [...toolCalls], message: {...msg} });
                return await this.handleToolCalls(msg, toolCalls, iter);
              }
            }
            break;
          case 'content':
            if (data) {
              msg.content += data;
              iter.push('content', { type, content: data, message: {...msg}, delta: data });
            }
            break;
        }
      }
    }
    
    async finalizeResponse(msg, toolCalls, iter) {
      if (toolCalls.length > 0 && toolCalls.every(t => t.function?.name)) {
        msg.tool_calls = [...toolCalls];
        iter.push('tool_request', { type: 'tool_request', toolCalls: [...toolCalls], message: {...msg} });
        return await this.handleToolCalls(msg, toolCalls, iter);
      } else {
        iter.push('final', { type: 'final', message: msg });
        iter.complete();
      }
    }
    
    async handleToolCalls(msg, toolCalls, iter) {
      if (!this.toolFn) {
        iter.push('final', { type: 'final', message: msg });
        iter.complete();
        return;
      }
      
      const results = await Promise.all(toolCalls.map(async tool => {
        try {
          const args = JSON.parse(tool.function.arguments);
          const result = await this.toolFn.execute(tool.function.name, args);
          return {
            tool_call_id: tool.id, 
            role: "tool",
            content: typeof result === 'string' ? result : JSON.stringify(result)
          };
        } catch (err) { 
          return { 
            tool_call_id: tool.id, 
            role: "tool", 
            content: JSON.stringify({ error: err.message }) 
          }; 
        }
      }));
      
      iter.push('tool_response', { type: 'tool_response', toolResults: results, toolCalls });
      
      try {
        // 继续对话，将工具结果添加到消息历史中
        const nextResponse = await this.create("", { 
          options: {
            ...iter.reqOptions,
            messages: [
              ...iter.reqOptions.messages, 
              {...msg},
              ...results.map(r => ({ 
                role: "tool", 
                tool_call_id: r.tool_call_id, 
                content: r.content 
              }))
            ],
            tool_choice: "auto"
          }
        });
        iter.chainWith(nextResponse);
      } catch (error) { iter.error(error); }
    }
    
    prepareUserMessage(message, { images, audio, files } = {}) {
      if ((!images?.length) && (!audio?.length) && (!files?.length)) 
        return { role: "user", content: message };
      
      const content = [];
      if (message?.trim()) content.push({ type: "text", text: message });
      
      if (images?.length) images.forEach(img => content.push({
        type: "image_url", image_url: { url: img.url || img, detail: img.detail || "auto" }
      }));
      
      if (audio?.length) audio.forEach(clip => 
        content.push({ type: "audio", audio: { url: clip.url || clip } }));
      
      if (files?.length) files.forEach(file => 
        content.push({ type: "file", file: { url: file.url || file } }));
      
      return { role: "user", content };
    }
    
    updateToolCalls(deltas, toolCalls) {
      if (!Array.isArray(deltas)) return;
      
      deltas.forEach(d => {
        const idx = d.index;
        if (!toolCalls[idx]) toolCalls[idx] = { 
          id: d.id || '', type: 'function', function: { name: '', arguments: '' } 
        };
        
        if (d.id) toolCalls[idx].id = d.id;
        if (d.function?.name) toolCalls[idx].function.name = d.function.name;
        if (d.function?.arguments) toolCalls[idx].function.arguments += d.function.arguments;
      });
    }
  }

  class ResponseIterator {
    constructor({ ai, reqOptions, type, message, final = false, filters = {} }) {
      this.ai = ai;
      this.reqOptions = reqOptions;
      this.queues = new Map();
      this.waiters = new Map();
      this.chained = null;
      this.completed = false;
      this.filters = filters;
      
      // 创建所有队列 - 移除 reasoning_content
      ['content', 'tool_calls', 'tool_request', 
       'tool_response', 'streaming', 'final', ...Object.keys(filters)].forEach(t => {
        this.queues.set(t, []);
        this.waiters.set(t, []);
      });
      
      if (final && type && message) {
        this.push(type, { type, message });
        this.complete();
      }
    }
    
    push(type, data) {
      if (this.completed) return;
      // 仅处理基本队列
      const queue = this.queues.get(type) || [];
      const waiters = this.waiters.get(type) || [];
      queue.push(data);
      if (waiters.length) waiters.shift()();
    }
    
    complete() {
      this.completed = true;
      for (const waiters of this.waiters.values()) waiters.forEach(r => r());
    }
    
    chainWith(r) { this.chained = r; this.complete(); }
    error(e) { this.errorObj = e; this.complete(); }
    
    on(type) {
      if (!this.queues.has(type)) throw new Error(`未知事件类型: ${type}`);
      const self = this;
      
      return {
        async *[Symbol.asyncIterator]() {
          try {
            if (self.errorObj) throw self.errorObj;
            let queue = self.queues.get(type), index = 0;
            
            while (true) {
              if (index >= queue.length) {
                if (self.completed && !self.chained) break;
                if (self.chained) { 
                  for await (const item of self.chained.on(type)) yield item;
                  break;
                }
                
                await new Promise(r => self.waiters.get(type).push(r));
                if (self.errorObj) throw self.errorObj;
                queue = self.queues.get(type);
              } else yield queue[index++];
            }
          } catch (e) { throw e; }
        }
      };
    }
    
    async *[Symbol.asyncIterator]() { yield* this.on('streaming'); }
  }

  global.AI = AI;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AI };
  } else if (typeof define === 'function' && define.amd) {
    define(function() { return { AI }; });
  }
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);