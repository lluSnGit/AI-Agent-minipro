// app.ts
import { getAccessToken, clearTokens, getRefreshToken, refreshAccessToken } from './utils/api'

App<IAppOption>({
  globalData: {
    isLoggedIn: false,
    accessToken: null as string | null,
    tokenRefreshTimer: null as any // token自动刷新定时器
  },
  onLaunch() {
    // 展示本地存储能力
    const logs = wx.getStorageSync('logs') || []
    logs.unshift(Date.now())
    wx.setStorageSync('logs', logs)

    // 检查登录状态
    this.checkLoginStatus()

    // 启动token自动刷新机制
    this.startTokenAutoRefresh()

    // 微信登录（用于获取openId等）
    wx.login({
      success: res => {
        console.log(res.code)
        // 发送 res.code 到后台换取 openId, sessionKey, unionId
      },
    })
  },
  
  // 启动token自动刷新机制
  // 注意：如果后端不支持token刷新接口，此功能将被禁用
  startTokenAutoRefresh() {
    // 清除旧的定时器
    if (this.globalData.tokenRefreshTimer) {
      clearInterval(this.globalData.tokenRefreshTimer)
    }
    
    const refreshToken = getRefreshToken()
    if (!refreshToken) {
      console.log('没有refresh token，无法启动自动刷新')
      return
    }
    
    // 先测试一下刷新接口是否存在
    console.log('检测后端是否支持token刷新接口...')
    refreshAccessToken()
      .then((newToken) => {
        console.log('后端支持token刷新，启动自动刷新机制')
        this.globalData.accessToken = newToken
        this.globalData.isLoggedIn = true
        
        // 接口存在，启动定时刷新
        this._startRefreshTimer()
      })
      .catch((error) => {
        // 如果是接口不存在（404），禁用自动刷新机制
        if (error?.message?.includes('REFRESH_API_NOT_FOUND') || 
            error?.message?.includes('404') ||
            error?.message?.includes('刷新token失败: 404')) {
          console.warn('后端不支持token刷新接口，自动刷新功能已禁用')
          console.warn('提示：登录持续时间取决于access token的有效期，请联系后端延长token有效期')
          if (this.globalData.tokenRefreshTimer) {
            clearInterval(this.globalData.tokenRefreshTimer)
            this.globalData.tokenRefreshTimer = null
          }
          return
        }
        // 其他错误（如网络错误），也禁用自动刷新，避免频繁报错
        console.warn('Token刷新接口检测失败，禁用自动刷新:', error.message)
        if (this.globalData.tokenRefreshTimer) {
          clearInterval(this.globalData.tokenRefreshTimer)
          this.globalData.tokenRefreshTimer = null
        }
      })
  },
  
  // 内部方法：启动定时刷新
  _startRefreshTimer() {
    // 每30分钟自动刷新一次token（更频繁的刷新，确保token不会过期）
    // 如果后端token有效期更长，可以相应调整这个时间
    const refreshInterval = 30 * 60 * 1000 // 30分钟 = 1800000毫秒
    
    this.globalData.tokenRefreshTimer = setInterval(() => {
      const currentRefreshToken = getRefreshToken()
      if (currentRefreshToken) {
        console.log('定时自动刷新token...')
        refreshAccessToken()
          .then((newToken) => {
            console.log('Token自动刷新成功')
            // 更新全局状态
            this.globalData.accessToken = newToken
            this.globalData.isLoggedIn = true
          })
          .catch((error) => {
            // 如果是接口不存在（404），停止自动刷新机制
            if (error?.message?.includes('REFRESH_API_NOT_FOUND') || 
                error?.message?.includes('404') ||
                error?.message?.includes('刷新token失败: 404')) {
              console.warn('后端不支持token刷新接口，停止自动刷新机制')
              if (this.globalData.tokenRefreshTimer) {
                clearInterval(this.globalData.tokenRefreshTimer)
                this.globalData.tokenRefreshTimer = null
              }
              return
            }
            console.error('Token自动刷新失败:', error)
            // 刷新失败，清除token，需要重新登录
            clearTokens()
            this.globalData.isLoggedIn = false
            this.globalData.accessToken = null
            // 停止自动刷新
            if (this.globalData.tokenRefreshTimer) {
              clearInterval(this.globalData.tokenRefreshTimer)
              this.globalData.tokenRefreshTimer = null
            }
          })
      } else {
        // 没有refresh token，停止自动刷新
        console.log('没有refresh token，停止自动刷新')
        if (this.globalData.tokenRefreshTimer) {
          clearInterval(this.globalData.tokenRefreshTimer)
          this.globalData.tokenRefreshTimer = null
        }
      }
    }, refreshInterval)
    
    console.log('Token自动刷新机制已启动，每30分钟刷新一次')
  },
  
  // 停止token自动刷新
  stopTokenAutoRefresh() {
    if (this.globalData.tokenRefreshTimer) {
      clearInterval(this.globalData.tokenRefreshTimer)
      this.globalData.tokenRefreshTimer = null
      console.log('Token自动刷新机制已停止')
    }
  },
  
  // 全局登录状态检查
  checkLoginStatus() {
    const token = getAccessToken()
    const isValidToken = token && token.length > 50
    console.log('全局登录状态检查:', { hasToken: !!token, tokenLength: token?.length || 0, isValidToken })
    
    if (token && !isValidToken) {
      clearTokens()
      this.globalData.isLoggedIn = false
      this.globalData.accessToken = null
      // 停止自动刷新
      this.stopTokenAutoRefresh()
    } else {
      this.globalData.isLoggedIn = !!isValidToken
      this.globalData.accessToken = token
      // 如果有token，尝试启动自动刷新（如果后端支持的话）
      if (isValidToken && getRefreshToken()) {
        // 注意：如果后端不支持refresh接口，startTokenAutoRefresh会自动禁用
        this.startTokenAutoRefresh()
      }
    }
    
    return this.globalData.isLoggedIn
  },
  
  // 获取登录状态
  getLoginStatus() {
    return this.globalData.isLoggedIn
  }
})