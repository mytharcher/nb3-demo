# 六步骤概念模型及下游集成字典 1.0

本字典是 M00-03/M01-01 的技术约束。实体未建表表示由所属业务模块交付；没有对应的 HTTP 接口可调用。生产业务状态及 DEC 仍待确认。

| 实体 / 责任模块                       | 主键与关联                                                                                                                                              | 必须保持的不变量                                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Submission / M04                      | submissionId；periodVersionId；authorId、originalSubmitterId；originalOrganizationSnapshotId；currentBatchId、currentRoundId；version                   | 原周期/月份和历史归属不被编辑覆盖；state、scoringMode、validity 分开；所有写命令带 expectedVersion |
| ParticipantAssignment / M02/M04       | submissionId；participantUserId；assignmentVersion；source、validFrom、validUntil；supersedesId                                                         | 原参与人不被承接人覆盖；当前访问重查账号状态及有效关系；汇报人没有隐含访问关系                     |
| Batch / M04                           | batchId；submissionId；ordinal；fileVersionId、templateVersionId；actorId；previousBatchId；contentUnchanged                                            | (submissionId,ordinal)唯一；每次重提建立批次，即便引用同一文件；批次不可变                         |
| ReviewSnapshot / M05                  | batchId；organizationVersionId；reviewerId；source；assignmentVersion                                                                                   | 保存本轮解析及转派历史；原审核人被转派后失去本轮写权限；自审拒绝                                   |
| Round / M05                           | roundId；submissionId；batchId；ruleVersionId；reviewSnapshotId；validity、invalidReason；supersedesId                                                  | 活动轮次由投稿 currentRoundId+version 原子指向；重试、复议及人工兜底引用同一不可变材料和标准       |
| AITask、Attempt / M07                 | taskId；roundId；fileVersionId、ruleVersionId；model、prompt、parser版本及摘要；attemptNo                                                               | (taskId,attemptNo)唯一；活跃任务令牌防迟到回调；有效结果保存失败优先恢复保存                       |
| AIResult / M07                        | aiResultId；roundId；任务版本；原始逐项分、依据、可选页码；raw/formal总分                                                                               | 每轮有效结果唯一；引用版本、完整性、范围、汇总全部通过后入账；原始输出不可改                       |
| ExpertInstance / M08                  | reviewInstanceId；roundId；kind=userObjection/extremeScore/manualFallback；assignmentVersion                                                            | 每轮当前实例唯一；前三者来源不同；管理员不能替代专家评分                                           |
| ExpertSeat / M08                      | seatId；reviewInstanceId；ordinal=1/2/3；expertUserId；assignmentVersion；validity                                                                      | 三个有效席位且用户不同；有效席位指针+CAS保证替换与提交不能同时接受；旧席位记录保留                 |
| ExpertScore / M08                     | seatId；assignmentVersion；逐项重评/null及意见，或人工总分                                                                                              | 提交锁定；人工兜底无虚构逐项分；非公开分只对本人返回；专家回避包含原参与人和已审核人               |
| ResultVersion / M07/M08/M09           | resultVersionId；roundId；sourceId；sourceMode；raw/formal；precision；previousId                                                                       | 当前有效结果指针不覆盖历史；极端分路由与复议创建、入账在同一事务；完成时另冻结最终确认引用         |
| ConfirmationClock / M09               | resultVersionId；calendarVersionId；effectiveDeliveryEventId；original/newDeadline；reason                                                              | 一个结果只结案一次；日历未覆盖或未有效送达时不自动结案；普通结果无默认自动确认参数                 |
| PublicationBatch/Line/Recipient / M10 | publicationId；type=original/supplement/correction；originalMonth；resultVersionId、awardVersionId、templateVersionId、contentDigest、recipientSnapshot | 明细与实际披露字段/收件范围快照不可变；修改使确认失效；每人投递唯一；未知结果先核实                |
| AwardVersion / M10                    | awardVersionId；submissionId；year/month；award、level；status                                                                                          | 待评定/未获奖/已获奖明确区分；不自动发奖或发钱；修改保留版本                                       |
| PortalVersion / M11                   | contentVersionId；kind；title、body、link/fileVersionId；year、department；state                                                                        | 草稿/发布/下架；仅发布内容对员工开放；案例披露授权与原文件权限分开                                 |
| Correction / M13                      | correctionId；originalSubmission/resultVersionId；evidence；applicantId、approverId；impactSet；newRoundId                                              | 独立审批，申请人不自批；材料、结果、公示旧版本保留；只经重新评审产生新分                           |
| Calendar、Rule、Template / 本阶段     | sixStepVersions.id；kind/key；payload；publishedAt；并发version                                                                                         | 草稿无生产默认；批准依据必需；发布不可覆盖；引用由 sixStepReferences 或 sixStepFileReferences 保持 |
| FileVersion / 本阶段                  | sixStepFileVersions.id；File Repository ID；sha256；policyVersionId                                                                                     | 上传、安全、预览、解析独立；无 scanner 不出 clean；业务引用不能删除                                |
| Event / M12                           | eventId；aggregateId；action；roundId/resultVersionId（后续模块增加）；recipients；notificationId                                                       | 接收人按账号去重；事件与业务写同事务；任务提交后通过插件幂等发送；accepted 不等于阅读              |

本阶段无投稿/专家/AI业务表，因而没有“唯一有效结果已真实集成”的结论。上表的指针及唯一性约束必须在各模块迁移与事务中落实，M14 再验证。

## 服务调用边界

所有数据命令运行于 receipt 的 `execute(transaction)` 内。`FoundationService.consume(transaction, ...)` 没有独立消耗 HTTP 接口；后续 M04-02 的投稿受理、补交消耗、批次引用与审计必须原子提交。receipt 的重放只重查当前权限和结果可见性，不重新执行已成功受理的周期截止判断。

`snapshotParticipants` 的 submitter 参数只能来自服务端认证身份；真实 HR 适配器发布来源版本后调用，禁止浏览器声明实际提交人。`assertNoConflict` 必须接在实际审核/专家命令前，不能因为角色是管理员就跳过。`materialVisible` 是关系约束，不能代替业务动作授权，也不能用于浏览器过滤无权数据。

`selectRule` 按适用范围和确定时刻选择唯一规则；已发布窗口不重叠，未来规则不抢占当前时间窗口。M05 审核通过时在同一事务锁定该 ID；后续模块读取该 ID 而不重新选“最新”。`calculate`、`average`、`reconsider`、`calculateReconsideration` 是公共计分入口；复议完整汇总必须调用后者保留有理原值后一次取整，不能累加逐项显示分。`validateAIResult` 校验引用、依据及总分，并非 AI 调用或结果入账接口。配置精度及取整必须显式传入；无正式规则不调用生产评分。

通知消费者保存事件后，由提交后持久任务调用 `dispatchNotification`，携带固定语言消息及业务入口。M12-02 负责实际流程任务、有效性重查和恢复策略。本阶段提供真实 in-app 投递契约和隔离集成测试；生产频道和后台持久队列仍由部署负责人配置。
