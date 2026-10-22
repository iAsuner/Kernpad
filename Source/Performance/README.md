# 独立性能测试

[English](README.en.md)

测试驱动使用生产原生宿主和四篇合成示例，自动编辑、打开与关闭 PDF 预览。只使用新建临时资料库，不打开正式资料。测试入口不会打包到发行应用。指标解释见本文最后一节，结果生成在本机 Build 目录。

## 准备基线

在修改前生成 Web 资源，再保存基线；已有基线目录会拒绝覆盖：

```sh
python3 Source/build-web.py
python3 Source/Performance/capture-baseline.py
```

保存基线时记录 Git 提交号和文件 SHA-256。重现旧版本应使用独立检出目录，不覆盖当前工作目录。

## macOS

完成改动并运行项目回归后：

```sh
zsh Source/build.sh
python3 Source/Performance/build-mac.py before
python3 Source/Performance/build-mac.py after
python3 Source/Performance/measure-mac.py before 1
python3 Source/Performance/measure-mac.py after 1
python3 Source/Performance/measure-mac.py before 2
python3 Source/Performance/measure-mac.py after 2
```

每次约 80 秒。两个独立 Bundle ID 分别驱动生产 `AppDelegate`。测量期间不要重新构建正在运行的测试应用，也不要启动其他 WebKit 应用。结果包含宿主和启动后新增的 WebKit 进程；检查进程列表，排除无关进程。命令需要本机编译、启动 GUI 和读取进程统计的权限。

每轮产生 JSON 原始样本、`.checks.json` 功能结果、阶段文件和日志。仅接受退出码 0、四篇便签保留、预览关闭的结果。不同运行编号不会相互覆盖。

## Windows 11 ARM 虚拟机

宿主安装 .NET 10 SDK，虚拟机安装 WebView2 Runtime。在项目目录构建两份自包含测试包：

```sh
python3 Source/Performance/build-windows.py before
python3 Source/Performance/build-windows.py after
```

将 `Build/performance/windows-before.zip` 与 `windows-after.zip` 复制到虚拟机，各自解压到独立目录，然后在 Windows PowerShell 顺序运行：

```powershell
New-Item -ItemType Directory -Force .\results
.\before\Kernpad.Performance.exe .\results\windows-before-1.json
.\before\Kernpad.Performance.exe .\results\windows-before-2.json
.\after\Kernpad.Performance.exe .\results\windows-after-1.json
.\after\Kernpad.Performance.exe .\results\windows-after-2.json
```

每轮使用新的临时资料目录，无需系统验证。失败写入结果路径加 `.error` 的文件，不能当作通过。JSON 包含合成资料检查、每阶段统计和采样进程 ID。不要同时运行其他 WebView2 应用或构建任务。若要测试 x64，需将发布 RID 改为 `win-x64` 并在对应系统重新测量，不能沿用 ARM64 结果。

## 功能验收与解释

性能驱动不是完整功能测试。另运行 `Source/test.sh`、`Source/test-documents.sh`、.NET 核心套件；在 Windows 用 `Kernpad.Smoke.exe` 及 `Source/Tests/Fixtures/` 中的合成资料验收原生媒体和 PDF。它验证照片与封面确实解码，防止将内容缺失误判为性能提升。

Mac 记录 physical footprint，Windows 同时记录 Private Bytes 和 Working Set。CPU 均按单核 100% 计算。分别报告同平台两轮均值和单轮波动，不只选择最好的运行。复现时优先串行测两平台；虚拟机与宿主并行负载会影响 CPU 对比。不要提交原始本机日志、临时资料库或含凭据的结果。
