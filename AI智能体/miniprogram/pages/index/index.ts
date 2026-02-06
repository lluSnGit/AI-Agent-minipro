const OSS_BASE_URL = 'image-cq.oss-cn-beijing.aliyuncs.com'

Page({
  data: {
    imageVideoServices: [
      { id: 1, title: '文生成图', description: '通过文字描述生成精美图片', image: `https://${OSS_BASE_URL}/文生图.png`, route: '/pages/text-to-image/text-to-image' },
      { id: 2, title: '多图生成', description: '场景与产品，真实海报', image: `https://${OSS_BASE_URL}/多图生成.png`, route: '/pages/multi-image-generate/multi-image-generate' },
      { id: 3, title: 'AI模特', description: '定制虚拟形象，告别高成本', image: `https://${OSS_BASE_URL}/ai模特.png`, route: '/pages/ai-model/ai-model' },
      { id: 4, title: 'AI换装', description: '拍照即试穿，购物更沉浸', image: `https://${OSS_BASE_URL}/ai换装.png`, route: '/pages/ai-outfit/ai-outfit' },
      { id: 5, title: '九宫格图', description: '多角度展示产品细节', image: `https://${OSS_BASE_URL}/九宫格图.png`, route: '/pages/grid-image/grid-image' },
      { id: 6, title: '文生视频', description: '将文字描述转化为动态视频', image: `https://${OSS_BASE_URL}/文生视频.png`, route: '/pages/text-to-video/text-to-video' },
      { id: 7, title: '图生视频', description: '基于图片生成动态视频', image: `https://${OSS_BASE_URL}/图生视频.png`, route: '/pages/image-to-video/image-to-video' },
      { id: 8, title: '多图视频', description: '多张图片生成连续视频', image: `https://${OSS_BASE_URL}/多图视频.png`, route: '/pages/multi-image-video/multi-image-video' }
    ],
    aiServices: [
      { id: 1, title: '新闻播报', description: '智能新闻播报与内容生成', image: `https://${OSS_BASE_URL}/新闻播报.png`, route: '/pages/news-broadcast/news-broadcast' },
      { id: 2, title: '智能客服', description: '24小时智能客服解决方案', image: `https://${OSS_BASE_URL}/智能客服智能体.png`, route: '/pages/customer-service/customer-service' },
      { id: 3, title: 'openclaw AI总裁', description: '智能决策分析与战略规划', image: `https://${OSS_BASE_URL}/ai数智总裁.png`, route: '/pages/ai-ceo/ai-ceo' },
      { id: 4, title: '数智人直播', description: '虚拟数字人直播解决方案', image: `https://${OSS_BASE_URL}/数字人直播.png` }
    ]
  },
  onLoad() {
    this.silentLogin()
  },
  
  onShow() {
    // 每次显示页面时检查登录状态
    const app = getApp<IAppOption>()
    app.checkLoginStatus()
  },
  silentLogin() {
    wx.login({
      success: (res) => {
        if (res.code) {
          console.log('登录code:', res.code)
          // 发送 res.code 到后台换取 openId, sessionKey, unionId
        }
      }
    })
  },
  // 处理服务卡片点击事件
  onServiceTap(e: WechatMiniprogram.TouchEvent) {
    const item = e.currentTarget.dataset.item
    if (item && item.route) {
      wx.navigateTo({
        url: item.route
      })
    } else {
      wx.showToast({
        title: '功能开发中',
        icon: 'none'
      })
    }
  },
  // 处理客服悬浮按钮点击事件
  onServiceBtnTap() {
    wx.navigateTo({
      url: '/pages/customer-service/customer-service'
    })
  },
  // 用户点击右上角转发按钮时触发
  onShareAppMessage(options: WechatMiniprogram.Page.IShareAppMessageOption) {
    return {
      title: 'AI智能体 - 强大的AI视频和图片生成工具',
      path: '/pages/index/index',
      imageUrl: `https://${OSS_BASE_URL}/文生图.png` // 可选，自定义分享图片
    }
  },
  // 用户点击右上角分享到朋友圈按钮时触发（可选）
  onShareTimeline() {
    return {
      title: 'AI智能体 - 强大的AI视频和图片生成工具',
      query: '',
      imageUrl: `https://${OSS_BASE_URL}/文生图.png` // 可选，自定义分享图片
    }
  }
})
