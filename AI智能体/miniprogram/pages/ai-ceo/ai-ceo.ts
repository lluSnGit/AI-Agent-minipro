import { sendMessageToOpenClawStream } from '../../utils/openclaw'

Page({
  data: {
    scenarios: [
      {
        id: 1,
        icon: '💻',
        iconClass: 'icon-blue',
        tag: '效率提升',
        tagClass: 'tag-blue',
        title: '核心办公与流程自动化',
        description: '旨在将员工从重复的电脑操作中解放出来。通过自然语言指令，瞬间完成文件整理、邮件分类与报表生成。',
        skills: ['文件批量整理器', '邮件自动分类', '数据报表生成器'],
        exampleClass: 'example-blue',
        example: '你只需说"把昨天市场部发来的所有报价单PDF，按客户名分类存到\'2024年5月报价\'文件夹"，它就会自动完成。根据预设规则（如发件人、关键词），自动分类新邮件并发送标准回复。'
      },
      {
        id: 2,
        icon: '📊',
        iconClass: 'icon-indigo',
        tag: '决策辅助',
        tagClass: 'tag-indigo',
        title: '数据获取与市场洞察',
        description: '让企业能更便捷地监控外部信息，辅助决策。低成本实现市场情报自动化收集，快速应对外部变化。',
        skills: ['竞品价格监控', '行业新闻摘要', '舆情追踪'],
        exampleClass: 'example-indigo',
        example: '自动每日爬取指定竞争对手的产品价格页面，将变动情况整理成表格或图表发给你。自动抓取预设的行业新闻源，生成一份包含核心观点的每日简报。'
      },
      {
        id: 3,
        icon: '💬',
        iconClass: 'icon-pink',
        tag: '增长引擎',
        tagClass: 'tag-pink',
        title: '客户互动与营销辅助',
        description: '增强与客户的连接，提升营销内容的产出效率。规模化内容创作能力，优化客户体验。',
        skills: ['咨询智能路由', '文案批量生成', '社群自动回复'],
        exampleClass: 'example-pink',
        example: '在收到如微信/TG群的客户咨询时，能根据问题关键词（如"价格"、"售后"），自动@相应负责人或回复预设答案。根据产品卖点，批量生成不同平台风格的宣传文案草稿。'
      },
      {
        id: 4,
        icon: '🖥️',
        iconClass: 'icon-teal',
        tag: '技术保障',
        tagClass: 'tag-teal',
        title: 'IT与开发运维支持',
        description: '对于有技术团队的中小企业，这些技能能成为开发者的"副驾驶"。实现基础运维工作的自动化，让开发者更专注核心业务。',
        skills: ['日志监控告警', '代码自动备份', 'API健康检查'],
        exampleClass: 'example-teal',
        example: '监控服务器日志，出现"Error"等关键词时，自动发送告警到指定聊天群。在每天凌晨自动备份代码库到指定位置，并发送成功/失败通知。'
      }
    ],
    steps: [
      { num: 1, title: '指令下达', desc: '使用自然语言描述需求，无需编程知识。' },
      { num: 2, title: '智能解析', desc: 'AI 智能体理解意图，自动规划执行路径。' },
      { num: 3, title: '自动执行', desc: '跨软件、跨平台协同操作，完成任务并反馈。' }
    ],
    values: [
      { icon: '⏰', iconClass: 'icon-green', title: '时间节省', desc: '直接节省人工操作时间，减少因重复劳动导致的错误。' },
      { icon: '🎯', iconClass: 'icon-purple', title: '精准聚焦', desc: '特别适合行政、财务、销售支持等岗位，释放人力价值。' },
      { icon: '🚀', iconClass: 'icon-orange', title: '敏捷响应', desc: '低成本市场情报收集，帮助中小企业快速应对外部变化。' }
    ],
    formData: {
      name: '',
      email: '',
      message: ''
    },
    // 聊天相关数据
    showChat: false, // 是否显示聊天界面
    chatMessages: [] as Array<{ type: 'user' | 'ai', content: string, timestamp: number }>, // 聊天消息列表
    inputMessage: '', // 输入框内容
    isSending: false, // 是否正在发送消息
    chatScrollTop: 0, // 聊天滚动位置
    sessionKey: '' // 会话 key，用于持久化
  },

  onLoad() {
    // 页面加载时恢复聊天历史
    this.loadChatHistory()
  },

  onShow() {
    // 页面显示时也恢复一次（防止从其他页面返回时丢失）
    if (this.data.showChat) {
      this.loadChatHistory()
    }
  },

  onStartTap() {
    // 打开聊天界面
    this.setData({
      showChat: true
    })
    // 打开时恢复聊天历史
    this.loadChatHistory()
  },

  // 关闭聊天界面
  onCloseChat() {
    // 关闭时保存聊天历史
    this.saveChatHistory()
    this.setData({
      showChat: false
    })
  },

  // 加载聊天历史
  loadChatHistory() {
    try {
      // 获取 sessionKey（从 openid 生成）
      const openid = wx.getStorageSync('wechat_openid') || 'default'
      const sessionKey = `wechat:miniapp:${openid}`
      
      // 从本地存储读取聊天历史
      const storageKey = `chat_history_${sessionKey}`
      const savedMessages = wx.getStorageSync(storageKey)
      
      if (savedMessages && Array.isArray(savedMessages) && savedMessages.length > 0) {
        this.setData({
          chatMessages: savedMessages,
          sessionKey: sessionKey
        })
        // 恢复后滚动到底部
        setTimeout(() => {
          this.scrollToBottom()
        }, 200)
      } else {
        // 如果没有历史记录，初始化 sessionKey
        this.setData({
          sessionKey: sessionKey
        })
      }
    } catch (error) {
      console.error('加载聊天历史失败:', error)
      // 失败不影响使用，继续使用空列表
    }
  },

  // 保存聊天历史
  saveChatHistory() {
    try {
      const { chatMessages, sessionKey } = this.data
      if (sessionKey && chatMessages && chatMessages.length > 0) {
        const storageKey = `chat_history_${sessionKey}`
        wx.setStorageSync(storageKey, chatMessages)
        console.log('聊天历史已保存:', chatMessages.length, '条消息')
      }
    } catch (error) {
      console.error('保存聊天历史失败:', error)
      // 保存失败不影响使用，只是下次打开会丢失
    }
  },

  // 输入框内容变化
  onInputChange(e: WechatMiniprogram.Input) {
    this.setData({
      inputMessage: e.detail.value
    })
  },

  // 发送消息
  async onSendMessage() {
    const message = this.data.inputMessage.trim()
    if (!message) {
    wx.showToast({
        title: '请输入消息',
        icon: 'none'
      })
      return
    }

    if (this.data.isSending) {
      wx.showToast({
        title: '正在发送，请稍候',
        icon: 'none'
      })
      return
    }

    // 添加用户消息到聊天列表
    const userMessage = {
      type: 'user' as const,
      content: message,
      timestamp: Date.now()
    }
    const newMessages = [...this.data.chatMessages, userMessage]
    this.setData({
      chatMessages: newMessages,
      inputMessage: '',
      isSending: true
    })
    
    // 保存聊天历史
    this.saveChatHistory()

    // 滚动到底部
    this.scrollToBottom()

    try {
      // 添加 AI 占位消息（显示加载中）
      const aiPlaceholder = {
        type: 'ai' as const,
        content: '正在思考...',
        timestamp: Date.now()
      }
      this.setData({
        chatMessages: [...newMessages, aiPlaceholder]
      })
      this.scrollToBottom()

      // 发送消息到 OpenClaw（使用流式模式，模拟打字效果）
      let fullResponse = ''
      await sendMessageToOpenClawStream(
        message,
        undefined, // openid 会自动获取
        undefined, // 使用默认模型
        (chunk: string) => {
          // 增量更新 - 使用当前最新的消息列表
          fullResponse += chunk
          const currentMessages = [...this.data.chatMessages]
          // 更新最后一条 AI 消息
          if (currentMessages.length > 0 && currentMessages[currentMessages.length - 1].type === 'ai') {
            currentMessages[currentMessages.length - 1] = {
              type: 'ai',
              content: fullResponse,
              timestamp: aiPlaceholder.timestamp
            }
          } else {
            // 如果没有 AI 消息，添加一条
            currentMessages.push({
              type: 'ai',
              content: fullResponse,
              timestamp: aiPlaceholder.timestamp
            })
          }
          this.setData({
            chatMessages: currentMessages
          })
          // 增量更新时也保存（避免意外关闭丢失）
          this.saveChatHistory()
          this.scrollToBottom()
        },
        (result: any) => {
          // 完成 - 使用当前最新的消息列表（包含流式更新）
          const finalResponse = result.summary || fullResponse || '抱歉，我没有理解您的问题。'
          // 使用当前 data 中的消息列表，而不是 newMessages
          const currentMessages = [...this.data.chatMessages]
          // 更新最后一条 AI 消息
          if (currentMessages.length > 0 && currentMessages[currentMessages.length - 1].type === 'ai') {
            currentMessages[currentMessages.length - 1] = {
              type: 'ai',
              content: finalResponse,
              timestamp: aiPlaceholder.timestamp
            }
          } else {
            // 如果没有 AI 消息，添加一条
            currentMessages.push({
              type: 'ai',
              content: finalResponse,
              timestamp: aiPlaceholder.timestamp
            })
          }
          this.setData({
            chatMessages: currentMessages,
            isSending: false
          })
          // 完成时保存聊天历史
          this.saveChatHistory()
          this.scrollToBottom()
        },
        (error: string) => {
          // 错误处理 - 使用当前最新的消息列表
          const errorMessage = {
            type: 'ai' as const,
            content: `抱歉，发生了错误：${error}`,
            timestamp: aiPlaceholder.timestamp
          }
          const currentMessages = [...this.data.chatMessages]
          // 更新最后一条消息为错误消息
          if (currentMessages.length > 0 && currentMessages[currentMessages.length - 1].type === 'ai') {
            currentMessages[currentMessages.length - 1] = errorMessage
          } else {
            currentMessages.push(errorMessage)
          }
          this.setData({
            chatMessages: currentMessages,
            isSending: false
          })
          // 错误时也保存（保留错误信息）
          this.saveChatHistory()
          this.scrollToBottom()
        }
      )
    } catch (error: any) {
      console.error('发送消息失败:', error)
      const errorMessage = {
        type: 'ai' as const,
        content: `抱歉，发生了错误：${error.message || '发送消息失败'}`,
        timestamp: Date.now()
      }
      this.setData({
        chatMessages: [...newMessages, errorMessage],
        isSending: false
      })
      // 错误时也保存
      this.saveChatHistory()
      this.scrollToBottom()
      wx.showToast({
        title: error.message || '发送失败',
        icon: 'none',
        duration: 2000
      })
    }
  },

  // 滚动到底部
  scrollToBottom() {
    setTimeout(() => {
      const query = wx.createSelectorQuery()
      query.select('.chat-messages').boundingClientRect()
      query.selectViewport().scrollOffset()
      query.exec((res) => {
        if (res[0]) {
          this.setData({
            chatScrollTop: res[0].height || 9999
          })
        }
      })
    }, 100)
  },

  onDemoTap() {
    wx.showToast({
      title: '演示视频即将上线',
      icon: 'none'
    })
  },

  onNameInput(e: WechatMiniprogram.Input) {
    this.setData({
      'formData.name': e.detail.value
    })
  },

  onEmailInput(e: WechatMiniprogram.Input) {
    this.setData({
      'formData.email': e.detail.value
    })
  },

  onMessageInput(e: WechatMiniprogram.Input) {
    this.setData({
      'formData.message': e.detail.value
    })
  },

  onSubmitForm() {
    const { name, email, message } = this.data.formData
    if (!name || !email || !message) {
      wx.showToast({
        title: '请填写完整信息',
        icon: 'none'
      })
      return
    }
    wx.showToast({
      title: '提交成功，我们会尽快联系您',
      icon: 'none'
    })
    this.setData({
      formData: { name: '', email: '', message: '' }
    })
  },

  onShareAppMessage() {
    return {
      title: 'openclaw AI总裁 - openclaw智能体驱动的增长引擎',
      path: '/pages/ai-ceo/ai-ceo'
    }
  },

  onShareTimeline() {
    return {
      title: 'openclaw AI总裁 - openclaw智能体驱动的增长引擎',
      query: ''
    }
  },

  // 阻止弹窗背景滚动
  preventTouchMove() {
    return false
  }
})

