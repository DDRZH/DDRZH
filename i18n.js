(() => {
  const STORAGE_KEY = "ddrzh-language";
  const supportedLanguages = ["en", "zh"];
  const originalTextNodes = new WeakMap();
  const originalAttributes = new WeakMap();
  const listeners = new Set();

  const zh = {
    "ddrzh.com | AI Systems, Websites, Apps and Software": "ddrzh.com | AI 系统、网站、应用和软件",
    "ddrzh.com builds AI systems, websites, apps and tailored software that reduce manual work, improve decisions and help companies grow profit.":
      "ddrzh.com 构建 AI 系统、网站、应用和定制软件，帮助企业减少人工工作、改进决策并提升利润。",
    "GDPR Policy | ddrzh.com": "GDPR 政策 | ddrzh.com",
    "GDPR privacy policy for ddrzh.com, explaining how DDRZH handles enquiry data, local storage, email contact, AI project data and data protection rights.":
      "ddrzh.com 的 GDPR 隐私政策，说明 DDRZH 如何处理咨询数据、本地存储、电子邮件联系、AI 项目数据和数据保护权利。",

    "Skip to content": "跳到主要内容",
    "ddrzh.com home": "ddrzh.com 首页",
    "Toggle navigation": "切换导航",
    "Primary navigation": "主导航",
    "Policy navigation": "政策导航",
    "Language": "语言",
    "Show English": "显示英文",
    "Show Chinese": "显示中文",
    "Services": "服务",
    "AI & data": "AI 与数据",
    "Process": "流程",
    "Free trial": "免费试用",
    "Contact": "联系",
    "Home": "首页",

    "Custom digital products and AI integration": "定制数字产品与 AI 集成",
    "We deliver the future.": "未来，已来。",
    "DDRZH builds AI systems, Cyber Clones of real people, websites and apps that help you and/or your business.":
      "DDRZH 构建 AI 系统、真实人物的虚拟分身、网站和应用，帮助您或您的工作。",
    "Primary actions": "主要操作",
    "Start a project": "开始项目",
    "Call +353 0830425119": "致电 +353 0830425119",
    "Key offer highlights": "核心服务亮点",
    "First version": "第一版",
    "Free": "免费",
    "Trial period": "试用期",
    "30 days": "30 天",
    "Build style": "构建方式",
    "Fully custom": "完全个性化定制",

    "What ddrzh.com builds": "ddrzh.com 构建的内容",
    "Websites": "网站",
    "Mobile apps": "APP",
    "Cyber clone": "虚拟分身",
    "AI assistants": "AI 助手",
    "Workflow automation": "工作流自动化",
    "Data privacy": "数据隐私",

    "Business outcomes": "业务成效",
    "Technology that removes busywork.": "让繁琐工作自动化的技术。",
    "Many businesses know they need better digital tools, but off-the-shelf software rarely matches the real workflow. ddrzh.com designs around your exact needs: the staff tasks, customer journeys, reporting habits and decisions that matter every week.":
      "很多企业都知道自己需要更好的数字工具，但通用软件往往很难贴合真实的业务流程。ddrzh.com 会围绕您的实际需求来设计：员工每天要完成的任务、客户从咨询到成交的路径、报表习惯，以及每周都影响经营的关键决策。",
    "The result is software that can reduce labour costs, make daily operations faster, and turn historical business data into practical insight.":
      "最终交付的软件，可以帮助您降低人工成本、提升日常运营速度，并把过去积累的业务数据转化为真正能指导行动的洞察。",

    "Core services": "核心服务",
    "Build the cyber system to grow your business.": "构建 Cyber 系统，推动您的业务增长。",
    "Choose one service or combine them into a complete operating system for your website, app, staff and data.":
      "您可以选择单项服务，也可以把它们组合成覆盖网站、应用、员工和数据的完整运营系统。",
    "Personalised AI assistants": "个性化 AI 助手",
    "AI assistants shaped around your business context, documents, customers and daily tasks.":
      "围绕您的业务背景、文档、客户和日常任务定制的 AI 助手。",
    "AI workflow integration": "AI 工作流集成",
    "Bring AI into websites, apps and existing systems so routine work is handled faster and consistently.":
      "把 AI 接入网站、应用和现有系统，让常规工作更快、更稳定地完成。",
    "Cyber Clone": "虚拟分身",
    "Clone a person's speaking style, tone and knowledge into a 24-hour assistant, from ChatGPT-style customer service tailored to your business to training and sales conversations that sound more human.":
      "把一个人的说话风格、语气和知识克隆成 24 小时助手，从按您的业务定制的 ChatGPT 式客户服务，到更像真人的培训和销售对话。",
    "Website design and development": "网站设计与开发",
    "Modern commercial websites built to explain your offer clearly, capture enquiries and support growth.":
      "现代商业网站，用于清晰说明您的服务、获取咨询并支持增长。",
    "Mobile app development": "APP 开发",
    "Customer, staff or internal apps designed for the tasks people need to complete on the move.":
      "为客户、员工或内部团队打造的应用，支持人们在移动场景下完成任务。",
    "Tailored business software": "定制业务软件",
    "Dashboards, booking systems, portals, admin tools and workflows built around your operation.":
      "围绕您的运营方式构建仪表盘、预订系统、门户、管理工具和工作流。",
    "Safety and data privacy protection": "安全与数据隐私保护",
    "Your data is your secret. Systems are designed to protect sensitive business, customer and workflow data.":
      "您的数据就是您的秘密。系统会被设计为保护敏感的业务、客户和工作流数据。",

    "AI and data intelligence": "AI 与数据智能",
    "Turn historical data into action your team can use.": "把历史数据转化为团队可使用的行动。",
    "ddrzh.com can build AI and analysis features into your website, app or software system so past activity becomes useful guidance for the next decision.":
      "ddrzh.com 可以把 AI 和分析功能构建进您的网站、应用或软件系统，让过去的活动成为下一次决策的有用指引。",
    "Example business intelligence workflow": "业务智能工作流示例",
    "Insight pipeline": "洞察流程",
    "Live model": "实时模型",
    "Compare history": "对比历史",
    "Orders, bookings, enquiries, staff output": "订单、预订、咨询、员工产出",
    "Analyse performance": "分析表现",
    "Which services, campaigns and periods perform best": "哪些服务、活动和周期表现最好",
    "Understand customers": "理解客户",
    "Behaviour patterns, repeat customers and drop-off points": "行为模式、复购客户和流失节点",
    "Predict trends": "预测趋势",
    "Demand, sales, stock, workload and growth signals": "需求、销售、库存、工作量和增长信号",

    "Why clients use it": "客户使用原因",
    "Designed to improve cost, speed and profit.": "为改善成本、速度和利润而设计。",
    "Grow profit": "提升利润",
    "Focus time and resources on the services, customers and actions with the strongest return.":
      "把时间和资源集中到回报最强的服务、客户和行动上。",
    "Reduce manual work": "减少人工工作",
    "Automate repeated admin, data entry, reporting and customer-response tasks.":
      "自动化重复的行政、数据录入、报告和客户回应任务。",
    "Increase efficiency": "提高效率",
    "Give staff one clear system instead of scattered spreadsheets, messages and manual checks.":
      "为员工提供一个清晰系统，而不是分散的电子表格、消息和人工检查。",
    "Improve decisions": "改进决策",
    "Use historical performance and customer behaviour to see what is working and what needs attention.":
      "利用历史表现和客户行为，看清什么有效、什么需要关注。",
    "Protect private data": "保护私有数据",
    "Keep customer information, business knowledge and AI assistant context handled with care.":
      "谨慎处理客户信息、业务知识和 AI 助手上下文。",

    "Case studies": "案例展示",
    "Show clients how the system works before they buy it.": "在客户购买前，先把系统如何运作展示给他们看。",
    "This portal can lead visitors into focused demos. The first example below shows a teaching assistant that turns school data into a conversational AI workflow.":
      "这个门户可以把访客引导进聚焦式演示。下面的第一个案例展示了一个教学助手，如何把学校数据变成可对话的 AI 工作流。",
    "Featured case": "精选案例",
    "Teaching assistant demo": "教学助手演示",
    "A full case page with AI chat simulation, spreadsheet import, role-based access control and analytics views. It shows how DDRZH can package a practical workflow into a client-facing product demo.":
      "这是一个完整的案例页面，包含 AI 对话模拟、表格导入、基于角色的权限控制和分析视图，展示 DDRZH 如何把实际工作流打包成可面向客户演示的产品 Demo。",
    "Case highlights": "案例亮点",
    "Natural-language questions over historical data": "用自然语言查询历史数据",
    "Excel and CSV onboarding with field mapping": "支持 Excel 和 CSV 导入及字段映射",
    "Reusable for education, retail, clinics and operations": "可复用于教育、零售、诊所和运营场景",
    "Open case study": "打开案例详情",
    "Build a version for my business": "为我的业务定制一个版本",
    "Teaching assistant": "教学助手",
    "AI classroom copilot": "AI 课堂副驾",
    "Live analysis": "实时分析中",
    "Ask about student progress, scores or next actions": "可提问学生进度、分数或下一步建议",
    "Students synced": "已同步学生",
    "Needs follow-up": "需要跟进",
    "Attendance this week": "本周出勤率",
    "Teacher": "教师",
    "AI assistant": "AI 助手",
    "Which students slipped below 70 in maths this month?": "这个月数学成绩跌破 70 分的学生有哪些？",
    "Three students are below 70. Liam fell the most, from 78 to 64. I can group them by class and suggest follow-up actions.":
      "目前有 3 名学生低于 70 分。Liam 降幅最大，从 78 分降到 64 分。我可以按班级分组，并给出后续跟进建议。",
    "Show me the ones with low attendance too.": "再把出勤率偏低的学生也一起列出来。",
    "Two of those students also dropped below 92% attendance this week. I have prepared a parent-contact draft and a revision plan for Friday.":
      "其中有 2 名学生本周出勤率也低于 92%。我已经准备好家长联系草稿和周五的复习计划。",

    "Working method": "工作方法",
    "Start simple, then customise around the real workflow.": "从简单开始，再围绕真实工作流定制。",
    "The first version proves the direction quickly. After that, the product is shaped around your data, customers, staff responsibilities and growth goals.":
      "第一版会快速验证方向。之后，产品会围绕您的数据、客户、员工职责和增长目标继续塑形。",
    "Map the business need": "梳理业务需求",
    "Clarify the exact tasks, costs and decisions the product should improve.":
      "明确产品需要改进的具体任务、成本和决策。",
    "Build a useful first version": "构建有用的第一版",
    "Create the smallest practical version that lets you see the product working.":
      "创建最小但实用的版本，让您能看到产品实际运行。",
    "Improve from real use": "根据真实使用改进",
    "Refine the system during the trial so it fits the business instead of forcing a template.":
      "在试用期间打磨系统，让它贴合业务，而不是强行套用模板。",

    "Free first version": "免费第一版",
    "Try the first working version for 30 days before committing.": "先试用第一个可运行版本 30 天，再决定是否继续。",
    "Start with a focused version of the website, app, software system or AI assistant you need. Use it, test it, and decide what should be improved before the full build continues with zero cost.":
      "先从您需要的网站、应用、软件系统或 AI 助手的聚焦版本开始。免费使用、测试，并在完整构建继续前决定需要改进什么。",
    "Request the free trial": "申请免费试用",

    "Tell ddrzh.com what you want to improve.": "告诉 ddrzh.com 您想改进什么。",
    "Share the product you need, the manual work you want to reduce, or the data you want to understand. ddrzh.com will help shape the first version.":
      "分享您需要的产品、想减少的人工工作，或需要分析的数据。ddrzh.com 会帮助塑造第一版。",
    "Contact details": "联系详情",
    "Phone": "电话",
    "Email": "电子邮件",
    "GDPR policy": "GDPR 政策",
    "AI systems, tailored software, websites and apps.": "AI 系统、定制软件、网站和应用。",
    "· AI systems, tailored software, websites and apps.": "· AI 系统、定制软件、网站和应用。",

    "Privacy notice": "隐私通知",
    "GDPR privacy notice": "GDPR 隐私通知",
    "Accept to save your project-question draft on this device. Reject to disable draft saving. DDRZH does not sell your data. Your data is your secret.":
      "接受即可在此设备保存您的项目问题草稿。拒绝则会停用草稿保存。DDRZH 不会出售您的数据。您的数据就是您的秘密。",
    "Read the GDPR policy": "阅读 GDPR 政策",
    "Reject": "拒绝",
    "Accept": "接受",

    "Question {current} of {total}": "第 {current} / {total} 题",
    "Question 1 of 3": "第 1 / 3 题",
    "Close project questions": "关闭项目问题",
    "State your dream for the future here. If there is an AI assistant that can help you do anything in a computer, what would you like it to do?":
      "在这里写下您对未来的想法。如果有一个 AI 助手可以帮您在电脑上完成任何事情，您希望它做什么？",
    "Describe the outcome you want, even if it feels ambitious.": "描述您想要的结果，即使它听起来很有野心。",
    "This survey takes 3 mins to complete. Describe the outcome you want, even if it feels ambitious.":
      "这个调查大约需要 3 分钟完成。描述您想要的结果，即使它听起来很有野心。",
    "Your answer": "您的回答",
    "Website": "网站",
    "Back": "返回",
    "Next": "下一步",
    "Your future AI assistant": "您未来的 AI 助手",
    "Your name and/or your business name": "您的姓名和/或企业名称",
    "What is your name and/or your business name?": "您的姓名和/或企业名称是什么？",
    "This helps DDRZH understand who the project is for.": "这会帮助 DDRZH 理解项目服务对象。",
    "Your email": "您的电子邮件",
    "What email should DDRZH use to contact you?": "DDRZH 应该用哪个电子邮件联系您？",
    "Add the best email for project follow-up.": "填写最适合项目跟进的电子邮件。",
    "Send enquiry": "发送咨询",
    "Please answer this question before continuing.": "请先回答这个问题再继续。",
    "Please enter a valid email address.": "请输入有效的电子邮件地址。",
    "The contact form is not configured yet. Please try again later.": "联系表单尚未配置。请稍后再试。",
    "Please wait a moment, then try sending again.": "请稍等片刻，然后再尝试发送。",
    "Your enquiry was just sent. Please wait before sending another one.": "您的咨询刚刚已发送。请稍后再发送新的咨询。",
    "Sending...": "正在发送...",
    "Sending your enquiry...": "正在发送您的咨询...",
    "Enquiry sent. DDRZH will contact you by email.": "咨询已发送。DDRZH 会通过电子邮件联系您。",
    "Sent": "已发送",
    "Sending failed": "发送失败",
    "Please try again in a few minutes.": "请几分钟后再试。",
    "Sending failed. Please try again in a few minutes.": "发送失败。请几分钟后再试。",
    "Project enquiry": "项目咨询",
    "Website visitor": "网站访客",
    "Customer behaviour": "客户行为",
    "Trend prediction": "趋势预测",

    "Privacy, safety and data protection at DDRZH.": "DDRZH 的隐私、安全与数据保护。",
    "Last updated: 12 May 2026. This policy explains how ddrzh.com handles personal data when you use this website, contact DDRZH, or send a project enquiry.":
      "最后更新：2026 年 5 月 12 日。本政策说明当您使用本网站、联系 DDRZH 或发送项目咨询时，ddrzh.com 如何处理个人数据。",
    "GDPR policy details": "GDPR 政策详情",
    "1. Who controls your data": "1. 谁控制您的数据",
    "The data controller for this website is DDRZH, operating through ddrzh.com. You can contact DDRZH about privacy or data protection at":
      "本网站的数据控制者是通过 ddrzh.com 运营的 DDRZH。您可以通过以下方式联系 DDRZH 讨论隐私或数据保护：",
    "or": "或",
    "2. What data this website may collect": "2. 本网站可能收集哪些数据",
    "If you complete the project questions, the site may collect your answer about your future AI assistant, your name or business name, and your email address. If you call or email DDRZH, DDRZH may receive your phone number, email address, message content and any business information you choose to provide.":
      "如果您完成项目问题，本网站可能会收集您关于未来 AI 助手的回答、您的姓名或企业名称，以及您的电子邮件地址。如果您致电或发邮件给 DDRZH，DDRZH 可能会收到您的电话号码、电子邮件地址、消息内容，以及您选择提供的任何业务信息。",
    "3. Local storage and consent": "3. 本地存储与同意",
    "This website uses local storage to remember your GDPR banner choice. If you accept, it may also save your unfinished project-question draft on your own device. If you reject, draft saving is disabled and any saved draft is cleared from this browser.":
      "本网站使用本地存储记住您对 GDPR 横幅的选择。如果您接受，它也可能会把未完成的项目问题草稿保存在您自己的设备上。如果您拒绝，草稿保存会被停用，并且此浏览器中已保存的草稿会被清除。",
    "4. Why data is used": "4. 为什么使用数据",
    "DDRZH uses enquiry data to understand your project, respond to your request, prepare a first version or trial, discuss services, and protect the website and business from misuse.":
      "DDRZH 使用咨询数据来理解您的项目、回应您的请求、准备第一版或试用、讨论服务，并保护网站和业务免受滥用。",
    "5. Lawful basis": "5. 法律依据",
    "DDRZH relies on consent for optional local draft storage, legitimate interests for responding to business enquiries and protecting the website, contract steps where you ask DDRZH to prepare a proposal or service, and legal obligation where records must be kept for compliance.":
      "DDRZH 对可选的本地草稿存储依赖同意；对回应业务咨询和保护网站依赖合法利益；在您要求 DDRZH 准备方案或服务时依赖合同步骤；在必须为合规保存记录时依赖法律义务。",
    "6. Email and phone contact": "6. 电子邮件和电话联系",
    "The project questionnaire opens your email client at the end. Your enquiry is sent only when you choose to send that email. Your email provider and DDRZH's email provider may process the message to deliver it.":
      "项目问卷会在最后打开您的电子邮件客户端。只有当您选择发送该邮件时，您的咨询才会被发送。您的电子邮件服务商和 DDRZH 的电子邮件服务商可能会处理该消息以完成投递。",
    "7. AI, client systems and confidentiality": "7. AI、客户系统与保密",
    "For client projects, DDRZH treats business data, customer data, workflow information and AI assistant context as confidential. Your data is your secret. Project-specific data use should be confirmed in the project agreement before production work begins.":
      "对于客户项目，DDRZH 会把业务数据、客户数据、工作流信息和 AI 助手上下文视为机密。您的数据就是您的秘密。项目特定的数据使用应在生产工作开始前于项目协议中确认。",
    "8. Data sharing": "8. 数据共享",
    "DDRZH does not sell personal data. Data may be shared only where needed to provide services, operate email and hosting tools, comply with the law, protect legal rights, or work with approved service providers.":
      "DDRZH 不会出售个人数据。只有在提供服务、运营电子邮件和托管工具、遵守法律、保护合法权利或与获批准的服务提供商合作所需时，数据才可能被共享。",
    "9. How long data is kept": "9. 数据保留多久",
    "Enquiry data is kept only as long as needed to respond, manage the business relationship, handle a trial or project, and meet legal or accounting duties. Local survey drafts stay on your own browser unless you clear them, reject draft storage, or overwrite them.":
      "咨询数据只会在回应、管理业务关系、处理试用或项目，以及履行法律或会计义务所需的时间内保存。本地调查草稿会留在您自己的浏览器中，除非您清除它们、拒绝草稿存储或覆盖它们。",
    "10. Your GDPR rights": "10. 您的 GDPR 权利",
    "You can ask to access, correct, delete, restrict, transfer or object to use of your personal data. You can also withdraw consent where processing is based on consent. To exercise these rights, email":
      "您可以要求访问、更正、删除、限制、转移或反对使用您的个人数据。在处理基于同意时，您也可以撤回同意。若要行使这些权利，请发送电子邮件至",
    "11. Security": "11. 安全",
    "DDRZH designs websites, apps, AI assistants and business systems with privacy and data safety in mind. Security measures should match the sensitivity of the data, the project scope and the agreed technical architecture.":
      "DDRZH 在设计网站、应用、AI 助手和业务系统时会考虑隐私和数据安全。安全措施应与数据敏感性、项目范围和约定的技术架构相匹配。",
    "12. Complaints": "12. 投诉",
    "If you are not satisfied with how DDRZH handles your data, contact DDRZH first. You may also contact the Irish Data Protection Commission or your local EU data protection authority.":
      "如果您对 DDRZH 处理您数据的方式不满意，请先联系 DDRZH。您也可以联系爱尔兰数据保护委员会或您所在地的欧盟数据保护机构。",
    "Contact DDRZH": "联系 DDRZH",
    "Your data is your secret.": "您的数据就是您的秘密。",
    "· Your data is your secret.": "· 您的数据就是您的秘密。"
  };

  let currentLanguage = "en";
  let initialized = false;

  const safeStorage = {
    get(key) {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        // Language selection still works for the current page when storage is blocked.
      }
    }
  };

  const normalizeWhitespace = (value) => String(value).replace(/\s+/g, " ").trim();

  const normalizeLanguage = (language) => {
    const normalized = String(language || "").toLowerCase();
    if (normalized.startsWith("zh")) return "zh";
    if (normalized.startsWith("en")) return "en";
    return "";
  };

  const detectLanguage = () => {
    const storedLanguage = safeStorage.get(STORAGE_KEY);
    if (supportedLanguages.includes(storedLanguage)) return storedLanguage;

    const browserLanguages = navigator.languages?.length ? navigator.languages : [navigator.language];
    for (const language of browserLanguages) {
      const supportedLanguage = normalizeLanguage(language);
      if (supportedLanguage) return supportedLanguage;
    }

    return "en";
  };

  const getDictionary = () => (currentLanguage === "zh" ? zh : {});

  const translate = (value) => {
    const original = normalizeWhitespace(value);
    if (!original) return String(value || "");
    return getDictionary()[original] || original;
  };

  const translateNodeValue = (value) => {
    const original = String(value || "");
    const leadingWhitespace = original.match(/^\s*/)?.[0] || "";
    const trailingWhitespace = original.match(/\s*$/)?.[0] || "";
    const translated = translate(original);
    const normalized = normalizeWhitespace(original);

    if (!normalized || translated === normalized) return original;
    return `${leadingWhitespace}${translated}${trailingWhitespace}`;
  };

  const getOriginalAttribute = (element, attributeName) => {
    const originalAttributesForElement = originalAttributes.get(element) || {};

    if (!(attributeName in originalAttributesForElement)) {
      originalAttributesForElement[attributeName] = element.getAttribute(attributeName) || "";
      originalAttributes.set(element, originalAttributesForElement);
    }

    return originalAttributesForElement[attributeName];
  };

  const translateTextNodes = () => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parentName = node.parentElement?.tagName;
        if (["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA"].includes(parentName)) {
          return NodeFilter.FILTER_REJECT;
        }

        return normalizeWhitespace(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });

    const nodes = [];
    while (walker.nextNode()) {
      nodes.push(walker.currentNode);
    }

    nodes.forEach((node) => {
      if (!originalTextNodes.has(node)) {
        originalTextNodes.set(node, node.nodeValue);
      }

      const original = originalTextNodes.get(node);
      node.nodeValue = currentLanguage === "en" ? original : translateNodeValue(original);
    });
  };

  const translateAttributes = () => {
    document.querySelectorAll("[aria-label], [placeholder], [title]").forEach((element) => {
      ["aria-label", "placeholder", "title"].forEach((attributeName) => {
        if (!element.hasAttribute(attributeName)) return;

        const original = getOriginalAttribute(element, attributeName);
        element.setAttribute(attributeName, currentLanguage === "en" ? original : translate(original));
      });
    });

    document.querySelectorAll('meta[name="description"]').forEach((element) => {
      const original = getOriginalAttribute(element, "content");
      element.setAttribute("content", currentLanguage === "en" ? original : translate(original));
    });

    if (!originalAttributes.has(document)) {
      originalAttributes.set(document, { title: document.title });
    }

    const originalTitle = originalAttributes.get(document).title;
    document.title = currentLanguage === "en" ? originalTitle : translate(originalTitle);
  };

  const updateLanguageButtons = () => {
    document.querySelectorAll("[data-lang-option]").forEach((button) => {
      const isActive = button.dataset.langOption === currentLanguage;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
  };

  const applyTranslations = () => {
    document.documentElement.lang = currentLanguage === "zh" ? "zh-Hans" : "en";
    translateTextNodes();
    translateAttributes();
    updateLanguageButtons();
  };

  const setLanguage = (language, shouldPersist = true) => {
    const nextLanguage = supportedLanguages.includes(language) ? language : "en";
    const changed = currentLanguage !== nextLanguage;
    currentLanguage = nextLanguage;

    if (shouldPersist) {
      safeStorage.set(STORAGE_KEY, nextLanguage);
    }

    if (initialized) {
      applyTranslations();
    }

    if (changed) {
      listeners.forEach((listener) => listener(currentLanguage));
    }
  };

  const init = () => {
    const detectedLanguage = detectLanguage();
    const changed = currentLanguage !== detectedLanguage;
    currentLanguage = detectedLanguage;
    initialized = true;

    document.querySelectorAll("[data-lang-option]").forEach((button) => {
      button.addEventListener("click", () => setLanguage(button.dataset.langOption));
    });

    applyTranslations();

    if (changed) {
      listeners.forEach((listener) => listener(currentLanguage));
    }
  };

  window.DDRZH_I18N = {
    get language() {
      return currentLanguage;
    },
    setLanguage,
    translate,
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
