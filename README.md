# MCPez - 微服务命令代理管理平台

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

MCPez 是一个基于 Web 的管理平台，旨在简化后端服务（如 AI 模型、本地脚本或远程 API）的定义、配置、管理和监控。它通过标准化的代理接口（SSE 或 STDIO）暴露这些服务，使它们易于被其他应用程序（尤其是需要调用工具的 AI 代理）集成和使用。

## 项目意义

当前的微服务命令代理（MCP）生态系统和 AI Agent 应用开发面临诸多挑战：

> *   **孤立的 MCP 价值有限**: 单个 MCP 服务通常功能单一，难以独立产生显著价值。用户需要将多个 MCP 组合起来才能构建有意义的应用，但这往往需要复杂的编排和集成工作。


>*   **Agent-to-Agent (A2A) 交互复杂**: 现有的 A2A 通信方案往往过于复杂，缺乏统一标准，使得构建能够协同工作的多 Agent 系统变得困难。

> *   **封闭的生态系统**: 许多平台将用户锁定在特定的、不开放的 MCP 组合中，限制了灵活性和可扩展性。另外，MCP本身的很多特性都无法修改，寄托于开源实际上是反用户体验的

> *   **MCP 质量参差不齐**: 现有 MCP 平台充斥着大量低质量的服务，其中许多是 AI 生成的、未经充分测试的代码。据观察，大约 80% 的服务是重复性的，15% 存在功能问题或不可用，剩下的 5% 也往往缺乏实际应用价值。这极大地增加了开发者筛选和集成可靠工具的难度。
>     _**Todo**: 接下来的版本，会有一个MCP来帮忙构建MCP服务器系统：已经在测试中，构建的效果还是有意思的_

> *   **客户端集成与管理困难**: 开发者需要为不同的服务编写不同的客户端适配代码，并分别管理它们的配置、部署和运行状态，耗时耗力。很明显，在LLM使用工具这块，Lang*这类Agent，携带者过时的RAG在增加Token消耗的路上越走越远，Autogen和MCP协议处于一种低效的竞争状态，Google也换着概念来搞事情。Pydantic把自己的“格式验证”正全力的往标准化的概念上套。这个战场一看就十分叙利亚，连泽连斯基都不好意思演绎，就不要指望近期内可以统一了。

所以，MCPez 旨在通过以下方式克服这些挑战，提供一个更开放、可靠和易于管理的解决方案：

> *   **统一管理与标准化接口**: 将不同的后端服务（无论是本地脚本、远程 API 还是其他 MCP）统一封装为标准的 SSE 或 STDIO 接口。提供集中的 Web UI 进行创建、配置、监控和管理，降低管理复杂度。

> *   **解决客户端问题**: 应用程序（如 AI Agent）只需通过 MCPez 提供的稳定代理地址与后端服务交互，无需关心底层服务的具体实现和部署细节，简化了客户端集成。

> *   **打破 MCP 孤岛**: 通过提供一个易于使用的平台来组合和管理多个服务，使得原本单一、价值有限的 MCP 能够更容易地被整合进更复杂的应用流程中，从而产生更大的价值。

> *   **Docker 化部署**: 提供 Dockerfile，将整个管理平台和其依赖（如 Nginx、Python 环境）打包，实现一键部署。这不仅简化了环境配置，也确保了服务运行环境的一致性，方便用户在本地或服务器上快速搭建和运行自己的 MCP 服务集合。

> *   **提升服务质量与可用性**: 虽然 MCPez 本身不直接编写 MCP 服务，但它提供了一个框架，鼓励用户将自己验证过、高质量的服务集成进来，并通过模板共享等功能促进优质服务的复用，逐步改善生态质量。

通过 MCPez，开发者可以更专注于核心业务逻辑和 Agent 能力的构建，而不是陷入繁琐的服务集成和管理细节中。

## 主要特性

*   **Web 用户界面**: 直观的界面用于管理应用和服务。
*   **应用/服务定义**: 支持创建和配置“应用”，每个应用可以包含多个后端服务配置。
*   **多种服务类型**:
    *   **SSE**: 代理远程 HTTP SSE 服务，支持配置 Base URL 和 Headers。
    *   **STDIO**: 代理本地命令行进程，支持配置执行命令、参数和环境变量。
*   **配置管理**:
    *   支持将应用配置导出为 JSON 文件。
    *   支持从 JSON 文件导入应用配置。
    *   支持将常用的服务配置保存为“工具模板”，方便复用。
*   **服务状态管理**:
    *   在主页列出所有已定义的“应用”。
    *   启动/停止基于 STDIO 的服务。
    *   查看运行中服务的状态详情（ID、地址、状态、详细日志/信息）。
