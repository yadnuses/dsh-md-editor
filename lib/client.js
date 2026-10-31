/**
 * dsh-md-editor — 浏览器端。
 *
 * 往右侧边栏文档预览的头部动作位（sidebar.right.tab.document.actions）挂一个
 * 铅笔按钮；点开后把编辑器精确铺在预览区上方（原地编辑），保存走宿主插件的
 * 回环路由 /md-editor/{read,write}。
 *
 * 只认 .md / .markdown / .txt；其它文件不渲染任何按钮。
 */
window.__ModuleLoader__.load({
  id: "dsh-md-editor",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    let react = require("react");
    let reactDom = require("react-dom");
    // DSH 自带的 Markdown 渲染组件（与内置预览同一个），拿不到时降级为纯文本。
    let primitives = null;
    try {
      primitives = require("@deepseek-ai/dsh-client-ui-primitives");
    } catch {
      primitives = null;
    }

    /** 头部动作位：文档预览的「打开」按钮也挂在这里。 */
    const SLOT = "sidebar.right.tab.document.actions";
    /** 可编辑扩展名。 */
    const EDITABLE = /\.(?:md|markdown|txt)$/i;
    /** 需要的浏览器服务：只要槽位注册表。 */
    const inject = ["slots"];
    /** 预览根节点的稳定标记，用来量出「原地」编辑器的边界。 */
    const PREVIEW_ROOT_SELECTOR = '[data-textpreview-state="text"]';

    const STYLE_ID = "dsh-md-editor-style";
    const css =
      ".dsh-mde-trigger{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#8a8f98);cursor:pointer}" +
      ".dsh-mde-trigger:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.16));color:var(--dsw-alias-label-primary,#e6e6e6)}" +
      ".dsh-mde-trigger:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4d6bfe);outline-offset:1px}" +
      ".dsh-mde-panel{position:fixed;z-index:9000;display:flex;flex-direction:column;box-sizing:border-box;overflow:hidden;border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.28));border-radius:10px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#1a1a1a);box-shadow:0 18px 48px rgba(0,0,0,.28);font-size:13px}" +
      ".dsh-mde-panel.dsh-mde-docked{border-radius:0;border-width:0 0 0 1px;box-shadow:none}" +
      "body[data-ds-dark-theme] .dsh-mde-panel{background:var(--dsw-alias-bg-layer-1,#191b20);color:var(--dsw-alias-label-primary,#e6e6e6);border-color:var(--dsw-alias-border-l2,rgba(255,255,255,.12))}" +
      ".dsh-mde-header{display:flex;flex:none;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.2))}" +
      ".dsh-mde-name{min-width:0;overflow:hidden;font-weight:600;text-overflow:ellipsis;white-space:nowrap}" +
      ".dsh-mde-dirty{flex:none;color:var(--dsw-alias-state-warn-primary,#e8a33d);font-size:10px;line-height:1}" +
      ".dsh-mde-spacer{flex:1}" +
      ".dsh-mde-primary,.dsh-mde-ghost{height:24px;padding:0 10px;border:1px solid transparent;border-radius:6px;font:inherit;font-size:12px;cursor:pointer;white-space:nowrap}" +
      ".dsh-mde-primary{background:var(--dsw-static-deepseek-500,#4176e6);color:#fff;font-weight:500}" +
      ".dsh-mde-primary:hover:not(:disabled){background:var(--dsw-static-deepseek-450,#5686fe)}" +
      ".dsh-mde-primary:disabled{opacity:.45;cursor:default}" +
      ".dsh-mde-ghost{border-color:rgba(127,127,127,.3);background:transparent;color:inherit}" +
      ".dsh-mde-ghost:hover{background:rgba(127,127,127,.12)}" +
      ".dsh-mde-preview{flex:1;min-height:0;overflow:auto;background:var(--dsw-alias-bg-document-preview,transparent)}" +
      ".dsh-mde-blocks{padding:4px 0}" +
      ".dsh-mde-block{position:relative;cursor:text;border-radius:6px}" +
      ".dsh-mde-block:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.08))}" +
      ".dsh-mde-block:hover:after{content:\"\";position:absolute;left:2px;top:8px;bottom:8px;width:2px;border-radius:2px;background:var(--dsw-alias-state-business-primary,#4176e6);opacity:.55}" +
      ".dsh-mde-block-gap{height:6px}" +
      ".dsh-mde-block-input{box-sizing:border-box;width:100%;margin:2px 0;padding:8px 10px;border:1px solid var(--dsw-alias-state-business-primary,#4176e6);border-radius:6px;background:var(--dsw-alias-bg-base,#fff);color:inherit;font:12.5px/1.6 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;outline:none;resize:none;overflow:hidden;tab-size:2}" +
      ".dsh-mde-markdown{padding:8px 12px;font-size:13px}" +
      ".dsh-mde-preview-empty{padding:12px;color:var(--dsw-alias-label-tertiary,#8a8f98);font-size:12px}" +
      ".dsh-mde-textarea{flex:1;box-sizing:border-box;width:100%;min-height:0;padding:12px;border:0;outline:none;background:transparent;color:inherit;font:13px/1.65 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;resize:none;tab-size:2}" +
      ".dsh-mde-footer{display:flex;flex:none;align-items:center;gap:12px;padding:6px 10px;border-top:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.2));color:var(--dsw-alias-label-secondary,#8a8f98);font-size:12px}" +
      ".dsh-mde-footer .dsh-mde-counts{margin-left:auto;font-variant-numeric:tabular-nums}" +
      ".dsh-mde-state{display:flex;flex:1;align-items:center;justify-content:center;padding:24px;text-align:center}" +
      ".dsh-mde-error{color:var(--dsw-alias-state-error-primary,#e5534b)}";

    function ensureStyles() {
      let style = document.getElementById(STYLE_ID);
      if (style === null) {
        style = document.createElement("style");
        style.id = STYLE_ID;
        document.head.appendChild(style);
      }
      if (style.textContent !== css) style.textContent = css;
    }

    /** 统一的 JSON 请求：非 2xx 或 ok!==true 都抛带 code 的错误。 */
    async function requestJson(url, init) {
      const response = await fetch(url, init);
      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      if (!response.ok || payload === null || payload.ok !== true) {
        const error = new Error(payload?.error ?? `请求失败（HTTP ${response.status}）`);
        error.code = payload?.code;
        error.details = payload?.details;
        throw error;
      }
      return payload;
    }

    function readDocument(path) {
      return requestJson(`/md-editor/read?path=${encodeURIComponent(path)}`);
    }

    function writeDocument(path, content, mtimeMs, force) {
      return requestJson("/md-editor/write", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path, content, mtimeMs, force })
      });
    }

    /** 预览里的图片：相对路径按文档所在目录解析，走 DSH 的 /api/file 认证路由。 */
    function resolvePreviewImage(documentPath, destination) {
      if (typeof destination !== "string" || destination.length === 0) return undefined;
      const suffix = destination.search(/[?#]/u);
      let target;
      try {
        target = decodeURIComponent(suffix === -1 ? destination : destination.slice(0, suffix));
      } catch {
        return undefined;
      }
      if (target.length === 0) return undefined;
      if (!/^[a-z]:[/\\]/iu.test(target) && /^[a-z][a-z\d+.-]*:/iu.test(target)) return undefined;
      const absolute = /^(?:[a-z]:[/\\]|[/\\]|\\\\)/iu.test(target);
      let resolved = target;
      if (!absolute) {
        const slash = Math.max(documentPath.lastIndexOf("/"), documentPath.lastIndexOf("\\"));
        if (slash < 0) return undefined;
        resolved = documentPath.slice(0, slash + 1) + target;
      }
      const base = document.baseURI;
      if (!/^https?:/u.test(base) && !base.startsWith("dsh-app://app/")) return undefined;
      return new URL(`api/file?path=${encodeURIComponent(resolved)}`, base).href;
    }

    const MARKDOWN_LABELS = {
      code: {
        copyLabel: "复制",
        copiedLabel: "已复制",
        toolbarLabels: { codeLabel: "代码", wrapLabel: "自动换行", unwrapLabel: "取消换行" }
      },
      footnotes: "脚注"
    };

    /** 预览渲染失败时兜底成纯文本，并把原因报给宿主诊断日志。 */
    class PreviewBoundary extends react.Component {
      constructor(props) {
        super(props);
        this.state = { error: null };
      }
      static getDerivedStateFromError(error) {
        return { error };
      }
      componentDidCatch(error) {
        try {
          const message = String((error && error.message) || error).slice(0, 300);
          fetch(`/md-editor/health?from=preview-error&message=${encodeURIComponent(message)}`).catch(() => {});
        } catch {
          /* 诊断失败不影响兜底 */
        }
      }
      render() {
        if (this.state.error !== null) {
          return react.createElement("pre", { className: "dsh-mde-preview-empty" }, this.props.text);
        }
        return this.props.children;
      }
    }

    /** 实时渲染的 Markdown 预览；primitives 不可用时退化为等宽纯文本。 */
    function MarkdownPreview({ text, documentPath }) {
      const pathImages = react.useMemo(
        () => ({ resolve: (destination) => resolvePreviewImage(documentPath, destination) }),
        [documentPath]
      );
      const MarkdownComponent = primitives === null ? undefined : primitives.MarkdownText;
      const usable =
        MarkdownComponent != null &&
        (typeof MarkdownComponent === "function" || typeof MarkdownComponent === "object");
      if (!usable) {
        return react.createElement("pre", { className: "dsh-mde-preview-empty" }, text);
      }
      return react.createElement(
        "div",
        { className: "dsh-mde-markdown" },
        react.createElement(MarkdownComponent, {
          text,
          streaming: false,
          labels: MARKDOWN_LABELS,
          pathImages
        })
      );
    }

    /**
     * 按空行把文档切成块（围栏代码块内部不切）。
     * 每块携带自己的字符区间与原文，`blocks.map(b => b.source).join("")` 可还原原文。
     */
    function splitBlocks(text) {
      const blocks = [];
      if (text === "") return blocks;
      const lines = text.split("\n");
      let start = 0;
      let offset = 0;
      let inFence = false;
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        if (/^\s*(?:```|~~~)/u.test(line)) inFence = !inFence;
        offset += line.length + 1;
        if (inFence || line.trim() !== "") continue;
        // 空行处再向后看：下一段若仍是列表项或缩进内容，说明是同一个块（松散列表/嵌套块）
        let next = index + 1;
        while (next < lines.length && lines[next].trim() === "") next += 1;
        if (next < lines.length) {
          const following = lines[next];
          if (/^\s*(?:[-*+]|\d+[.)])\s+/u.test(following) || /^\s{2,}\S/u.test(following)) continue;
        }
        const end = Math.min(offset, text.length);
        if (end > start) blocks.push({ start, end, source: text.slice(start, end) });
        start = end;
      }
      if (start < text.length) blocks.push({ start, end: text.length, source: text.slice(start) });
      return blocks;
    }

    /** 单个块的原地编辑框：内容是该块的 Markdown 源码。 */
    function BlockEditor({ initial, onCommit, onCancel }) {
      const [value, setValue] = react.useState(initial);
      const ref = react.useRef(null);
      const resize = () => {
        const element = ref.current;
        if (element === null) return;
        element.style.height = "auto";
        element.style.height = `${element.scrollHeight}px`;
      };
      react.useLayoutEffect(() => {
        const element = ref.current;
        if (element === null) return;
        resize();
        element.focus();
        const end = element.value.length;
        element.setSelectionRange(end, end);
      }, []);
      react.useEffect(resize, [value]);
      return react.createElement("textarea", {
        ref,
        className: "dsh-mde-block-input",
        value,
        spellCheck: false,
        "data-dsh-md-editor-block-input": "",
        onChange: (event) => setValue(event.target.value),
        onBlur: () => onCommit(value),
        onKeyDown: (event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onCancel();
            return;
          }
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            event.stopPropagation();
            onCommit(value);
            return;
          }
          if ((event.metaKey || event.ctrlKey) && !event.altKey && (event.key === "s" || event.key === "S")) {
            event.preventDefault();
            event.stopPropagation();
            onCommit(value, true);
          }
        }
      });
    }

    /** 渲染出来的文档；点任意块即可就地改这一块的源码，失焦后重新渲染。 */
    function PreviewEditor({ text, documentPath, onChange, onSave }) {
      const blocks = react.useMemo(() => splitBlocks(text), [text]);
      const [editingStart, setEditingStart] = react.useState(null);
      const beginEdit = (block, event) => {
        const target = event.target;
        if (target !== null && typeof target.closest === "function" && target.closest("a, button, input, textarea")) return;
        setEditingStart(block.start);
      };
      const commit = (block, value, saveAfter) => {
        setEditingStart(null);
        const trimmed = value.replace(/\s+$/u, "");
        const trailing = block.source.slice(block.source.replace(/\s+$/u, "").length);
        const next = trimmed + trailing;
        const whole = text.slice(0, block.start) + next + text.slice(block.end);
        if (whole === text) {
          if (saveAfter === true) onSave(text);
          return;
        }
        onChange(whole);
        if (saveAfter === true) onSave(whole);
      };
      return react.createElement(
        "div",
        { className: "dsh-mde-blocks" },
        blocks.map((block) => {
          if (block.source.trim() === "") {
            return react.createElement("div", { key: block.start, className: "dsh-mde-block-gap" });
          }
          const editing = editingStart === block.start;
          return react.createElement(
            "div",
            {
              key: block.start,
              className: "dsh-mde-block",
              "data-dsh-md-editor-block": "",
              onClick: (event) => beginEdit(block, event)
            },
            editing
              ? react.createElement(BlockEditor, {
                  initial: block.source.replace(/\s+$/u, ""),
                  onCommit: (value, saveAfter) => commit(block, value, saveAfter),
                  onCancel: () => setEditingStart(null)
                })
              : react.createElement(
                  PreviewBoundary,
                  { text: block.source },
                  react.createElement(MarkdownPreview, {
                    text: block.source.replace(/\s+$/u, ""),
                    documentPath
                  })
                )
          );
        })
      );
    }

    function fileNameOf(path) {
      const parts = path.split(/[\\/]/);
      return parts[parts.length - 1] || path;
    }

    function PencilIcon() {
      return react.createElement(
        "svg",
        {
          width: 14,
          height: 14,
          viewBox: "0 0 24 24",
          fill: "none",
          stroke: "currentColor",
          strokeWidth: 2,
          strokeLinecap: "round",
          strokeLinejoin: "round",
          "aria-hidden": "true"
        },
        react.createElement("path", { d: "M12 20h9" }),
        react.createElement("path", { d: "M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" })
      );
    }

    /**
     * 原地编辑器：测量预览根节点的位置，把面板精确盖上去；量不到时退化为右侧浮层。
     */
    function EditorPanel({ path, anchor, onClose }) {
      const [docState, setDocState] = react.useState(null);
      const [failure, setFailure] = react.useState(null);
      const [saving, setSaving] = react.useState(false);
      const [notice, setNotice] = react.useState("");
      const [bounds, setBounds] = react.useState(null);
      const [reloadToken, setReloadToken] = react.useState(0);
      const [mode, setMode] = react.useState("preview");
      const savingRef = react.useRef(false);


      // 跟随预览区的位置与尺寸（拖拽分栏不会触发 window resize，所以用 ResizeObserver）。
      react.useLayoutEffect(() => {
        const measure = () => {
          const root =
            anchor != null && anchor.isConnected ? anchor.closest(PREVIEW_ROOT_SELECTOR) : null;
          const target = root ?? document.querySelector(PREVIEW_ROOT_SELECTOR);
          if (target === null) {
            setBounds(null);
            return;
          }
          const rect = target.getBoundingClientRect();
          if (rect.width < 80 || rect.height < 80) {
            setBounds(null);
            return;
          }
          setBounds({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
        };
        measure();
        const initial =
          anchor != null && anchor.isConnected ? anchor.closest(PREVIEW_ROOT_SELECTOR) : null;
        const observed = initial ?? document.querySelector(PREVIEW_ROOT_SELECTOR);
        let observer = null;
        if (observed !== null && typeof ResizeObserver !== "undefined") {
          observer = new ResizeObserver(measure);
          observer.observe(observed);
        }
        window.addEventListener("resize", measure);
        return () => {
          window.removeEventListener("resize", measure);
          if (observer !== null) observer.disconnect();
        };
      }, [anchor]);

      // 打开即读全文；CRLF 在编辑时统一成 LF，保存时按原样还原。
      react.useEffect(() => {
        let cancelled = false;
        setFailure(null);
        setDocState(null);
        readDocument(path)
          .then((payload) => {
            if (cancelled) return;
            const eol = payload.content.includes("\r\n") ? "\r\n" : "\n";
            const content = eol === "\r\n" ? payload.content.replace(/\r\n/g, "\n") : payload.content;
            setDocState({ content, original: content, eol, mtimeMs: payload.mtimeMs });
          })
          .catch((error) => {
            if (!cancelled) setFailure(error.message);
          });
        return () => {
          cancelled = true;
        };
      }, [path, reloadToken]);

      const dirty = docState !== null && docState.content !== docState.original;

      const save = react.useCallback(
        async (force = false, overrideContent) => {
          if (docState === null || savingRef.current) return;
          savingRef.current = true;
          setSaving(true);
          setNotice("保存中…");
          try {
            const raw = typeof overrideContent === "string" ? overrideContent : docState.content;
            const content = docState.eol === "\r\n" ? raw.replace(/\n/g, "\r\n") : raw;
            let result;
            try {
              result = await writeDocument(path, content, docState.mtimeMs, force);
            } catch (error) {
              if (error.code !== "conflict" || force) throw error;
              if (!window.confirm("文件已在别处被修改。用当前内容覆盖吗？")) {
                setNotice("未保存：文件已被其他程序修改");
                return;
              }
              result = await writeDocument(path, content, docState.mtimeMs, true);
            }
            setDocState((current) =>
              current === null ? current : { ...current, original: raw, mtimeMs: result.mtimeMs }
            );
            setNotice("已保存");
          } catch (error) {
            setNotice(`保存失败：${error.message}`);
          } finally {
            savingRef.current = false;
            setSaving(false);
          }
        },
        [docState, path]
      );

      const requestClose = react.useCallback(() => {
        if (dirty && !window.confirm("有未保存的修改，确定关闭吗？")) return;
        onClose();
      }, [dirty, onClose]);

      const onKeyDown = react.useCallback(
        (event) => {
          if ((event.metaKey || event.ctrlKey) && !event.altKey && (event.key === "s" || event.key === "S")) {
            event.preventDefault();
            save();
            return;
          }
          if (event.key === "Escape") {
            event.preventDefault();
            requestClose();
          }
        },
        [requestClose, save]
      );

      const style =
        bounds === null
          ? { right: 12, top: 12, bottom: 12, width: Math.min(560, Math.max(320, window.innerWidth - 24)) }
          : { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height };

      const header = react.createElement(
        "div",
        { className: "dsh-mde-header" },
        react.createElement("span", { className: "dsh-mde-name", title: path }, fileNameOf(path)),
        dirty ? react.createElement("span", { className: "dsh-mde-dirty", title: "有未保存的修改" }, "●") : null,
        react.createElement("span", { className: "dsh-mde-spacer" }),
        react.createElement(
          "button",
          {
            type: "button",
            className: "dsh-mde-ghost",
            "aria-pressed": mode === "source",
            title: mode === "preview" ? "切换到源码模式（整篇编辑）" : "回到预览，点段落原地编辑",
            onClick: () => setMode((value) => (value === "preview" ? "source" : "preview"))
          },
          mode === "preview" ? "源码" : "预览"
        ),
        react.createElement(
          "button",
          {
            type: "button",
            className: "dsh-mde-primary",
            disabled: saving || docState === null || !dirty,
            onClick: () => save(false)
          },
          saving ? "保存中…" : "保存"
        ),
        react.createElement("button", { type: "button", className: "dsh-mde-ghost", onClick: requestClose }, "关闭")
      );

      let body;
      if (failure !== null) {
        body = react.createElement(
          "div",
          { className: "dsh-mde-state dsh-mde-error" },
          react.createElement("div", null, react.createElement("p", null, failure), react.createElement("button", {
            type: "button",
            className: "dsh-mde-ghost",
            onClick: () => setReloadToken((value) => value + 1)
          }, "重试"))
        );
      } else if (docState === null) {
        body = react.createElement("div", { className: "dsh-mde-state" }, "正在读取…");
      } else {
        const textarea = react.createElement("textarea", {
          className: "dsh-mde-textarea",
          value: docState.content,
          onChange: (event) => {
            const value = event.target.value;
            setDocState((current) => (current === null ? current : { ...current, content: value }));
            setNotice("");
          },
          spellCheck: false,
          autoFocus: true,
          "aria-label": "文档内容"
        });
        body =
          mode === "preview"
            ? react.createElement(
                "div",
                { className: "dsh-mde-preview", "data-dsh-md-editor-preview": "" },
                docState.content.trim() === ""
                  ? react.createElement("div", { className: "dsh-mde-preview-empty" }, "（空文档，点这里开始写）")
                  : react.createElement(PreviewEditor, {
                      text: docState.content,
                      documentPath: path,
                      onChange: (next) => {
                        setDocState((current) => (current === null ? current : { ...current, content: next }));
                        setNotice("");
                      },
                      onSave: (next) => save(false, next)
                    })
              )
            : textarea;
      }

      const footer = react.createElement(
        "div",
        { className: "dsh-mde-footer" },
        react.createElement("span", null, notice === "" ? "⌘/Ctrl+S 保存 · Esc 关闭" : notice),
        docState === null
          ? null
          : react.createElement(
              "span",
              { className: "dsh-mde-counts" },
              `${docState.content.split("\n").length} 行 · ${docState.content.length} 字符`
            )
      );

      const onPanelKeyDown = (event) => {
        if ((event.metaKey || event.ctrlKey) && !event.altKey && (event.key === "s" || event.key === "S")) {
          event.preventDefault();
          save();
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          requestClose();
        }
      };

      const panel = react.createElement(
        "div",
        {
          className: `dsh-mde-panel${bounds === null ? "" : " dsh-mde-docked"}`,
          style,
          role: "dialog",
          "aria-label": "编辑文档",
          onKeyDown: onPanelKeyDown
        },
        header,
        body,
        footer
      );

      return reactDom.createPortal(panel, document.body);
    }

    /** 文档预览头部的入口按钮：只在可编辑文件上渲染。 */
    function EditTrigger(props) {
      const absolutePath = props.absolutePath;
      const [open, setOpen] = react.useState(false);
      const buttonRef = react.useRef(null);
      if (typeof absolutePath !== "string" || !EDITABLE.test(absolutePath)) return null;
      return react.createElement(
        react.Fragment,
        null,
        react.createElement(
          "button",
          {
            type: "button",
            ref: buttonRef,
            className: "dsh-mde-trigger",
            title: "编辑文档",
            "aria-label": "编辑文档",
            "data-dsh-md-editor-trigger": "",
            onClick: () => setOpen(true)
          },
          react.createElement(PencilIcon, null)
        ),
        open
          ? react.createElement(EditorPanel, {
              path: absolutePath,
              anchor: buttonRef.current,
              onClose: () => setOpen(false)
            })
          : null
      );
    }

    function apply(ctx) {
      ensureStyles();
      // 启动自检：确认宿主路由可达（同时让宿主侧留下一条「客户端已加载」诊断）。
      try {
        fetch(`/md-editor/health?from=client&markdown=${primitives?.MarkdownText == null ? "0" : "1"}`).catch(() => {});
      } catch {
        /* 自检失败不影响按钮 */
      }
      ctx.effect(
        () =>
          ctx.slots.inject(SLOT, () =>
            ctx.slots.register(
              {
                name: SLOT,
                id: "md-editor",
                order: 10
              },
              EditTrigger
            )
          ),
        "md-editor: document action"
      );
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
