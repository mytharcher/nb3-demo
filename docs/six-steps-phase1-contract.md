# 六步骤第一阶段契约（1.0）

基线：PRD V2.0、实施计划 V1.0。2026-10-29 检索 docs 后未发现 DEC-01～13 的后续批准记录，全部待确认。本文冻结技术边界，不批准业务推荐值。

## 决策与依赖登记（M00-01/02）

| 事项                                       | 责任人                   | 解除条件                                                                                                                                                                                                                                                                                |
| ------------------------------------------ | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DEC-01/02/03：身份、状态、确认             | 业务/产品                | 有版本、批准人、日期、原文出处的批准记录                                                                                                                                                                                                                                                |
| DEC-04：时区、截止、授权有效期             | 业务                     | 同上；不采用机器或聊天时区                                                                                                                                                                                                                                                              |
| DEC-05/06/07：算法精度、正式规则、专家、AI | 评分规则负责人/业务/技术 | 正式规则和批准材料；算法配置必须携带批准依据                                                                                                                                                                                                                                            |
| DEC-08/09/10：看板、公示、更正             | 业务/管理员代表          | 批准记录，下一阶段实施                                                                                                                                                                                                                                                                  |
| DEC-11/12/13：文件策略、模型、运行目标     | 产品/技术/运维           | 批准策略、扫描服务、容量及恢复标准                                                                                                                                                                                                                                                      |
| 审批插件                                   | 采购/平台负责人          | 最新复核已安装并双端注册 `@nocobase/app-plugin-approval@0.1.0-beta.7`、Task Center `0.1.0-beta.3`；真实应用测试可启动。包 peer 版本匹配当前应用，`publishConfig.access` 为 public，但不能据此推定商业适用授权；PRD 所指 Pro 授权/部署许可仍须平台确认，六步骤审批定义与真实流转尚未接入 |
| 组织                                       | 组织数据负责人           | 权威数据源及停用事件协议；当前提供显式手工版本导入边界，不能声称已对接 HR                                                                                                                                                                                                               |
| 文件                                       | 安全/运维                | 存储验证、扫描适配器和批准文件策略；无扫描实现时 pending/blocked，不准人工标记通过                                                                                                                                                                                                      |
| 模板/日历/通知                             | 业务/运维                | 真实模板、完整逐日日历和审批依据；通知沿用插件，不重复造投递引擎                                                                                                                                                                                                                        |

审批插件负责人工任务、会签与审批实例；应用生命周期负责业务对象合法状态、版本、锁定引用及事务。批准审批任务不直接绕过业务授权、利益冲突和 expectedVersion。第一阶段不建替代审批引擎；不开放审核/更正等假 API。

## 模型及文件边界（M00-03、M01-01）

`server/providers/six-steps/` 唯一拥有公共服务；`server/routes/six-steps/` 只处理认证、授权、DTO、HTTP；`client/pages/six-steps/` 为管理页面；`tests/{server,database,client,playwright}/six-steps*` 为证据。应用总入口串行注册；共享算法、日历与权限不得复制。

完整概念链：周期 → 投稿（原月、双参与者、历史部门、当前批次/轮次、version、状态、评分方式、有效性）→ 不可变批次（文件/模板引用、实际操作者、内容未变）→ 轮次（规则版本、审核快照、有效性）→ AI任务/尝试/原始结果 → 专家实例/三席位/分配版本/原始评分 → 结果版本（当前有效/最终确认）→ 确认时钟（日历版本、送达、截止）→ 公示批次/明细/收件快照 → 更正申请/影响链。审计、文件、组织快照、通知事件贯穿全链。后续实体随所属模块创建表及 API。

第一阶段物理模型：

