# Kernpad 开发约定

- 先读中文 `README.md` 或英文 `README.en.md`，安全约束、实现与测试均在对应文件中。
- macOS 使用 Swift、AppKit、WKWebView，目标为 Apple Silicon、macOS 14+。Windows 使用独立原生宿主，不模拟 macOS 系统认证。
- 修改 Web 源文件，再运行 `python3 Source/build-web.py`；不编辑或提交生成的 app.js、app.css、index.html。
- 行为修改运行 `zsh Source/test.sh`，原生集成运行 `zsh Source/build.sh`，富文本、布局、媒体和 PDF 另运行 `zsh Source/test-documents.sh`。
- 测试仅使用合成凭据、临时资料库和独立测试应用，不使用个人正式资料库。
- macOS 保留 Secure Enclave 的 userPresence 与系统可用性检查；Windows 解锁必须依赖真正的受保护密钥操作，不得仅凭认证布尔值解锁。
- 摘要、单条详情和带票据补丁保持边界；未提交正文保留密文，永久删除显式列出 ID；正常备份恢复逐条重加密。
- 保存成功后才能释放详情；失败保留修改。重新认证更新票据并清理旧详情。预览最多 40 个 ID，不返回密码、正文或 OTP 种子，刷新不延长闲置时间。
- 普通便签中明确公开的 OTP 保持明文语义；受保护记录、媒体和旧验证器继续保护。
- 新发行版只使用 Kernpad 标识与当前加密格式。本机旧资料由仓库外的独立迁移工具转换，主程序不保留旧格式解锁或导入路径。
- 不提交应用、缓存、日志、个人资料、证书或恢复密钥。系统密码与生物认证由本人输入。

- 面向用户的文字不使用中点作为装饰性分隔符。用完整句子、按语义使用标点，或拆为段落和列表；不要机械替换成其他装饰分隔符。
- 产品名称为 Kernpad，Bundle ID 为 app.kernpad.desktop，资料目录为 Kernpad。开源交付只包含审计过的源文件，不包含原开发仓库历史。
