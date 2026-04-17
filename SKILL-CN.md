---
name: anydef-enc
description: |
    anydef-enc Data Encryption Protection Skill Pack. Use this when it is necessary to encrypt critical Agent data for protection, including: encryption of uploaded file content, encrypted storage of conversation Memory, encryption of sensitive data fields, and Agent-level encryption switch management. Trigger scenarios: This skill must be used whenever the user mentions "encryption", "data protection", "privacy protection", "secure storage", "memory encryption", "file encryption", "agent encryption configuration", "key rotation", "audit log", "1password", "KMS", or "master key source". Even if the user is merely asking how to protect the data security of a certain Agent, this skill shall be triggered immediately to complete the full encryption configuration process.

  anydef-enc 数据加密保护技能包。当需要对 Agent 的关键数据进行加密保护时使用，包括：上传文件内容加密、对话 Memory 加密存储、敏感数据字段加密、Agent 级别的加密开关管理。触发场景：用户提到"加密"、"数据保护"、"隐私保护"、"安全存储"、"memory 加密"、"文件加密"、"agent 加密配置"、"密钥轮换"、"审计日志"、"1password"、"KMS"、"主密钥来源"时必须使用此技能。即使用户只是询问如何保护某个 Agent 的数据安全，也应立即触发此技能完成完整的加密配置流程。
---

#  anydef-enc  v4

## ⚠️ 运行环境约束（必读）

本技能包运行在 **OpenClaw 浏览器端 Artifact 环境**：

| ❌ 禁止 | ✅ 替代 |
|--------|--------|
| Python `cryptography` 等第三方包 | `window.crypto.subtle`（浏览器原生） |
| `import os / hashlib` 等标准库 | `window.crypto.subtle.*` |
| 文件系统 `open / Path` | `window.storage` |
| `fetch() / XMLHttpRequest` | 纯本地计算，零网络请求 |
| `localStorage / sessionStorage` | `window.storage` |

---

## 能力总览

| 能力 | v2 | v3 | v4 |
|------|----|----|-----|
| 每 Agent 独立密钥 | ✅ | ✅ | ✅ |
| AES-256-GCM 加密 | ✅ | ✅ | ✅ |
| 分 scope 加密控制 | ✅ | ✅ | ✅ |
| 向后兼容明文数据 | ✅ | ✅ | ✅ |
| 密钥三层结构（MK→KEK→DEK） | ❌ | ✅ | ✅ |
| 密钥轮换（含紧急模式） | ❌ | ✅ | ✅ |
| 审计日志 | ❌ | ✅ | ✅ |
| **主密钥来源：手动输入** | ✅ | ✅ | ✅ |
| **主密钥来源：AWS KMS** | ❌ | ❌ | ✅ |
| **主密钥来源：GCP KMS** | ❌ | ❌ | ✅ |
| **主密钥来源：1Password** | ❌ | ❌ | ✅ |

---

## 密钥三层结构

```
主密码（用户输入，永不存储）
    │
    └─► KEK（密钥加密密钥）— 每个 Agent 独立，PBKDF2 派生，存于内存
            │
            ├─► DEK:files        — 加密文件内容
            ├─► DEK:memory       — 加密 Memory
            ├─► DEK:sessions     — 加密对话历史
            └─► DEK:tool_results — 加密工具调用结果
```

**优势**：memory 泄露不影响 files；单个 DEK 轮换只需重加密对应范围数据，不动其他范围。

DEK 用随机字节生成，用 KEK 加密后存入 `window.storage`，内存中只短暂存在。

---

## 密文格式（v3）

```
enc:v3:<scope>:<keyVersion>:<base64(salt)>:<base64(iv)>:<base64(ciphertext)>
```

- `scope`：files / memory / sessions / tool_results
- `keyVersion`：当前密钥版本号（如 `v1` `v2`），密钥轮换后递增
- `salt`：16 字节，每次加密随机生成
- `iv`：12 字节，每次加密随机生成
- `ciphertext`：AES-GCM 密文 + 16 字节认证 tag

---

## 核心模块（必须完整复制到 Artifact）

