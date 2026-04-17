# 完整参考实现 v4：含 Key Provider 选择、密钥轮换 & 审计日志的管理面板

## 完整代码（可直接作为 Artifact）

```html
<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>OpenClaw 加密管理 v4</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
       background: #0f1117; color: #e1e4e8; min-height: 100vh; }
.tabs { display: flex; border-bottom: 1px solid #21262d; background: #161b22; }
.tab { padding: 12px 20px; cursor: pointer; font-size: 0.9rem; color: #8b949e;
       border-bottom: 2px solid transparent; transition: all .2s; user-select: none; }
.tab.active { color: #58a6ff; border-bottom-color: #58a6ff; }
.tab:hover:not(.active) { color: #c9d1d9; }
.panel { display: none; padding: 20px; max-width: 680px; margin: 0 auto; }
.panel.active { display: block; }
.card { background: #161b22; border: 1px solid #30363d; border-radius: 10px;
        padding: 18px; margin-bottom: 14px; }
.card-title { font-size: 0.82rem; color: #8b949e; text-transform: uppercase;
              letter-spacing: .06em; margin-bottom: 14px; font-weight: 600; }
.field { margin-bottom: 12px; }
.field-label { font-size: 0.82rem; color: #8b949e; margin-bottom: 5px; }
input[type="text"], input[type="password"] {
  width: 100%; padding: 7px 11px; background: #0d1117; border: 1px solid #30363d;
  border-radius: 6px; color: #e1e4e8; font-size: 0.88rem; outline: none; }
input:focus { border-color: #58a6ff; }
label.check { display: flex; align-items: center; gap: 9px; margin-bottom: 9px;
              cursor: pointer; font-size: 0.9rem; }
input[type="checkbox"] { width: 16px; height: 16px; accent-color: #58a6ff; }
button { padding: 7px 16px; border-radius: 6px; border: none; cursor: pointer;
         font-size: 0.88rem; font-weight: 500; transition: opacity .15s; }
button:hover { opacity: 0.82; }
button:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-p { background: #238636; color: #fff; }
.btn-s { background: #21262d; color: #c9d1d9; border: 1px solid #30363d; }
.btn-d { background: #da3633; color: #fff; }
.btn-w { background: #9e6a03; color: #fff; }
.row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
.msg { padding: 9px 13px; border-radius: 6px; font-size: 0.85rem; margin-top: 10px; display: none; }
.msg.ok   { background: #0f2d1a; border: 1px solid #238636; color: #3fb950; display: block; }
.msg.err  { background: #2d0f0f; border: 1px solid #da3633; color: #f85149; display: block; }
.msg.info { background: #0d1f38; border: 1px solid #1f6feb; color: #79c0ff; display: block; }
.badge { display: inline-flex; align-items: center; padding: 2px 9px; border-radius: 12px;
         font-size: 0.75rem; font-weight: 600; gap: 4px; }
.badge-on  { background: #0f2d1a; color: #3fb950; }
.badge-off { background: #21262d; color: #8b949e; }
.kv-grid { display: grid; grid-template-columns: 1fr 2fr; gap: 6px 12px;
           font-size: 0.85rem; align-items: start; }
.kv-key  { color: #8b949e; padding-top: 2px; }
.kv-val  { color: #e1e4e8; font-family: monospace; word-break: break-all; }
.scope-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
.scope-item { display: flex; align-items: center; gap: 6px; font-size: 0.85rem;
              padding: 4px 0; }
.dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.dot-on  { background: #3fb950; }
.dot-off { background: #484f58; }
table { width: 100%; border-collapse: collapse; font-size: 0.83rem; }
th { text-align: left; padding: 7px 10px; color: #8b949e; border-bottom: 1px solid #21262d;
     font-weight: 500; }
td { padding: 7px 10px; border-bottom: 1px solid #161b22; vertical-align: top; }
tr:hover td { background: #161b22; }
.mono { font-family: "SF Mono","Fira Code",monospace; font-size: 0.8rem; color: #79c0ff; }
.op-tag { display: inline-block; padding: 1px 7px; border-radius: 4px; font-size: 0.75rem;
          font-weight: 600; }
.op-setup    { background: #0d1f38; color: #58a6ff; }
.op-encrypt  { background: #0f2d1a; color: #3fb950; }
.op-decrypt  { background: #1a1f0d; color: #a8d5a2; }
.op-rotate   { background: #2d1f0a; color: #e3b341; }
.op-disable  { background: #2d0f0f; color: #f85149; }
.op-default  { background: #21262d; color: #8b949e; }
.divider { border: none; border-top: 1px solid #21262d; margin: 14px 0; }
.loading { text-align: center; color: #484f58; padding: 20px; font-size: 0.88rem; }
.empty   { text-align: center; color: #484f58; padding: 30px; font-size: 0.88rem; }
</style>
</head>
<body>

<!-- Tab 导航 -->
<div class="tabs">
  <div class="tab active" onclick="switchTab('config')">⚙️ 配置</div>
  <div class="tab" onclick="switchTab('keyprovider')">🔑 密钥来源</div>
  <div class="tab" onclick="switchTab('test')">🔒 加解密测试</div>
  <div class="tab" onclick="switchTab('rotate')">🔄 密钥轮换</div>
  <div class="tab" onclick="switchTab('audit')">📋 审计日志</div>
</div>

<!-- ── Tab 1：配置 ── -->
<div id="tab-config" class="panel active">
  <div class="card">
    <div class="card-title">Agent 选择</div>
    <div style="display:flex;gap:8px">
      <input type="text" id="agentId" value="agent_001" placeholder="Agent ID" style="flex:1">
      <button class="btn-s" onclick="loadStatus()">载入</button>
    </div>
  </div>

  <!-- 状态展示 -->
  <div class="card" id="statusCard" style="display:none">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <div class="card-title" style="margin:0">当前状态</div>
      <span id="encBadge" class="badge badge-off">未启用</span>
    </div>
    <div class="kv-grid" id="statusGrid"></div>
    <hr class="divider">
    <div class="card-title">加密范围</div>
    <div class="scope-grid" id="scopeGrid"></div>
  </div>

  <!-- 新建 / 修改配置 -->
  <div class="card">
    <div class="card-title">配置加密</div>
    <div class="field">
      <div class="field-label">加密范围</div>
      <label class="check"><input type="checkbox" id="sFiles" checked> 上传文件 (files)</label>
      <label class="check"><input type="checkbox" id="sMemory" checked> 对话记忆 (memory)</label>
      <label class="check"><input type="checkbox" id="sSessions"> 对话历史 (sessions)</label>
      <label class="check"><input type="checkbox" id="sToolResults"> 工具调用结果 (tool_results)</label>
    </div>
    <div class="field">
      <div class="field-label">密码（仅存于内存，不会被保存）</div>
      <input type="password" id="setupPwd" placeholder="设置加密密码...">
    </div>
    <div id="setupPwdNote" class="msg info" style="display:block;margin-bottom:10px">
      💡 当前使用手动密码模式。切换到「密钥来源」Tab 可配置 1Password / AWS KMS / GCP KMS。
    </div>
    <div class="row">
      <button class="btn-p" onclick="doSetup()">💾 初始化加密</button>
      <button class="btn-s" onclick="doUpdateScopes()">🔄 仅更新范围</button>
      <button class="btn-d" onclick="doDisable()">🔓 禁用加密</button>
    </div>
    <div id="configMsg" class="msg"></div>
  </div>
</div>

<!-- ── Tab 2：密钥来源 ── -->
<div id="tab-keyprovider" class="panel">

  <!-- Provider 类型选择 -->
  <div class="card">
    <div class="card-title">选择主密钥来源</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:4px">
      <label class="check" style="border:1px solid #30363d;border-radius:8px;padding:12px;cursor:pointer;margin:0" id="kpManualCard">
        <input type="radio" name="kpType" value="manual" checked onchange="switchKP()">
        <span>🔤 手动输入密码</span>
      </label>
      <label class="check" style="border:1px solid #30363d;border-radius:8px;padding:12px;cursor:pointer;margin:0" id="kp1pCard">
        <input type="radio" name="kpType" value="1password" onchange="switchKP()">
        <span>🔐 1Password</span>
      </label>
      <label class="check" style="border:1px solid #30363d;border-radius:8px;padding:12px;cursor:pointer;margin:0" id="kpAWSCard">
        <input type="radio" name="kpType" value="aws_kms" onchange="switchKP()">
        <span>☁️ AWS KMS</span>
      </label>
      <label class="check" style="border:1px solid #30363d;border-radius:8px;padding:12px;cursor:pointer;margin:0" id="kpGCPCard">
        <input type="radio" name="kpType" value="gcp_kms" onchange="switchKP()">
        <span>🌐 GCP KMS</span>
      </label>
    </div>
    <div id="kpMsg" class="msg"></div>
  </div>

  <!-- manual 配置（无需填写） -->
  <div id="kpPanel-manual" class="card">
    <div class="card-title">手动密码模式</div>
    <p style="font-size:0.88rem;color:#8b949e;line-height:1.6">
      每次使用加密功能时，在输入框中手动输入密码。密码不会被保存在任何地方。<br>
      这是默认模式，与 v3 版本行为完全一致。
    </p>
    <div class="row"><button class="btn-p" onclick="saveKPConfig('manual')">✅ 使用此模式</button></div>
  </div>

  <!-- 1Password 配置 -->
  <div id="kpPanel-1password" class="card" style="display:none">
    <div class="card-title">1Password 配置</div>
    <p style="font-size:0.85rem;color:#8b949e;margin-bottom:14px;line-height:1.6">
      通过 OpenClaw Gateway RPC（<code style="color:#79c0ff">1password.readSecret</code>）或
      1Password Connect REST API 读取密钥。<br>
      需要 <strong>1password</strong> 或 <strong>1password-ui</strong> skill 已安装并登录。
    </p>
    <div style="display:flex;gap:8px;margin-bottom:12px">
      <label class="check" style="margin:0"><input type="radio" name="opMode" value="rpc" checked onchange="toggleOPMode()"> 本地 CLI（Gateway RPC）</label>
      <label class="check" style="margin:0"><input type="radio" name="opMode" value="connect" onchange="toggleOPMode()"> Docker（Connect API）</label>
    </div>
    <div class="field">
      <div class="field-label">Vault 名称</div>
      <input type="text" id="opVault" placeholder="Private" value="Private">
    </div>
    <div class="field">
      <div class="field-label">Item 名称</div>
      <input type="text" id="opItem" placeholder="OpenClaw Encryption Keys">
    </div>
    <div class="field">
      <div class="field-label">字段名称（对应该 Agent 的 master key）</div>
      <input type="text" id="opField" placeholder="agent_001_master">
    </div>
    <div id="connectFields" style="display:none">
      <div class="field">
        <div class="field-label">Connect Host（OP_CONNECT_HOST）</div>
        <input type="text" id="opConnectHost" placeholder="http://localhost:8080">
      </div>
      <div class="field">
        <div class="field-label">Connect Token（OP_CONNECT_TOKEN）</div>
        <input type="password" id="opConnectToken" placeholder="eyJ...">
      </div>
    </div>
    <div class="row">
      <button class="btn-s" onclick="testKP1P()">🧪 测试连接</button>
      <button class="btn-p" onclick="saveKPConfig('1password')">💾 保存配置</button>
    </div>
    <div id="kpTestMsg" class="msg"></div>
    <details style="margin-top:14px">
      <summary style="font-size:0.82rem;color:#8b949e;cursor:pointer">📖 如何在 1Password 中创建密钥</summary>
      <pre style="margin-top:10px;font-size:0.78rem;color:#79c0ff;background:#0d1117;padding:12px;border-radius:6px;overflow-x:auto">op item create \
  --category="Secure Note" \
  --title="OpenClaw Encryption Keys" \
  --vault="Private" \
  "agent_001_master[password]=$(openssl rand -base64 48)"</pre>
    </details>
  </div>

  <!-- AWS KMS 配置 -->
  <div id="kpPanel-aws_kms" class="card" style="display:none">
    <div class="card-title">AWS KMS 配置</div>
    <p style="font-size:0.85rem;color:#8b949e;margin-bottom:14px;line-height:1.6">
      首次 setup 时调用 <code style="color:#79c0ff">GenerateDataKey</code> 生成密钥材料，
      并将加密后的数据密钥（EncryptedDataKey）保存在 Agent 配置中。
      每次解密时调用 <code style="color:#79c0ff">Decrypt</code> 恢复明文密钥。
    </p>
    <div class="field">
      <div class="field-label">KMS Key ARN 或别名</div>
      <input type="text" id="awsKeyId" placeholder="arn:aws:kms:us-east-1:123456789:key/xxxx">
    </div>
    <div class="field">
      <div class="field-label">AWS Region</div>
      <input type="text" id="awsRegion" placeholder="us-east-1">
    </div>
    <div class="field">
      <div class="field-label">Access Key ID</div>
      <input type="text" id="awsAKID" placeholder="AKIAIOSFODNN7EXAMPLE">
    </div>
    <div class="field">
      <div class="field-label">Secret Access Key</div>
      <input type="password" id="awsSAK" placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY">
    </div>
    <div class="field">
      <div class="field-label">Session Token（临时凭证，可选）</div>
      <input type="password" id="awsToken" placeholder="可留空（非 STS 临时凭证时）">
    </div>
    <div class="row">
      <button class="btn-s" onclick="testKPAWS()">🧪 测试连接</button>
      <button class="btn-p" onclick="saveKPConfig('aws_kms')">💾 保存配置</button>
    </div>
    <div id="kpAWSMsg" class="msg"></div>
    <p style="font-size:0.8rem;color:#484f58;margin-top:10px">
      ⚠️ AWS 凭证仅在内存中使用，不会写入 window.storage。
      建议使用最小权限 IAM 角色（仅允许 kms:GenerateDataKey + kms:Decrypt）。
    </p>
  </div>

  <!-- GCP KMS 配置 -->
  <div id="kpPanel-gcp_kms" class="card" style="display:none">
    <div class="card-title">GCP KMS 配置</div>
    <p style="font-size:0.85rem;color:#8b949e;margin-bottom:14px;line-height:1.6">
      首次 setup 时本地生成随机密钥，用 GCP KMS <code style="color:#79c0ff">encrypt</code> 包装后存储；
      每次解密时调用 <code style="color:#79c0ff">decrypt</code> 恢复明文密钥。
    </p>
    <div class="field">
      <div class="field-label">CryptoKey 资源名称</div>
      <input type="text" id="gcpKeyName" placeholder="projects/my-proj/locations/global/keyRings/my-ring/cryptoKeys/my-key">
    </div>
    <div class="field">
      <div class="field-label">Access Token（OAuth2 / Service Account）</div>
      <input type="password" id="gcpToken" placeholder="ya29.xxx...">
    </div>
    <div class="row">
      <button class="btn-s" onclick="testKPGCP()">🧪 测试连接</button>
      <button class="btn-p" onclick="saveKPConfig('gcp_kms')">💾 保存配置</button>
    </div>
    <div id="kpGCPMsg" class="msg"></div>
    <p style="font-size:0.8rem;color:#484f58;margin-top:10px">
      ⚠️ GCP Access Token 仅在内存中使用，不会写入 window.storage。
      建议使用专用 Service Account，并通过 Workload Identity 获取短期 token。
    </p>
  </div>

  <!-- 当前配置状态 -->
  <div class="card">
    <div class="card-title">当前 Agent 密钥来源</div>
    <div id="kpStatusGrid" class="kv-grid" style="font-size:0.85rem;color:#8b949e">点击上方保存后显示</div>
  </div>
</div>

<!-- ── Tab 3：加解密测试 ── -->
<div id="tab-test" class="panel">
  <div class="card">
    <div class="card-title">写入（加密存储）</div>
    <div style="display:flex;gap:8px;margin-bottom:10px">
      <div class="field" style="flex:1;margin:0">
        <div class="field-label">数据范围 (scope)</div>
        <select id="writeScope" style="width:100%;padding:7px 11px;background:#0d1117;
          border:1px solid #30363d;border-radius:6px;color:#e1e4e8;font-size:0.88rem">
          <option value="memory">memory</option>
          <option value="files">files</option>
          <option value="sessions">sessions</option>
          <option value="tool_results">tool_results</option>
        </select>
      </div>
      <div class="field" style="flex:1;margin:0">
        <div class="field-label">Key</div>
        <input type="text" id="writeKey" placeholder="例：user_pref">
      </div>
    </div>
    <div class="field">
      <div class="field-label">Value（明文）</div>
      <input type="text" id="writeValue" placeholder="输入要加密的内容...">
    </div>
    <div class="field">
      <div class="field-label">密码</div>
      <input type="password" id="writePwd" placeholder="加密密码">
    </div>
    <div class="row">
      <button class="btn-p" onclick="doWrite()">🔒 加密写入</button>
    </div>
    <div id="writeMsg" class="msg"></div>
    <div id="writeCT" class="mono" style="margin-top:10px;font-size:0.78rem;word-break:break-all;display:none"></div>
  </div>

  <div class="card">
    <div class="card-title">读取（解密）</div>
    <div style="display:flex;gap:8px;margin-bottom:10px">
      <div class="field" style="flex:1;margin:0">
        <div class="field-label">数据范围 (scope)</div>
        <select id="readScope" style="width:100%;padding:7px 11px;background:#0d1117;
          border:1px solid #30363d;border-radius:6px;color:#e1e4e8;font-size:0.88rem">
          <option value="memory">memory</option>
          <option value="files">files</option>
          <option value="sessions">sessions</option>
          <option value="tool_results">tool_results</option>
        </select>
      </div>
      <div class="field" style="flex:1;margin:0">
        <div class="field-label">Key</div>
        <input type="text" id="readKey" placeholder="例：user_pref">
      </div>
    </div>
    <div class="field">
      <div class="field-label">密码</div>
      <input type="password" id="readPwd" placeholder="解密密码">
    </div>
    <div class="row">
      <button class="btn-p" onclick="doRead()">🔓 读取并解密</button>
      <button class="btn-s" onclick="doReadRaw()">👁 查看原始密文</button>
    </div>
    <div id="readMsg" class="msg"></div>
    <div id="readResult" style="display:none;margin-top:10px">
      <div class="field-label" style="margin-bottom:5px">结果：</div>
      <div id="readResultText" class="mono"></div>
    </div>
  </div>
</div>

<!-- ── Tab 3：密钥轮换 ── -->
<div id="tab-rotate" class="panel">
  <div class="card" style="border-color:#e3b34140">
    <div class="card-title">密钥轮换</div>
    <p style="font-size:0.85rem;color:#8b949e;margin-bottom:14px;line-height:1.6">
      轮换会为每个 scope 生成新的独立 DEK，并用新密码重新加密所有数据。
      旧 DEK 在本次轮换后删除（紧急模式立即删，常规模式保留至下次轮换）。
    </p>
    <div class="field">
      <div class="field-label">当前密码</div>
      <input type="password" id="rotOldPwd" placeholder="现在使用的密码">
    </div>
    <div class="field">
      <div class="field-label">新密码</div>
      <input type="password" id="rotNewPwd" placeholder="轮换后使用的新密码">
    </div>
    <div class="field">
      <div class="field-label">确认新密码</div>
      <input type="password" id="rotNewPwd2" placeholder="再次输入新密码">
    </div>
    <div class="row">
      <button class="btn-w" onclick="doRotate(false)" id="btnRotate">🔑 常规轮换</button>
      <button class="btn-d" onclick="doRotate(true)" id="btnRotateEmg">⚡ 紧急轮换（立即废弃旧密钥）</button>
    </div>
    <div id="rotateMsg" class="msg"></div>
    <div id="rotateResult" style="display:none;margin-top:12px">
      <div class="kv-grid" id="rotateResultGrid"></div>
    </div>
  </div>
</div>

<!-- ── Tab 4：审计日志 ── -->
<div id="tab-audit" class="panel">
  <div class="card">
    <div style="display:flex;gap:8px;align-items:flex-end">
      <div class="field" style="flex:1;margin:0">
        <div class="field-label">筛选操作类型</div>
        <select id="auditFilter" style="width:100%;padding:7px 11px;background:#0d1117;
          border:1px solid #30363d;border-radius:6px;color:#e1e4e8;font-size:0.88rem">
          <option value="">全部</option>
          <option value="setup">setup</option>
          <option value="encrypt">encrypt</option>
          <option value="decrypt">decrypt</option>
          <option value="decrypt_fail">decrypt_fail</option>
          <option value="key_rotate">key_rotate</option>
          <option value="disable">disable</option>
          <option value="update_scopes">update_scopes</option>
        </select>
      </div>
      <div class="field" style="flex:1;margin:0">
        <div class="field-label">最近 N 条</div>
        <input type="text" id="auditLast" value="50" placeholder="50">
      </div>
      <button class="btn-s" onclick="loadAudit()" style="flex-shrink:0">载入</button>
      <button class="btn-d" onclick="clearAudit()" style="flex-shrink:0">清空</button>
    </div>
  </div>

  <div class="card" style="padding:0;overflow:hidden">
    <div id="auditContent">
      <div class="empty">点击"载入"查看审计日志</div>
    </div>
  </div>
</div>

<script>
// ════════════════════════════════════════════════════════
//  OCE — OpenClaw Encryption Module v3
// ════════════════════════════════════════════════════════
const OCE = (() => {
  const te = new TextEncoder(), td = new TextDecoder();
  const b64e = b => btoa(String.fromCharCode(...new Uint8Array(b)));
  const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const PREFIX = "enc:v3:";
  const PBKDF2_ITER = 310000;
  const SCOPES = ["files","memory","sessions","tool_results"];

  async function _deriveKEK(password, salt) {
    const raw = await crypto.subtle.importKey("raw", te.encode(password), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name:"PBKDF2", salt, iterations:PBKDF2_ITER, hash:"SHA-256" },
      raw, { name:"AES-GCM", length:256 }, true, ["encrypt","decrypt"]
    );
  }
  async function _genDEK() {
    return crypto.subtle.generateKey({ name:"AES-GCM", length:256 }, true, ["encrypt","decrypt"]);
  }
  async function _wrapDEK(dek, kek) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const raw = await crypto.subtle.exportKey("raw", dek);
    const ct  = await crypto.subtle.encrypt({ name:"AES-GCM", iv }, kek, raw);
    return b64e(iv) + ":" + b64e(ct);
  }
  async function _unwrapDEK(wrapped, kek) {
    const [ivB64, ctB64] = wrapped.split(":");
    const raw = await crypto.subtle.decrypt({ name:"AES-GCM", iv:b64d(ivB64) }, kek, b64d(ctB64));
    return crypto.subtle.importKey("raw", raw, { name:"AES-GCM", length:256 }, true, ["encrypt","decrypt"]);
  }
  const _cfgKey   = id          => `enc-cfg:${id}`;
  const _dekKey   = (id,ver,sc) => `enc-dek:${id}:${ver}:${sc}`;
  const _auditKey = id          => `enc-audit:${id}`;

  async function _getDEK(agentId, password, scope, ver) {
    const cfg = await getConfig(agentId);
    if (!cfg) throw new Error(`Agent ${agentId} 未配置加密`);
    const kek     = await _deriveKEK(password, b64d(cfg.salt));
    const res     = await window.storage.get(_dekKey(agentId, ver || cfg.keyVersion, scope));
    if (!res) throw new Error(`DEK 不存在: ${scope} / ${ver || cfg.keyVersion}`);
    return _unwrapDEK(res.value, kek);
  }

  async function setup(agentId, password, scopeConfig = {}) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const kek  = await _deriveKEK(password, salt);
    const ver  = "v1";
    for (const sc of SCOPES) {
      const dek = await _genDEK();
      await window.storage.set(_dekKey(agentId, ver, sc), await _wrapDEK(dek, kek));
    }
    const cfg = {
      enabled: true, keyVersion: ver, salt: b64e(salt),
      scopes: { files: scopeConfig.files??true, memory: scopeConfig.memory??true,
                sessions: scopeConfig.sessions??false, tool_results: scopeConfig.tool_results??false },
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    await window.storage.set(_cfgKey(agentId), JSON.stringify(cfg));
    await _writeAudit(agentId, "setup", { keyVersion: ver, scopes: cfg.scopes });
    return cfg;
  }

  async function encrypt(plaintext, agentId, password, scope) {
    const cfg = await getConfig(agentId);
    if (!cfg?.enabled || !cfg.scopes[scope]) return plaintext;
    const dek  = await _getDEK(agentId, password, scope);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv   = crypto.getRandomValues(new Uint8Array(12));
    const ct   = await crypto.subtle.encrypt({ name:"AES-GCM", iv }, dek,
      te.encode(typeof plaintext === "string" ? plaintext : JSON.stringify(plaintext)));
    await _writeAudit(agentId, "encrypt", { scope, keyVersion: cfg.keyVersion });
    return `${PREFIX}${scope}:${cfg.keyVersion}:${b64e(salt)}:${b64e(iv)}:${b64e(ct)}`;
  }

  async function decrypt(ciphertext, agentId, password) {
    if (!ciphertext?.startsWith(PREFIX)) return ciphertext;
    const parts = ciphertext.split(":");
    // enc:v3:scope:ver:salt:iv:ct  => parts[2]=scope, [3]=ver, [4]=salt, [5]=iv, [6]=ct
    const [scope, ver, , ivB64, ctB64] = parts.slice(2);
    const saltB64 = parts[6] ? parts[4] : parts[4]; // salt not used for decryption
    const actualIv = b64d(parts[5]);
    const actualCt = b64d(parts[6]);
    const dek = await _getDEK(agentId, password, scope, ver);
    try {
      const pt = await crypto.subtle.decrypt({ name:"AES-GCM", iv:actualIv }, dek, actualCt);
      await _writeAudit(agentId, "decrypt", { scope, keyVersion: ver });
      const text = td.decode(pt);
      try { return JSON.parse(text); } catch { return text; }
    } catch {
      await _writeAudit(agentId, "decrypt_fail", { scope, keyVersion: ver });
      throw new Error("解密失败：密码错误或数据已损坏");
    }
  }

  async function rotateKey(agentId, oldPassword, newPassword, emergency = false) {
    const cfg = await getConfig(agentId);
    if (!cfg) throw new Error("Agent 未配置加密");
    const oldVer = cfg.keyVersion;
    const newVer = `v${parseInt(oldVer.slice(1)) + 1}`;
    const newSalt = crypto.getRandomValues(new Uint8Array(16));
    const newKEK  = await _deriveKEK(newPassword, newSalt);
    const counts  = {};
    for (const sc of SCOPES) {
      const newDEK = await _genDEK();
      await window.storage.set(_dekKey(agentId, newVer, sc), await _wrapDEK(newDEK, newKEK));
      let count = 0;
      try {
        const keys = await window.storage.list(`${sc}:${agentId}:`);
        for (const k of (keys?.keys || [])) {
          const res = await window.storage.get(k);
          if (!res?.value?.startsWith(PREFIX)) continue;
          const plain = await decrypt(res.value, agentId, oldPassword);
          // re-encrypt with new DEK directly
          const iv = crypto.getRandomValues(new Uint8Array(12));
          const salt2 = crypto.getRandomValues(new Uint8Array(16));
          const ct = await crypto.subtle.encrypt({ name:"AES-GCM", iv }, newDEK,
            te.encode(typeof plain === "string" ? plain : JSON.stringify(plain)));
          await window.storage.set(k, `${PREFIX}${sc}:${newVer}:${b64e(salt2)}:${b64e(iv)}:${b64e(ct)}`);
          count++;
        }
      } catch {}
      counts[sc] = count;
      if (emergency) {
        await window.storage.delete(_dekKey(agentId, oldVer, sc)).catch(()=>{});
      }
    }
    cfg.keyVersion = newVer; cfg.salt = b64e(newSalt); cfg.updatedAt = new Date().toISOString();
    await window.storage.set(_cfgKey(agentId), JSON.stringify(cfg));
    await _writeAudit(agentId, "key_rotate", { oldVer, newVer, emergency, counts });
    return { oldVer, newVer, counts };
  }

  async function getConfig(agentId) {
    try { const r = await window.storage.get(_cfgKey(agentId)); return r ? JSON.parse(r.value) : null; }
    catch { return null; }
  }
  async function updateScopes(agentId, updates) {
    const cfg = await getConfig(agentId);
    if (!cfg) throw new Error("Agent 未配置加密");
    Object.assign(cfg.scopes, updates); cfg.updatedAt = new Date().toISOString();
    await window.storage.set(_cfgKey(agentId), JSON.stringify(cfg));
    await _writeAudit(agentId, "update_scopes", updates);
  }
  async function disable(agentId) {
    const cfg = await getConfig(agentId);
    if (!cfg) return;
    cfg.enabled = false; cfg.updatedAt = new Date().toISOString();
    await window.storage.set(_cfgKey(agentId), JSON.stringify(cfg));
    await _writeAudit(agentId, "disable", {});
  }
  async function _writeAudit(agentId, op, meta) {
    try {
      const key = _auditKey(agentId);
      let log = [];
      try { const r = await window.storage.get(key); if (r) log = JSON.parse(r.value); } catch {}
      log.push({ ts: new Date().toISOString(), op, ...meta });
      if (log.length > 500) log = log.slice(-500);
      await window.storage.set(key, JSON.stringify(log));
    } catch {}
  }
  async function getAuditLog(agentId, opts = {}) {
    try {
      const r = await window.storage.get(_auditKey(agentId));
      let log = r ? JSON.parse(r.value) : [];
      if (opts.operation) log = log.filter(e => e.op === opts.operation);
      if (opts.last)      log = log.slice(-opts.last);
      return log.reverse(); // 最新在前
    } catch { return []; }
  }
  async function clearAuditLog(agentId) {
    await window.storage.set(_auditKey(agentId), JSON.stringify([]));
  }
  const isEncrypted = v => typeof v === "string" && v.startsWith(PREFIX);
  return { setup, encrypt, decrypt, rotateKey, getConfig, updateScopes, disable, getAuditLog, clearAuditLog, isEncrypted };
})();

// ════════════════════════════════════════════════════════
//  OCEKeyProviders — Key Provider 抽象层 v4
// ════════════════════════════════════════════════════════
const OCEKeyProviders = (() => {
  const _cfgKey = id => `enc-kp-cfg:${id}`;

  async function saveProviderConfig(agentId, config) {
    const safe = { ...config };
    delete safe.password; delete safe.token; delete safe.accessKey;
    delete safe.secretAccessKey; delete safe.connectToken; delete safe.gcpToken;
    await window.storage.set(_cfgKey(agentId), JSON.stringify({ ...safe, savedAt: new Date().toISOString() }));
  }

  async function getProviderConfig(agentId) {
    try {
      const r = await window.storage.get(_cfgKey(agentId));
      return r ? JSON.parse(r.value) : { type: "manual" };
    } catch { return { type: "manual" }; }
  }

  async function resolve1Password(config) {
    const { vault, item, field, mode = "rpc", connectHost, connectToken } = config;
    if (!vault || !item || !field) throw new Error("1Password 配置缺少 vault / item / field");

    if (mode === "rpc") {
      if (typeof window.clawdRPC !== "function")
        throw new Error("window.clawdRPC 不可用，请确认 1password skill 已安装并登录");
      const result = await window.clawdRPC("1password.readSecret", { ref: `op://${vault}/${item}/${field}` });
      const secret = result?.value ?? result?.secret ?? result;
      if (!secret || typeof secret !== "string") throw new Error("1Password 返回值为空");
      return secret;
    }

    if (mode === "connect") {
      if (!connectHost || !connectToken) throw new Error("Connect 模式需要 connectHost 和 connectToken");
      const base = connectHost.replace(/\/$/, "");
      const vRes = await fetch(`${base}/v1/vaults`, { headers: { Authorization: `Bearer ${connectToken}` } });
      if (!vRes.ok) throw new Error(`1Password Connect vaults 失败: ${vRes.status}`);
      const vaults = await vRes.json();
      const tv = vaults.find(v => v.name === vault);
      if (!tv) throw new Error(`vault 不存在: "${vault}"`);
      const iRes = await fetch(`${base}/v1/vaults/${tv.id}/items?filter=title eq "${encodeURIComponent(item)}"`,
        { headers: { Authorization: `Bearer ${connectToken}` } });
      if (!iRes.ok) throw new Error(`1Password Connect items 失败: ${iRes.status}`);
      const items = await iRes.json();
      const ti = items.find(i => i.title === item);
      if (!ti) throw new Error(`item 不存在: "${item}"`);
      const dRes = await fetch(`${base}/v1/vaults/${tv.id}/items/${ti.id}`,
        { headers: { Authorization: `Bearer ${connectToken}` } });
      if (!dRes.ok) throw new Error(`1Password Connect item 详情失败: ${dRes.status}`);
      const data = await dRes.json();
      const f = data.fields?.find(f => f.label === field || f.id === field);
      if (!f?.value) throw new Error(`字段不存在或为空: "${field}"`);
      return f.value;
    }
    throw new Error(`未知的 1Password 模式: ${mode}`);
  }

  async function resolveAWSKMS(config) {
    const { keyId, region, accessKeyId, secretAccessKey, sessionToken, encryptedDek } = config;
    if (!keyId || !region || !accessKeyId || !secretAccessKey)
      throw new Error("AWS KMS 缺少 keyId / region / accessKeyId / secretAccessKey");
    const endpoint = `https://kms.${region}.amazonaws.com/`;
    const te = new TextEncoder();

    async function signV4(body, action) {
      const now = new Date();
      const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g,"").slice(0,15)+"Z";
      const dateStamp = amzDate.slice(0,8);
      const bh = await crypto.subtle.digest("SHA-256", te.encode(body));
      const bhHex = Array.from(new Uint8Array(bh)).map(b=>b.toString(16).padStart(2,"0")).join("");
      const ch = `content-type:application/x-amz-json-1.1\nhost:kms.${region}.amazonaws.com\nx-amz-date:${amzDate}\n`;
      const cr = ["POST","","",ch,"content-type;host;x-amz-date",bhHex].join("\n");
      const crh = await crypto.subtle.digest("SHA-256", te.encode(cr));
      const crHex = Array.from(new Uint8Array(crh)).map(b=>b.toString(16).padStart(2,"0")).join("");
      const cs = `${dateStamp}/${region}/kms/aws4_request`;
      const sts = `AWS4-HMAC-SHA256\n${amzDate}\n${cs}\n${crHex}`;
      const hmac = async (key, data) => {
        const k = await crypto.subtle.importKey("raw",key,{name:"HMAC",hash:"SHA-256"},false,["sign"]);
        return new Uint8Array(await crypto.subtle.sign("HMAC",k,te.encode(data)));
      };
      const kD = await hmac(te.encode(`AWS4${secretAccessKey}`), dateStamp);
      const kR = await hmac(kD, region);
      const kS = await hmac(kR, "kms");
      const kK = await hmac(kS, "aws4_request");
      const sig = Array.from(await hmac(kK, sts)).map(b=>b.toString(16).padStart(2,"0")).join("");
      const hdrs = {
        "Content-Type":"application/x-amz-json-1.1",
        "X-Amz-Date":amzDate,
        "X-Amz-Target":`TrentService.${action}`,
        Authorization:`AWS4-HMAC-SHA256 Credential=${accessKeyId}/${cs},SignedHeaders=content-type;host;x-amz-date,Signature=${sig}`,
      };
      if (sessionToken) hdrs["X-Amz-Security-Token"] = sessionToken;
      return hdrs;
    }

    if (encryptedDek) {
      const body = JSON.stringify({ CiphertextBlob: encryptedDek, KeyId: keyId });
      const resp = await fetch(endpoint, { method:"POST", headers: await signV4(body,"Decrypt"), body });
      if (!resp.ok) { const e = await resp.json().catch(()=>({})); throw new Error(`AWS KMS Decrypt 失败 (${resp.status}): ${e.message||e.__type||""}`); }
      return (await resp.json()).Plaintext;
    } else {
      const body = JSON.stringify({ KeyId: keyId, KeySpec:"AES_256" });
      const resp = await fetch(endpoint, { method:"POST", headers: await signV4(body,"GenerateDataKey"), body });
      if (!resp.ok) { const e = await resp.json().catch(()=>({})); throw new Error(`AWS KMS GenerateDataKey 失败 (${resp.status}): ${e.message||e.__type||""}`); }
      const d = await resp.json();
      return { plaintext: d.Plaintext, encryptedDek: d.CiphertextBlob };
    }
  }

  async function resolveGCPKMS(config) {
    const { keyName, accessToken, encryptedDek } = config;
    if (!keyName || !accessToken) throw new Error("GCP KMS 缺少 keyName / accessToken");
    const base = "https://cloudkms.googleapis.com/v1";
    const auth = { Authorization:`Bearer ${accessToken}`, "Content-Type":"application/json" };
    const b64e = b => btoa(String.fromCharCode(...new Uint8Array(b)));

    if (encryptedDek) {
      const resp = await fetch(`${base}/${keyName}:decrypt`, { method:"POST", headers:auth, body:JSON.stringify({ciphertext:encryptedDek}) });
      if (!resp.ok) { const e = await resp.json().catch(()=>({})); throw new Error(`GCP KMS decrypt 失败 (${resp.status}): ${e.error?.message||""}`); }
      return (await resp.json()).plaintext;
    } else {
      const rawKey = crypto.getRandomValues(new Uint8Array(32));
      const pt = b64e(rawKey);
      const keyForEnc = keyName.replace(/\/cryptoKeyVersions\/\d+$/,"");
      const encResp = await fetch(`${base}/${keyForEnc}:encrypt`, { method:"POST", headers:auth, body:JSON.stringify({plaintext:pt}) });
      if (!encResp.ok) { const e = await encResp.json().catch(()=>({})); throw new Error(`GCP KMS encrypt 失败 (${encResp.status}): ${e.error?.message||""}`); }
      return { plaintext: pt, encryptedDek: (await encResp.json()).ciphertext };
    }
  }

  async function resolve(agentId, overrideConfig = {}) {
    const stored = await getProviderConfig(agentId);
    const cfg = { ...stored, ...overrideConfig };
    switch (cfg.type) {
      case "manual": case undefined:
        if (!overrideConfig.password && !cfg.password) throw new Error("manual 模式需要提供密码");
        return overrideConfig.password ?? cfg.password;
      case "1password": return resolve1Password(cfg);
      case "aws_kms": { const r = await resolveAWSKMS(cfg); return typeof r === "string" ? r : r.plaintext; }
      case "gcp_kms": { const r = await resolveGCPKMS(cfg); return typeof r === "string" ? r : r.plaintext; }
      default: throw new Error(`未知 Key Provider: ${cfg.type}`);
    }
  }

  return { resolve, saveProviderConfig, getProviderConfig, resolve1Password, resolveAWSKMS, resolveGCPKMS };
})();

