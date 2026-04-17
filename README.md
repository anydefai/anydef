**anydef-encryption Skill Pack** is a transparent encryption layer for Agent data designed for the OpenClaw platform. The core philosophy is "encryption is transparent to business code."

## Core Value

| Feature                    | Description |
|----------------------------|-------------|
| **Transparency**           | Agent business code requires no modification; encryption/decryption happens automatically |
| **Fine-grained Control**   | Can be toggled on/off per data type (files/memory/sessions, etc.) |
| **Security & Compliance**  | AES-256-GCM + PBKDF2, supports key rotation and auditing |
| **Backward Compatibility** | Unencrypted historical data can still be read normally |
| **Auditable**              | Complete encryption operation logs without recording plaintext content |

## Data Classification & Encryption Scope

| Data Type | Storage Path | Encryption | Notes |
|-----------|--------------|------------|-------|
| Uploaded file contents | `storage/files/` | Optional |
| Conversation Memory | `storage/memory/` | Optional |
| Conversation history | `storage/sessions/` | Optional | Complete conversation records |
| Sensitive tool call results | `storage/tool_results/` | Optional |
| Agent configuration | `config/agents/` | Recommended | Contains API Keys, etc. |
| Vector embedding metadata | `storage/vectors/` | Optional |

## Core Architecture Description

### Purpose & Encryption Algorithms

| Purpose | Algorithm |
|---------|-----------|
| Data encryption | AES-256-GCM |
| Key derivation | PBKDF2-HMAC-SHA256 (600k iterations) |
| Key wrapping | AES-256-KW |

### Three-Layer Key Structure: Layered Wrapping, Leakage Isolation, Efficient Rotation

```
Master Key (MK)
  │
  │  Stored in: Environment variables / KMS / 1Password / Local key file
  │  Never written to disk (only memory or external secure storage)
  │
  └──► KEK (Key Encryption Key)
         │  Independent per Agent
         │  Used to wrap DEKs
         │
         ├──► files-dek     (encrypts file contents)
         ├──► memory-dek    (encrypts Memory)
         ├──► sessions-dek  (encrypts conversation history)
         ├──► tool_results-dek (encrypts tool call results)
         └──► metadata-dek  (encrypts vector metadata)
```

### Key Three-Layer Structure (MK → KEK → DEK)

When each Agent is initialized, an independent random DEK is generated for each of the four scopes (files / memory / sessions / tool_results), encrypted with the KEK, and stored in `window.storage`. During decryption, the password is first used to restore the KEK, then the KEK unwraps the DEK for the corresponding scope, and finally the data is decrypted. Memory leakage does not affect files; scopes are completely isolated from each other.

### Key Rotation

Two modes are supported: **Scheduled rotation** (old DEK retained until the next rotation) and **Emergency rotation** (old DEK deleted immediately). During rotation, all encrypted data under the Agent is automatically scanned, re-encrypted entry by entry with the new DEK and written back. The key version number increments from v1 to v2, v3, etc.

### Audit Log

Every setup, encrypt, decrypt, key rotation, and disable operation writes a log entry to `window.storage`, recording timestamp, operation type, scope, and key version. The management panel includes an independent audit log tab supporting filtering by operation type and clearing.

## Design Features

- Single DEK leakage only affects one data type
- Key rotation only requires re-encrypting the corresponding data type
- Master key leakage only requires re-wrapping the KEK
- Each encryption generates new salt and IV — never reused
- PBKDF2 with 600,000 iterations — NIST 2023 recommendation
- GCM mode with built-in authentication — tamper-proof
- GCM decryption automatically verifies authentication tag
- If data is tampered with, decryption fails with exception (no silent failure)
- Unencrypted data automatically passes through (backward compatible)

## Ciphertext Format

```
enc:v1:AbC123xYz:DeF456uVw:GhI789rSt...==
│   │   │        │        │
│   │   │        │        └── Ciphertext + GCM authentication tag
│   │   │        └── IV (12 bytes, Base64URL)
│   │   └── Salt (16 bytes, Base64URL)
│   └── Version number (for future upgrades)
└── Protocol identifier
```

