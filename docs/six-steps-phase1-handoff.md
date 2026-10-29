# 六步骤第一阶段开发交接（2026-10-29）

## 结论与使用范围

已交付可操作的基础管理页、应用内服务、两个自包含迁移和隔离测试数据。不是完整投稿评审流程，也不是生产上线验收。DEC-01～DEC-13 未发现正式批准记录，继续待确认；测试证据中的 UTC、分值、精度、日期、文件限制及模拟批准材料均不是生产决定。

统一整合者：本轮主 agent；公共源由 `server/providers/six-steps/`、`shared/six-steps/` 单一维护。实现按 M00 → M01 → M02/M06/M12 → M03 → M04-01 推进。期间发现已新增的 Approval/Task Center 依赖与双端注册，予以保留并重新核查；不覆盖这些改动。工作区没有 Git 元数据，未创建提交或 PR。

继续开发先读 [技术契约](six-steps-phase1-contract.md)、[完整概念模型](six-steps-phase1-model.md) 和本文。本文作为实施计划 V1.0 的阶段状态补充；没有将整项业务 AC 标记通过。

## 任务状态（按验收边界）

| 任务   | 状态及已完成行为                                                           | 文件 / 未完成条件                                                                                                                           |
| ------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| M00-01 | 完成决策、资料和外部依赖登记；所有 DEC 仍待确认                            | 技术契约；业务、规则负责人和运维分别提供有版本的批准证据                                                                                    |
| M00-02 | 完成当前安装、注册及 peer 版本核查和职责评估                               | Approval `0.1.0-beta.7`、Task Center `0.1.0-beta.3` 已双端注册，真实测试 App 可启动；商业部署许可待平台确认；六步骤审批流未配置或联调       |
| M00-03 | 完成本阶段技术契约冻结                                                     | 共享 DTO、迁移、API 声明、稳定页面/权限 ID、事件及模型文档；未开发模块没有假接口                                                            |
| M00-04 | 持续维护，本次交接已更新                                                   | 后续修改契约需登记版本、消费者和兼容策略，不得复制公共服务                                                                                  |
| M01-01 | 完成完整概念模型和阶段物理模型                                             | 模型文档及两个迁移；投稿/轮次/席位/结果等表由所属模块创建                                                                                   |
| M01-02 | 本阶段完成：真实库 up/down/reapply、外键、唯一性、CAS、receipt、回滚及审计 | `database/main/migrations/202611030001*`、`202611030002*`；后续有效轮次/结果/席位约束尚无业务表，不声称已完成                               |
| M01-03 | 基础完成，完整任务未完成                                                   | `lifecycle.ts` 仅配置 draft→published 及真实执行历史；投稿唯一生命周期待 DEC-02 和 M04/M05，不建立替代审批引擎                              |
| M02-01 | 本阶段适配及快照能力完成                                                   | `organization.ts`：明确来源版本、双参与者、历史部门/上级、缺审核人标志、活跃账号和回避；真实 HR 未接入                                      |
| M02-02 | 本阶段管理与权限完成；业务转派/承接留待所属流程                            | 注册原有 Users / Roles 页面、显式角色分配查看/撤销、原生账号停用立即失权；利益冲突服务和测试。无投稿/审核任务时不伪造转派实例或承接 API     |
| M02-03 | 本阶段授权场景通过，持续扩展                                               | API 401/403、撤销后重放拒绝、模板专用下载权限、无角色浏览器拒绝；未来列表/导出/统计需追加关系范围测试                                       |
| M03-01 | 本地上传、受权下载和浏览器 PPTX 预览已验证；生产安全集成未完成             | `files.ts`、文件路由、上传页；无 scanner 时 blocked；scanner 异常 failed；digest 不符拒绝；真实安全检查与其他格式/生产预览构建待联调        |
| M03-02 | 不可变文件引用及模板发布下载完成；批次/清理任务未启动                      | `sixStepFileReferences`、模板路由/详情；无替换或删除入口。未改文件重提的批次关联归 M04-03；孤立文件清理禁止影响正式引用，当前没有自动删除   |
| M06-01 | 配置结构、版本发布校验完成；正式规则未就绪                                 | scope、含权重逐项满分、依据要求、精度、取整、生效窗口、批准依据；重叠窗口拒绝，未来版本不抢占当前规则；生产规则源材料未提供                 |
| M06-02 | 公共纯计算及验证服务、测试夹具完成；未启用生产评分                         | `calculation.ts`：统一合计、精确有理平均、复议原值总计后一次取整、三人完整总分平均、AI 引用/依据/汇总校验。没有 AI 调用、生产阈值或专家流程 |
| M12-01 | 本阶段完成：日历版本、逐日覆盖/假日/调休/时区、事件去重和送达查询          | `calendar.ts`、`notifications.ts`；真实 in-app 插件隔离投递验证。生产频道、持久队列和邮件服务仍需部署配置，不以插件注册代替可用性           |
| M04-01 | 本阶段完成：独立月度/年度周期、开放截止、指定用户补交/延期、撤销和事务消耗 | `FoundationService` 和 grants/periods 页面；真实库一次消耗竞争、CAS 和 rollback 通过。投稿提交事务接入属于 M04-02，本阶段没有完整投稿页面   |
| M14-01 | 已启动并维护下表和证据                                                     | 本轮覆盖基础；完整业务 AC、性能、备份恢复和全部浏览器矩阵没有通过结论                                                                       |