| Collection                | 内容与不变量                                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| sixStepVersions           | 配置版本：kind、key、title、payload、state、version、创建/发布信息；规则/日历/周期/模板/文件策略/组织均有严格 DTO；发布后不可改 |
| sixStepHeads              | 每个 kind/key 唯一的发布游标；version 条件更新序列化并发发布                                                                    |
| sixStepReferences         | 目标版本、引用对象类型/ID，唯一组合；引用必须已发布；无删除 API                                                                 |
| sixStepAudit              | 追加式事件 ID、聚合、动作、操作者、前后版本、原因、时间；不保存密钥                                                             |
| sixStepFiles              | File Repository 固定列及 ownerId；不暴露修改/删除/公开 URL                                                                      |
| sixStepFileVersions       | 不可变文件 ID、SHA256、上传状态、安全/预览/解析独立状态和扫描依据；正式引用必须 clean                                           |
| sixStepGrants             | 补交/延期授权，指定用户/周期版本、用途/目标、有效期、剩余次数、version、撤销记录                                                |
| sixStepGrantUses          | 授权消耗与业务操作绑定，唯一 commandId；必须使用调用方提交事务                                                                  |
| sixStepSnapshots          | 参与者/部门/上级的不可变组织版本快照；原提交人由服务端身份传入                                                                  |
| sixStepNotificationEvents | 业务事件与插件 notificationId 关联，接收人账号去重；投递状态查询通过插件公共服务                                                |

数据库默认拒绝 Repository HTTP 暴露这些内部表；仅服务在业务授权之后访问。管理配置是无记录范围的 settings 操作；业务材料必须额外满足 owner/不可变参与关系，不因 page grant 开放。汇报人字段没有授权含义。多角色不能绕过冲突检查。

## 接口、ID 与错误

页面 ID：`sixStepsRules`、`sixStepsCalendars`、`sixStepsPeriods`、`sixStepsTemplates`、`sixStepsFilePolicies`、`sixStepsOrganizations`、`sixStepsGrants`；路径 `/<kind>`（流程管理为 `/workflows`）。所有路径由运行时恢复 base path。管理权限 `settings:sixSteps.<kind>` 的 `read/create/publish`；授权管理使用 `read/create/revoke`。文件权限 `settings:sixSteps.files` 的 `read/upload`。角色仅显式用户分配，沿用 Users 的 app scope；没有指定用户不自动分配。初始化不扩大 member 或 authenticated:*。

`GET /api/sixSteps/:kind` 分页查询；`POST` 创建不可变草稿；`POST /api/sixSteps/:kind/:id/publish` 带 expectedVersion 和 expectedHeadVersion。DTO 及完整领域错误 ID 单一清单为 `shared/six-steps/contracts.ts`（服务端原路径只 re-export）；API 文档由 describeRoute 生成。写操作必须带 Idempotency-Key；当前授权先于 receipt 查询。相同 key 不同输入 OPERATION_CONFLICT；过期 OPERATION_EXPIRED；并发 VERSION_CONFLICT；无批准依据 DECISION_REQUIRED；无适用配置 CONFIGURATION_NOT_READY；文件未清洁 FILE_NOT_SAFE；日历缺日 CALENDAR_COVERAGE_MISSING；授权不足 GRANT_UNAVAILABLE；冲突 CONFLICT_OF_INTEREST。错误 domain 为 sixSteps，客户端按 reason 翻译，未知基础设施 reason 使用已翻译的通用失败文案而不输出内部异常。

事件 envelope：`{id, aggregateId, action, actorId, fromVersion, toVersion, reason, occurredAt}`。发布、创建授权、撤销、消耗都在原事务追加审计。未来流程事件增加 batchId/roundId/resultVersionId，并在消费者执行前重验有效性。通知 idempotencyKey 使用事件 ID；送达不等于阅读或邮件受理。没有实际 notificationId 不得报告 sent。

计分：仅接收显式的规则版本和精度/取整，十进制整数运算，单项已含权重不再乘一次；复议 3 个席位，null 表示不受理；全 null 沿用 AI；人工平均需 3 个完整总分。推荐阈值不作为生产默认算法。工作日历为逐日显式覆盖，时区/版本必填，节假日和调休均为数据；缺一天立即阻塞。

周期/授权：开放截止为带时区的确定时刻，年度独立；服务端受理时间与原子消耗在调用方事务检查。补交绑定用户和周期；延期还绑定原投稿 ID；撤销/消费竞争使用 version CAS；rollback 不留消耗。M04-02 必须将消耗与投稿写入同一个 receipt 事务。
