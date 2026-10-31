/**
 * dsh-md-editor — 宿主端（Node 侧）。
 *
 * 只做一件事：在 DSH 的 Web 服务器上挂三条仅限本机回环访问的 HTTP 路由，
 * 让浏览器端能在右侧边栏里直接读写 Markdown / 纯文本文件。
 *
 * 刻意不做的事：不注册工具、不注入提示词、不读写会话数据、不碰 DSH 内核。
 * 写入走「同目录临时文件 + rename」的原子替换，保留原文件权限位。
 *
 * 安全边界（三条一起成立才允许写）：
 *   1. 请求必须来自回环地址；
 *   2. 目标必须是**已存在**的普通文件（拒绝符号链接、目录、设备）；
 *   3. 扩展名必须是 .md / .markdown / .txt，且大小不超过 4 MiB。
 */
import {
  appendFileSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { randomBytes } from "node:crypto";
import { basename, dirname, extname, isAbsolute, join, resolve } from "node:path";
import { tmpdir } from "node:os";

export const name = "dsh-md-editor";

const VERSION = "0.1.0";
const ROUTE_PREFIX = "/md-editor";
const EDITABLE_EXTENSIONS = new Set([".md", ".markdown", ".txt"]);
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_BODY_BYTES = MAX_FILE_BYTES + 64 * 1024;
/** 允许的时间戳漂移（毫秒）：文件系统 mtime 精度不同，1ms 内视为同一版本。 */
const MTIME_TOLERANCE_MS = 1.5;

/** 诊断日志默认写到系统临时目录；设 DSH_MD_EDITOR_DIAG="" 可关闭。 */
const DIAG = process.env.DSH_MD_EDITOR_DIAG ?? join(tmpdir(), "dsh-md-editor.log");

function diag(message) {
  if (DIAG === "") return;
  try {
    mkdirSync(dirname(DIAG), { recursive: true });
    appendFileSync(DIAG, `[${new Date().toISOString()}] ${message}\n`);
  } catch {
    /* 诊断日志失败不影响主流程 */
  }
}

/** 可预期的请求错误：带 HTTP 状态与稳定错误码，供浏览器端分支。 */
class EditError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function isLoopback(address) {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        rejectBody(new EditError(413, "too-large", "请求体超过大小上限"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolveBody(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        rejectBody(new EditError(400, "bad-json", "请求体不是合法 JSON"));
      }
    });
    req.on("error", rejectBody);
  });
}

/**
 * 校验并解析目标文件。
 * @param rawPath - 浏览器端传来的绝对路径。
 * @returns 解析后的绝对路径与 lstat 结果。
 */
function inspectTarget(rawPath) {
  if (typeof rawPath !== "string" || rawPath.trim() === "") {
    throw new EditError(400, "bad-path", "缺少文件路径");
  }
  if (rawPath.includes("\0")) {
    throw new EditError(400, "bad-path", "路径包含非法字符");
  }
  if (!isAbsolute(rawPath)) {
    throw new EditError(400, "not-absolute", "只接受绝对路径");
  }
  const target = resolve(rawPath);
  const extension = extname(target).toLowerCase();
  if (!EDITABLE_EXTENSIONS.has(extension)) {
    throw new EditError(415, "unsupported-type", `只支持 ${[...EDITABLE_EXTENSIONS].join(" / ")} 文件`);
  }
  let info;
  try {
    info = lstatSync(target);
  } catch {
    throw new EditError(404, "not-found", "文件不存在");
  }
  if (info.isSymbolicLink()) {
    throw new EditError(400, "symlink", "不编辑符号链接");
  }
  if (!info.isFile()) {
    throw new EditError(400, "not-regular-file", "目标不是普通文件");
  }
  if (info.size > MAX_FILE_BYTES) {
    throw new EditError(413, "too-large", `文件超过 ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MiB 上限`);
  }
  return { path: target, info };
}

/**
 * 原子替换文件内容：同目录临时文件写完再 rename，保留原权限位。
 * @param target - 目标绝对路径。
 * @param content - 新内容。
 * @param mode - 原文件的权限位。
 */
