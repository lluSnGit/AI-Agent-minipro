Component({
  properties: {
    // 是否在当前页面隐藏（例如已在客服页但仍想显示可设 false）
    hidden: {
      type: Boolean,
      value: false
    }
  },
  data: {
    x: 620, // 默认靠右
    y: 820  // 默认偏下
  },
  lifetimes: {
    attached() {
      try {
        const saved = wx.getStorageSync('csFloatPos')
        if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
          this.setData({ x: saved.x, y: saved.y })
        }
      } catch (_) {}
    }
  },
  methods: {
    onMove(e: WechatMiniprogram.MovableViewChange) {
      const { x, y, source } = e.detail as any
      // 只在用户拖动时持久化，避免初始化/动画触发写入
      if (source === 'touch') {
        try {
          wx.setStorageSync('csFloatPos', { x, y })
        } catch (_) {}
      }
    },
    onTap() {
      // 统一跳转到客服页，并自动打开聊天
      wx.navigateTo({
        url: '/pages/customer-service/customer-service?openChat=1'
      }).catch(() => {
        // 如果当前已经在栈顶或 navigateTo 失败，兜底跳转
        wx.redirectTo({
          url: '/pages/customer-service/customer-service?openChat=1'
        }).catch(() => {
          wx.showToast({ title: '打开客服失败', icon: 'none' })
        })
      })
    }
  }
})