// ════════ UI 逻辑 v4 ════════
const $ = id => document.getElementById(id);
const agentId = () => $("agentId").value.trim() || "agent_001";

function switchTab(name) {
  const names = ["config","keyprovider","test","rotate","audit"];
  document.querySelectorAll(".tab").forEach((t,i) => t.classList.toggle("active", names[i] === name));
  document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
  $("tab-" + name).classList.add("active");
  if (name === "config")      loadStatus();
  if (name === "keyprovider") loadKPStatus();
  if (name === "audit")       loadAudit();
}

function showMsg(id, text, type) {
  const el = $(id); el.textContent = text; el.className = "msg " + type;
}

// ── 解析当前有效密码（优先从 KP 获取，fallback 到 UI 输入框）──
async function resolvePassword(fallbackInputId) {
  const kpCfg = await OCEKeyProviders.getProviderConfig(agentId());
  if (kpCfg.type && kpCfg.type !== "manual") {
    // 对于 KMS 模式，需要从 UI 获取凭证（凭证不存 storage）
    const overrides = buildKMSOverrides(kpCfg.type);
    return await OCEKeyProviders.resolve(agentId(), overrides);
  }
  const pwd = $(fallbackInputId)?.value;
  if (!pwd) throw new Error("请输入密码");
  return pwd;
}

