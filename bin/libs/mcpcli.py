import asyncio
import json
import logging


class MCPCli:

    def __init__(self, config, **kwargs):
        self.rpcid = 0
        self.rpc_responses = {}
        self.config = config
        self.name = kwargs.get('name')
        self.timeout = kwargs.get('timeout', 60)
        self.config['type'] = 'sse' if config.get('baseUrl') else 'stdio'
        self.write = None
        self.tools = None
        self.process = None
        logging.info('created Mcpcli instance')


    async def request(self, method, params, with_response=True, with_timeout=None):
        assert self.write, "Connection not established"
        
        if with_response:
            self.rpcid += 1
            json_rpc_data = {'method': method, 'params': params, 'jsonrpc': '2.0', 'id': self.rpcid}
            fut = asyncio.Future()
            self.rpc_responses[self.rpcid] = fut
            logging.debug(f"Sending request: {json_rpc_data}")
            await self.write(json.dumps(json_rpc_data).encode() + b'\n')
            try:
                return await asyncio.wait_for(fut, timeout=with_timeout or self.timeout)
            except asyncio.TimeoutError:
                raise TimeoutError(f"Timeout waiting for response to {method}({params})")
        else:
            json_rpc_data = {'method': method, 'params': params, 'jsonrpc': '2.0'}
            await self.write(json.dumps(json_rpc_data).encode() + b'\n')


    async def init(self):
        if self.config['type'] == 'stdio':
            await self.start_stdio_mcp()
        elif self.config['type'] == 'sse':
            await self.start_sse()


    def close(self):
        if self.config['type'] == 'stdio':
            self.process.terminate()
        elif self.config['type'] == 'sse':
            asyncio.ensure_future(self.process.aclose())


    async def start_sse(self):
        import urllib.parse
        from httpx_sse import EventSource
        import httpx
        client = httpx.AsyncClient(verify=False, timeout=httpx.Timeout(None, connect=10.0))
        session_addr = None
        is_connected = asyncio.Future()

        async def start_loop():
            try:
                async with client.stream('GET', self.config['baseUrl']) as response:
                    self.process = client
                    event_source = EventSource(response)
                    async for event in event_source.aiter_sse():
                        if client.is_closed: break
                        if event.event == 'endpoint':
                            session_addr = event.data if event.data.startswith('http') else urllib.parse.urljoin(self.config['baseUrl'], event.data)
                            is_connected.set_result(session_addr)
                        elif event.event == 'message':
                            try:
                                data = json.loads(event.data)
                                if data.get('id') and data.get('result'):
                                    future = self.rpc_responses.get(data['id'])
                                    if future: future.set_result(data)
                            except json.JSONDecodeError:
                                logging.warning(f"Failed to decode JSON: {repr(event.data)}")
            except Exception as e:
                await client.aclose()

        def writer(data):
            return client.post(session_addr, data=data)

        
        asyncio.ensure_future(start_loop())
        session_addr = await is_connected
        self.write = writer
        await self.request('initialize', {'protocolVersion':'2024-11-05', 'capabilities': {}, 'clientInfo': {'name': 'EzMCPCli', 'version': '0.1.2'}}, with_response=False)
        await self.request('notifications/initialized', {}, with_response=False)
        r = await self.request('tools/list', {}, with_timeout=10)
        self.tools = r.get('result', {}).get('tools', [])


    
    async def start_stdio_mcp(self):
        proc = await asyncio.create_subprocess_exec(
            self.config['command'],
            *self.config['args'],
            env=self.config.get('env', None),
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        self.process = proc

        async def writer(data):
            proc.stdin.write(data)

        self.write = writer

        async def start_loop():
            while True:
                line = await proc.stdout.readline()
                if not line:
                    break
                try:
                    data = json.loads(line.decode())
                    if 'id' in data and data['id'] in self.rpc_responses:
                        self.rpc_responses[data['id']].set_result(data)
                        del self.rpc_responses[data['id']]
                    else:
                        logging.debug(f"Received notification: {data}")
                except json.JSONDecodeError as e:
                    logging.warning(f"Failed to decode JSON: {repr(line)}")

        asyncio.ensure_future(start_loop())

        await self.request('initialize', {'protocolVersion':'2024-11-05', 'capabilities': {}, 'clientInfo': {'name': 'EzMCPCli', 'version': '0.1.2'}}, with_response=False)
        await self.request('notifications/initialized', {}, with_response=False)
        r = await self.request('tools/list', {}, with_timeout=30)
        self.tools = r.get('result', {}).get('tools', [])

