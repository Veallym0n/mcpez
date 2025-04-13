from tornado.web import RequestHandler
import json
import os
import logging
import time


class SSEServer(RequestHandler):

    def initialize(self, *args, **kwargs):
        self._auto_finish = False
        self.ctxStore = kwargs.get('ctxStore')
        self.pathroute = kwargs.get('pathroute', '')

    def set_default_headers(self):
        self.set_header('Content-Type', 'text/event-stream')
        self.set_header('Cache-Control', 'no-cache')
        self.set_header('Connection', 'keep-alive')
        self.set_header('Access-Control-Allow-Origin', '*')
        self.set_header('Access-Control-Allow-Headers', 'Content-Type')
        self.set_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')

    def options(self): self.set_status(204)

    async def get(self):
        self.ctxid = os.urandom(16).hex()
        self.ctxStore[self.ctxid] = self
        await self.write_sse(self.pathroute+'/messages/?session_id=' + self.ctxid, 'endpoint')

    async def write_sse(self, data, event='message'):
        self.write('event: ' + event + '\r\ndata: ' + data + '\r\n\r\n')
        await self.flush()

    async def write_jsonrpc(self, req_id, result):
        response = {'jsonrpc': '2.0', 'id': req_id, 'result': result}
        await self.write_sse( json.dumps(response) )

    def on_connection_close(self):
        if not hasattr(self, 'ctxid'): return
        self.ctxStore.pop(self.ctxid, None)




class RPCServer(RequestHandler):

    def initialize(self, *args, **kwargs):
        self.executor = kwargs.get('executor')
        self.ctxStore = kwargs.get('ctxStore')

    def set_default_headers(self):
        self.set_header('Content-Type', 'text/event-stream')
        self.set_header('Cache-Control', 'no-cache')
        self.set_header('Connection', 'keep-alive')
        self.set_header('Access-Control-Allow-Origin', '*')
        self.set_header('Access-Control-Allow-Headers', 'Content-Type')
        self.set_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')

    def options(self): self.set_status(204)

    async def post(self):
        ctxid = self.get_argument('session_id')
        session = self.ctxStore.get(ctxid)
        req = json.loads(self.request.body)
        req_method = req.get('method')
        func = self.for_name(req_method)
        if func: await func(req, session)
        self.set_status(202)
        self.finish('Accepted')

    def for_name(self, method):
        return getattr(self, 'with_' + method.replace('/', '_'), None)

    async def with_initialize(self, req, session):
        req_id = req.get('id')
        result = {"protocolVersion":"2024-11-05","capabilities":{"experimental":{},"prompts":{"listChanged":False},"resources":{"subscribe":False,"listChanged":False},"tools":{"listChanged":False}},"serverInfo":{"name":"mcpsrv","version":"1.3.0"}}
        await session.write_jsonrpc(req_id, result)

    async def with_tools_list(self, req, session):
        try:
            self.executor and await self.executor.list_tools(req, session)
        except Exception as e:
            await session.write_jsonrpc(req['id'], {'tools': []})
    
    async def with_ping(self, req, session):
        req_id = req.get('id')
        result = {}
        await session.write_jsonrpc(req_id, result)

    async def with_tools_call(self, req, session):
        try:
            self.executor and await self.executor.call_tools(req, session)
        except Exception as e:
            await session.write_jsonrpc(req['id'], {'result': 'error'})







class ServerStatus(RequestHandler):
    def initialize(self, *args, **kwargs):
        self.ctxStore = kwargs.get('ctxStore')
        self.init_time = kwargs.get('init_time')
        self.name = kwargs.get('name')
        self.executor = kwargs.get('executor')


    def set_default_headers(self):
        self.set_header('Content-Type', 'application/json')
        self.set_header('Cache-Control', 'no-cache')
        self.set_header('Connection', 'keep-alive')
        self.set_header('Access-Control-Allow-Origin', '*')
        self.set_header('Access-Control-Allow-Headers', 'Content-Type')
        self.set_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')

    def options(self): self.set_status(204)

    async def get(self):
        self.finish(dict(
            name = self.name,
            description = self.executor.description,
            init_time = self.init_time,
            status = 'ok',
            connection_cnt = len(self.ctxStore),
            tools = self.executor.get_tools()
            ))




def make_mcp_handlers(application, executor, pathroute='',name=''):
    ctxStore = {}
    executor.ctxStore = ctxStore
    executor.pathroute = pathroute
    application.add_handlers('.*', [
        (pathroute + '/sse', SSEServer, {'ctxStore': ctxStore, 'pathroute': pathroute, 'name':name}),
        (pathroute + '/messages/', RPCServer, {'executor': executor, 'ctxStore': ctxStore, 'name':name}),
        (pathroute + '/server_status', ServerStatus, {'ctxStore': ctxStore,  'executor': executor, 'name': name, 'init_time': int(time.time())}),
    ])