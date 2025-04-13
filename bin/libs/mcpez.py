from libs.mcpcli import MCPCli
from libs.mcphandler import make_mcp_handlers
import copy
import os

class MCPEazy:

    def __init__(self, name, description=''):
        self.servers = {}
        self.name = name
        self.description = description
        self.functions = {}
        self.ctxStore = None
        self.pathroute = None
        self.apps = None

    async def add_mcp_server(self, name, config):
        subsrv = MCPCli(config)
        await subsrv.init()
        self.servers[name] = subsrv
        return self.servers[name]

    async def add_to_server(self, app, pathroute=''):
        self.apps = app
        self.pathroute = pathroute
        make_mcp_handlers(app, self, pathroute=pathroute, name=self.name)

    async def stop(self):
        names = list(self.servers.keys())
        for name in names:
            srv = self.servers.pop(name, None)
            srv.close()
        for route in self.apps.default_router.rules[0].target.rules:
            if route.target_kwargs.get('name') == self.name:
                self.apps.default_router.rules[0].target.rules.remove(route)

    def get_tools(self, openai=None):
        tools = []
        self.functions = {}
        for srv in self.servers.values():
            for tool in srv.tools:
                namehash = os.urandom(5).hex()
                self.functions[namehash] = {'name':tool['name'], 'srv':srv}
                _tool = copy.deepcopy(tool)
                _tool['name'] = namehash
                tools.append(_tool)
        return tools

    async def list_tools(self, req, session):
        await session.write_jsonrpc(req['id'], {'tools':self.get_tools()})

    async def call_tools(self, req, session):
        name = req['params'].get('name')
        if name not in self.functions:
            return await session.write_jsonrpc(req['id'], {'error': {'code': -32601, 'message': f"Method {name} not found"}})
        _srv = self.functions[name]
        try:
            req['params']['name'] = _srv['name']
            result = await _srv['srv'].request('tools/call', req['params'])
            return await session.write_jsonrpc(req['id'], {'result': result.get('result')})
        except Exception as e:
            return await session.write_jsonrpc(req['id'], {'error': {'code': -32603, 'message': str(e)}})