```javascript
// ═══════════════════════════════════════════════════════════
//  OpenClaw Encryption Module v3
//  依赖：仅 window.crypto.subtle + window.storage，零网络请求
// ═══════════════════════════════════════════════════════════
const OCE = (() => {
  const te = new TextEncoder(), td = new TextDecoder();
  const b64e = b => btoa(String.fromCharCode(...new Uint8Array(b)));
  const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const PREFIX = "enc:v3:";
  const PBKDF2_ITER = 310000;
  const SCOPES = ["files","memory","sessions","tool_results"];

  // ── 内部：从密码派生 KEK ──────────────────────────────────
  async function _deriveKEK(password, salt) {
    const raw = await crypto.subtle.importKey("raw", te.encode(password), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name:"PBKDF2", salt, iterations:PBKDF2_ITER, hash:"SHA-256" },
      raw, { name:"AES-GCM", length:256 }, true, ["encrypt","decrypt"]
    );
  }

  // ── 内部：生成随机 DEK ───────────────────────────────────
  async function _genDEK() {
    return crypto.subtle.generateKey({ name:"AES-GCM", length:256 }, true, ["encrypt","decrypt"]);
  }

  // ── 内部：用 KEK 包装 / 解包 DEK ────────────────────────
  async function _wrapDEK(dek, kek) {
    const iv  = crypto.getRandomValues(new Uint8Array(12));
    const raw = await crypto.subtle.exportKey("raw", dek);
    const ct  = await crypto.subtle.encrypt({ name:"AES-GCM", iv }, kek, raw);
    return b64e(iv) + ":" + b64e(ct);
  }
  async function _unwrapDEK(wrapped, kek) {
    const [ivB64, ctB64] = wrapped.split(":");
    const raw = await crypto.subtle.decrypt(
      { name:"AES-GCM", iv:b64d(ivB64) }, kek, b64d(ctB64)
    );
    return crypto.subtle.importKey("raw", raw, { name:"AES-GCM", length:256 }, true, ["encrypt","decrypt"]);
  }

  // ── 内部：storage key 规范 ───────────────────────────────
  const _cfgKey    = id          => `enc-cfg:${id}`;
  const _dekKey    = (id,ver,sc) => `enc-dek:${id}:${ver}:${sc}`;
  const _auditKey  = id          => `enc-audit:${id}`;
  const _dataKey   = (sc,id,k)   => `${sc}:${id}:${k}`;

  // ── 公共：初始化 Agent 加密 ──────────────────────────────
  async function setup(agentId, password, scopeConfig = {}) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const kek  = await _deriveKEK(password, salt);
    const ver  = "v1";

    // 为每个 scope 生成独立 DEK，加密后存储
    for (const sc of SCOPES) {
      const dek     = await _genDEK();
      const wrapped = await _wrapDEK(dek, kek);
      await window.storage.set(_dekKey(agentId, ver, sc), wrapped);
    }

    const cfg = {
      enabled: true,
      keyVersion: ver,
      salt: b64e(salt),
      scopes: {
        files:        scopeConfig.files        ?? true,
        memory:       scopeConfig.memory       ?? true,
        sessions:     scopeConfig.sessions     ?? false,
        tool_results: scopeConfig.tool_results ?? false,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await window.storage.set(_cfgKey(agentId), JSON.stringify(cfg));
    await _writeAudit(agentId, "setup", { keyVersion: ver, scopes: cfg.scopes });
    return cfg;
  }

  // ── 内部：获取解密后的 DEK ───────────────────────────────
  async function _getDEK(agentId, password, scope, ver) {
    const cfg = await getConfig(agentId);
    if (!cfg) throw new Error(`Agent ${agentId} 未配置加密`);
    const kek     = await _deriveKEK(password, b64d(cfg.salt));
    const wrapped = await window.storage.get(_dekKey(agentId, ver || cfg.keyVersion, scope));
    if (!wrapped) throw new Error(`DEK 不存在: ${scope} ${ver}`);
    return _unwrapDEK(wrapped.value, kek);
  }

  // ── 公共：加密 ──────────────────────────────────────────
  async function encrypt(plaintext, agentId, password, scope) {
    const cfg = await getConfig(agentId);
    if (!cfg?.enabled || !cfg.scopes[scope]) return plaintext; // 该 scope 未启用，透明返回
    const dek  = await _getDEK(agentId, password, scope);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv   = crypto.getRandomValues(new Uint8Array(12));
    const ct   = await crypto.subtle.encrypt({ name:"AES-GCM", iv }, dek, te.encode(
      typeof plaintext === "string" ? plaintext : JSON.stringify(plaintext)
    ));
    await _writeAudit(agentId, "encrypt", { scope, keyVersion: cfg.keyVersion });
    return `${PREFIX}${scope}:${cfg.keyVersion}:${b64e(salt)}:${b64e(iv)}:${b64e(ct)}`;
  }

  // ── 公共：解密 ──────────────────────────────────────────
  async function decrypt(ciphertext, agentId, password) {
    if (!ciphertext?.startsWith(PREFIX)) return ciphertext; // 明文，透明返回
    const [,,scope, ver, saltB64, ivB64, ctB64] = ciphertext.split(":");
    const dek = await _getDEK(agentId, password, scope, ver);
    try {
      const pt = await crypto.subtle.decrypt({ name:"AES-GCM", iv:b64d(ivB64) }, dek, b64d(ctB64));
      await _writeAudit(agentId, "decrypt", { scope, keyVersion: ver });
      const text = td.decode(pt);
      try { return JSON.parse(text); } catch { return text; }
    } catch {
      await _writeAudit(agentId, "decrypt_fail", { scope, keyVersion: ver });
      throw new Error("解密失败：密码错误或数据已损坏");
    }
  }

  // ── 公共：密钥轮换 ───────────────────────────────────────
  async function rotateKey(agentId, oldPassword, newPassword, opts = {}) {
    const cfg = await getConfig(agentId);
    if (!cfg) throw new Error("Agent 未配置加密");

    const oldVer  = cfg.keyVersion;
    const verNum  = parseInt(oldVer.slice(1)) + 1;
    const newVer  = `v${verNum}`;
    const newSalt = crypto.getRandomValues(new Uint8Array(16));
    const newKEK  = await _deriveKEK(newPassword, newSalt);

    // 为每个 scope 生成新 DEK，重加密存储数据
    const reEncryptedCounts = {};
    for (const sc of SCOPES) {
      // 生成新 DEK
      const newDEK     = await _genDEK();
      const newWrapped = await _wrapDEK(newDEK, newKEK);
      await window.storage.set(_dekKey(agentId, newVer, sc), newWrapped);

      // 重加密该 scope 下的所有数据
      let count = 0;
      try {
        const keys = await window.storage.list(`${sc}:${agentId}:`);
        for (const k of (keys?.keys || [])) {
          const res = await window.storage.get(k);
          if (!res?.value?.startsWith(PREFIX)) continue;
          const plain = await decrypt(res.value, agentId, oldPassword);
          const newCT = await _encryptWithDEK(plain, newDEK, sc, newVer);
          await window.storage.set(k, newCT);
          count++;
        }
      } catch(e) { /* scope 无数据时正常 */ }
      reEncryptedCounts[sc] = count;
    }

    // 更新配置
    cfg.keyVersion = newVer;
    cfg.salt       = b64e(newSalt);
    cfg.updatedAt  = new Date().toISOString();
    if (!opts.keepOldKey) {
      // 删除旧 DEK（紧急模式立即删，常规模式保留一个版本）
      if (opts.emergency) {
        for (const sc of SCOPES)
          await window.storage.delete(_dekKey(agentId, oldVer, sc)).catch(() => {});
      }
    }
    await window.storage.set(_cfgKey(agentId), JSON.stringify(cfg));
    await _writeAudit(agentId, "key_rotate", {
      oldVer, newVer,
      reason: opts.emergency ? "emergency" : "scheduled",
      reEncryptedCounts,
    });
    return { oldVer, newVer, reEncryptedCounts };
  }

  // ── 内部：用指定 DEK 直接加密（轮换内部用）──────────────
  async function _encryptWithDEK(plaintext, dek, scope, ver) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv   = crypto.getRandomValues(new Uint8Array(12));
    const ct   = await crypto.subtle.encrypt({ name:"AES-GCM", iv }, dek, te.encode(
      typeof plaintext === "string" ? plaintext : JSON.stringify(plaintext)
    ));
    return `${PREFIX}${scope}:${ver}:${b64e(salt)}:${b64e(iv)}:${b64e(ct)}`;
  }

  // ── 公共：读取配置 ───────────────────────────────────────
  async function getConfig(agentId) {
    try {
      const r = await window.storage.get(_cfgKey(agentId));
      return r ? JSON.parse(r.value) : null;
    } catch { return null; }
  }

  // ── 公共：更新 scope 配置 ────────────────────────────────
  async function updateScopes(agentId, scopeUpdates) {
    const cfg = await getConfig(agentId);
    if (!cfg) throw new Error("Agent 未配置加密，请先 setup");
    Object.assign(cfg.scopes, scopeUpdates);
    cfg.updatedAt = new Date().toISOString();
    await window.storage.set(_cfgKey(agentId), JSON.stringify(cfg));
    await _writeAudit(agentId, "update_scopes", scopeUpdates);
  }

  // ── 公共：禁用加密 ───────────────────────────────────────
  async function disable(agentId) {
    const cfg = await getConfig(agentId);
    if (!cfg) return;
    cfg.enabled = false;
    cfg.updatedAt = new Date().toISOString();
    await window.storage.set(_cfgKey(agentId), JSON.stringify(cfg));
    await _writeAudit(agentId, "disable", {});
  }

  // ── 公共：写审计日志 ─────────────────────────────────────
  async function _writeAudit(agentId, operation, meta = {}) {
    try {
      const key = _auditKey(agentId);
      let log = [];
      try {
        const r = await window.storage.get(key);
        if (r) log = JSON.parse(r.value);
      } catch {}
      log.push({ ts: new Date().toISOString(), op: operation, ...meta });
      if (log.length > 500) log = log.slice(-500); // 保留最近 500 条
      await window.storage.set(key, JSON.stringify(log));
    } catch {} // 审计失败不阻塞主流程
  }

  // ── 公共：读审计日志 ─────────────────────────────────────
  async function getAuditLog(agentId, opts = {}) {
    try {
      const r = await window.storage.get(_auditKey(agentId));
      let log = r ? JSON.parse(r.value) : [];
      if (opts.operation) log = log.filter(e => e.op === opts.operation);
      if (opts.last)      log = log.slice(-opts.last);
      return log;
    } catch { return []; }
  }

  const isEncrypted = v => typeof v === "string" && v.startsWith(PREFIX);

  return { setup, encrypt, decrypt, rotateKey, getConfig, updateScopes, disable, getAuditLog, isEncrypted };
})();
// ═══════════════════════════════════════════════════════════
```

