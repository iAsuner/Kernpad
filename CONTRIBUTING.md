# 参与 Kernpad 开发

[English](CONTRIBUTING.en.md)

欢迎通过 issue 描述问题或提出改进，通过 pull request 提交实现。较大的架构或交互变更，先说明具体使用场景、预期行为和影响范围，避免重复工作。安全漏洞按[安全说明](SECURITY.zh.md)私下报告。

## 准备环境

macOS 使用 Apple Silicon、macOS 14+、Xcode Command Line Tools、Python 3.9+ 和 Node.js 22+。Windows 使用 Windows 11、.NET 10 SDK、Python 3.9+、Node.js 22+ 和 WebView2 Runtime。

共享编辑器位于 `Source/Web/`。修改源文件后运行 `python3 Source/build-web.py`，不提交生成的三个 Web 文件。原生宿主加载本地资源，不能通过普通网页服务器完整验收密码库。

## 验证变更

| 变更范围 | 验证命令 |
| --- | --- |
| 共享模型、行为与文案 | `python3 Source/test-web.py` |
| macOS 加密、存储、会话、原生桥 | `zsh Source/test.sh` |
| 富文本、媒体、排版、PDF | `zsh Source/test-documents.sh` |
| macOS 原生集成与签名 | `zsh Source/build.sh` |
| Windows 原生客户端 | `powershell -File Windows/build.ps1` |
| Windows 中英文完整流程 | `dotnet run --project Windows/Kernpad.Smoke -- --workflows Windows/Artifacts/workflows` |
| 发布内容边界 | `python3 Source/Tests/RepositoryTests.py` |

在 PR 中记录实际运行的命令、平台、结果和未完成项。系统认证需要本人完成，CI 或虚拟机不能证明真实硬件策略正确。测试必须使用合成凭据、临时资料库和独立测试应用。

修改保存或编辑行为时，验收输入、撤销、失败重试、切换记录、锁定和重启。修改模板时，覆盖设计、保存、应用、快捷粘贴及列表映射。修改布局时，检查两种语言、最小窗口宽度、长标签、键盘操作和 PDF。

## 代码与数据约束

- 保留系统可用性检查与真正的受保护密钥操作，不以认证布尔值替代硬件保护。
- 摘要、单条详情和带会话票据的补丁保持边界。保存失败保留修改，成功后才释放详情。
- 格式和应用身份变更需完整迁移设计。正式发行代码只支持当前 Kernpad 格式。
- 新增依赖说明必要性、许可与发布包影响，提交相应锁文件。
- 面向用户的文字分别维护中英文，避免拼接短语和装饰性中点分隔符。
- 不提交应用、缓存、日志、个人资料、证书、访问令牌或真实恢复密钥。

## 检查将要公开的内容

先审查并暂存有意发布的文件，然后执行：

```sh
python3 Source/check-repository.py
python3 Source/scan-secrets.py --gitleaks /path/to/gitleaks
python3 Source/export-source.py ../Kernpad-source
```

使用官方 Gitleaks 8.30.1 或更新版本。扫描器默认规则保留，仅对指定文件中的公开 RFC 测试种子做精确例外；不要整目录忽略测试数据。扫描输出隐藏匹配值。图片需要人工检查，扫描通过不等于不存在敏感信息。

导出工具只复制审查过的 Git 暂存内容，不复制 `.git`、未跟踪文件或本机迁移工具，且拒绝覆盖目标目录。新仓库从导出目录创建，开发仓库的历史无需转移。导出后可再次执行 `python3 Source/check-repository.py --directory ../Kernpad-source`。

## 发布

发布前运行对应平台的测试和实际安装验收，核对第三方许可、签名与 SHA-256。只上传生成的应用发行包和校验文件，检查包中没有调试资料、用户资料与签名私钥。在 GitHub 启用私密漏洞报告和分支保护，并确认 CI 实际成功；不要以缺失或无法启动的 CI 作为通过。

仓库简介可使用“本地便签与密码管理器，支持富文本、Markdown、HTML、自定义模板与 PDF”。Topics 使用实际能力，例如 `password-manager`、`notes`、`markdown`、`rich-text`、`pdf`、`totp`、`offline`、`macos`、`windows`、`swift`、`wpf`。

MIT 适用于本项目代码。贡献时保留第三方许可与来源说明，见[第三方声明](THIRD_PARTY_NOTICES.txt)。
