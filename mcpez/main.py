import json
import time
import asyncio
import httpx
import hashlib


from fastapi import FastAPI, Request, Response, Depends, HTTPException, Query
from typing import Optional
from sqlmodel import Field, SQLModel, Session, create_engine, select, Column, VARCHAR
from contextlib import asynccontextmanager
from fastapi.middleware.cors import CORSMiddleware  # 添加CORS中间件


# 数据库配置
DATABASE_URL = "sqlite:///./mcpez.db"
engine = create_engine(DATABASE_URL)

class appDB(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)  # 应用的名称
    description: Optional[str] = Field(default='') # 应用的描述    
    item_type: str = Field(index=True)  # tool / app - 修改字段名避免与Python关键字冲突
    hashcode: str = Field(sa_column=Column("hashcode", VARCHAR, unique=True))
    config: str         # { "mcpServers": { "server1": {}, "server2": {} } }
    functions: Optional[str] = Field(default=None)  # 函数列表
    create_at: Optional[int] = Field(default=None)
    modify_at: Optional[int] = Field(default=None)


def create_db_and_tables():
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动时执行
    create_db_and_tables()
    yield
    # 关闭时执行（如果有的话）


app = FastAPI(lifespan=lifespan)

# 添加CORS中间件配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 允许所有来源，生产环境建议设置为特定的域名
    allow_credentials=True,
    allow_methods=["*"],  # 允许所有HTTP方法
    allow_headers=["*"],  # 允许所有请求头
)

# 列出数据库里所有的保存的MCP服务的配置
@app.get("/app/list")
async def list_apps(session: Session = Depends(get_session)):
    apps = session.exec(select(appDB).where(appDB.item_type == "app")).all()
    return apps


# 搜索数据库里的所有的MCP服务名称
@app.api_route("/app/search", methods=["GET"])
async def search_apps(query: str = Query(...), session: Session = Depends(get_session)):
    apps = session.exec(select(appDB).where(
        (appDB.item_type == "app") & 
        (appDB.name.contains(query) | appDB.description.contains(query))
    )).all()
    return apps


# 获取指定名称的MCP服务的配置
@app.api_route("/app/{id}", methods=["GET"])
async def get_app(id: int, session: Session = Depends(get_session)):
    app = session.get(appDB, id)
    if not app or app.item_type != "app":
        raise HTTPException(status_code=404, detail="App not found")
    return app


# 删除指定名称的MCP服务的配置
@app.api_route("/app/{id}", methods=["DELETE"])
async def delete_app(id: int, session: Session = Depends(get_session)):
    app = session.get(appDB, id)
    if not app or app.item_type != "app":
        raise HTTPException(status_code=404, detail="App not found")
    session.delete(app)
    session.commit()
    return {"status": "success", "message": f"App {id} deleted"}


# 列出所有常用的MCP服务
@app.api_route("/tool/list", methods=["GET"])
async def list_tools(session: Session = Depends(get_session)):
    tools = session.exec(select(appDB).where(appDB.item_type == "tool")).all()
    return tools


# 搜索常用的MCP服务
@app.api_route("/tool/search", methods=["GET"])
async def search_tools(query: str = Query(...), session: Session = Depends(get_session)):
    tools = session.exec(select(appDB).where(
        (appDB.item_type == "tool") & 
        (appDB.name.contains(query) | appDB.description.contains(query))
    )).all()
    return tools


@app.api_route("/tool/add", methods=["POST"])
async def add_tool(request: Request, session: Session=Depends(get_session)):
    try:
        data = await request.json()
        tool_name = data.get('name')
        description = data.get('description', '')
        config = data.get('config')
        hashcode = hashlib.md5(json.dumps(config).encode()).hexdigest()

        if not tool_name or not config:
            raise HTTPException(status_code=400, detail="Tool name and config are required")

        # Check if tool with the same name already exists
        existing_tool = session.exec(
            select(appDB).where(
                (appDB.item_type == "tool") &
                (appDB.hashcode == hashcode)
            )
        ).first()

        if existing_tool:
            raise HTTPException(status_code=409, detail=f"Tool with name '{tool_name}' already exists")

        current_time = int(time.time())

        new_tool = appDB(
            name=tool_name,
            description=description,
            item_type="tool",
            config=json.dumps(config),
            hashcode=hashcode,
            create_at=current_time,
            modify_at=current_time
        )

        session.add(new_tool)
        session.commit()
        session.refresh(new_tool)

        return {"status": "success", "message": "Tool added", "id": new_tool.id}

    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON format")
    except HTTPException as e:
        raise e  # Re-raise HTTPException to keep status code and detail
    except Exception as e:
        # Log the exception for debugging purposes if needed
        # logger.error(f"Error adding tool: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error adding tool: {str(e)}")



# 获取指定名称的常用MCP服务的配置
@app.api_route("/tool/{id}", methods=["GET"])
async def get_tool(id: int, session: Session = Depends(get_session)):
    tool = session.get(appDB, id)
    if not tool or tool.item_type != "tool":
        raise HTTPException(status_code=404, detail="Tool not found")
    return tool


