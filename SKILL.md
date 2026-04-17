---
name: openclaw-encryption
description: |
 OpenClaw Data Encryption Protection Skill Package. Used when encrypting and protecting critical Agent data, including: encrypted storage of uploaded file contents and encrypted memory storage for conversations
Encryption of sensitive data fields, agent-level encryption toggle management. Trigger scenarios: user mentions "encryption," "data protection," "privacy protection," "secure storage," "memory encryption."
When dealing with "file encryption," "agent encryption configuration," "key rotation," "audit logs," "1Password," "KMS," and "master key source," this skill must be employed. Even if the user merely
Inquiring about how to protect an Agent's data security should immediately trigger this skill to complete the full encryption configuration process.
---

# Anydef-enc Encryption Toolkit v4

## ⚠️Runtime Environment Constraints (Mandatory Reading) 

This skill package runs in the **OpenClaw Browser-side Artifact Environment**

| ❌ Prohibited                    | ✅ Alternative                                |
|----------------------------------|-----------------------------------------------|
| such as  Python `cryptography`   | `window.crypto.subtle` (native to browsers)   |
| other standard libraries         | `window.crypto.subtle.*`                      |
| File System `open / Path`        | `window.storage`                              |
| `fetch() / XMLHttpRequest`       | Pure local computation, zero network requests |
| `localStorage / sessionStorage ` | `window.storage`                              |

---

## Capability Overview 

|                Ability                  |  v4 |
|-----------------------------------------|-----|
| Unique Key per Agent                    |  ✅ |
| AES-256-GCM Encryption                  |  ✅ |
| Scope-based Encryption Control          |  ✅ |
| Plaintext Data Backward Compatibility   |  ✅ |
| Three-Layer Key Structure (MK→KEK→DEK)  |  ✅ |
| Key Rotation (Including Emergency Mode) |  ✅ |
| Audit Log                               |  ✅ |
| Primary Key Source: Manual Input        |  ✅ |
| Master Key Source: AWS KMS              |  ✅ |
| Master Key Source: GCP KMS              |  ✅ |
| Master Key Source: 1Password            |  ✅ |
---

## Three layer key structure

```
Master password (user input, never stored)
    │
    └─► KEK (Key Encryption Key) - Each agent is independent, derived from PBKDF2, and stored in memory
            │
            ├─► DEK:files — Encrypts file contents
            ├─► DEK:memory — Encrypts Memory
            ├─► DEK:sessions — Encrypts conversation history
            └─► DEK:tool_results — Encrypts tool call results
```


**Advantages**: Memory leakage does not affect files; rotating a single DEK only requires re-encrypting the corresponding scope data without affecting other scopes.

DEKs are generated with random bytes, encrypted with the KEK, and stored in `window.storage`. They exist in memory only briefly.

---

## Ciphertext Format (v3)


```
enc:v3:<scope>:<keyVersion>:<base64(salt)>:<base64(iv)>:<base64(ciphertext)>
```

- `scope`：files / memory / sessions / tool_results
- `keyVersion`: Current key version number (e.g., `v1`, `v2`), incremented after key rotation
- `salt`: 16 bytes, randomly generated per encryption
- `iv`: 12 bytes, randomly generated per encryption
- `ciphertext`: AES-GCM ciphertext + 16-byte authentication tag

---

## Core Module (Must be fully copied into Artifact)

