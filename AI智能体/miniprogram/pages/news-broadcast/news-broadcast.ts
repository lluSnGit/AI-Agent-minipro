// AI新闻视频生成页面

Page({
  data: {},

  onLoad() {
    // 页面加载
  },

  onStartGrowth() {
    // 立即开启流量增长按钮点击
    wx.showModal({
      title: '立即咨询',
      content: '请联系客服了解更多AI新闻视频生成服务详情',
      confirmText: '联系客服',
      success(res) {
        if (res.confirm) {
          // 跳转到客服页面或打开客服会话
          wx.navigateTo({
            url: '/pages/customer-service/customer-service'
          });
        }
      }
    });
  },

  onWatchDemo() {
    // 观看演示视频按钮点击
    wx.showToast({
      title: '演示视频即将上线',
      icon: 'none',
      duration: 2000
    });
  },

  onShareAppMessage() {
    return {
      title: 'AI新闻视频生成 - 你的24小时自动热点引擎',
      path: '/pages/news-broadcast/news-broadcast'
    };
  }
});