**Example ciphertext:**

```
enc:v1:abc123XYZ:def456UVW:ghi789RST012JKLMNOP345...
```

- Protocol identifier for version upgrades
- salt/IV randomly generated each time, never reused

## Core Components

- **EncryptionManager** — Python API main class
- **EncryptedStorageAdapter** — Transparent encryption decorator
- **EncryptedFileStorage** — File encryption adapter

## Core Module Documentation

- `references/encryption-core.md` — Encryption algorithms and key management
- `references/agent-config.md` — Agent configuration format and API
- `references/storage-adapter.md` — Storage adapter implementation
- `scripts/encrypt_migrate.py` — Existing data migration encryption script
- `scripts/key_rotation.py` — Key rotation script
- `scripts/audit_log.py` — Encryption audit log viewer

## Three Encryption Application Strategies

| Strategy | Scope | Performance Impact |
|----------|-------|-------------------|
| Minimal | Only encrypt memory | Minimal impact |
| Balanced | files + memory (recommended) | Low impact |
| Maximum security | All scopes | Moderate impact |

## Three Usage Scenarios

- **Scenario A:** New Agent configuration from scratch
- **Scenario B:** Add encryption to existing Agent
- **Scenario C:** Key leakage emergency response

## ⚠️ Critical Security Conventions

- **Master key never written to disk:** Only in memory, KMS, or third-party托管 platforms
- **Fail-closed principle:** Encryption failure does not fall back to plaintext; throw exception
- **Key rotation period:** ≤ 90 days
- **Decryption errors must alert:** No silent failure
- **Backward compatibility:** Unencrypted historical data can still be read without forced migration
- **Ciphertext format tagging:** All encrypted fields carry `enc:v1:` prefix for easy identification and version upgrades

## 💡 Recommended Encryption Policy Configuration Modes

| Mode | Scopes | Use Case |
|------|--------|----------|
| **Minimal (Entry)** | memory only | Quick start, minimal impact |
| **Balanced (Recommended)** | files + memory | General purpose |
| **Maximum Security** | All scopes | Financial/Healthcare |

## Daily Usage

Once configured, use the Agent normally — encryption/decryption happens completely in the background:

- Agent saves memory → automatically encrypted before storage
- Agent reads memory → automatically decrypted for use
- You upload a file → file contents automatically encrypted

The only difference: if you directly view raw data in storage, you'll see ciphertext like this instead of plaintext:

```
enc:v2:abc123XYZ:def456UVW:ghi789RST...
```

## Viewing or Modifying Encryption Status

In the dialog, say:

- "View encryption configuration for agent_001"
- "Turn off sessions encryption for agent_001"
- "Disable all encryption for agent_002"

## Migrating Old Data (Upgrading from Unencrypted to Encrypted)

If an Agent previously had no encryption and already has stored data, say:

- "Help me encrypt the existing Memory data for agent_001"

The skill pack will scan all plaintext entries, encrypt each one with the password you provide and write them back. No original data is lost.

## Important Reminders

- **Master key loss cannot be recovered.** It is recommended to store the master key in a password manager (1Password, third-party KMS, etc.) or write it down in a safe place.

- After changing devices/browsers, the password needs to be re-entered. Encrypted data syncs with `window.storage`, but decryption requires you to provide the master key again.

- Different Agents can use different passwords or the same one, depending on your security requirements.

## Operating Environment

This skill pack runs in the **OpenClaw browser-side Artifact environment** — pure local computation, zero network dependencies. API calls for encryption/decryption in the browser environment will not trigger error fallbacks due to network issues.

## Current Validation Status