// 从 UI 字段临时读取 KMS 凭证（不持久化）
function buildKMSOverrides(type) {
  if (type === "aws_kms") return {
    accessKeyId:     $("awsAKID")?.value,
    secretAccessKey: $("awsSAK")?.value,
    sessionToken:    $("awsToken")?.value || undefined,
  };
  if (type === "gcp_kms") return { accessToken: $("gcpToken")?.value };
  if (type === "1password") return {
    connectToken: $("opConnectToken")?.value || undefined,
  };
  return {};
}

// ── Config Tab ──────────────────────────────────────────
async function loadStatus() {
  const cfg = await OCE.getConfig(agentId());
  const card = $("statusCard");
  if (!cfg) { card.style.display = "none"; return; }
  card.style.display = "block";
  const badge = $("encBadge");
  badge.textContent = cfg.enabled ? "已启用" : "已禁用";
  badge.className = "badge " + (cfg.enabled ? "badge-on" : "badge-off");

  // 显示当前 Key Provider 类型
  const kpCfg = await OCEKeyProviders.getProviderConfig(agentId());
  const kpLabel = { manual:"🔤 手动密码", "1password":"🔐 1Password", aws_kms:"☁️ AWS KMS", gcp_kms:"🌐 GCP KMS" };
  $("statusGrid").innerHTML = `
    <span class="kv-key">Agent ID</span><span class="kv-val">${agentId()}</span>
    <span class="kv-key">密钥版本</span><span class="kv-val">${cfg.keyVersion}</span>
    <span class="kv-key">密钥来源</span><span class="kv-val">${kpLabel[kpCfg.type]||kpCfg.type||"手动密码"}</span>
    <span class="kv-key">更新时间</span><span class="kv-val">${cfg.updatedAt?.slice(0,19).replace("T"," ")||"-"}</span>
    <span class="kv-key">创建时间</span><span class="kv-val">${cfg.createdAt?.slice(0,19).replace("T"," ")||"-"}</span>`;
  const SN = { files:"文件", memory:"记忆", sessions:"对话历史", tool_results:"工具结果" };
  $("scopeGrid").innerHTML = Object.entries(cfg.scopes).map(([k,v]) =>
    `<div class="scope-item"><span class="dot ${v?"dot-on":"dot-off"}"></span>
     <span style="color:${v?"#e1e4e8":"#484f58"}">${SN[k]||k}</span></div>`).join("");
  $("sFiles").checked = cfg.scopes.files; $("sMemory").checked = cfg.scopes.memory;
  $("sSessions").checked = cfg.scopes.sessions; $("sToolResults").checked = cfg.scopes.tool_results;
  // 提示密钥来源
  const note = $("setupPwdNote");
  if (kpCfg.type && kpCfg.type !== "manual") {
    note.textContent = `🔐 当前密钥来源：${kpLabel[kpCfg.type]}（初始化时将自动获取主密钥，无需手动输入密码）`;
    note.className = "msg ok"; note.style.display = "block";
    $("setupPwd").placeholder = "KP 模式下可留空";
  } else {
    note.textContent = "💡 当前使用手动密码模式。切换到「密钥来源」Tab 可配置 1Password / AWS KMS / GCP KMS。";
    note.className = "msg info"; note.style.display = "block";
  }
}

