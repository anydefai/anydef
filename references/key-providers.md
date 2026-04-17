# Key Provider 规范 v4

## 概述

Key Provider 是主密钥获取的抽象层，在调用 `OCE.setup()` 或 `OCE.rotateKey()` 时，
替代手动输入密码，从外部密钥管理服务安全获取主密码材料。

获取到的密钥材料直接传入 PBKDF2 派生 KEK，后续流程与 v3 完全一致。

---

## OCEKeyProviders 模块（必须完整复制到 Artifact）

```javascript
// ════════════════════════════════════════════════════════
//  OCEKeyProviders — Key Provider 抽象层 v4
//  支持：manual | 1password | aws_kms | gcp_kms
//  无外部依赖，fetch() 仅用于 KMS API 调用
// ════════════════════════════════════════════════════════
const OCEKeyProviders = (() => {

  // ── Provider 配置存储 key ──────────────────────────────
  const _cfgKey = agentId => `enc-kp-cfg:${agentId}`;

  // ── 保存 Provider 配置（不含密钥值，只存引用信息）──────
  async function saveProviderConfig(agentId, config) {
    // config 示例：
    // { type: "1password", vault: "Private", item: "OpenClaw Keys", field: "agent_001_master" }
    // { type: "aws_kms",   keyId: "arn:aws:kms:...", region: "us-east-1" }
    // { type: "gcp_kms",   keyName: "projects/.../cryptoKeyVersions/1" }
    // { type: "manual" }   — 不存任何引用，密码由用户每次输入
    const safe = { ...config };
    // 确保不意外存储密钥值
    delete safe.password; delete safe.token; delete safe.accessKey; delete safe.secretKey;
    await window.storage.set(_cfgKey(agentId), JSON.stringify({ ...safe, savedAt: new Date().toISOString() }));
  }

  async function getProviderConfig(agentId) {
    try {
      const r = await window.storage.get(_cfgKey(agentId));
      return r ? JSON.parse(r.value) : { type: "manual" };
    } catch { return { type: "manual" }; }
  }

  // ════════════════════════════════════════════════════════
  //  Provider 1：manual（默认，v3 行为）
  //  直接返回用户传入的密码字符串
  // ════════════════════════════════════════════════════════
  async function resolveManual(password) {
    if (!password) throw new Error("manual 模式需要提供密码");
    return password; // 直接返回，不做任何转换
  }

  // ════════════════════════════════════════════════════════
  //  Provider 2：1Password
  //  通过 OpenClaw Gateway RPC 1password.readSecret 获取密钥
  //
  //  两种模式：
  //    A) Gateway RPC（推荐）：window.clawdRPC("1password.readSecret", ref)
  //       要求 1password 或 1password-ui skill 已安装
  //    B) Connect REST API（Docker 部署）：
  //       直接调用 OP_CONNECT_HOST REST 端点
  // ════════════════════════════════════════════════════════
  async function resolve1Password(config) {
    // config 字段：
    //   vault   - Vault 名称，如 "Private"
    //   item    - Item 名称，如 "OpenClaw Encryption Keys"
    //   field   - 字段名称，如 "agent_001_master_key"
    //   mode    - "rpc"（默认）| "connect"
    //   connectHost  - Connect 模式: OP_CONNECT_HOST 值
    //   connectToken - Connect 模式: OP_CONNECT_TOKEN 值

    const { vault, item, field, mode = "rpc", connectHost, connectToken } = config;
    if (!vault || !item || !field) {
      throw new Error("1Password 配置缺少必填项：vault / item / field");
    }

    // ── 模式 A：通过 OpenClaw Gateway RPC ──────────────────
    if (mode === "rpc") {
      if (typeof window.clawdRPC !== "function") {
        throw new Error(
          "window.clawdRPC 不可用。请确认：\n" +
          "1. openclaw 1password skill 已安装\n" +
          "2. 1Password 已登录（op whoami 验证）\n" +
          "3. 此 Artifact 运行在 OpenClaw 环境中"
        );
      }

      // Secret reference 格式：op://Vault/Item/field
      const secretRef = `op://${vault}/${item}/${field}`;

      let result;
      try {
        result = await window.clawdRPC("1password.readSecret", { ref: secretRef });
      } catch (e) {
        throw new Error(`1Password RPC 调用失败：${e.message}\n` +
          "请检查 1password skill 是否已登录，以及 item/field 引用是否正确。");
      }

      const secret = result?.value ?? result?.secret ?? result;
      if (!secret || typeof secret !== "string") {
        throw new Error(`1Password 返回值为空或格式不符（ref: ${secretRef}）`);
      }
      return secret;
    }

    // ── 模式 B：1Password Connect REST API ────────────────
    if (mode === "connect") {
      if (!connectHost || !connectToken) {
        throw new Error("Connect 模式需要 connectHost 和 connectToken");
      }

      const base = connectHost.replace(/\/$/, "");

      // Step 1: 查找 vault UUID
      const vaultsResp = await fetch(`${base}/v1/vaults`, {
        headers: { Authorization: `Bearer ${connectToken}` }
      });
      if (!vaultsResp.ok) throw new Error(`1Password Connect vaults 请求失败: ${vaultsResp.status}`);
      const vaults = await vaultsResp.json();
      const targetVault = vaults.find(v => v.name === vault);
      if (!targetVault) throw new Error(`1Password vault 不存在: "${vault}"`);

      // Step 2: 查找 item UUID
      const itemsResp = await fetch(
        `${base}/v1/vaults/${targetVault.id}/items?filter=title eq "${encodeURIComponent(item)}"`,
        { headers: { Authorization: `Bearer ${connectToken}` } }
      );
      if (!itemsResp.ok) throw new Error(`1Password Connect items 请求失败: ${itemsResp.status}`);
      const items = await itemsResp.json();
      const targetItem = items.find(i => i.title === item);
      if (!targetItem) throw new Error(`1Password item 不存在: "${item}"`);

      // Step 3: 读取完整 item（含字段值）
      const itemResp = await fetch(
        `${base}/v1/vaults/${targetVault.id}/items/${targetItem.id}`,
        { headers: { Authorization: `Bearer ${connectToken}` } }
      );
      if (!itemResp.ok) throw new Error(`1Password Connect item 详情请求失败: ${itemResp.status}`);
      const itemData = await itemResp.json();

      const targetField = itemData.fields?.find(f => f.label === field || f.id === field);
      if (!targetField?.value) throw new Error(`1Password 字段不存在或为空: "${field}"`);

      return targetField.value;
    }

    throw new Error(`未知的 1Password 模式: ${mode}`);
  }

  // ════════════════════════════════════════════════════════
  //  Provider 3：AWS KMS
  //  用 GenerateDataKey 生成数据密钥，取明文部分作为主密码材料
  //  注意：每次调用生成不同密钥 → 适合 setup/rotate，不适合每次解密
  //  解密场景：存储加密后的数据密钥（EncryptedDataKey），用 Decrypt 解包
  // ════════════════════════════════════════════════════════
  async function resolveAWSKMS(config) {
    // config 字段：
    //   keyId       - KMS 密钥 ARN 或别名，如 "arn:aws:kms:us-east-1:123:key/xxx"
    //   region      - AWS 区域，如 "us-east-1"
    //   accessKeyId     - AWS Access Key ID
    //   secretAccessKey - AWS Secret Access Key
    //   sessionToken    - （可选）临时凭证 Session Token
    //   encryptedDek    - （解密模式）之前由 KMS 加密的数据密钥 Base64

    const { keyId, region, accessKeyId, secretAccessKey, sessionToken, encryptedDek } = config;
    if (!keyId || !region || !accessKeyId || !secretAccessKey) {
      throw new Error("AWS KMS 配置缺少必填项：keyId / region / accessKeyId / secretAccessKey");
    }

    const endpoint = `https://kms.${region}.amazonaws.com/`;

    // ── AWS Signature V4 签名 ──────────────────────────────
    async function signV4(method, body, service, action) {
      const te = new TextEncoder();
      const now = new Date();
      const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "").slice(0, 15) + "Z";
      const dateStamp = amzDate.slice(0, 8);

      const bodyHash = await crypto.subtle.digest("SHA-256", te.encode(body));
      const bodyHashHex = Array.from(new Uint8Array(bodyHash)).map(b => b.toString(16).padStart(2,"0")).join("");

      const canonicalHeaders = `content-type:application/x-amz-json-1.1\nhost:kms.${region}.amazonaws.com\nx-amz-date:${amzDate}\n`;
      const signedHeaders = "content-type;host;x-amz-date";
      const canonicalRequest = [method, "/", "", canonicalHeaders, signedHeaders, bodyHashHex].join("\n");

      const crHash = await crypto.subtle.digest("SHA-256", te.encode(canonicalRequest));
      const crHex = Array.from(new Uint8Array(crHash)).map(b => b.toString(16).padStart(2,"0")).join("");
      const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
      const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${crHex}`;

      async function hmac(key, data) {
        const k = await crypto.subtle.importKey("raw", key, { name:"HMAC", hash:"SHA-256" }, false, ["sign"]);
        return new Uint8Array(await crypto.subtle.sign("HMAC", k, te.encode(data)));
      }
      const kDate    = await hmac(te.encode(`AWS4${secretAccessKey}`), dateStamp);
      const kRegion  = await hmac(kDate, region);
      const kService = await hmac(kRegion, service);
      const kSigning = await hmac(kService, "aws4_request");
      const sigBytes = await hmac(kSigning, stringToSign);
      const signature = Array.from(sigBytes).map(b => b.toString(16).padStart(2,"0")).join("");

      const headers = {
        "Content-Type": "application/x-amz-json-1.1",
        "X-Amz-Date": amzDate,
        "X-Amz-Target": `TrentService.${action}`,
        Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope},SignedHeaders=${signedHeaders},Signature=${signature}`,
      };
      if (sessionToken) headers["X-Amz-Security-Token"] = sessionToken;
      return headers;
    }

    if (encryptedDek) {
      // ── 解密模式：Decrypt 已加密的数据密钥 ──
      const body = JSON.stringify({ CiphertextBlob: encryptedDek, KeyId: keyId });
      const headers = await signV4("POST", body, "kms", "Decrypt");
      const resp = await fetch(endpoint, { method: "POST", headers, body });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(`AWS KMS Decrypt 失败 (${resp.status}): ${err.message || err.__type || ""}`);
      }
      const data = await resp.json();
      // Plaintext 是 Base64，作为主密码材料
      return data.Plaintext;
    } else {
      // ── 生成模式：GenerateDataKey，取明文密钥材料 ──
      const body = JSON.stringify({ KeyId: keyId, KeySpec: "AES_256" });
      const headers = await signV4("POST", body, "kms", "GenerateDataKey");
      const resp = await fetch(endpoint, { method: "POST", headers, body });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(`AWS KMS GenerateDataKey 失败 (${resp.status}): ${err.message || err.__type || ""}`);
      }
      const data = await resp.json();
      // 返回 { Plaintext: "<base64>", CiphertextBlob: "<base64>" }
      // 调用方应将 CiphertextBlob 存入 enc-cfg，下次用 encryptedDek 解密
      return { plaintext: data.Plaintext, encryptedDek: data.CiphertextBlob };
    }
  }

  // ════════════════════════════════════════════════════════
  //  Provider 4：GCP KMS
  //  用 generateRandomBytes（>= 256bit）作为主密码材料
  //  或用 encrypt/decrypt 包装本地生成的随机密钥
  // ════════════════════════════════════════════════════════
  async function resolveGCPKMS(config) {
    // config 字段：
    //   keyName    - 完整资源名称
    //               "projects/P/locations/L/keyRings/R/cryptoKeys/K/cryptoKeyVersions/V"
    //   accessToken - GCP OAuth2 / Service Account access token
    //   encryptedDek - （解密模式）之前由 GCP KMS 加密的数据密钥 Base64

    const { keyName, accessToken, encryptedDek } = config;
    if (!keyName || !accessToken) {
      throw new Error("GCP KMS 配置缺少必填项：keyName / accessToken");
    }

    const baseUrl = "https://cloudkms.googleapis.com/v1";
    const authHeader = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };

    if (encryptedDek) {
      // ── 解密模式：decrypt 已加密的数据密钥 ──
      const resp = await fetch(`${baseUrl}/${keyName}:decrypt`, {
        method: "POST",
        headers: authHeader,
        body: JSON.stringify({ ciphertext: encryptedDek }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(`GCP KMS decrypt 失败 (${resp.status}): ${err.error?.message || ""}`);
      }
      const data = await resp.json();
      return data.plaintext; // Base64，作为主密码材料
    } else {
      // ── 生成模式：本地生成随机密钥，用 GCP KMS encrypt 包装 ──
      const rawKey = crypto.getRandomValues(new Uint8Array(32));
      const b64e = b => btoa(String.fromCharCode(...new Uint8Array(b)));
      const plaintextB64 = b64e(rawKey);

      // 用 GCP KMS 加密密钥材料（用于后续解密恢复）
      // 注意：keyName 此处应指向 cryptoKey（不含版本号）以支持自动轮换
      const keyForEncrypt = keyName.replace(/\/cryptoKeyVersions\/\d+$/, "");
      const encResp = await fetch(`${baseUrl}/${keyForEncrypt}:encrypt`, {
        method: "POST",
        headers: authHeader,
        body: JSON.stringify({ plaintext: plaintextB64 }),
      });
      if (!encResp.ok) {
        const err = await encResp.json().catch(() => ({}));
        throw new Error(`GCP KMS encrypt 失败 (${encResp.status}): ${err.error?.message || ""}`);
      }
      const encData = await encResp.json();
      // 返回明文材料 + 加密后的材料（供 enc-cfg 存储，下次解密用）
      return { plaintext: plaintextB64, encryptedDek: encData.ciphertext };
    }
  }

  // ════════════════════════════════════════════════════════
  //  统一入口：resolve(agentId, overrideConfig?)
  //  根据 Agent 存储的 Provider 配置自动选择实现
  // ════════════════════════════════════════════════════════
  async function resolve(agentId, overrideConfig = {}) {
    const stored = await getProviderConfig(agentId);
    const config = { ...stored, ...overrideConfig };

    switch (config.type) {
      case "manual":
      case undefined:
        return resolveManual(overrideConfig.password ?? config.password);

      case "1password":
        return resolve1Password(config);

      case "aws_kms": {
        const result = await resolveAWSKMS(config);
        if (typeof result === "string") return result;        // 解密模式
        return result.plaintext;                              // 生成模式，返回明文
      }

      case "gcp_kms": {
        const result = await resolveGCPKMS(config);
        if (typeof result === "string") return result;        // 解密模式
        return result.plaintext;                              // 生成模式，返回明文
      }

      default:
        throw new Error(`未知的 Key Provider 类型: ${config.type}`);
    }
  }

  return {
    resolve,
    saveProviderConfig,
    getProviderConfig,
    // 暴露各 provider 函数，供高级用法（如在 rotate 时同时获取 encryptedDek）
    resolveManual,
    resolve1Password,
    resolveAWSKMS,
    resolveGCPKMS,
  };
})();
// ════════════════════════════════════════════════════════
```

---

## 与 OCE.setup / OCE.rotateKey 集成

v4 的 `OCE.setup()` 和 `OCE.rotateKey()` 接受 `keyMaterial` 参数替代明文密码：

```javascript
// ── manual 模式（与 v3 完全兼容）──
await OCE.setup(agentId, { type: "manual", password: "my-password" }, scopeConfig);