# 删除指定名称的常用MCP服务的配置
@app.api_route("/tool/{id}", methods=["DELETE"])
async def delete_tool(id: int, session: Session = Depends(get_session)):
    tool = session.get(appDB, id)
    if not tool or tool.item_type != "tool":
        raise HTTPException(status_code=404, detail="Tool not found")
    session.delete(tool)
    session.commit()
    return {"status": "success", "message": f"Tool {id} deleted"}


# 测试MCP服务器的可用性，并获取工具列表
@app.api_route("/tool/test", methods=["POST"])
async def test_tool(request: Request):
    try:
        data = await request.json()
        server_url = data.get("serverUrl")
        api_key = data.get("apiKey")
        
        if not server_url:
            return Response(status_code=400, content="Server URL is required")
            
        # 这里应该实现对MCP服务器的连接测试
        # 由于实际实现需要依赖外部服务，这里只返回模拟数据
        return {
            "status": "success",
            "available": True,
            "tools": ["tool1", "tool2", "tool3"]
        }
    except Exception as e:
        return Response(status_code=500, content=f"Error testing tool: {str(e)}")


# 对用户的提交进行解析，并将mcp.json进行解析，该落库的落库
@app.api_route("/app/submit", methods=["POST"])
async def submit_work(request: Request, session: Session = Depends(get_session)):
    try:
        data = await request.json()
        app_name = data.get('name') or data.get('appName')
        description = data.get('description', '')
        app_id = data.pop('id', None) 

        
        if not app_name:
            return Response(status_code=400, content="App name is required")
            
        if not data.get('mcpServers', {}):
            return Response(status_code=400, content="Invalid data format")
            
        current_time = int(time.time())
        servers = data.get('mcpServers')
        hashcode = hashlib.md5(json.dumps(servers).encode()).hexdigest()
        
        
        # 存储应用到数据库
        existing_app = session.exec(
            select(appDB).where(
                (appDB.item_type == "app") & 
                (appDB.hashcode == hashcode)
            )
        ).first()
        
        if existing_app:
           raise Exception('duplicated app config')
        
        
        # If app_id is not provided, proceed with creating a new app (existing logic follows)
        # Check for duplicates before creating a new one
        existing_app = session.exec(
            select(appDB).where(
                (appDB.item_type == "app") &
                (appDB.hashcode == hashcode)
            )
        ).first()

        if existing_app:
           raise HTTPException(status_code=409, detail='App config conflicts with an existing app')
        


        if app_id:
            app_to_update = session.get(appDB, app_id)
            if not app_to_update or app_to_update.item_type != "app":
                raise HTTPException(status_code=404, detail=f"App with id {app_id} not found")

            app_to_update.name = app_name
            app_to_update.description = description
            app_to_update.config = json.dumps(data)
            app_to_update.hashcode = hashcode
            app_to_update.modify_at = current_time

            session.add(app_to_update)
            session.commit()
            session.refresh(app_to_update)
            return {"status": "success", "message": f"App {app_id} updated", "id": app_to_update.id}

        
        new_app = appDB(
            name=app_name,
            description=description,
            item_type="app",  # 修改 type 为 item_type
            config=json.dumps(data),
            hashcode=hashcode,
            create_at=current_time,
            modify_at=current_time
        )
        session.add(new_app)
        session.commit()
        session.refresh(new_app)
        return {"status": "success", "message": "App created", "id": new_app.id}
    
    except Exception as e:
        return Response(status_code=500, content=f"Error submitting work: {str(e)}")




class ServiceStatus:

    process = {}

    async def start_service(self, id):
        if id in self.process:
            return False
        proc = await asyncio.create_subprocess_shell(f'uv run bin/mcpproxy.py -c {id}')
        self.process[id] = proc
        await proc.wait()
        self.process.pop(id, None)


    def stop_service(self, id):
        if id not in self.process: return False
        proc = self.process[id]
        proc.terminate()
        return True


    def get_services(self):
        return list(self.process.keys())
        

ServicePool = ServiceStatus()


@app.api_route("/service/start", methods=["POST"])
async def start_service(request: Request): 
    # 启动服务的逻辑
    data = await request.json()
    id = data.get('id') 
    if not (isinstance(id, str) and id.isdigit() and id.isnumeric()):
        return Response(status_code=400, content="Invalid ID format")

    asyncio.create_task(ServicePool.start_service(id))
    await asyncio.sleep(0.5)
    return ServicePool.get_services()

@app.api_route("/service/status", methods=["GET"])
async def status_service():
    # 获取服务状态的逻辑
    services = ServicePool.get_services()
    return {"status": "success", "services": services}

@app.api_route("/service/status/{id}", methods=["GET"])
async def status_service_id(id: str):
    try:
        id = int(id)
        r = await httpx.AsyncClient().get(f'http://127.0.0.1/mcp/{id}/server_status')
        return r.json()
    except Exception as e:
        return Response(status_code=500, content=f"Error getting service status: {str(e)}")


@app.api_route("/service/stop", methods=["POST"])
async def stop_service(request: Request):
    # 停止服务的逻辑
    data = await request.json()
    id = data.get('id')
    if not (isinstance(id, str) and id.isdigit() and id.isnumeric()):
        return Response(status_code=400, content="Invalid ID format")

    ServicePool.stop_service(id)
    await asyncio.sleep(0.5)
    return {"status": "success", "message": f"Service {id} stopped"}