async function doSetup() {
  try {
    const pwd = await resolvePassword("setupPwd");
    await OCE.setup(agentId(), pwd, {
      files: $("sFiles").checked, memory: $("sMemory").checked,
      sessions: $("sSessions").checked, tool_results: $("sToolResults").checked,
    });
    const kpCfg = await OCEKeyProviders.getProviderConfig(agentId());
    await OCE._writeAudit?.(agentId(), "setup_kp", { provider: kpCfg.type || "manual" });
    showMsg("configMsg","✅ 加密已初始化，密钥三层结构已生成","ok");
    loadStatus();
  } catch(e) { showMsg("configMsg","❌ " + e.message,"err"); }
}

async function doUpdateScopes() {
  try {
    await OCE.updateScopes(agentId(), {
      files: $("sFiles").checked, memory: $("sMemory").checked,
      sessions: $("sSessions").checked, tool_results: $("sToolResults").checked,
    });
    showMsg("configMsg","✅ 加密范围已更新","ok"); loadStatus();
  } catch(e) { showMsg("configMsg","❌ " + e.message,"err"); }
}

async function doDisable() {
  if (!confirm(`确认禁用 ${agentId()} 的加密？`)) return;
  try { await OCE.disable(agentId()); showMsg("configMsg","🔓 加密已禁用","info"); loadStatus(); }
  catch(e) { showMsg("configMsg","❌ " + e.message,"err"); }
}

