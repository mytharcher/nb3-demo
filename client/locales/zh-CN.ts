import fileUi from '../extensions/nocobase-file-component-ui/locales/zh-CN.js';
import type { AppResource } from './en-US.js';
import sixSteps from './six-steps.zh.js';
import systemZhCN from './system/zh-CN.js';

const zhCN: AppResource = {
  sixSteps,
  workbench: {
    sessionExpired: '登录已过期，请重新登录后继续。',
    forbidden: '你没有访问这些功能的权限，请联系管理员。',
    title: '工作台',
    description: '集中查看通知，快速进入日常业务。',
    inbox: '收件箱',
    inboxDescription: '查看发给你的通知，跟进业务动态。',
    openInbox: '打开收件箱',
    entries: '业务入口',
    entriesDescription: '根据你当前的权限显示可用功能。',
    open: '进入',
    openModule: '进入{{name}}',
    noAccess: '暂无可用业务入口',
    noAccessDescription: '请联系管理员分配所需权限。你仍然可以使用收件箱。',
    loadFailed: '暂时无法加载可用功能，请重试。',
    modules: {
      rules: '管理评分规则及其发布版本。',
      calendars: '维护工作日与日历覆盖范围。',
      periods: '管理填报窗口及关联日历。',
      templates: '维护报表模板与文件版本引用。',
      filePolicies: '配置文件类型、大小限制与安全要求。',
      organizations: '维护组织结构与参与人员快照。',
      grants: '管理补交和延期授权。',
      files: '查看已上传文件及处理状态。',
      processes: '查看流程定义与执行历史。',
    },
  },
  uiAudit: { actionsFor: '{{name}}的操作' },
  // The template's own copy; see `./en-US.ts`.
  ...systemZhCN,
  ...fileUi,
};

export default zhCN;
