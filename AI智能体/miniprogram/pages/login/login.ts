import { loginWithPassword, loginWithCode, sendVerificationCode, getAccessToken } from '../../utils/api'

Page({
  data: {
    loginType: 'password' as 'password' | 'code', // 登录方式：password 或 code
    email: '',
    password: '',
    code: '',
    loading: false,
    errorMessage: '',
    successMessage: '',
    codeCountdown: 0 // 验证码倒计时
  },

  onLoad(options: any) {
    // 如果已经有token，提示用户
    const token = getAccessToken()
    if (token) {
      this.setData({
        successMessage: '您已登录，可以直接使用'
      })
    }
  },

  // 切换登录方式
  switchLoginType(e: WechatMiniprogram.TouchEvent) {
    const type = e.currentTarget.dataset.type
    this.setData({
      loginType: type,
      errorMessage: '',
      successMessage: '',
      code: '',
      password: ''
    })
  },

  // 输入邮箱
  onEmailInput(e: WechatMiniprogram.InputEvent) {
    this.setData({
      email: e.detail.value,
      errorMessage: '',
      successMessage: ''
    })
  },

  // 输入密码
  onPasswordInput(e: WechatMiniprogram.InputEvent) {
    this.setData({
      password: e.detail.value,
      errorMessage: ''
    })
  },

  // 输入验证码
  onCodeInput(e: WechatMiniprogram.InputEvent) {
    this.setData({
      code: e.detail.value,
      errorMessage: ''
    })
  },

  // 发送验证码
  async onSendCode() {
    const email = this.data.email.trim()
    if (!email) {
      wx.showToast({
        title: '请输入邮箱',
        icon: 'none'
      })
      return
    }

    // 简单的邮箱格式验证
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      wx.showToast({
        title: '邮箱格式不正确',
        icon: 'none'
      })
      return
    }

    this.setData({
      loading: true,
      errorMessage: ''
    })

    try {
      await sendVerificationCode(email)
      wx.showToast({
        title: '验证码已发送',
        icon: 'success'
      })

      // 开始倒计时
      this.startCountdown()
    } catch (error: any) {
      const errorMsg = error.message || '发送验证码失败'
      this.setData({
        errorMessage: errorMsg
      })
      wx.showToast({
        title: errorMsg,
        icon: 'none',
        duration: 2000
      })
    } finally {
      this.setData({
        loading: false
      })
    }
  },

  // 开始倒计时
  startCountdown() {
    this.setData({
      codeCountdown: 60
    })

    const timer = setInterval(() => {
      const countdown = this.data.codeCountdown - 1
      if (countdown <= 0) {
        clearInterval(timer)
        this.setData({
          codeCountdown: 0
        })
      } else {
        this.setData({
          codeCountdown: countdown
        })
      }
    }, 1000)
  },

  // 密码登录
  async onPasswordLogin() {
    const email = this.data.email.trim()
    const password = this.data.password

    if (!email || !password) {
      wx.showToast({
        title: '请填写完整信息',
        icon: 'none'
      })
      return
    }

    this.setData({
      loading: true,
      errorMessage: '',
      successMessage: ''
    })

    try {
      await loginWithPassword(email, password)
      
      // 更新全局登录状态并启动自动刷新
      const app = getApp<IAppOption>()
      app.checkLoginStatus()
      app.startTokenAutoRefresh() // 登录成功后启动自动刷新
      
      this.setData({
        successMessage: '登录成功！',
        loading: false
      })

      wx.showToast({
        title: '登录成功',
        icon: 'success'
      })

      // 延迟返回上一页或跳转到首页
      setTimeout(() => {
        const pages = getCurrentPages()
        if (pages.length > 1) {
          wx.navigateBack()
        } else {
          wx.switchTab({
            url: '/pages/index/index'
          }).catch(() => {
            wx.redirectTo({
              url: '/pages/index/index'
            })
          })
        }
      }, 1500)
    } catch (error: any) {
      const errorMsg = error.message || '登录失败，请重试'
      console.error('登录错误:', error)
      
      // 如果是服务器错误，显示更详细的提示
      let displayMsg = errorMsg
      if (errorMsg.includes('500') || errorMsg.includes('Internal Server Error') || errorMsg.includes('服务器内部错误')) {
        displayMsg = '服务器内部错误(500)\n\n可能原因：\n1. 后端服务未正常运行\n2. API地址配置错误\n3. 账号或密码格式不正确\n\n请检查后端服务状态或联系管理员'
      }
      
      this.setData({
        errorMessage: displayMsg,
        loading: false
      })
      
      wx.showModal({
        title: '登录失败',
        content: displayMsg,
        showCancel: false,
        confirmText: '知道了'
      })
    }
  },

  // 验证码登录
  async onCodeLogin() {
    const email = this.data.email.trim()
    const code = this.data.code.trim()

    if (!email || !code) {
      wx.showToast({
        title: '请填写完整信息',
        icon: 'none'
      })
      return
    }

    this.setData({
      loading: true,
      errorMessage: '',
      successMessage: ''
    })

    try {
      await loginWithCode(email, code)
      
      // 更新全局登录状态并启动自动刷新
      const app = getApp<IAppOption>()
      app.checkLoginStatus()
      app.startTokenAutoRefresh() // 登录成功后启动自动刷新
      
      this.setData({
        successMessage: '登录成功！',
        loading: false
      })

      wx.showToast({
        title: '登录成功',
        icon: 'success'
      })

      // 延迟返回上一页或跳转到首页
      setTimeout(() => {
        const pages = getCurrentPages()
        if (pages.length > 1) {
          wx.navigateBack()
        } else {
          wx.switchTab({
            url: '/pages/index/index'
          }).catch(() => {
            wx.redirectTo({
              url: '/pages/index/index'
            })
          })
        }
      }, 1500)
    } catch (error: any) {
      const errorMsg = error.message || '登录失败，请重试'
      this.setData({
        errorMessage: errorMsg,
        loading: false
      })
      wx.showToast({
        title: errorMsg,
        icon: 'none',
        duration: 2000
      })
    }
  }
})