---

## 三种主密钥来源

v4 新增主密钥提供者（Key Provider）抽象层，在 KEK 派生前统一获取主密码/密钥材料：

```
用户选择 Key Provider
    │
    ├─► manual   — 用户直接在 UI 输入密码（默认，v3 行为）
    ├─► 1password — 从 1Password vault 读取（新增）
    ├─► aws_kms  — 用 AWS KMS 数据密钥（新增）
    └─► gcp_kms  — 用 GCP KMS 数据密钥（新增）
         │
         ▼
    主密码/密钥材料  →  PBKDF2 派生 KEK  →  解包 DEK  →  加解密数据
```

详细接口规范见 `references/key-providers.md`。

---

## 参考实现与脚本

- `references/full-implementation.md` — 完整管理面板 Artifact（含 Key Provider 选择、轮换 & 审计 UI）
- `references/key-providers.md` — 三种 Key Provider 接口规范与对接代码
- `references/storage-keys.md` — window.storage key 命名规范
- `scripts/migration-helper.js` — v2/v3 → v4 数据迁移

---

## 构建 Artifact 检查清单

- [ ] 复制了完整 `OCE` 模块 + `OCEKeyProviders` 模块
- [ ] 没有任何 Python 包 / `localStorage`
- [ ] 1Password 模式：通过 `window.clawdRPC("1password.readSecret", ...)` 调用，不直接调 `op` CLI
- [ ] AWS/GCP KMS 模式：`fetch()` 只调用 KMS 端点，不调其他地址
- [ ] 主密码/密钥材料只在内存中，不写入 `window.storage`
- [ ] 加密/解密失败时抛出异常，不静默降级
- [ ] 审计日志记录 Key Provider 类型（不记录密钥值）
