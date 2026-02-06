import { generateAIOutfit } from '../../utils/api-multi'
import { getAccessToken, setAccessToken, clearTokens } from '../../utils/api'

Page({
  data: {
    image1: '', // 模特图文件路径
    image2: '', // 服装图文件路径
    image1Path: '', // 模特图原始路径（用于上传）
    image2Path: '', // 服装图原始路径
    prompt: '',
    negativePrompt: '',
    seed: '',
    loading: false,
    generatedImage: '',
    errorMessage: '',
    isLoggedIn: false,
    accessToken: '',
    showTokenInput: false
  },

  onLoad() {
    // 页面加载时检查登录状态（和文生图一样）
    const token = getAccessToken()
    // 如果未登录，默认显示token输入区域
    if (!token) {
      this.setData({
        showTokenInput: true
      })
    }
    this.checkLoginStatus()
  },

  onShow() {
    // 每次显示页面时检查登录状态（从登录页返回时）
    this.checkLoginStatus()
  },

  // 检查登录状态
  checkLoginStatus() {
    const token = getAccessToken()
    // Token有效性检查：正常token应该至少50个字符
    const isValidToken = token && token.length > 50
    console.log('检查登录状态:', { hasToken: !!token, tokenLength: token?.length || 0, isValidToken })
    
    // 如果token无效，清除它
    if (token && !isValidToken) {
      console.warn('检测到无效token，已清除')
      clearTokens()
      this.setData({
        isLoggedIn: false,
        accessToken: '',
        showTokenInput: true // 显示token输入区域
      })
    } else {
      this.setData({
        isLoggedIn: !!isValidToken,
        accessToken: token || ''
      })
    }
  },

  // 跳转到登录页
  goToLogin() {
    wx.navigateTo({
      url: '/pages/login/login'
    })
  },

  // 清除Token并重新登录
  clearTokenAndRelogin() {
    wx.showModal({
      title: '提示',
      content: '确定要清除当前Token吗？',
      success: (res) => {
        if (res.confirm) {
          clearTokens()
          this.checkLoginStatus()
          wx.showToast({
            title: 'Token已清除',
            icon: 'success'
          })
        }
      }
    })
  },

  // 输入token
  onTokenInput(e: any) {
    this.setData({
      accessToken: e.detail.value
    })
  },

  // 保存token
  onSaveToken() {
    const token = this.data.accessToken.trim()
    if (!token) {
      wx.showToast({
        title: 'Token不能为空',
        icon: 'none'
      })
      return
    }
    setAccessToken(token)
    wx.showToast({
      title: 'Token已保存',
      icon: 'success'
    })
    this.setData({
      showTokenInput: false,
      isLoggedIn: true
    })
    // 重新检查登录状态
    this.checkLoginStatus()
  },

  // 切换token输入显示
  toggleTokenInput() {
    this.setData({
      showTokenInput: !this.data.showTokenInput
    })
  },

  // 选择模特图
  chooseImage1() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFilePaths[0]
        
        // 压缩图片
        wx.compressImage({
          src: tempFilePath,
          quality: 80,
          success: (compressRes) => {
            this.setData({
              image1: compressRes.tempFilePath,
              image1Path: compressRes.tempFilePath
            })
            wx.showToast({
              title: '模特图选择成功',
              icon: 'success',
              duration: 1500
            })
          },
          fail: () => {
            // 压缩失败，使用原图
            this.setData({
              image1: tempFilePath,
              image1Path: tempFilePath
            })
          }
        })
      }
    })
  },

  // 选择服装图
  chooseImage2() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFilePaths[0]
        
        // 压缩图片
        wx.compressImage({
          src: tempFilePath,
          quality: 80,
          success: (compressRes) => {
            this.setData({
              image2: compressRes.tempFilePath,
              image2Path: compressRes.tempFilePath
            })
            wx.showToast({
              title: '服装图选择成功',
              icon: 'success',
              duration: 1500
            })
          },
          fail: () => {
            // 压缩失败，使用原图
            this.setData({
              image2: tempFilePath,
              image2Path: tempFilePath
            })
          }
        })
      }
    })
  },

  // 移除模特图
  removeImage1() {
    this.setData({
      image1: '',
      image1Path: ''
    })
  },

  // 移除服装图
  removeImage2() {
    this.setData({
      image2: '',
      image2Path: ''
    })
  },

  // 输入提示词
  onPromptInput(e: any) {
    this.setData({
      prompt: e.detail.value
    })
  },

  // 输入负面提示词
  onNegativePromptInput(e: any) {
    this.setData({
      negativePrompt: e.detail.value
    })
  },

  // 输入随机种子
  onSeedInput(e: any) {
    this.setData({
      seed: e.detail.value
    })
  },

  // 生成换装效果
  async onGenerate() {
    // 检查登录状态（和文生图一样）
    const token = getAccessToken()
    if (!token || token.length < 50) {
      wx.showModal({
        title: 'Token无效',
        content: '您的Access Token无效或已过期，请重新登录或输入有效Token。',
        showCancel: false,
        success: () => {
          this.setData({ 
            showTokenInput: true,
            isLoggedIn: false
          })
        }
      })
      this.setData({ loading: false })
      return
    }

    // 验证必填项
    if (!this.data.image1Path || !this.data.image2Path) {
      wx.showToast({
        title: '请选择模特图和服装图',
        icon: 'none',
        duration: 2000
      })
      return
    }

    const prompt = this.data.prompt.trim()
    if (!prompt) {
      wx.showToast({
        title: '请输入换装效果提示词',
        icon: 'none'
      })
      return
    }

    this.setData({
      loading: true,
      errorMessage: '',
      generatedImage: ''
    })

    try {
      // 解析seed参数
      const seed = this.data.seed.trim() ? parseInt(this.data.seed.trim()) : undefined
      const negativePrompt = this.data.negativePrompt.trim() || undefined

      console.log('开始生成AI换装，参数:', { 
        hasImage1: !!this.data.image1Path, 
        hasImage2: !!this.data.image2Path,
        prompt, 
        negativePrompt, 
        seed, 
        hasToken: !!token 
      })
      
      // 显示初始加载提示
      wx.showLoading({
        title: '提交任务中...',
        mask: true
      })
      
      // 进度回调，更新加载提示
      let loadingTimer: any = null
      const onProgress = (elapsed: number) => {
        const minutes = Math.floor(elapsed / 60)
        const seconds = elapsed % 60
        const timeText = minutes > 0 ? `${minutes}分${seconds}秒` : `${seconds}秒`
        wx.showLoading({
          title: `生成中，已等待${timeText}...`,
          mask: true
        })
      }
      
      const result = await generateAIOutfit(
        this.data.image1Path,
        this.data.image2Path,
        prompt,
        negativePrompt,
        seed,
        onProgress
      )
      
      wx.hideLoading()

      // 处理返回结果（和文生图一样）
      console.log('API返回结果:', result)
      let imageUrl = ''
      
      // 处理images数组格式（和文生图一样）
      if (result.images && Array.isArray(result.images) && result.images.length > 0) {
        const firstImage = result.images[0]
        // 如果images数组中的元素是对象，取url字段
        if (typeof firstImage === 'object' && firstImage.url) {
          imageUrl = firstImage.url
        } else if (typeof firstImage === 'string') {
          imageUrl = firstImage
        } else {
          imageUrl = firstImage
        }
      } else if (result.image_url) {
        imageUrl = result.image_url
      } else if (result.data && result.data.image_url) {
        imageUrl = result.data.image_url
      } else if (result.data && result.data.images && Array.isArray(result.data.images) && result.data.images.length > 0) {
        const firstImage = result.data.images[0]
        if (typeof firstImage === 'object' && firstImage.url) {
          imageUrl = firstImage.url
        } else {
          imageUrl = firstImage
        }
      } else if (result.url) {
        imageUrl = result.url
      } else if (typeof result === 'string') {
        imageUrl = result
      } else {
        // 如果返回的是base64或其他格式
        console.log('API返回结果:', result)
        imageUrl = result.image || result
      }
      
      console.log('提取的图片URL:', imageUrl ? imageUrl.substring(0, 50) + '...' : '未找到')

      // 处理base64格式的图片URL
      if (imageUrl && imageUrl.startsWith('data:image')) {
        // base64格式，直接使用
        this.setData({
          generatedImage: imageUrl,
          loading: false
        })
      } else if (imageUrl) {
        // 普通URL格式
        this.setData({
          generatedImage: imageUrl,
          loading: false
        })
      } else {
        throw new Error('未找到生成的图片')
      }

      wx.showToast({
        title: '生成成功',
        icon: 'success'
      })
    } catch (error: any) {
      console.error('生成AI换装失败:', error)
      wx.hideLoading()
      let errorMsg = error.message || '生成失败，请重试'
      
      // 如果是token相关错误，提示重新登录
      if (errorMsg.includes('token') || errorMsg.includes('Token') || errorMsg.includes('401') || errorMsg.includes('无效') || errorMsg.includes('过期')) {
        wx.showModal({
          title: 'Token无效',
          content: errorMsg + '\n\n请重新登录获取新的Token',
          showCancel: false,
          confirmText: '去登录',
          success: () => {
            // 清除无效token
            clearTokens()
            this.checkLoginStatus()
            // 跳转到登录页
            this.goToLogin()
          }
        })
      } else {
        // 其他错误直接显示
        this.setData({
          errorMessage: errorMsg,
          loading: false
        })
        wx.showToast({
          title: errorMsg.length > 20 ? errorMsg.substring(0, 20) + '...' : errorMsg,
          icon: 'none',
          duration: 3000
        })
      }
      
      this.setData({
        loading: false
      })
    }
  },

  // 预览图片
  previewImage() {
    if (this.data.generatedImage) {
      wx.previewImage({
        urls: [this.data.generatedImage],
        current: this.data.generatedImage
      })
    }
  },

  // 保存图片
  saveImage() {
    if (!this.data.generatedImage) {
      wx.showToast({
        title: '没有可保存的图片',
        icon: 'none'
      })
      return
    }

    // 如果是base64格式，需要先下载
    if (this.data.generatedImage.startsWith('data:image')) {
      // base64格式，需要转换为临时文件
      const base64 = this.data.generatedImage.split(',')[1] || this.data.generatedImage
      const fs = wx.getFileSystemManager()
      const filePath = `${wx.env.USER_DATA_PATH}/ai_outfit_${Date.now()}.png`
      
      try {
        const arrayBuffer = wx.base64ToArrayBuffer(base64)
        fs.writeFileSync(filePath, arrayBuffer, 'binary')
        
        wx.saveImageToPhotosAlbum({
          filePath: filePath,
          success: () => {
            wx.showToast({
              title: '保存成功',
              icon: 'success'
            })
          },
          fail: (err) => {
            console.error('保存失败:', err)
            wx.showToast({
              title: '保存失败',
              icon: 'none'
            })
          }
        })
      } catch (error) {
        console.error('转换base64失败:', error)
        wx.showToast({
          title: '保存失败',
          icon: 'none'
        })
      }
    } else {
      // 普通URL，先下载再保存
      wx.downloadFile({
        url: this.data.generatedImage,
        success: (res) => {
          if (res.statusCode === 200) {
            wx.saveImageToPhotosAlbum({
              filePath: res.tempFilePath,
              success: () => {
                wx.showToast({
                  title: '保存成功',
                  icon: 'success'
                })
              },
              fail: () => {
                wx.showToast({
                  title: '保存失败',
                  icon: 'none'
                })
              }
            })
          }
        },
        fail: () => {
          wx.showToast({
            title: '下载失败',
            icon: 'none'
          })
        }
      })
    }
  },

  // 重新生成
  regenerate() {
    this.onGenerate()
  },
  // 用户点击右上角转发按钮时触发
  onShareAppMessage(options: WechatMiniprogram.Page.IShareAppMessageOption) {
    return {
      title: 'AI换装 - AI智能体，拍照即试穿，购物更沉浸',
      path: '/pages/ai-outfit/ai-outfit',
      imageUrl: this.data.generatedImage || undefined
    }
  },
  // 用户点击右上角分享到朋友圈按钮时触发
  onShareTimeline() {
    return {
      title: 'AI换装 - AI智能体，拍照即试穿，购物更沉浸',
      query: '',
      imageUrl: this.data.generatedImage || undefined
    }
  }
})