// ── Key Provider Tab ────────────────────────────────────
function switchKP() {
  const type = document.querySelector("input[name='kpType']:checked").value;
  ["manual","1password","aws_kms","gcp_kms"].forEach(t => {
    $(`kpPanel-${t}`).style.display = t === type ? "block" : "none";
  });
}

function toggleOPMode() {
  const isConnect = document.querySelector("input[name='opMode']:checked")?.value === "connect";
  $("connectFields").style.display = isConnect ? "block" : "none";
}

async function loadKPStatus() {
  const cfg = await OCEKeyProviders.getProviderConfig(agentId());
  // Set radio to current type
  const radio = document.querySelector(`input[name='kpType'][value='${cfg.type||"manual"}']`);
  if (radio) { radio.checked = true; switchKP(); }
  // Populate fields
  if (cfg.type === "1password") {
    if ($("opVault"))  $("opVault").value  = cfg.vault  || "";
    if ($("opItem"))   $("opItem").value   = cfg.item   || "";
    if ($("opField"))  $("opField").value  = cfg.field  || "";
    if (cfg.mode === "connect") {
      document.querySelector("input[name='opMode'][value='connect']").checked = true;
      toggleOPMode();
      if ($("opConnectHost")) $("opConnectHost").value = cfg.connectHost || "";
    }
  }
  if (cfg.type === "aws_kms") {
    if ($("awsKeyId"))  $("awsKeyId").value  = cfg.keyId  || "";
    if ($("awsRegion")) $("awsRegion").value = cfg.region || "";
    if ($("awsAKID"))   $("awsAKID").value   = cfg.accessKeyId || "";
  }
  if (cfg.type === "gcp_kms") {
    if ($("gcpKeyName")) $("gcpKeyName").value = cfg.keyName || "";
  }
  // Status grid
  const KPL = { manual:"🔤 手动密码", "1password":"🔐 1Password", aws_kms:"☁️ AWS KMS", gcp_kms:"🌐 GCP KMS" };
  const rows = [
    ["类型", KPL[cfg.type] || "手动密码"],
    ...(cfg.type === "1password" ? [["Vault", cfg.vault||"-"], ["Item", cfg.item||"-"], ["Field", cfg.field||"-"], ["模式", cfg.mode||"rpc"]] : []),
    ...(cfg.type === "aws_kms"   ? [["Key ID", (cfg.keyId||"-").slice(0,40)+"…"], ["Region", cfg.region||"-"]] : []),
    ...(cfg.type === "gcp_kms"   ? [["Key Name", (cfg.keyName||"-").slice(0,50)+"…"]] : []),
    ...(cfg.savedAt ? [["保存时间", cfg.savedAt.slice(0,19).replace("T"," ")]] : []),
  ];
  $("kpStatusGrid").innerHTML = rows.map(([k,v]) =>
    `<span class="kv-key">${k}</span><span class="kv-val">${v}</span>`).join("");
}