## 管理界面及权限契约

页面实际路径（均由运行时补应用 base path）：`/six-steps/{rules,calendars,periods,templates,filePolicies,organizations,grants,files}`，以及 `/six-steps/workflows/{definitions,executions}`。列表支持分页；配置/授权列表的日期、版本、余额支持允许字段的服务端排序；精确业务标识/用户 ID 筛选；新建页包含本地/服务端字段错误、未保存关闭保护；详情发布携带双重版本前提；撤销通过行菜单和原因确认。日期使用 Calendar/Popover，时刻明确以 UTC 输入，不推断业务时区。规则项、逐日日历、组织导入及批准依据为有结构说明的 JSON 输入。

稳定 ID 以 `client/pages/six-steps/routes.ts` 为单一清单，包括 `sixStepsRules`、`sixStepsCalendars`、`sixStepsPeriods`、`sixStepsTemplates`、`sixStepsFilePolicies`、`sixStepsOrganizations`、`sixStepsGrants`、`sixStepsFiles`、`sixStepsProcesses` 及其 Create/Detail 子页。Users、Roles 使用原有 ID，注册恰好一次；页面标题中英测试通过。

权限为 `settings:sixSteps.<kind>`：配置 `read/create/publish`；授权 `read/create/revoke`；文件 `read/upload`；流程定义/历史 `read`。`sixStepsAdministrator` 是可编辑 Permission Set，仅创建不分配。通过已有用户管理的 app role scope 显式赋给账号，可查看及撤销。没有 `authenticated:*` 业务赋权或 member 扩权。页面可见性不代替 API 权限；模板 read 仅能访问实际已发布模板关联的 clean 文件，不能读取整个文件库。后续参与者/审核人/专家材料范围必须在服务端同时检查当前关系和利益冲突。

## API、服务与下游接入

所有业务 HTTP 路由有独立认证、授权、校验和 OpenAPI 声明。运行实例以登录态访问 `/main/api/swagger` 获取当前文档；测试断言无未声明路由和 schema 问题。

