let locale='zh';
const translations=Object.fromEntries(`
条记录|records
移除|Remove
格式化 JSON|Format JSON
清空回收站…|Empty Trash…
设置|Settings
模板|Templates
通用|General
安全|Security
备份|Backups
快捷键|Shortcuts
语言|Language
无操作后锁定|Lock after inactivity
最长解锁时间|Maximum unlocked time
切到其他应用时锁定|Lock when switching apps
锁屏、睡眠和退出时始终锁定密码库。|Always locks when the Mac locks, sleeps or the app quits.
进入密码库即可使用指纹解锁。|Open Vault to use Touch ID.
解锁后可设置本机验证。|Unlock to set up this Mac.
重新设置…|Set Up Again…
Mac 丢失或重置后，用它恢复资料库和备份。|Use this key to recover your vault and backups if your Mac is lost or reset.
查看…|View…
普通便签未加密。私密内容请存入密码库。|Notes are not encrypted. Keep private information in Vault.
保存所有便签、密码记录和模板，使用恢复密钥打开。|Save all notes, vault records and templates. Open with your recovery key.
导出…|Export…
导入…|Import…
切换…|Switch…
恢复为新资料库，保留现有资料。|Restore a separate library and keep your current data.
调整字段和导入规则，已有记录不受影响。|Adjust fields and import rules. Existing records are preserved.
选择模板开始记录。|Choose a template to start a record.
银行卡、银行账户|Cards and bank accounts
笔记与待办|Notes and checklists
自定义|Custom
创建|Create
可选|Optional
密笺|Kernpad
便签与密码|Notes & passwords
在本机保存便签与密码|Local notes and passwords
资料保存在本机，无需云端账户|Stored on this Mac, without a cloud account
个人资料库|Personal library
便签|Notes
密码库|Vault
已锁定|Locked
已解锁|Unlocked
全部便签|All notes
我的便签|My notes
我的收藏|Favorites
收藏便签|Favorite notes
最近便签|Recent notes
密码记录|Vault records
全部记录|All records
按类型浏览|Categories
动态验证码|Authenticator
新建便签|New note
普通便签|Note
加锁便签|Locked note
免解锁便签|Unlocked note
密码库保护|Vault protected
模板中心|Templates
资料库与备份|Settings & backup
返回总览|Back to overview
返回表格|Back to overview
查看模式|Viewing
编辑文档|Edit
完成编辑|Done
粘贴录入|Paste import
撤销|Undo
字色|Color
组件|Blocks
插入 Markdown|Insert Markdown
行左侧 ＋ 或 @|Line + or @
添加内容（输入 @ 选择组件）|Add content (type @ for blocks)
输入正文，@ 选择组件|Write something, or type @ for blocks
添加用途或说明…|Add a description…
未命名便签|Untitled note
记录名称|Record title
记录说明|Description
加粗所选文字|Bold
斜体所选文字|Italic
删除线|Strikethrough
高亮标记|Highlight
行内代码|Inline code
纯文本|Plain text
复制代码|Copy code
输入代码或命令…|Enter code or a command…
搜索便签…|Search notes…
搜索密码记录…|Search vault…
搜索组件|Search blocks
选择组件|Choose a block
关闭组件选择|Close block menu
输入 2fa、table、code 或中文…|Type 2fa, table, code, or a name…
↑↓ 选择　Enter 插入　Esc 取消|↑↓ Choose   Enter Insert   Esc Cancel
没有匹配的指令或组件|No matching blocks
没有匹配的组件|No matching blocks
代码块|Code block
多行代码 / 命令|Code and shell commands
一级标题|Heading 1
二级标题|Heading 2
三级标题|Heading 3
正文|Text
标题|Heading
待办清单|To-do list
待办|To-do
表格|Table
表单|Form
日期|Date
标签|Tags
网址|Link
引用|Quote
引用说明|Quoted text
无序列表|Bulleted list
逐项记录|List your ideas
有序列表|Numbered list
步骤与顺序|Ordered steps
提示块|Callout
提示|Callout
分隔线|Divider
基本信息字段|Property
关联记录|Related records
账号资料组合|Login details
表单 + 动态验证码|Form and authenticator
服务器连接组合|Server connection
主机、端口与账密|Host, port and credentials
联系方式组合|Contact details
姓名、邮箱与手机|Name, email and phone
基本信息|Properties
连接信息|Connection
卡片资料|Card details
账户资料|Account details
点击字段编辑，右侧减号可移除|Click a field to edit; use the minus button to remove it
添加基本信息字段|Add property
尚无基本信息|No properties yet
复制|Copy
打开|Open
关联|Link
新建|New
编辑|Edit
删除|Delete
添加|Add
关闭|Close
取消|Cancel
完成|Done
保存|Save
查看|View
启用|Enable
停用|Disable
默认|Default
红色|Red
橙色|Orange
绿色|Green
蓝色|Blue
紫色|Purple
快捷入口|Quick links
这是一条本地记录|A local record
尚未关联其他资料|No linked records
邮箱独立维护，引用自动更新。|Email details update across linked records.
暂无其他记录引用|No incoming links
引用了当前记录|Links to this record
编辑关联记录|Edit related records
受保护记录|Protected record
密码库已锁定|Vault locked
解锁密码库|Unlock vault
普通便签仍可直接使用|Your notes remain available
账号、密码、验证码和关联资料|Accounts, passwords, codes and linked details
解锁后在这里查看。|Unlock to view them here.
解锁后查看账号、邮箱、服务器与其他凭据。|Unlock to access accounts, email, servers and credentials.
切换当前记录的模板|Change record template
正文与已有资料会保留；密码类模板使用密码库保护。|Keep existing content. Credential templates are protected by the vault.
随手记、文档与待办|Notes, documents and to-dos
设为加锁便签|Protect this note
已受保护的记录切换为便签模板后，仍保留密码库保护。|Protected records stay in the vault after switching to a note template.
选择记录模板|Choose a template
选择后直接进入编辑页，填写资料或使用粘贴录入。|Open the editor to fill in fields or paste your data.
自定义模板|Custom template
配置模板|Configure template
模板名称|Template name
所属分类|Category
快捷识别格式|Import pattern
解析规则只指定导入列，不会删除模板中的其他字段。|The import pattern selects columns; it does not remove other template fields.
从规则补充字段|Add fields from pattern
字段标识|Field ID
显示名称|Display name
类型|Type
必填|Required
添加字段|Add field
保存模板|Save template
保存并粘贴录入|Save and paste data
配置规则|Edit pattern
收起粘贴录入|Close paste import
待识别资料|Data to import
粘贴到这里，识别后填入当前记录。|Paste here to fill the current record.
未包含的字段保持原值|Other fields remain unchanged
填入示例|Insert sample
预览识别|Preview import
填入当前记录|Fill current record
字段名称|Field name
字段类型|Field type
文本|Text
密码 / 密钥|Password / secret
邮箱|Email
数字|Number
多行文本|Multiline text
添加资料字段|Add property
为表单添加字段|Add form field
字段类型决定左侧图标、输入方式和快捷操作。|Field types determine icons, inputs and quick actions.
例如：续费日期 / 备用密码|e.g. Renewal date / Backup password
验证器设置|Authenticator settings
TOTP 密钥（Base32 格式）|TOTP secret (Base32)
输入密钥后自动生成|Enter a secret to generate codes
复制验证码|Copy code
新标签|New tag
输入标签，回车或点添加|Enter a tag and press Return
复制所有标签|Copy all tags
行|Row
列|Column
账号资料|Login details
服务器连接|Server connection
联系方式|Contact details
文档|Document
临时遮挡|Hide values
没有匹配的记录|No matching records
点击内容复制，点击名称编辑文档|Click a value to copy, or a title to open
上一页|Previous page
下一页|Next page
设置与备份|Settings & backup
所有资料留在此 Mac；备份文件由你选择保存位置。|Your data stays on this Mac. You choose where backups are saved.
无操作后自动锁定|Lock after inactivity
每次解锁的最长时长|Maximum unlocked duration
转入后台时锁定|Lock when app goes to background
锁屏、睡眠与退出|Screen lock, sleep and quit
始终锁定密码库；普通便签继续可用。|Always lock the vault. Notes remain available.
Touch ID / 系统密码|Touch ID / system password
由系统钥匙串保护；不会读取你的系统密码。|Protected by Keychain. Your system password is never read.
恢复密钥|Recovery key
加密备份|Encrypted backup
包含便签、密码记录、关联和模板。|Includes notes, credentials, links and templates.
导出备份|Export backup
跨设备迁移|Move to another device
恢复为新的本地资料库，原资料库保留。|Restore as a new library. The current library stays intact.
导入备份|Import backup
本地资料库|Local library
切换资料库|Switch library
普通便签免解锁、明文保存在此 Mac。密码记录与模板使用 AES-256-GCM 加密。|Notes are stored unencrypted on this Mac. Vault records and templates are encrypted with AES-256-GCM.
1 分钟|1 minute
5 分钟|5 minutes
15 分钟|15 minutes
30 分钟|30 minutes
1 小时|1 hour
不限制|No limit
正在保存…|Saving…
密码库已加密保存|Vault encrypted and saved
便签已保存到本机|Saved locally
保存失败，请勿关闭应用|Save failed. Keep the app open.
最后一次保存失败，请检查磁盘|Last save failed. Check your disk.
正在加密并锁定…|Encrypting and locking…
已自动锁定密码库|Vault locked automatically
已复制，30 秒后自动清除|Copied. Clears in 30 seconds
已在当前行插入组件|Block inserted
已撤销上一次编辑操作|Last edit undone
暂无可撤销的操作|Nothing to undo
已切换模板，原有正文、字段和关联保留|Template changed. Content, fields and links retained.
含凭据的便签已放入密码库|Note moved to the vault
密码字段已加入，便签已放入密码库|Password field added. Note moved to vault.
已进入编辑页，可填写字段或粘贴录入|Ready to edit or paste your data
已填入当前记录，其他字段保持原值|Record filled. Other fields unchanged.
模板已保存|Template saved
请填写模板名称|Enter a template name
请填写字段名称|Enter a field name
无法加载本地资料。原文件保留，请重新打开应用。|Could not load your library. Files are preserved. Reopen the app.
社交账号|Social account
网站账号|Website login
服务器|Server
数据库|Database
SSH 密钥|SSH key
管理台|Admin console
银行卡|Payment card
银行账户|Bank account
API 凭据|API credentials
域名与证书|Domain & certificate
Wi-Fi / VPN|Wi-Fi / VPN
3x-ui 面板|3x-ui panel
宝塔面板|BaoTa panel
其他资料|Other records
密码|Password
账号|Account
地址|Address
主机|Host
端口|Port
姓名|Name
手机号|Phone
用户名|Username
TOTP 密钥|TOTP secret
备用恢复码|Recovery codes
验证与恢复|Verification & recovery
关联邮箱地址|Linked email address
关联邮箱密码|Linked email password
关联邮箱 TOTP 密钥|Linked email TOTP secret
新建或复用关联邮箱|Create or link email
邮箱地址|Email address
邮箱密码|Email password
邮箱服务商|Email provider
服务商|Provider
恢复手机号|Recovery phone
IMAP 主机|IMAP host
IMAP 端口|IMAP port
SMTP 主机|SMTP host
SMTP 端口|SMTP port
应用专用密码|App password
邮箱登录地址|Email login URL
打开邮箱|Open email
登录账号|Login account
登录密码|Login password
账号 ID|Account ID
绑定手机号|Linked phone
所属平台|Platform
登录页|Login page
账号中心|Account center
业务管理台|Business console
找回账号|Recover account
登录方式|Login method
订阅 / 到期时间|Subscription / expiry
登录地址|Login URL
打开网站|Open website
账单中心|Billing center
账号恢复地址|Account recovery URL
公网 IP|Public IP
内网 IP|Private IP
SSH 端口|SSH port
SSH 用户|SSH user
SSH 密码|SSH password
认证方式|Authentication
系统 / 地区|OS / region
主机名|Hostname
到期日期|Expiry date
网站首页|Website
服务器面板|Server panel
数据库类型|Database engine
主机地址|Host address
数据库名|Database name
SSL 模式|SSL mode
连接串|Connection string
数据库管理台|Database console
密钥类型|Key type
公钥指纹|Public key fingerprint
密钥口令|Key passphrase
私钥|Private key
公钥|Public key
默认用户|Default user
业务 ID|Business ID
权限角色|Role
资产用途|Purpose
管理台地址|Console URL
打开管理台|Open console
租户 / 项目|Tenant / project
默认地区|Default region
续费方式|Renewal method
云控制台|Cloud console
持卡人|Cardholder
卡号|Card number
有效期|Expiry
安全码|Security code
发卡机构|Issuer
账单日|Statement date
还款日|Payment due date
账单地址|Billing address
预留手机号|Registered phone
银行官网|Bank website
银行名称|Bank name
户名|Account holder
银行账号|Bank account number
开户行|Branch
网银用户名|Online banking username
网银密码|Online banking password
网上银行|Online banking
服务地址|Service URL
打开服务|Open service
访问令牌|Access token
使用环境|Environment
权限范围|Scope
到期时间|Expires
接口文档|API documentation
域名|Domain
注册商|Registrar
DNS 服务商|DNS provider
名称服务器|Nameservers
自动续费|Auto-renew
证书到期日期|Certificate expiry
证书 PEM|Certificate PEM
证书私钥|Certificate private key
注册商控制台|Registrar console
DNS 控制台|DNS console
网络名称 / SSID|Network name / SSID
网络类型|Network type
加密方式|Encryption
VPN 用户名|VPN username
网络 / VPN 密码|Network / VPN password
VPN 主机|VPN host
VPN 端口|VPN port
使用地点|Location
VPN 配置|VPN configuration
路由器管理页|Router admin page
软件名称|Software
适用版本|Version
许可证 / 序列号|License / serial number
授权邮箱|Licensed email
订单编号|Order number
授权数量|Seats
账号管理页|Account page
软件下载|Download
证件类型|Document type
证件号码|Document number
签发机构|Issuing authority
签发日期|Issue date
国家 / 地区|Country / region
登记地址|Registered address
完整面板地址|Full panel URL
打开 3x-ui 面板|Open 3x-ui
面板账号|Panel account
面板密码|Panel password
入口路径|Entry path
面板端口|Panel port
访问条件|Access requirements
面板版本|Panel version
打开宝塔面板|Open BaoTa
安全入口|Secure entry path
二次验证|Secondary verification
网站地址|Website URL
查看网站|View website
注册手机号|Registered phone
账号类型|Account type
两步验证类型|Two-step verification type
两步验证凭据|Two-step credential
恢复方式|Recovery method
主设备备注|Primary device notes
两步验证密码|Two-step password
登录验证方式|Login verification
打开 Telegram Web|Open Telegram Web
打开 WhatsApp Web|Open WhatsApp Web
用途|Purpose
路径 / 端口|Path / port
服务|Service
内容|Content
名称|Name
升级前检查最近一次备份|Check the latest backup before upgrading
已记录账号恢复方式|Account recovery method recorded
邮箱与恢复说明|Email and recovery notes
使用说明|Usage notes
订阅与账号说明|Subscription and account notes
部署与维护|Deployment and maintenance
连接与备份说明|Connection and backup notes
密钥使用说明|Key usage notes
权限与资产说明|Permissions and assets
资源与账单说明|Resources and billing
订阅记录|Subscriptions
账户使用说明|Account notes
接口使用说明|API notes
域名与证书维护|Domain and certificate maintenance
连接说明|Connection notes
授权说明|License notes
证件使用备注|Identity notes
访问说明|Access notes
面板与站点说明|Panel and site notes
设备与恢复说明|Device and recovery notes
新的待办事项|New task
列表项目|List item
文档内容|Document content
当前记录未覆盖|Current record unchanged
工作|Work
个人|Personal
运营|Operations
生产|Production
运维|DevOps
新记录|New record
未关联|Not linked
关联资料|Linked details
验证|Verification
密码 / 凭据|Password / credential
本地记录|Local record
自动|Automatic
输入 Markdown 内容|Enter Markdown
插入|Insert
默认组合|Presets
其他|Other
邮箱与恢复|Email & recovery
文档编辑|Document editor
隐藏内容|Hide contents
显示全部|Show all
记录|Record
账号密码|Credentials
到期|Expiry
不脱敏|Show full values
新建记录|New record
请输入 Markdown 内容|Enter Markdown content
请填写有效的 HTTP / HTTPS 地址|Enter a valid HTTP or HTTPS URL
记录编号|Record ID
存储位置|Storage location
未关联其他资料|No linked records
导出|Export
导入|Import
恢复|Restore
关联邮箱|Linked email
加粗|Bold
斜体|Italic
高亮|Highlight
说明|Description
纯本地|Local only
新增|Add
来源|Source
主题|Subject
资料来源|Source
关键词|Keywords
更新|Update
无操作|Inactive
入口|Quick link
快捷操作|Quick actions
自定义|Custom
登录|Login
清单|Checklist
舒适|Comfortable
紧凑|Compact
显示关联侧栏|Show related sidebar
表格密度|Table density
复制后清空剪贴板|Clear clipboard after copying
系统身份验证|System authentication
备份|Backup
验证器|Authenticator
备注|Notes
自定义账号|Custom account
完整字段，支持解析录入|Complete fields with pattern import
证件|Identity document
网络|Network
许可证|License
恢复码|Recovery codes
退出|Quit
修改|Edit
下载|Download
完整字段|Complete fields
全部|All
命令|Command
搜索|Search
字段|Field
秒|seconds
已收藏|Favorited
收藏|Favorite
其他凭据|Other credentials
密钥|Keys
编辑表格|Edit table
打开入口|Open link
原文件保留|Original file preserved
使用|Use
连接|Connection
确认|Confirm
确认导入|Confirm import
填写字段|Fill fields
解析规则|Import pattern
切换|Switch
请输入|Enter
预览|Preview
数据|Data
自动锁定|Auto-lock
快速解锁|Quick unlock
重复|Duplicate
可选|Optional
当前行|Current line
当前记录|Current record
加密导出|Encrypted export
显示|Show
隐藏|Hide
无|None
有|Yes
是|Yes
本地优先|Local first
自动生成|Generated automatically
保存位置|Storage location
应用|Apply
账户|Account
系统密码|System password
两步验证|Two-step verification
验证方式|Verification method
加锁|Protect
免解锁|No unlock required
设置|Settings
语言|Language
简体中文|简体中文
未命名|Untitled
最近|Recent
文档标题|Document heading
文档正文|Document text
完成预览|Done
版本|Version
移除|Remove
待填写|Not filled
链接|Link
默认视图|Default view
返回|Back
下移|Move down
上移|Move up
选择行|Select row
选择列|Select column
保存失败|Save failed
加密|Encryption
本地|Local
公开|Public
备份文件|Backup file
登录信息|Login details
主密码|Vault password
加密存储|Encrypted storage
已保存|Saved
继续|Continue
多个标签|Multiple tags
验证码|One-time code
模板|Template
安全|Security
解锁|Unlock
锁定|Lock
加密备份与跨设备迁移|Encrypted backups and migration
单条|Single record
批量|Batch
仅用示例体验|Sample data only
内容块|Block
保留|Keep
无操作后|After inactivity
重复记录|Duplicate record
直接显示|Show values
个人资料|Personal details
信息|Information
管理|Manage
离线恢复密钥|Offline recovery key
在浏览器打开|Open in browser
示例|Example
主页|Home
选项|Options
标记|Mark
代码|Code
已有资料|Existing records
主机 IP|Host IP
表单字段|Form fields
本地资料|Local data
账号管理|Account management
验证资料|Authentication details
操作|Actions
配置|Configure
检查磁盘|Check disk
完整入口|Full URL
图标|Icon
时间|Time
正常|Normal
创建|Create
明文|Plain text
密文|Ciphertext
凭据|Credentials
验证成功|Authenticated
清除|Clear
输入密钥|Enter secret
笔记|Notes
系统保护|System protection
备份密码|Backup password
添加内容|Add content
打开页面|Open page
配置字段|Configure fields
记录类型|Record type
填写完整|Complete details
选定|Selected
文字|Text
列表|List
格式|Format
切换模板|Change template
记录密码|Save password
添加表格|Add table
常用|Common
登录凭据|Login credentials
创建记录|Create record
自动识别|Detect automatically
密码字段|Password field
连接参数|Connection parameters
无需解锁|No unlock required
当前资料|Current data
系统验证|System authentication
锁定密码库|Lock vault
使用密码|Use password
独立保存|Stored separately
资料库|Library
自定义字段|Custom field
多行|Multiline
添加表单|Add form
收起|Collapse
内置模板|Built-in template
动态码|One-time code
保存并返回|Save and return
重新打开|Reopen
已加密|Encrypted
可恢复|Recoverable
写入|Write
内容复制|Copy content
密码记录与模板|Credentials and templates
未命名记录|Untitled record
导出文件|Export file
已修改|Modified
快照|Snapshot
授权|Authorize
重新验证|Verify again
立即锁定|Lock now
此 Mac|This Mac
离线|Offline
已导入|Imported
已有记录|Existing record
待办事项|To-do item
编辑字段|Edit fields
选中|Selected
值|Value
文件|File
选择记录|Choose record
软件|Software
入口地址|Entry URL
点击编辑|Click to edit
使用密码库|Use vault
动态验证|Dynamic verification
正在加密|Encrypting
应用数据|App data
权限|Permissions
录入|Entry
继续使用|Continue
编辑标题|Edit title
中文|中文
English|English
添加基本信息|Add properties
原资料库保留|Current library preserved
查找|Find
有效|Valid
恢复密码库|Restore vault
资料分类|Categories
清空|Clear
手动锁定|Lock manually
其他字段|Other fields
访问|Access
添加自定义字段|Add custom field
信息字段|Information field
恢复邮箱|Recovery email
模式|Mode
用户|User
首次设置|First-time setup
记录编辑|Record editing
颜色|Color
行列|Rows & columns
系统|System
跨设备|Across devices
记录账号|Save account
存储|Storage
内置|Built-in
开发|Development
保持原值|Keep current value
空白便签|Blank note
页面|Page
已删除|Deleted
空白|Blank
文字颜色|Text color
解锁方式|Unlock method
原始资料|Original data
复制按钮|Copy button
资料库已锁定|Vault locked
编辑工具|Editing tools
已填入|Filled
提示内容|Callout text
记录模板|Record template
填写|Fill
钥匙串|Keychain
首次创建|Create for the first time
列表项|List item
检查|Check
添加资料|Add record
密码库已解锁|Vault unlocked
切换资料|Switch record
加密快照|Encrypted snapshot
分类|Category
资料整理|Organize data
邮箱关联|Email link
备份密钥|Backup key
分隔符|Delimiter
浏览|Browse
所有资料|All data
首次使用|First use
录入方式|Entry method
查看账号|View account
点击填写|Click to fill
备份格式|Backup format
代码语言|Code language
代码内容|Code content
核对|Review
保护方式|Protection method
独立验证器|Standalone authenticator
解锁后的默认视图|Default view after unlocking
窗口|Window
文字格式|Text formatting
敏感字段|Sensitive field
仅本次|This time only
清空剪贴板|Clear clipboard
已验证|Verified
查看完整记录|View full record
标识|Identifier
生成|Generate
首次生成|Generate initially
自定义模板与解析规则|Custom templates & import patterns
系统身份验证平台|Authentication platform
重新打开应用|Reopen app
原文|Source text
进入编辑|Start editing
字段已添加|Field added
输入文字|Enter text
认证|Authentication
状态|Status
自动加密|Automatic encryption
读取|Read
系统登录|System login
恢复密码|Recover password
独立恢复|Independent recovery
云端|Cloud
资料字段|Record field
可编辑|Editable
密码解锁|Password unlock
新字段|New field
原值|Original value
搜索便签|Search notes
搜索密码记录|Search vault
本地版本|Local version
填写记录|Fill record
在此 Mac 上|On this Mac
库|Library
其他记录|Other records
独立恢复密钥|Unique recovery key
示例数据|Sample data
插入组件|Insert block
解锁后|When unlocked
登录验证|Login verification
系统验证解锁|Unlock with system authentication
库已锁定|Vault locked
我的资料|My data
同步|Sync
备份与迁移|Backup & migration
每次解锁|Each unlock
系统身份|System identity
变更|Changes
更新字段|Update field
删除所选行|Delete selected row
删除所选列|Delete selected column
剪贴板|Clipboard
侧栏|Sidebar
资料库自动锁定|Library auto-lock
系统钥匙串|System Keychain
复制后|After copying
快捷识别|Quick parsing
没有匹配|No matches
使用密码库保护|Protect with vault
输入代码|Enter code
快捷网址|Quick URL
记录与关联|Records & links
完整记录|Complete record
保留密码库保护|Keep vault protection
安全设置|Security settings
已切换模板|Template changed
已复制|Copied
当前记录的模板|Current record template
在本机保存便签与密码|Local notes and passwords
记录切换|Switch record
已进入编辑页|Editor opened
模板与解析规则|Templates & import patterns
无云端账户|No cloud account
记录与模板|Records & templates
邮箱凭据|Email credentials
面板地址|Panel URL
编辑工具栏|Editor toolbar
添加第一条便签|Create your first note
随手记，也可以在右上角切换成密码模板。|Write a note, or choose a credential template in the top right.
0.1.0 本地个人版|0.1.0 Local personal edition
切换语言|Switch language
搜索资料|Search library
社交与网站|Social & websites
服务器与服务|Servers & services
后台与云平台|Admin & cloud
银行卡与账户|Cards & accounts
云平台|Cloud account
软件许可|Software license
证件资料|Identity document
本地个人版|Local personal edition
文档章节|Document section
常用小节|Common section
细分层级|Nested section
自由编辑|Free text
增删指定行列|Add or remove rows and columns
勾选完成状态|Check off tasks
有类型的字段组合|A group of typed fields
密钥 → 6 位验证码|Secret → 6-digit code
日历选择器|Calendar picker
一键打开与复制|Open or copy in one click
重要说明|Important information
组织文档|Organize your document
加入上方基本信息|Add to the properties above
引用已有资料|Link an existing record
创建密码库|Create your vault
请将手指放在 Touch ID 上。|Place your finger on Touch ID.
使用 Touch ID 创建密码库，无需设置资料库密码。|Create your vault with Touch ID. No vault password needed.
使用 Touch ID 查看账号、密码与验证码。|Use Touch ID to view accounts, passwords and verification codes.
使用 Mac 登录密码…|Use Mac login password…
使用密码…|Use Password…
此密码库已锁定。|This vault is locked.
使用 Touch ID 或 Mac 登录密码查看此密码库。|Use Touch ID or your Mac login password to view this vault.
重试 Touch ID|Try Touch ID again
使用恢复密钥|Use recovery key
验证已取消，可重试 Touch ID 或使用恢复密钥。|Authentication cancelled. Try Touch ID again or use your recovery key.
请先用恢复密钥解锁，再重新配置本机验证。|Unlock with your recovery key, then configure this Mac again.
Touch ID / 系统验证|Touch ID / system authentication
点击密码库即可设置。|Click Vault to set up.
已启用，进入密码库即可使用指纹。|Enabled. Open Vault to use Touch ID.
解锁后可配置本机系统验证。|Unlock to configure system authentication on this Mac.
重新配置|Configure again
升级|Upgrade
系统验证后查看；请单独保存，用于资料库和备份恢复。|View after system authentication. Save separately to recover your vault and backups.
使用恢复密钥保护，无需另设备份密码。|Protected with your recovery key. No separate backup password needed.
暂不可用|Unavailable
本机生成动态验证码|Codes generated on this Mac
加密文档|Protected document
0.2.0 本地个人版|0.2.0 Local personal edition
0.4.0 本地个人版|0.4.0 Local personal edition
0.4.1 本地个人版|0.4.1 Local personal edition
1.0.0 本地个人版|1.0.0 Local personal edition
账号|Accounts
自由便签|Free-form notes
银行卡／银行账户|Cards & bank accounts
邮箱、社交、网站和管理台|Email, social, websites and admin panels
主机连接、数据库和密钥|Hosts, databases and keys
卡片资料与银行账户|Payment cards and bank accounts
笔记、文档与待办|Notes, documents and tasks
通用账号|General account
选择预设|Choose a preset
先选资料类型，再选需要的预设。|Choose a category, then a preset.
点击模板编辑字段；垃圾桶按钮删除模板，已有记录保留。|Click a template to edit. Deleting a template preserves existing records.
内置预设可直接浏览；解锁后显示自定义模板。|Browse built-in presets now. Unlock to see custom templates.
编辑字段与解析规则|Edit fields and parsing rules
全部分类|All categories
更多预设|More presets
此分类暂无模板，可在编辑模式中添加。|No templates here. Add one in edit mode.
删除模板|Delete template
模板回收站|Template trash
模板删除不影响已有记录；可以在这里恢复。|Deleting templates preserves records. Restore templates here.
恢复模板|Restore template
没有已删除的模板|No deleted templates
模板已移入回收站，已有记录保留|Template moved to trash. Existing records preserved.
模板已恢复|Template restored
回收站|Trash
删除记录|Delete record
恢复|Restore
删除后保留在这里；恢复会保留原有关联。|Deleted records stay here. Restoring preserves their links.
已移入回收站，可从左侧恢复|Moved to Trash. Restore it from the sidebar.
记录已恢复，原有关联保持不变|Record restored with its original links.
回收站是空的|Trash is empty
部分关联记录已删除或尚未解锁。恢复或解锁后会重新显示。|Some linked records are deleted or locked. Restore or unlock them to see them.
永久删除|Delete permanently
永久删除记录？|Permanently delete this record?
此操作无法撤销。其他记录的关联将显示为不可用，已有备份不会被删除。|This cannot be undone. Links to this record will become unavailable. Existing backups are not deleted.
记录已永久删除|Record permanently deleted
关联暂不可用|Linked record unavailable
切换模板|Switch template
Tab 缩进，Shift+Tab 退级，空行回车结束列表|Tab to indent, Shift+Tab to outdent, Enter on an empty item to exit
点击内容复制，点击名称查看详情|Click a value to copy, or a name to view details
`.trim().split('\n').map(line=>{const i=line.indexOf('|');return [line.slice(0,i),line.slice(i+1)];}));
translations['例：{$account}|{$password}。使用相同分隔符；email.account / email.password 用于关联邮箱。保存后进入粘贴录入。']='Example: {$account}|{$password}. Use the same delimiter. email.account / email.password create a linked email record. Save, then paste data.';
translations['例：{$account}|{$password}。使用相同分隔符；email.account / email.password 用于关联邮箱。在记录编辑页中使用粘贴录入。']='Example: {$account}|{$password}. Use the same delimiter. email.account / email.password link an email record. Paste data from the record editor.';
function tr(value){return hostWords(translateText(value));}
function hostWords(value){
 if(globalThis.kernpadPlatform!=='windows')return value;
 return String(value).replaceAll('Mac 登录密码','Windows Hello PIN').replaceAll('Mac login password','Windows Hello PIN')
 .replaceAll('Touch ID','Windows Hello').replaceAll('此 Mac','此电脑').replaceAll('this Mac','this PC').replaceAll('⇧⌘','Ctrl+Shift+').replaceAll('⌘','Ctrl+');
}
function translateText(value){
 if(locale!=='en')return String(value??'');
 const text=String(value??''),trim=text.trim();if(translations[trim])return text.replace(trim,translations[trim]);
 return text.replace(/^便签 \/ /,'Note / ').replace(/(\d+) 条便签，无需解锁即可记录/g,'$1 notes, ready without unlocking')
 .replace(/(\d+) 个字段，内容由密码库保护/g,'$1 fields protected by your vault').replace(/(\d+) 个字段，提供 (\d+) 个入口/g,'$1 fields and $2 quick links')
 .replace(/(\d+) 个完整字段/g,'$1 complete fields').replace(/(\d+) 种内置模板和 (\d+) 种自定义模板/g,'$1 built-in and $2 custom')
 .replace(/批量新增 (\d+) 条记录/g,'Create $1 records').replace(/被 (\d+) 条记录引用/g,'Linked from $1 records')
 .replace(/第 (\d+) 个组件的名称/g,'Block $1 title').replace(/在第 (\d+) 个内容块后插入组件/g,'Insert after block $1')
 .replace(/上移第 (\d+) 个组件/g,'Move block $1 up').replace(/下移第 (\d+) 个组件/g,'Move block $1 down').replace(/删除第 (\d+) 个组件/g,'Delete block $1')
 .replace(/删除基本信息：(.+)/g,(_,label)=>'Remove property: '+tr(label)).replace(/代码语言 (\d+)/g,'Code language $1').replace(/代码内容 (\d+)/g,'Code content $1')
 .replace(/文档正文 (\d+)/g,'Document text $1').replace(/文档标题 (\d+)/g,'Document heading $1')
 .replace(/可编辑表格 (\d+)/g,'Editable table $1').replace(/表格第(\d+)行第(\d+)列/g,'Table row $1, column $2')
 .replace(/表格 (\d+) 选择行/g,'Select row in table $1').replace(/表格 (\d+) 选择列/g,'Select column in table $1')
 .replace(/在所选行后插入行/g,'Insert row after selection').replace(/在所选列后插入列/g,'Insert column after selection')
 .replace(/(\d+) 行 × (\d+) 列/g,'$1 rows × $2 columns').replace(/^第 (\d+) 行$/,'Row $1').replace(/^第 (\d+) 列$/,'Column $1')
 .replace(/记录编号　/g,'Record ID  ').replace(/存储位置　/g,'Storage  ').replace(/本地保存　已保存到本机/g,'Saved locally')
 .replace(/(\d+) 条识别成功/g,'$1 records parsed').replace(/第 (\d+) 行：/g,'Line $1: ')
 .replace(/已新增 (\d+) 条记录，当前记录未覆盖/g,'Created $1 records. Current record unchanged.')
 .replace(/(\d+) 个字段/g,'$1 fields').replace(/(\d+) 条记录/g,'$1 records').replace(/(\d+) 条便签/g,'$1 notes');
}
const translatedText=new WeakMap(),translatedAttributes=new WeakMap();
function localize(){
 const walk=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;
 while(n=walk.nextNode()){
  if(n.parentElement.closest('script,style,textarea,code,pre,.mj-user-content,.mj-rich,.mj-doc-title,.mj-docdesc,.mj-readvalue,.mj-titlecell strong,.mj-note-nav span,.mj-note-card>strong,.mj-note-card>p,.mj-component-title,[contenteditable="true"]'))continue;
  const prior=translatedText.get(n),source=prior&&n.nodeValue===prior.result?prior.source:n.nodeValue,result=tr(source);
  translatedText.set(n,{source,result});if(n.nodeValue!==result)n.nodeValue=result;
 }
 for(const el of root.querySelectorAll('[aria-label],[placeholder],[data-placeholder],[title]')){
  const map=translatedAttributes.get(el)||{};
  for(const key of ['aria-label','placeholder','data-placeholder','title'])if(el.hasAttribute(key)){
   const old=map[key],now=el.getAttribute(key),source=old&&now===old.result?old.source:now,result=tr(source);map[key]={source,result};if(now!==result)el.setAttribute(key,result);
  }translatedAttributes.set(el,map);
 }
 document.documentElement.lang=locale==='en'?'en':'zh-CN';
}
let localeQueued=false;
new MutationObserver(()=>{if(localeQueued)return;localeQueued=true;queueMicrotask(()=>{localeQueued=false;localize();});}).observe(root,{subtree:true,childList:true,characterData:true});