async function saveKPConfig(type) {
  let config = { type };
  if (type === "1password") {
    const mode = document.querySelector("input[name='opMode']:checked")?.value || "rpc";
    config = { type, vault:$("opVault").value.trim(), item:$("opItem").value.trim(),
               field:$("opField").value.trim(), mode };
    if (mode === "connect") {
      config.connectHost = $("opConnectHost").value.trim();
      // connectToken 不存 storage（安全）
    }
    if (!config.vault || !config.item || !config.field)
      { showMsg("kpMsg","❌ 请填写 Vault / Item / Field","err"); return; }
  }
  if (type === "aws_kms") {
    config = { type, keyId:$("awsKeyId").value.trim(), region:$("awsRegion").value.trim(),
               accessKeyId:$("awsAKID").value.trim() };
    if (!config.keyId || !config.region || !config.accessKeyId)
      { showMsg("kpMsg","❌ 请填写 Key ID / Region / Access Key ID","err"); return; }
  }
  if (type === "gcp_kms") {
    config = { type, keyName:$("gcpKeyName").value.trim() };
    if (!config.keyName) { showMsg("kpMsg","❌ 请填写 Key Name","err"); return; }
  }
  try {
    await OCEKeyProviders.saveProviderConfig(agentId(), config);
    showMsg("kpMsg","✅ 密钥来源已保存","ok");
    loadKPStatus();
    loadStatus(); // 刷新配置 Tab 的 KP 显示
  } catch(e) { showMsg("kpMsg","❌ " + e.message,"err"); }
}