| 接口                                 | 请求/返回和约束                                                                                                         |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| GET /api/sixSteps/:kind              | `{data,meta}`；page/pageSize、精确 q、允许的 sort/direction；默认 createdAt desc/id desc                                |
| GET /api/sixSteps/:kind/:id          | `{data:{record,headVersion}}`，前端必须解开 data，不能把 record 当顶层                                                  |
| POST /api/sixSteps/:kind             | 共享 createVersionSchema + 对应 kind 严格 payload；仅创建新草稿                                                         |
| POST /api/sixSteps/:kind/:id/publish | expectedVersion、expectedHeadVersion、reason；批准依据和对应 DEC 必须齐全；失败事务不移动 head                          |
| GET/POST /api/sixSteps/grants        | 指定用户/周期/用途/目标及明确有效期、次数、批准依据；无全员授权                                                         |
| POST /api/sixSteps/grants/:id/revoke | expectedVersion、reason；历史已接受业务不因撤销被重写                                                                   |
| GET/POST /api/sixSteps/files         | 上传为 multipart file+policyVersionId；Idempotency-Key；默认隔离，返回上传/扫描/预览/解析独立状态；列表仅返回安全元数据 |
| GET /api/sixSteps/templates/:id/file | 已发布模板的安全文件元数据和受保护内容入口；read 权限每次重查                                                           |
| GET /api/sixStepAttachments/findOne  | File Repository 预览需要的安全字段；不返回 disk/key，不开放标准修改/删除 API                                            |
| GET /sixStepContent/:id.ext          | 认证和文件/模板授权、clean 校验后交给 File Repository 流式返回，无永久公开 URL                                          |
| GET /api/sixStepProcesses/...        | definition、executions、execution：授权后读取标准生命周期定义和真实历史；无可调转换参数，不展示假编辑器                 |

写接口统一 `Idempotency-Key`；当前授权先于 receipt 查询，撤销后不能通过旧 key 重放。服务命令由 receipt 的 `execute(tx)` 调用。`consume(tx,...)` 必须与实际投稿受理、批次、引用和审计同一事务，且 userId 来自会话；没有独立消费 HTTP 接口。授权/开放截止当前采用包含截止时刻的比较，业务需确认精度/时区，不把上传开始时间当受理时刻。

`snapshotParticipants(tx, organizationVersionId, authorId, authenticatedSubmitterId)` 冻结组织事实；`assertNoConflict` 和 `materialVisible` 不能代替权限动作检查。`selectRule` 选择唯一适用规则，M05 锁定其 ID，重试/复议/人工兜底不能再读取“最新”。`reference`、文件引用及外键保留追溯。

审计 envelope、错误 reason 见技术契约，额外包括 RULE_WINDOW_OVERLAP、SCAN_FAILED、INVALID_SORT。通知先同事务保存 `recordNotificationEvent`，接收人按账号去重；提交后的持久任务再调用 `dispatchNotification`，幂等键 `sixSteps:<eventId>`；`queryDelivery` 查询真实插件快照，accepted 不表示阅读。固定语言文案由调用方按中英 locale 生成，不在数据库事务中调用外部服务。M12-02 交付实际流程任务、有效性检查、重试/告警及恢复面板。

## 迁移、配置和外部依赖

保留原 device_code 与 mutation_receipts 迁移；应用新增顺序：

1. `202611030001_six_steps_foundation`：阶段表、约束、生命周期 history/effect store；没有业务示例种子。
2. `202611030002_six_steps_file_references`：不可变文件引用；规则发布目录 CAS 游标（技术数据，不是正式规则）。

down 反序执行，仅在隔离库验证，不向真实业务库执行回滚/重置。两个迁移每个字段和索引自包含，禁止后续 import 可变模型或改写已执行版本。未来以新增迁移扩展。

生产配置待办：File Repository 本阶段使用 `local` disk；真实扫描需在受信任任务中绑定 `SecurityScanner`，读取原字节校验 SHA256，网络失败不得 clean；未提供 HTTP 手工标记通过。预览目前为插件浏览器按需渲染，持久 previewState=pending 不是成功证明；解析 notConfigured，尚无后台预览/解析任务或可被正式提交消费的解析结果。需要真实服务后新增适配任务和验收。

通知沿用现有插件，测试频道 `fixtureInbox` 为真实 in-app channel；生产必须配置正式频道和可靠 jobs/queue，开发内存 jobs 的成功不代表多实例持久性。SMTP、邮件地址服务、HR、真实 PPT 模板/规则文件、组织源、正式节假日/调休资料、部署许可、DEC-13 容量与恢复目标均待对应负责人提供。未写入任何生产凭据或密钥。

## 验证与证据

受影响范围执行，不运行全应用 pnpm check。最终结果见本节；源测试全部位于 tests/，页面使用项目 harness，未 mock 认证/权限/i18n hooks。

