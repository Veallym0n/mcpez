import asyncio
import json
import tornado.web
import argparse
import sys, os
import logging

from tornado.httpserver import HTTPServer
from tornado.netutil import bind_unix_socket

from libs.mcpez import MCPEazy
from sqlmodel import Field, SQLModel, Session, create_engine

logging.basicConfig(level=logging.DEBUG)


optparser = argparse.ArgumentParser(description='MCP代理服务，支持从文件或数据库加载配置')
optparser.add_argument('-c', '--id', type=int, default=0, help='app id')
optparser.add_argument('-s', '--socketdir', default='/var/run/mcpez', help='服务器端口号，也可以是一个uds路径，')
optparser.add_argument('-n', '--name', default='mcpproxy',help='代理服务名称')
optargs = optparser.parse_args()

class AppDB(SQLModel, table=True):
    id: int = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    description: str = Field(default='')
    item_type: str = Field(index=True)
    config: str
    functions: str = None
    create_at: int = None
    modify_at: int = None


class MCPProxy(MCPEazy):
    def __init__(self, name="MCPProxy"):
        super().__init__(name)
    
    async def load_config_from_db(self, app_id):
        engine = create_engine('sqlite:///./mcpez.db')
        with Session(engine) as session:
            try:
                app = session.get(AppDB, app_id)
                if not app: raise Exception('Config is not Found')
                if app.item_type != 'app': raise Exception('item is not a app')
                self.name = app.name
                self.description = app.description
                return json.loads(app.config)
            except Exception as e:
                logging.error(e)
                sys.exit(1)
    
    async def load_config(self):
        try:
            config = await self.load_config_from_db(optargs.id)
            active_servers = []
            for name, server_config in config.get('mcpServers', {}).items():
                try:
                    await self.add_mcp_server(name, server_config)
                    active_servers.append(name)
                except Exception as e:
                    logging.error(e)
            
            if not active_servers: raise Exception('no active servers found')
            return active_servers
        except Exception as e:
            logging.error(f"配置加载失败: {str(e)}")
            return []
    
    @staticmethod
    async def start():
        proxy = MCPProxy(name=optargs.name)
        await proxy.load_config()
        app = tornado.web.Application(debug=True)
        await proxy.add_to_server(app, pathroute=f"/mcp/{optargs.id}")
        server = HTTPServer(app)
        socket_file = f"{optargs.socketdir}/{optargs.id}.sock"
        server.add_socket(bind_unix_socket(socket_file))
        os.system(f"chmod 777 {socket_file}")
        logging.info(f"HTTP Server runing at unix:{socket_file}:/mcp/{optargs.id}/sse")
        server.start()


async def main():
    await MCPProxy.start()
    await asyncio.Event().wait()


if __name__ == "__main__":
    asyncio.run(main())