async function testKP1P() {
  const mode = document.querySelector("input[name='opMode']:checked")?.value || "rpc";
  const config = {
    type:"1password", vault:$("opVault").value.trim(), item:$("opItem").value.trim(),
    field:$("opField").value.trim(), mode,
    connectHost:  $("opConnectHost")?.value.trim(),
    connectToken: $("opConnectToken")?.value.trim(),
  };
  showMsg("kpTestMsg","⏳ 正在连接 1Password…","info");
  try {
    const secret = await OCEKeyProviders.resolve1Password(config);
    showMsg("kpTestMsg",`✅ 连接成功，已读取密钥（长度: ${secret.length} 字符）`,"ok");
  } catch(e) { showMsg("kpTestMsg","❌ " + e.message,"err"); }
}

async function testKPAWS() {
  const config = {
    type:"aws_kms", keyId:$("awsKeyId").value.trim(), region:$("awsRegion").value.trim(),
    accessKeyId:$("awsAKID").value.trim(), secretAccessKey:$("awsSAK").value,
    sessionToken:$("awsToken").value||undefined,
  };
  showMsg("kpAWSMsg","⏳ 正在调用 AWS KMS GenerateDataKey…","info");
  try {
    const result = await OCEKeyProviders.resolveAWSKMS(config);
    const len = (result.plaintext || result).length;
    showMsg("kpAWSMsg",`✅ AWS KMS 连接成功，已生成数据密钥（Base64长度: ${len}）`,"ok");
  } catch(e) { showMsg("kpAWSMsg","❌ " + e.message,"err"); }
}