```sh
pnpm exec vitest run tests/database/six-steps-migration.test.ts tests/database/six-steps-file-references.test.ts tests/server/six-steps-calculation.test.ts tests/server/six-steps-foundation.test.ts tests/server/six-steps-rules.test.ts tests/server/six-steps-disabled.test.ts tests/server/six-steps-notifications.test.ts tests/client/six-steps.test.tsx tests/client/client-routes.test.ts tests/client/page-permission-titles.test.ts tests/server/authorization-assignment-safety.test.ts tests/client/permission-workspace.test.ts tests/client/settings.test.tsx tests/client/roles.test.tsx tests/client/user-permissions.test.tsx tests/client/permission-management-tabs.test.tsx
pnpm exec tsc -p storage/ui-workflow/six-steps/tsconfig.client.json --noEmit
pnpm exec tsc -p storage/ui-workflow/six-steps/tsconfig.server.json --noEmit
pnpm exec tsc -p storage/ui-workflow/six-steps/tsconfig.browser.json --noEmit
SIX_STEPS_TEST_URL=http://127.0.0.1:13010/main/ pnpm exec playwright test tests/playwright/six-steps-foundation.test.ts
```

最终 Vitest：16 个文件、62 项测试通过；另单独执行 `pnpm exec vitest run tests/server/authorization-assignment-safety.test.ts`，2 项通过（与前述套件重复，不累加）。范围格式检查、ESLint 零警告、三份受影响类型检查通过。浏览器最终计数见下方证据说明。

格式与 ESLint 的实际命令范围：`client/pages/six-steps/`、新增 Calendar primitive（通过 shadcn CLI 添加）、新增 locale/共享 DTO、`server/providers/six-steps/`、`server/routes/six-steps/`、新增测试及 fixture；另核对改动的入口、页面权限 workspace 和 package.json。迁移已执行，不机械改写其 checksum。类型配置包含影响到的页面、服务、迁移、测试及导入消费者，不使用全应用聚合检查。

### 需求到测试（M14-01）

| 需求 / AC                               | 证据文件（tests/ 下）                                                                                                            | 本轮结论                                                                                                                                |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| M01 迁移/引用/唯一性                    | database/six-steps-migration、six-steps-file-references                                                                          | 真实 SQLite up/down/reapply 通过；非 PostgreSQL/MySQL 多方言结论                                                                        |
| M02、AC-01/02 基础部分                  | server/six-steps-foundation、six-steps-disabled、six-steps-calculation；client/user-permissions；authorization-assignment-safety | 显式赋权/撤销、native 停用、关系/回避、去重通过；完整投稿关系和审核命令未实现                                                           |
| AC-05 基础日历                          | server/six-steps-calculation                                                                                                     | 假日/调休/时区/缺日与固定时钟通过；M09 自动确认与送达保护尚未接入                                                                       |
| AC-07/08 基础事务                       | server/six-steps-foundation                                                                                                      | receipt 重放、冲突、周期、一次授权消费竞争及 rollback 通过；完整投稿超时/跨月重提待 M04                                                 |
| AC-09 规则引用基础                      | server/six-steps-rules                                                                                                           | 已引用版本不变、未来版本、重叠及并发发布通过；审核锁版待 M05                                                                            |
| AC-10/11/12/14 计算部分                 | server/six-steps-calculation                                                                                                     | 29.99/30/85/85.01 数值保真；AI 引用/总分/依据校验；复议 6/null/8=7、全 null 沿用；70/80/90=80、总和只取整一次通过；不等于已启用阈值路由 |
| AC-21 文件基础                          | server/six-steps-foundation；playwright/six-steps-foundation                                                                     | 隔离、格式、失败扫描、digest、safe 私有下载、模板 read 范围、真实 PPTX 预览；安全成功分支仅测试替身；完整提交/重提/门户待后续           |
| AC-22 通知基础                          | server/six-steps-notifications                                                                                                   | 真实 in-app 投递、重复调用去重、notificationId、收件箱、缺频道失败通过；正式流程通知尚未实现                                            |
| 管理页                                  | client/six-steps、client-routes、page-permission-titles；playwright/six-steps-foundation                                         | 空态、403、404 旧详情清理、500 重试、字段校验、保留发布原因、过滤/排序、授权状态；真实创建/撤销、中文、隔离上传、主题和历史             |
| AC-03/04/06/13/15～20、AC-23 非页面部分 | 尚无业务验收测试                                                                                                                 | 未开始/待相应模块和 DEC；不得标记通过。原 SUB-01～10 与原验收18～34中完整流程部分同样待对应模块扩展                                     |

