import { sendDifyMessageStream, getAccessToken } from '../../utils/api'

Page({
  data: {
    // 聊天相关数据
    showChat: false, // 是否显示聊天界面
    chatMessages: [] as Array<{ type: 'user' | 'ai', content: string, timestamp: number }>, // 聊天消息列表
    inputMessage: '', // 输入框内容
    isSending: false, // 是否正在发送消息
    chatScrollTop: 0, // 聊天滚动位置
    conversationId: null as string | null, // Dify 对话 ID
    hasToken: false, // 是否已登录（是否存在 access token）
    directChat: false // 是否直接显示聊天界面（隐藏宣传内容）
  },

  onLoad(options: any) {
    this.refreshTokenState()
    // 支持从悬浮按钮跳转时自动打开聊天
    if (options && options.openChat === '1') {
      // 直接显示聊天界面，隐藏宣传内容
      this.setData({
        directChat: true,
        showChat: true
      })
    }
  },

  onShow() {
    // 从登录页返回后刷新 token 状态
    this.refreshTokenState()
    const pages = getCurrentPages()
    const current = pages[pages.length - 1] as any
    const options = (current && current.options) || {}
    if (options && options.openChat === '1' && !this.data.showChat) {
      // 直接显示聊天界面，隐藏宣传内容
      this.setData({
        directChat: true,
        showChat: true
      })
    }
  },

  refreshTokenState() {
    const token = getAccessToken()
    this.setData({
      hasToken: !!token
    })
  },

  // 打开聊天界面
  onStartChat() {
    if (!this.data.hasToken) {
      wx.showModal({
        title: '需要登录',
        content: '首次使用智能客服需要先登录获取 Token。',
        confirmText: '去登录',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            this.onGoLogin()
          }
        }
      })
      return
    }
    this.setData({
      showChat: true
    })
  },

  // 跳转到登录页
  onGoLogin() {
    wx.navigateTo({
      url: '/pages/login/login'
    }).catch(() => {
      wx.showToast({
        title: '跳转登录失败',
        icon: 'none'
      })
    })
  },

  // 关闭聊天界面
  onCloseChat() {
    // 如果是直接聊天模式，关闭时返回上一页
    if (this.data.directChat) {
      wx.navigateBack({
        delta: 1
      }).catch(() => {
        // 如果没有上一页，跳转到首页
        wx.switchTab({
          url: '/pages/index/index'
        })
      })
    } else {
      // 普通模式，只隐藏聊天界面
      this.setData({
        showChat: false
      })
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
    if (!this.data.hasToken) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      })
      this.onGoLogin()
      return
    }
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

    // 滚动到底部
    this.scrollToBottom()

    try {
      // 添加 AI 占位消息（显示加载中）
      const aiPlaceholder = {
        type: 'ai' as const,
        content: '正在思考...',
        timestamp: Date.now()
      }
      const messagesWithPlaceholder = [...newMessages, aiPlaceholder]
      this.setData({
        chatMessages: messagesWithPlaceholder
      })
      this.scrollToBottom()

      // 发送消息到 Dify（使用流式模式，模拟打字效果）
      let fullResponse = ''
      await sendDifyMessageStream(
        message,
        this.data.conversationId,
        undefined, // inputs
        (data) => {
          // 增量更新
          if (data.event === 'delta' && data.content) {
            fullResponse += data.content
            const updatedMessages = [...messagesWithPlaceholder]
            updatedMessages[updatedMessages.length - 1] = {
              type: 'ai',
              content: fullResponse || '正在思考...',
              timestamp: aiPlaceholder.timestamp
            }
            this.setData({
              chatMessages: updatedMessages
            })
            this.scrollToBottom()
          }
        },
        (data) => {
          // 完成
          const finalResponse = fullResponse || '抱歉，我没有理解您的问题。'
          const updatedMessages = [...messagesWithPlaceholder]
          updatedMessages[updatedMessages.length - 1] = {
            type: 'ai',
            content: finalResponse,
            timestamp: aiPlaceholder.timestamp
          }
          // 更新 conversationId
          if (data.conversation_id) {
            this.setData({
              conversationId: data.conversation_id
            })
          }
          this.setData({
            chatMessages: updatedMessages,
            isSending: false
          })
          this.scrollToBottom()
        },
        (error) => {
          // 错误处理
          const errorMessage = {
            type: 'ai' as const,
            content: `抱歉，发生了错误：${error.detail || '发送消息失败'}`,
            timestamp: aiPlaceholder.timestamp
          }
          const updatedMessages = [...messagesWithPlaceholder]
          updatedMessages[updatedMessages.length - 1] = errorMessage
          this.setData({
            chatMessages: updatedMessages,
            isSending: false
          })
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

  // 阻止弹窗背景滚动
  preventTouchMove() {
    return false
  },

  onShareAppMessage() {
    return {
      title: 'AI 智能客服 - 从"应答工具"到"智能业务员"',
      path: '/pages/customer-service/customer-service'
    }
  },

  onShareTimeline() {
    return {
      title: 'AI 智能客服 - 从"应答工具"到"智能业务员"',
      query: ''
    }
  }
})
