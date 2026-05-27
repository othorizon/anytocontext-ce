/**
 * 服务端生成 ed25519 SSH 密钥对。
 *
 * - 私钥用 OpenSSH 格式（与 ssh-keygen -t ed25519 输出一致；GitHub / Git OpenSSH 直接接受）
 * - 公钥用 SSH authorized_keys 单行格式 `ssh-ed25519 BASE64 <comment>`
 *
 * 不接受任何 passphrase；解密只在主应用 server action 内瞬时进行。
 */
import { generateKeyPairSync } from "node:crypto";
import sshpk from "sshpk";

export interface GeneratedSshKey {
  /** OpenSSH 单行公钥，复制到 GitHub Deploy Keys */
  publicKey: string;
  /** OpenSSH PEM 私钥，写入 sandbox `~/.ssh/id_rsa` */
  privateKey: string;
  /** 公钥指纹（SHA256），仅供日志 / 调试展示 */
  fingerprint: string;
}

export function generateEd25519KeyPair(comment: string): GeneratedSshKey {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");

  // Node KeyObject → sshpk 之间的转换都走 PKCS#8 PEM（sshpk 1.18+ 支持）
  const sshpkPriv = sshpk.parsePrivateKey(
    privateKey.export({ type: "pkcs8", format: "pem" }) as string,
    "pkcs8",
  );
  sshpkPriv.comment = comment;
  const sshpkPub = sshpk.parseKey(
    publicKey.export({ type: "spki", format: "pem" }) as string,
    "pkcs8",
  );
  sshpkPub.comment = comment;

  return {
    privateKey: sshpkPriv.toString("ssh") + "\n", // OpenSSH 格式
    publicKey: sshpkPub.toString("ssh"),
    fingerprint: sshpkPub.fingerprint("sha256").toString(),
  };
}