Playwright 最终 5 项通过：配置/预览/历史（含重复运行后真实翻页）、无角色拒绝、授权创建撤销及中文、上传隔离、原生 Users/Roles 显式分配展示。浏览器证据保存在 `storage/ui-workflow/six-steps/screenshots/`：approval-blocked、definition、execution、pptx-preview、roleless、grants-chinese、upload-quarantined、users-explicit-assignment、calendar-compact-light、calendar-default-dark、calendar-narrow-dark。检查布局完成节点、明确拒绝页及可见 Alert 后截图，不以加载屏作为通过。控制台有首页同样存在的 React script-tag 警告，以及预期缺批准 400；主要管理流程断言没有新增未识别 console error 或未捕获 pageerror。未覆盖所有浏览器、全部 Office 格式、生产构建或性能。

按 frontend workflow 做过一次独立设计审查和一次独立验收；后者发现授权状态、旧详情、排序、过滤后创建入口、字段反馈、日期控件、按钮忙碌状态、破坏性行操作及截图等待问题，已修复并重跑相关测试。没有将审查第一次未通过写为通过；修复后的核验由主 agent 完成，未循环自评审。临时设计文档依 Skill 删除，保留本文及截图。

## 隔离演示与测试账号

用户明确允许示例数据后，通过 `tests/fixtures/six-steps/prepare.ts` 创建独立临时库，未修改根 config.yml 或向真实业务库种测试账号。脚本依赖系统 zip 生成真实最小 PPTX；执行 `pnpm exec tsx tests/fixtures/six-steps/prepare.ts` 可重新生成，输出新的路径，不要复用旧输出假定账号 ID。

本次 Local 地址：`http://127.0.0.1:13010/main/`。账号 `sixstepsadmin` 仅显式拥有六步骤基础管理角色；`sixstepsreader` 无业务角色，用于验证拒绝。测试密码在本次交付消息和 fixture 中，禁止用于生产；管理员角色管理仍使用已有授权管理员，不把测试基础管理员提升为平台超级管理员。

当前隔离配置 `/tmp/nocobase-test-app-dHRPpT/config.json`，SQLite `/tmp/six-steps-demo-b3ndvl/database.sqlite`，本地文件和 jobs 在 `/tmp/six-steps-demo-b3ndvl/storage`。启动：

```sh
APP_CONFIG_FILE=/tmp/nocobase-test-app-dHRPpT/config.json APP_STORAGE_DIR=/tmp/six-steps-demo-b3ndvl/storage APP_SERVER_PORT=13010 NOCOBASE_STRICT_STARTUP=true pnpm dev
```

使用实际 printed Local URL，不推断其他进程端口。临时目录可能被系统清理；失效时重新运行 fixture 并使用新路径。样例批准来源明确标 TEST ONLY，样例文件的 clean 来自 `TEST-DOUBLE-NOT-A-REAL-SCANNER`，不构成真实安全检查；普通页面上传仍被隔离。可演示基础管理流程，不可演示完整六步骤投稿评审。

## 下一阶段启动条件

可立即启动：M04-02/03 的技术实现与隔离测试、M05 的契约设计、真实 scanner/HR/通知部署适配；复用公共服务并在实际业务事务落地批次、参与关系及快照，不另造计算/日历/权限/通知。

仍不可启用生产：正式评分（缺规则及 DEC-05）、无可信 scanner 的正式文件提交、依据未批准的时区/截止/授权策略、未核实许可的正式审批任务。M07 AI、M08 专家、M09 确认、M10 公示、M11 看板/门户完整业务、M13 更正及 M12-02 不是本阶段交付；必须先具备对应依赖/批准和真实流程数据。各阻塞责任及解除条件见技术契约登记表。

可选清理本轮 UI 验证产物（不删除代码、演示库或本文）：`rm -r storage/ui-workflow/six-steps`；其中包含截图和范围类型检查配置，确认不再需要后执行。