function writeAtomically(target, content, mode) {
  const temporary = `${target}.dsh-md-editor-${randomBytes(6).toString("hex")}.tmp`;
  try {
    writeFileSync(temporary, content, { encoding: "utf8", mode });
    renameSync(temporary, target);
  } catch (error) {
    try {
      unlinkSync(temporary);
    } catch {
      /* 临时文件可能根本没创建成功 */
    }
    throw error;
  }
}

/** 读取一条文件，返回内容与版本信息。 */
function handleRead(url, res) {
  const target = inspectTarget(url.searchParams.get("path"));
  const content = readFileSync(target.path, "utf8");
  const info = statSync(target.path);
  sendJson(res, 200, {
    ok: true,
    path: target.path,
    name: basename(target.path),
    content,
    mtimeMs: info.mtimeMs,
    size: info.size
  });
}

/** 写入一条文件，冲突时返回 409 而不是静默覆盖。 */
async function handleWrite(req, res) {
  const body = await readJsonBody(req);
  const target = inspectTarget(body.path);
  if (typeof body.content !== "string") {
    throw new EditError(400, "bad-content", "content 必须是字符串");
  }
  if (Buffer.byteLength(body.content, "utf8") > MAX_FILE_BYTES) {
    throw new EditError(413, "too-large", `内容超过 ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MiB 上限`);
  }
  const current = statSync(target.path);
  const requested = typeof body.mtimeMs === "number" && Number.isFinite(body.mtimeMs) ? body.mtimeMs : undefined;
  if (body.force !== true && requested !== undefined && Math.abs(current.mtimeMs - requested) > MTIME_TOLERANCE_MS) {
    throw new EditError(409, "conflict", "文件已被其他程序修改", { mtimeMs: current.mtimeMs });
  }
  writeAtomically(target.path, body.content, current.mode & 0o777);
  const next = statSync(target.path);
  diag(`write ${target.path} ${next.size}B`);
  sendJson(res, 200, { ok: true, path: target.path, mtimeMs: next.mtimeMs, size: next.size });
}

async function handleRequest(req, res) {
  if (!isLoopback(req.socket?.remoteAddress ?? "")) {
    sendJson(res, 403, { ok: false, code: "forbidden", error: "仅允许本机访问" });
    return;
  }
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const method = req.method ?? "GET";
  try {
    if (method === "GET" && url.pathname === `${ROUTE_PREFIX}/health`) {
      const from = url.searchParams.get("from");
      if (from === "client") {
        diag(`client half connected, markdown renderer: ${url.searchParams.get("markdown") === "1" ? "on" : "off"}`);
      } else if (from === "preview-error") {
        diag(`preview render failed: ${url.searchParams.get("message") ?? ""}`);
      }
      sendJson(res, 200, { ok: true, version: VERSION });
      return;
    }
    if (method === "GET" && url.pathname === `${ROUTE_PREFIX}/read`) {
      handleRead(url, res);
      return;
    }
    if (method === "POST" && url.pathname === `${ROUTE_PREFIX}/write`) {
      await handleWrite(req, res);
      return;
    }
    sendJson(res, 404, { ok: false, code: "not-found", error: "未知路由" });
  } catch (error) {
    if (error instanceof EditError) {
      sendJson(res, error.status, {
        ok: false,
        code: error.code,
        error: error.message,
        ...(error.details === undefined ? {} : { details: error.details })
      });
      return;
    }
    diag(`error ${method} ${url.pathname}: ${error?.stack ?? String(error)}`);
    sendJson(res, 500, {
      ok: false,
      code: "internal",
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

export function apply(ctx) {
  ctx.inject(["webServer"], (webCtx) => {
    webCtx.effect(
      () => webCtx.webServer.register({ kind: "exact", path: `${ROUTE_PREFIX}/health`, handler: handleRequest }),
      "md-editor: health route"
    );
    webCtx.effect(
      () => webCtx.webServer.register({ kind: "exact", path: `${ROUTE_PREFIX}/read`, handler: handleRequest }),
      "md-editor: read route"
    );
    webCtx.effect(
      () => webCtx.webServer.register({ kind: "exact", path: `${ROUTE_PREFIX}/write`, handler: handleRequest }),
      "md-editor: write route"
    );
    diag(`routes registered: ${ROUTE_PREFIX}/{health,read,write}`);
  });
}