*   **AI Playground**: (位于 `chat.html`) 提供一个聊天界面，可以配置 AI 模型（如 OpenAI, Gemini 等），并将 MCPez 中定义的服务作为 Tool/Function Calling 的后端，方便测试和调试 AI 与工具的交互。
*   **Docker 支持**: 提供 Dockerfile，方便容器化部署。

## 未来方向

*   **AI 驱动的工具描述与函数理解**: 计划引入让大型语言模型（LLM）根据服务配置和上下文自动生成或优化工具（MCP 服务）及其内部函数（如果适用）的描述信息。这将极大提升 AI Agent 对工具功能的理解深度和准确性，有效解决当前 AI Agent 在选择和调用 MCP 函数时命中率不高的问题。
*   **可共享的工具集**: 用户可以将精心配置和验证过的应用（包含一组相关的 MCP 服务）导出为配置包。这些配置包可以在社区或团队内部共享，其他用户可以轻松导入并复用这些工具集，加速开发进程。
*   **本地优先与安全性**: 工具集的共享机制将保持本地化部署的核心优势。用户导入配置后，服务仍在本地运行，避免了将敏感信息（如 API Key）上传到第三方共享平台而可能带来的安全风险。这确保了数据和凭证的安全性，同时促进了可信工具的流通。

**吐槽**：间接帮你降低了104%的税

## 快速开始

### 先决条件

*   [Docker](https://www.docker.com/) 和 [Docker Compose](https://docs.docker.com/compose/) (推荐)

### 使用 Docker 运行

1.  **构建 Docker 镜像**:
    ```bash
    docker build -t MCPez .
    ```

2.  **运行 Docker 容器**:
    ```bash
    docker run -d -p 8088:80 --name MCPez-instance -v MCPez_data:/data MCPez
    ```
    *   `-d`: 后台运行。
    *   `-p 8088:80`: 将主机的 8088 端口映射到容器的 80 端口（Nginx 默认端口）。您可以根据需要更改主机端口 `8088`。
    *   `--name MCPez-instance`: 为容器命名。
    *   `-v MCPez_data:/data`: 创建一个 Docker volume `MCPez_data` 来持久化存储 SQLite 数据库和服务配置等数据。

### 访问 Web UI

在浏览器中打开 `http://localhost:8088` (或您指定的主机端口)。

### 使用说明

1.  **服务管理 (`index.html`)**:
    *   主界面显示所有已创建的应用列表及其状态。
    *   可以搜索应用。
    *   对于 STDIO 类型的服务，可以点击“启动”或“停止”按钮。
    *   点击“编辑服务”跳转到编辑页面。
    *   点击“查看服务状态”查看运行中服务的详细信息。
    *   点击“新建服务”跳转到应用编辑页面。

2.  **应用编辑 (`edit.html`)**:
    *   **创建新应用**: 直接访问 `edit.html`。
    *   **编辑现有应用**: 从主页点击“编辑服务”或通过 `edit.html?id=<app_id>` 访问。
    *   **应用信息**: 设置应用的名称和描述。
    *   **配置管理**:
        *   **导入/导出**: 使用 JSON 文件导入或导出整个应用的配置（包括名称、描述和所有服务器配置）。
        *   **使用模板**: 从预存的工具模板库中选择并添加服务配置。
    *   **服务器配置**:
        *   点击“MCP”按钮添加新的服务器配置（SSE 或 STDIO）。
        *   填写服务器名称、类型（SSE/STDIO）、描述以及相应的配置（URL/Headers 或 Command/Args/Env）。
        *   编辑或删除已有的服务器配置。
        *   可以将配置好的服务器保存为“工具模板”供以后使用。
    *   **JSON 预览**: 实时显示当前应用的完整 JSON 配置。
    *   **保存配置**: 点击右上角的“保存配置”按钮保存更改。

3.  **AI Playground (`chat.html`)**:
    *   点击右上角齿轮图标进行设置，配置 AI 模型提供商的 API Key、Base URL、模型名称等。
    *   配置 MCP 服务器地址（通常是 `http://localhost:8088/mcp/<app_id>/sse`，其中 `<app_id>` 是您在 `edit.html` 中配置的应用的 ID/名称）。
    *   配置好后，可以在聊天界面与 AI 对话。如果 AI 模型支持 Tool/Function Calling，并且您配置的 MCP 应用中有相应的服务，AI 将能够调用这些服务。

## 许可证

本项目采用 [MIT 许可证](LICENSE)。

```
MIT License

Copyright (c) [Year] [Copyright Holder]

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
