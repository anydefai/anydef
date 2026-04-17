# window.storage Key 命名规范 v4

## 格式约定

所有 key 使用冒号分隔，**不含空格、斜杠、引号**。

## v4 标准 Key 一览

| 类型 | Key 格式 | 示例 |
|------|---------|------|
| Agent 加密配置 | `enc-cfg:<agentId>` | `enc-cfg:agent_001` |
| **Key Provider 配置（v4 新增）** | `enc-kp-cfg:<agentId>` | `enc-kp-cfg:agent_001` |
| 各 scope 的 DEK | `enc-dek:<agentId>:<keyVersion>:<scope>` | `enc-dek:agent_001:v1:memory` |
| 审计日志 | `enc-audit:<agentId>` | `enc-audit:agent_001` |
| Memory 数据 | `memory:<agentId>:<key>` | `memory:agent_001:user_pref` |
| 文件数据 | `files:<agentId>:<key>` | `files:agent_001:contract-pdf` |
| 对话历史 | `sessions:<agentId>:<sessionId>` | `sessions:agent_001:sess-20240115` |
| 工具结果 | `tool_results:<agentId>:<callId>` | `tool_results:agent_001:call-xyz` |

## enc-kp-cfg 存储结构

存储 Key Provider 类型和引用信息（**不存储任何凭证或密钥值**）：

```json
// 1Password 模式
{ "type": "1password", "vault": "Private", "item": "OpenClaw Keys", "field": "agent_001_master", "mode": "rpc", "savedAt": "2024-01-15T08:00:00.000Z" }

// AWS KMS 模式（encryptedDek 由首次 setup 时写入）
{ "type": "aws_kms", "keyId": "arn:aws:kms:...", "region": "us-east-1", "accessKeyId": "AKIA...", "encryptedDek": "<base64>", "savedAt": "..." }

// GCP KMS 模式（encryptedDek 由首次 setup 时写入）
{ "type": "gcp_kms", "keyName": "projects/.../cryptoKeys/my-key", "encryptedDek": "<base64>", "savedAt": "..." }

// 手动密码（默认，无额外字段）
{ "type": "manual", "savedAt": "..." }
```

> ⚠️ `secretAccessKey`、`connectToken`、`accessToken` 等凭证**永远不写入 storage**，每次使用时由用户在 UI 输入或从环境变量获取。