| Feature                                                           | Status                                                                   |
|-------------------------------------------------------------------|--------------------------------------------------------------------------|
| Third-party key management platform (1Password)                   | ✅ Implemented with OpenClaw official integration, all features complete |
| AWS/Google/Aliyun/HuaweiCloud KMS integration                     | 🔄 Verification in progress                                              |
| OpenClaw environment integration                                  | ✅ Implemented                                                           |
| Hermes/Claude Code agent integration                              | 🔄 Verification in progress                                              |
| Data encryption business scenarios                                | ✅ Verified                                                              |
| Browser native Web Crypto API framework conversation scenarios    | ✅ Verified                                                              |
| WeChat/QQ/Feishu/DingTalk scenarios | 📅 Planned for next version |

## Project Information

- **Project Category:** AI Agent Intrinsic Security
- **Source Code:** https://github.com/anydefai/anydef
- **Project Initiator:** Lü Lixiao (Lu Lixiao) WX: lisolv
- **Discussion WeChat Group:** AI Agent Intrinsic Security
- **Project Sponsor:** Beijing Anydef Technology Co., Ltd.

---

anydef-encryption 技能包是一个为 OpenClaw 平台设计的 Agent 数据透明加密层，核心理念是"加密对业务代码透明"。

核心价值

透明性	：Agent 业务代码无需修改，加密/解密自动发生

细粒度控制	：可按数据类型(files/memory/sessions等)分别开关

安全合规	：AES-256-GCM + PBKDF2，支持密钥轮换和审计

向后兼容	：未加密历史数据可正常读取

可审计：完整的加密操作日志，不记录明文内容

 数据分类与加密范围
 
1、上传文件内容 | `storage/files/` | 可选加密 

2、对话 Memory | `storage/memory/` | 可选加密

3、 对话历史 | `storage/sessions/` | 可选加密 | 完整对话记录 |

4、 工具调用敏感结果 | `storage/tool_results/` | 可选加密 

5、 Agent 配置 | `config/agents/` | 建议加密 | 含 API Key 等敏感配置 

6、向量嵌入元数据 | `storage/vectors/` | 可选加密


核心架构说明

用途与加密算法

1、数据加密  ：AES-256-GCM 

2、密钥派生 ： PBKDF2-HMAC-SHA256 (600k 轮) 

3、 密钥包装 | AES-256-KW 

三层密钥结构：层层包装、泄露隔离、轮换高效

<img width="896" height="794" alt="7e2c9d1f-f84c-4725-9c26-5e1a00ac9c21" src="https://github.com/user-attachments/assets/1ab206a9-d4f9-41b3-a21b-cc4c323a765e" />



密钥三层结构（MK → KEK → DEK）

每个Agent初始化时，会为 files / memory / sessions / tool_results 四个 scope 各自生成一个独立的随机 DEK，用 KEK 加密后存入 window.storage。解密时先用密码还原 KEK，再用 KEK 解包对应 scope 的 DEK，最后才解密数据。memory 泄露不影响 files，scope 之间完全隔离。

密钥轮换

支持两种模式：常规轮换（旧 DEK 保留到下次轮换）和紧急轮换（旧 DEK 立即删除）。轮换时自动扫描该 Agent 下所有加密数据，用新 DEK 逐条重新加密写回，密钥版本号从 v1 递增为 v2、v3…

审计日志

每次 setup、encrypt、decrypt、密钥轮换、禁用操作都会写一条日志到 window.storage，记录时间、操作类型、scope、密钥版本。管理面板里有独立的审计日志 Tab，支持按操作类型筛选和清空。


设计特点：

单个 DEK 泄露只影响一类数据

密钥轮换只需重加密对应数据类型

主密钥泄露只需重新包装 KEK

每次加密都生成新的 salt 和 IV— 绝不重用

PBKDF2 600,000 轮迭代— NIST 2023 推荐

GCM 模式自带认证— 防篡改

GCM 解密时会自动验证认证标签

如果数据被篡改，解密失败抛异常（不静默失败）

未加密数据自动透传（向后兼容）

密文格式：