async function testKPGCP() {
  const config = {
    type:"gcp_kms", keyName:$("gcpKeyName").value.trim(), accessToken:$("gcpToken").value,
  };
  showMsg("kpGCPMsg","⏳ 正在调用 GCP KMS encrypt…","info");
  try {
    const result = await OCEKeyProviders.resolveGCPKMS(config);
    const len = (result.plaintext || result).length;
    showMsg("kpGCPMsg",`✅ GCP KMS 连接成功，已生成并加密数据密钥（Base64长度: ${len}）`,"ok");
  } catch(e) { showMsg("kpGCPMsg","❌ " + e.message,"err"); }
}

// ── Test Tab ────────────────────────────────────────────
async function doWrite() {
  const scope = $("writeScope").value, key = $("writeKey").value.trim();
  const value = $("writeValue").value;
  if (!key || !value) { showMsg("writeMsg","❌ 请填写 Key 和 Value","err"); return; }
  try {
    const pwd = await resolvePassword("writePwd");
    const ct = await OCE.encrypt(value, agentId(), pwd, scope);
    await window.storage.set(`${scope}:${agentId()}:${key}`, ct);
    const isEnc = OCE.isEncrypted(ct);
    showMsg("writeMsg", isEnc ? "✅ 已加密写入" : "⚠️ 该 scope 未启用，已明文写入", isEnc?"ok":"info");
    const ctEl = $("writeCT"); ctEl.style.display = "block";
    ctEl.textContent = ct.length > 150 ? ct.slice(0,150)+"…" : ct;
  } catch(e) { showMsg("writeMsg","❌ "+e.message,"err"); }
}

async function doRead() {
  const scope = $("readScope").value, key = $("readKey").value.trim();
  if (!key) { showMsg("readMsg","❌ 请填写 Key","err"); return; }
  try {
    const res = await window.storage.get(`${scope}:${agentId()}:${key}`);
    if (!res) { showMsg("readMsg","❌ Key 不存在","err"); return; }
    const pwd = await resolvePassword("readPwd");
    const plain = await OCE.decrypt(res.value, agentId(), pwd);
    showMsg("readMsg","✅ 解密成功","ok");
    $("readResult").style.display = "block";
    $("readResultText").textContent = typeof plain === "object" ? JSON.stringify(plain,null,2) : plain;
  } catch(e) { showMsg("readMsg","❌ "+e.message,"err"); }
}

async function doReadRaw() {
  const scope = $("readScope").value, key = $("readKey").value.trim();
  if (!key) { showMsg("readMsg","❌ 请填写 Key","err"); return; }
  try {
    const res = await window.storage.get(`${scope}:${agentId()}:${key}`);
    if (!res) { showMsg("readMsg","❌ Key 不存在","err"); return; }
    showMsg("readMsg","👁 原始密文（未解密）","info");
    $("readResult").style.display = "block";
    $("readResultText").textContent = res.value;
  } catch(e) { showMsg("readMsg","❌ "+e.message,"err"); }
}

// ── Rotate Tab ──────────────────────────────────────────
async function doRotate(emergency) {
  const newPwd2 = $("rotNewPwd2").value;
  if (emergency && !confirm("⚡ 紧急轮换将立即删除旧密钥，确认继续？")) return;
  $("btnRotate").disabled = $("btnRotateEmg").disabled = true;
  showMsg("rotateMsg","⏳ 轮换中，正在重新加密所有数据…","info");
  try {
    const oldPwd = await resolvePassword("rotOldPwd");
    const newPwd = $("rotNewPwd").value;
    if (!newPwd) throw new Error("请输入新密码");
    if (newPwd !== newPwd2) throw new Error("两次新密码不一致");
    const result = await OCE.rotateKey(agentId(), oldPwd, newPwd, emergency);
    showMsg("rotateMsg",`✅ 密钥轮换成功：${result.oldVer} → ${result.newVer}`,"ok");
    $("rotateResult").style.display = "block";
    $("rotateResultGrid").innerHTML = `
      <span class="kv-key">旧版本</span><span class="kv-val">${result.oldVer}</span>
      <span class="kv-key">新版本</span><span class="kv-val">${result.newVer}</span>
      <span class="kv-key">模式</span><span class="kv-val">${emergency?"⚡ 紧急":"📅 常规"}</span>
      ${Object.entries(result.counts).map(([sc,n]) =>
        `<span class="kv-key">重加密 ${sc}</span><span class="kv-val">${n} 条</span>`).join("")}`;
    loadStatus();
  } catch(e) { showMsg("rotateMsg","❌ "+e.message,"err"); }
  finally { $("btnRotate").disabled = $("btnRotateEmg").disabled = false; }
}

// ── Audit Tab ───────────────────────────────────────────
async function loadAudit() {
  const filter = $("auditFilter").value, last = parseInt($("auditLast").value)||50;
  const log = await OCE.getAuditLog(agentId(), { operation:filter||undefined, last });
  const el = $("auditContent");
  if (!log.length) { el.innerHTML = '<div class="empty">暂无审计日志</div>'; return; }
  const OC = { setup:"op-setup", setup_kp:"op-setup", encrypt:"op-encrypt", decrypt:"op-decrypt",
               decrypt_fail:"op-disable", key_rotate:"op-rotate", disable:"op-disable",
               update_scopes:"op-setup", update_kp_provider:"op-setup" };
  el.innerHTML = `<table>
    <thead><tr><th>时间</th><th>操作</th><th>详情</th></tr></thead>
    <tbody>${log.map(e => {
      const {ts,op,...meta} = e;
      const detail = Object.entries(meta).map(([k,v]) =>
        `<span style="color:#8b949e">${k}:</span> <span class="mono">${typeof v==="object"?JSON.stringify(v):v}</span>`
      ).join("  ");
      return `<tr><td style="white-space:nowrap;color:#8b949e">${ts.slice(0,19).replace("T"," ")}</td>
        <td><span class="op-tag ${OC[op]||"op-default"}">${op}</span></td>
        <td style="font-size:0.8rem;line-height:1.8">${detail||"—"}</td></tr>`;
    }).join("")}</tbody></table>`;
}

async function clearAudit() {
  if (!confirm("确认清空审计日志？")) return;
  await OCE.clearAuditLog(agentId()); loadAudit();
}

// 初始化
loadStatus();
</script>
</body>
</html>
```
