// migration-helper.js  v2/v3 → v4
//
// 将 enc:v2 格式（单一密钥）数据迁移至 enc:v3 格式（三层密钥结构）
//
// 使用方式：将此脚本内容粘贴到 OpenClaw Artifact 的 <script> 标签中，
// 然后调用 migrateV2toV3(agentId, oldPassword, newPassword)

async function migrateV2toV3(agentId, oldPassword, newPassword) {
  // ── v2 解密模块（内嵌，不依赖外部） ──
  const _v2decrypt = async (ciphertext, password) => {
    const PREFIX_V2 = "enc:v2:";
    if (!ciphertext?.startsWith(PREFIX_V2)) return ciphertext;
    const te = new TextEncoder(), td = new TextDecoder();
    const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
    const parts = ciphertext.split(":");
    // enc:v2:salt:iv:ct
    const [saltB64, ivB64, ctB64] = parts.slice(2);
    const keyMat = await crypto.subtle.importKey("raw", te.encode(password), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey(
      { name:"PBKDF2", salt:b64d(saltB64), iterations:310000, hash:"SHA-256" },
      keyMat, { name:"AES-GCM", length:256 }, false, ["decrypt"]
    );
    try {
      const pt = await crypto.subtle.decrypt({ name:"AES-GCM", iv:b64d(ivB64) }, key, b64d(ctB64));
      return td.decode(pt);
    } catch {
      throw new Error("v2 解密失败：密码错误");
    }
  };

  const SCOPES = ["files","memory","sessions","tool_results"];
  const stats = { scanned: 0, migrated: 0, skipped: 0, errors: 0 };

  // 1. 用 v3 OCE 初始化新配置（如果还没有）
  const existingCfg = await OCE.getConfig(agentId);
  if (!existingCfg) {
    await OCE.setup(agentId, newPassword);
    console.log(`[migrate] v3 配置已初始化: ${agentId}`);
  }

  // 2. 扫描所有 scope 数据，将 v2 密文迁移为 v3
  for (const sc of SCOPES) {
    let keys = [];
    try {
      const res = await window.storage.list(`${sc}:${agentId}:`);
      keys = res?.keys || [];
    } catch { continue; }

    for (const k of keys) {
      stats.scanned++;
      const res = await window.storage.get(k);
      if (!res) continue;
      const raw = res.value;

      // 已经是 v3 格式，跳过
      if (raw.startsWith("enc:v3:")) { stats.skipped++; continue; }

      // v2 格式，迁移
      if (raw.startsWith("enc:v2:")) {
        try {
          const plain = await _v2decrypt(raw, oldPassword);
          const newCT = await OCE.encrypt(plain, agentId, newPassword, sc);
          await window.storage.set(k, newCT);
          stats.migrated++;
        } catch(e) {
          console.error(`[migrate] 迁移失败 key=${k}:`, e.message);
          stats.errors++;
        }
        continue;
      }

      // 明文数据，直接用 v3 加密
      if (!raw.startsWith("enc:")) {
        try {
          const newCT = await OCE.encrypt(raw, agentId, newPassword, sc);
          await window.storage.set(k, newCT);
          stats.migrated++;
        } catch(e) {
          stats.errors++;
        }
      }
    }
  }

  console.log(`[migrate] 完成:`, stats);
  return stats;
}