enc:v1:AbC123xYz:DeF456uVw:GhI789rSt...==
│   │   │        │        │
│   │   │        │        └── 密文 + GCM 认证标签
│   │   │        └── IV (12 bytes, Base64URL)
│   │   └── 盐值 (16 bytes, Base64URL)
│   └── 版本号 (便于未来升级)
└── 协议标识
示例密文：

enc:v1:abc123XYZ:def456UVW:ghi789RST012JKLMNOP345...

协议标识，便于版本升级

salt/iv 每次随机生成，绝不复用

核心组件

EncryptionManager — Python API 主类

EncryptedStorageAdapter — 透明加密装饰器

EncryptedFileStorage — 文件加密适配器


 核心模块说明
 
- `references/encryption-core.md` — 加密算法与密钥管理
- 
- `references/agent-config.md` — Agent 配置格式与 API
- 
- `references/storage-adapter.md` — 存储适配器实现
- 
- `scripts/encrypt_migrate.py` — 现有数据迁移加密脚本
- 
- `scripts/key_rotation.py` — 密钥轮换脚本
- 
- `scripts/audit_log.py` — 加密审计日志查看器
 
三种加密应用策略：

只加密 files + memory，性能影响最小。

最轻量：只加密 memory

平衡：files + memory（推荐）

最高安全：全部加密


三种使用情景

情景 A：新 Agent 从零配置

情景 B：现有 Agent 追加加密

情景 C：密钥泄露应急响应


⚠️ 关键安全约定

主密钥不落盘：仅内存或 KMS或第三方托管平台

失败关闭原则：加密失败不退化为明文，抛异常

密钥轮换周期： ≤ 90 天

解密错误必须告警 ：不能静默失败

向后兼容：未加密的历史数据可继续读取，不强制迁移

密文格式标记：所有加密字段带 `enc:v1:` 前缀，便于识别和版本升级


日常使用：完全透明，无需操心

配置好之后，正常使用 Agent 即可，加密/解密完全在后台自动发生：

Agent 保存记忆 → 自动加密后存储

Agent 读取记忆 → 自动解密后使用

你上传文件 → 文件内容自动加密存储

唯一的区别是：如果去 storage 里直接查看原始数据，看到的会是类似这样的密文，而不是明文：enc:v2:abc123XYZ:def456UVW:ghi789RST...

查看或修改加密状态

对话框里说：

"查看 agent_001 的加密配置" "给 agent_001 关闭 sessions 加密" "帮我把 agent_002 的加密全部禁用"

迁移旧数据（从未加密升级到加密）

如果 Agent 之前没有加密，已经存了一些数据，可以说：

"帮我把 agent_001 现有的 Memory 数据都加密"

技能包会扫描所有明文条目，用你提供的密码逐条加密写回，原数据不会丢失。

重要提醒：

主密钥丢失无法找回，建议把主密钥存在密码管理器里（1Password、第三方KMS等），或者记在安全的地方。

换设备/浏览器后需要重新输入密码，加密数据会跟着 window.storage 同步，但解密需要你再次提供主密钥。

不同 Agent 可以用不同密码，也可以用同一个，取决于你的安全需求。


使用环境：

本技能包运行在 OpenClaw 浏览器端 Artifact 环境，纯本地计算，零网络依赖，浏览器环境中加解密API调用不会因为网络问题触发错误回退。

当前验证情况：

1、第三方密钥管理平台： 已实现openclaw官方集成的1Password的平台对接并实现所有功能。 AWS/Google/Aliyun/HuaweiCloud的KMS对接验证中

2、已实现openclaw环境的集成。 Hermes/Claude Code等智能体的对接验证中

3、数据加密的业务场景已验证

4、基于浏览器原生 Web Crypto API框架的对话场景已验证。 微信/QQ/飞书/钉钉等场景计划下个版本

项目所属： AI智能体内生安全

源码地址：https://github.com/anydefai/anydef

项目发起人：吕鹂啸 WX： lisolv  

交流WX群：AI智能体内生安全

项目赞助商：北京安御道合科技有限公司