// ── 1Password 模式 ──
await OCEKeyProviders.saveProviderConfig(agentId, {
  type: "1password",
  vault: "Private",
  item: "OpenClaw Encryption Keys",
  field: "agent_001_master",
  mode: "rpc",   // "rpc"（本地）或 "connect"（Docker）
});
const masterKey = await OCEKeyProviders.resolve(agentId);
await OCE.setup(agentId, { type: "derived", keyMaterial: masterKey }, scopeConfig);

// ── AWS KMS 模式（首次 setup）──
const kmsResult = await OCEKeyProviders.resolveAWSKMS({
  keyId: "arn:aws:kms:us-east-1:123456789:key/xxxx",
  region: "us-east-1",
  accessKeyId: "AKIA...",
  secretAccessKey: "...",
});
// 存储 encryptedDek 到 Agent 配置，供后续解密使用
await OCEKeyProviders.saveProviderConfig(agentId, {
  type: "aws_kms",
  keyId: "arn:aws:kms:...",
  region: "us-east-1",
  encryptedDek: kmsResult.encryptedDek,  // 重要：存储加密后的 DEK
});
await OCE.setup(agentId, { type: "derived", keyMaterial: kmsResult.plaintext }, scopeConfig);

// ── 后续解密时（aws_kms / gcp_kms 需传 accessKeyId 等凭证）──
const masterKey2 = await OCEKeyProviders.resolve(agentId, {
  accessKeyId: "AKIA...",
  secretAccessKey: "...",
});
await OCE.decrypt(ciphertext, agentId, masterKey2);
```

---

## 1Password 字段约定

建议在 1Password 中为 OpenClaw 创建专用 item：

```
Vault:  Private（或专用的 "OpenClaw" vault）
Item:   OpenClaw Encryption Keys
Fields:
  agent_001_master   → 64位随机字符串（master key for agent_001）
  agent_002_master   → 64位随机字符串（master key for agent_002）
  ...
```

生成随机 master key 的方法：
```bash
# 在终端生成 64 字符随机 key
op item create --category="Secure Note" --title="OpenClaw Encryption Keys" \
  --vault="Private" \
  "agent_001_master[password]=$(openssl rand -base64 48)"
```

---

## KMS 密钥材料生命周期

| 场景 | AWS KMS | GCP KMS |
|------|---------|---------|
| 首次 setup | `GenerateDataKey` → 存 `encryptedDek` | 本地生成 + `encrypt` → 存 `encryptedDek` |
| 每次解密 | `Decrypt(encryptedDek)` → 得到 plaintext | `decrypt(encryptedDek)` → 得到 plaintext |
| 密钥轮换 | 重新 `GenerateDataKey`，更新 `encryptedDek` | 重新生成 + `encrypt`，更新 `encryptedDek` |
| 紧急撤销 | 在 KMS 控制台 Disable/Delete Key | 在 GCP Console Destroy Key Version |