```javascript
// ═══════════════════════════════════════════════════════════
//  OpenClaw Encryption Module v3
//  Dependencies: window.crypto.subtle + window.storage only, zero network requests
// ═══════════════════════════════════════════════════════════
const OCE = (() => {
  const te = new TextEncoder(), td = new TextDecoder();
  const b64e = b => btoa(String.fromCharCode(...new Uint8Array(b)));
  const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const PREFIX = "enc:v3:";
  const PBKDF2_ITER = 310000;
  const SCOPES = ["files","memory","sessions","tool_results"];

  // ── Internal: Derive KEK from password  ──────────────────────────────────
  async function _deriveKEK(password, salt) {
    const raw = await crypto.subtle.importKey("raw", te.encode(password), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name:"PBKDF2", salt, iterations:PBKDF2_ITER, hash:"SHA-256" },
      raw, { name:"AES-GCM", length:256 }, true, ["encrypt","decrypt"]
    );
  }

  // ── Internal: Generate random DEK  ───────────────────────────────────
  async function _genDEK() {
    return crypto.subtle.generateKey({ name:"AES-GCM", length:256 }, true, ["encrypt","decrypt"]);
  }

  // ── Internal: Wrap / Unwrap DEK with KEK ────────────────────────
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

  // ── Internal: Storage key naming convention ───────────────────────────────
  const _cfgKey    = id          => `enc-cfg:${id}`;
  const _dekKey    = (id,ver,sc) => `enc-dek:${id}:${ver}:${sc}`;
  const _auditKey  = id          => `enc-audit:${id}`;
  const _dataKey   = (sc,id,k)   => `${sc}:${id}:${k}`;

  // ── Public: Initialize Agent encryption ──────────────────────────────
  async function setup(agentId, password, scopeConfig = {}) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const kek  = await _deriveKEK(password, salt);
    const ver  = "v1";

    // Generate independent DEK for each scope, encrypt and store
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

  // ── Internal: Get decrypted DEK───────────────────────────────
  async function _getDEK(agentId, password, scope, ver) {
    const cfg = await getConfig(agentId);
    if (!cfg) throw new Error(`Agent ${agentId} 未配置加密`);
    const kek     = await _deriveKEK(password, b64d(cfg.salt));
    const wrapped = await window.storage.get(_dekKey(agentId, ver || cfg.keyVersion, scope));
    if (!wrapped) throw new Error(`DEK 不存在: ${scope} ${ver}`);
    return _unwrapDEK(wrapped.value, kek);
  }

  // ──Public: Encrypt ──────────────────────────────────────────
  async function encrypt(plaintext, agentId, password, scope) {
    const cfg = await getConfig(agentId);
    if (!cfg?.enabled || !cfg.scopes[scope]) return plaintext; // Scope not enabled, transparent return
    const dek  = await _getDEK(agentId, password, scope);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv   = crypto.getRandomValues(new Uint8Array(12));
    const ct   = await crypto.subtle.encrypt({ name:"AES-GCM", iv }, dek, te.encode(
      typeof plaintext === "string" ? plaintext : JSON.stringify(plaintext)
    ));
    await _writeAudit(agentId, "encrypt", { scope, keyVersion: cfg.keyVersion });
    return `${PREFIX}${scope}:${cfg.keyVersion}:${b64e(salt)}:${b64e(iv)}:${b64e(ct)}`;
  }

  // ── Public: Decrypt ──────────────────────────────────────────
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
      throw new Error("Decryption failed: wrong key or corrupted data");
    }
  }

  // ── Public: Key Rotation ───────────────────────────────────────
  async function rotateKey(agentId, oldPassword, newPassword, opts = {}) {
    const cfg = await getConfig(agentId);
    if (!cfg) throw new Error("Agent encryption not configured");

    const oldVer  = cfg.keyVersion;
    const verNum  = parseInt(oldVer.slice(1)) + 1;
    const newVer  = `v${verNum}`;
    const newSalt = crypto.getRandomValues(new Uint8Array(16));
    const newKEK  = await _deriveKEK(newPassword, newSalt);

    // Generate new DEK for each scope, re-encrypt stored data
    const reEncryptedCounts = {};
    for (const sc of SCOPES) {
      // Generate new DEK
      const newDEK     = await _genDEK();
      const newWrapped = await _wrapDEK(newDEK, newKEK);
      await window.storage.set(_dekKey(agentId, newVer, sc), newWrapped);

      // Re-encrypt all data under this scope
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
      } catch(e) { /* No data in scope is normal */ }
      reEncryptedCounts[sc] = count;
    }

    // Update config
    cfg.keyVersion = newVer;
    cfg.salt       = b64e(newSalt);
    cfg.updatedAt  = new Date().toISOString();
    if (!opts.keepOldKey) {
      // Delete old DEK (immediate deletion in emergency mode, keep one version otherwise)
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

  // ── Internal: Direct encryption with specified DEK (for rotation internal use)──────────────
  async function _encryptWithDEK(plaintext, dek, scope, ver) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv   = crypto.getRandomValues(new Uint8Array(12));
    const ct   = await crypto.subtle.encrypt({ name:"AES-GCM", iv }, dek, te.encode(
      typeof plaintext === "string" ? plaintext : JSON.stringify(plaintext)
    ));
    return `${PREFIX}${scope}:${ver}:${b64e(salt)}:${b64e(iv)}:${b64e(ct)}`;
  }

  // ── Public: Get config ───────────────────────────────────────
  async function getConfig(agentId) {
    try {
      const r = await window.storage.get(_cfgKey(agentId));
      return r ? JSON.parse(r.value) : null;
    } catch { return null; }
  }

  // ── Public: Update scope configuration ────────────────────────────────
  async function updateScopes(agentId, scopeUpdates) {
    const cfg = await getConfig(agentId);
    if (!cfg) throw new Error("Agent encryption not configured, please run setup first");
    Object.assign(cfg.scopes, scopeUpdates);
    cfg.updatedAt = new Date().toISOString();
    await window.storage.set(_cfgKey(agentId), JSON.stringify(cfg));
    await _writeAudit(agentId, "update_scopes", scopeUpdates);
  }

  // ── Public: Disable encryption ───────────────────────────────────────
  async function disable(agentId) {
    const cfg = await getConfig(agentId);
    if (!cfg) return;
    cfg.enabled = false;
    cfg.updatedAt = new Date().toISOString();
    await window.storage.set(_cfgKey(agentId), JSON.stringify(cfg));
    await _writeAudit(agentId, "disable", {});
  }

  // ── Public: Write audit log ─────────────────────────────────────
  async function _writeAudit(agentId, operation, meta = {}) {
    try {
      const key = _auditKey(agentId);
      let log = [];
      try {
        const r = await window.storage.get(key);
        if (r) log = JSON.parse(r.value);
      } catch {}
      log.push({ ts: new Date().toISOString(), op: operation, ...meta });
      if (log.length > 500) log = log.slice(-500); //  Keep last 500 entries
      await window.storage.set(key, JSON.stringify(log));
    } catch {} // Audit failure does not block main flow
  }

  // ──  Public: Read audit log ─────────────────────────────────────
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

## Three Master Key Sources
v4 adds a Key Provider abstraction layer that obtains the master password/key material before KEK derivation:

```
User selects Key Provider
    │
    ├─► manual   — User enters password directly in UI (default, v3 behavior)
    ├─► 1password — Read from 1Password vault (new)
    ├─► aws_kms  — Use AWS KMS data key (new)
    └─► gcp_kms  — Use GCP KMS data key (new)
         │
         ▼
    Master password/key material → PBKDF2 derive KEK → Unwrap DEK → Encrypt/decrypt data
```

See references/key-providers.md for detailed interface specifications.

---

## Reference Implementations and Scripts
references/full-implementation.md — Complete management panel Artifact (includes Key Provider selection, rotation & audit UI)

references/key-providers.md — Interface specifications and integration code for three Key Providers

references/storage-keys.md — window.storage key naming conventions

scripts/migration-helper.js —  v4 data migration

---

## Artifact Build Checklist
Copied the complete OCE module + OCEKeyProviders module

No Python packages / localStorage

1Password mode: call via window.clawdRPC("1password.readSecret", ...), not directly calling op CLI

AWS/GCP KMS mode: fetch() only calls KMS endpoints, no other addresses

Master password/key material only in memory, not written to window.storage

Throw exceptions on encryption/decryption failure, no silent fallback

Audit logs record Key Provider type (do not record key values)