anydef OpenClaw 加密工具包 0.1 (Encryption Toolkit)
总体架构
本技能包为 OpenClaw 平台的每个 Agent 提供透明加密层，核心设计原则：

透明性 — 加密/解密对 Agent 业务逻辑完全透明，不改变数据使用方式
可控性 — 每个 Agent 独立配置加密策略，可精细控制哪些数据需要加密
安全性 — 采用 AES-256-GCM + PBKDF2 密钥派生，支持密钥轮换
可审计 — 完整的加密操作日志，不记录明文内容


加密范围（数据分类）
数据类型存储位置默认策略说明上传文件内容storage/files/
可选加密文件原始内容对话 Memorystorage/memory/
可选加密长期记忆、摘要对话历史storage/sessions/
可选加密完整对话记录工具调用结果storage/tool_results/
可选加密敏感 API 返回值Agent 配置config/agents/建议加密含 API Key 等敏感配置向量嵌入元数据storage/vectors/可选加密关联的文本元数据

#初始化 Agent 加密配置
为指定 Agent 初始化加密
在 Agent 中使用（透明调用）
读取时自动解密
上传文件自动加密存储
查看加密状态
输出：
Agent: agent_001
加密状态: ✅ 已启用
加密范围: files=✅  memory=✅  sessions=❌
密钥版本: v3 (上次轮换: 2024-01-15)
受保护数据量: 文件 23 个 / Memory 条目 847 条

核心模块说明
详细实现请参阅：
references/encryption-core.md — 加密算法与密钥管理
references/agent-config.md — Agent 配置格式与 API
references/storage-adapter.md — 存储适配器实现
scripts/encrypt_migrate.py — 现有数据迁移加密脚本
scripts/key_rotation.py — 密钥轮换脚本
scripts/audit_log.py — 加密审计日志查看器


部署步骤（按情景选择）
情景 A：新 Agent，从零配置
→ 参阅 references/agent-config.md 的"新建配置"章节
情景 B：现有 Agent，追加加密
→ 先运行 scripts/encrypt_migrate.py 迁移存量数据，再更新配置
情景 C：批量启用所有 Agent 加密
→ 参阅 references/agent-config.md 的"全局策略"章节
情景 D：密钥泄露应急响应
→ 立即运行 scripts/key_rotation.py --emergency，参阅轮换流程文档

关键约定

密钥不落盘：默认安装技能包，主密钥初始化生成后保存在本机，仅适合功能测试。 商用环境或生产环境，需将主密钥保存在您的KMS服务中，并进行相关的接口代码改造。派生密钥有时效限制。
失败关闭原则：加密失败时不退化为明文存储，而是抛出异常
向后兼容：未加密的历史数据可继续读取，不强制迁移
密文格式标记：所有加密字段带 enc:v1: 前缀，便于识别和版本升级
