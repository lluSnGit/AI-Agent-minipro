import { generateMultiImage } from '../../utils/api-multi'
import { getAccessToken, setAccessToken, clearTokens } from '../../utils/api'

Page({
  data: {
    image1: '', // 图1文件路径
    image2: '', // 图2文件路径
    image3: '', // 图3文件路径
    image1Path: '', // 图1原始路径（用于上传）
    image2Path: '', // 图2原始路径
    image3Path: '', // 图3原始路径
    prompt: '',
    negativePrompt: '',
    seed: '',
    generateVideo: false,
    videoPrompt: '',
    loading: false,
    generatedImage: '',
    generatedImages: [] as Array<{ url: string, filename?: string }>, // 多张图片（类似九宫格）
    generatedVideo: '',
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
    this.checkLoginStatus()
  },

  // 检查登录状态
  checkLoginStatus() {
    const token = getAccessToken()
    const isValidToken = token && token.length > 50
    console.log('检查登录状态:', { hasToken: !!token, tokenLength: token?.length || 0, isValidToken })
    
    if (token && !isValidToken) {
      clearTokens()
      this.setData({
        isLoggedIn: false,
        accessToken: '',
        showTokenInput: true
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
    this.checkLoginStatus()
  },

  // 切换token输入显示
  toggleTokenInput() {
    this.setData({
      showTokenInput: !this.data.showTokenInput
    })
  },

  // 选择图片1
  chooseImage1() {
    this.chooseImage('image1')
  },

  // 选择图片2
  chooseImage2() {
    this.chooseImage('image2')
  },

  // 选择图片3
  chooseImage3() {
    this.chooseImage('image3')
  },

  // 选择图片通用方法
  chooseImage(type: 'image1' | 'image2' | 'image3') {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'], // 使用压缩图片，减少文件大小
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFilePaths[0]
        
        // 先获取图片信息，检查大小
        wx.getImageInfo({
          src: tempFilePath,
          success: (imageInfo) => {
            console.log(`图片${type}信息:`, {
              width: imageInfo.width,
              height: imageInfo.height,
              path: imageInfo.path
            })
            
            // 压缩图片（适度压缩，保持质量）
            wx.compressImage({
              src: tempFilePath,
              quality: 80, // 压缩质量（1-100，数值越大质量越好）
              success: (compressRes) => {
                this.setData({
                  [type]: compressRes.tempFilePath,
                  [`${type}Path`]: compressRes.tempFilePath
                })
                console.log(`图片${type}选择并压缩成功`)
              },
              fail: (err) => {
                console.warn('图片压缩失败，使用原图:', err)
                // 压缩失败，使用原图
                this.setData({
                  [type]: tempFilePath,
                  [`${type}Path`]: tempFilePath
                })
              }
            })
          },
          fail: (err) => {
            console.warn('获取图片信息失败，直接压缩:', err)
            // 获取图片信息失败，直接压缩
            wx.compressImage({
              src: tempFilePath,
              quality: 80,
              success: (compressRes) => {
                this.setData({
                  [type]: compressRes.tempFilePath,
                  [`${type}Path`]: compressRes.tempFilePath
                })
              },
              fail: () => {
                this.setData({
                  [type]: tempFilePath,
                  [`${type}Path`]: tempFilePath
                })
              }
            })
          }
        })
      },
      fail: (err) => {
        console.error('选择图片失败:', err)
        wx.showToast({
          title: '选择图片失败',
          icon: 'none'
        })
      }
    })
  },

  // 移除图片1
  removeImage1() {
    this.setData({
      image1: '',
      image1Path: ''
    })
  },

  // 移除图片2
  removeImage2() {
    this.setData({
      image2: '',
      image2Path: ''
    })
  },

  // 移除图片3
  removeImage3() {
    this.setData({
      image3: '',
      image3Path: ''
    })
  },

  // 输入提示词
  onPromptInput(e: any) {
    this.setData({
      prompt: e.detail.value,
      errorMessage: ''
    })
  },

  // 输入负面提示词
  onNegativePromptInput(e: any) {
    this.setData({
      negativePrompt: e.detail.value,
      errorMessage: ''
    })
  },

  // 输入随机种子
  onSeedInput(e: any) {
    this.setData({
      seed: e.detail.value,
      errorMessage: ''
    })
  },

  // 切换生成视频
  toggleGenerateVideo(e: any) {
    this.setData({
      generateVideo: e.detail.value.length > 0,
      errorMessage: ''
    })
  },

  // 输入视频提示词
  onVideoPromptInput(e: any) {
    this.setData({
      videoPrompt: e.detail.value,
      errorMessage: ''
    })
  },


  // 生成图片
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

    // 验证必填项（根据后端要求，三张图片都是必填的）
    if (!this.data.image1Path || !this.data.image2Path || !this.data.image3Path) {
      wx.showToast({
        title: '请选择三张图片（图1、图2、图3都是必填）',
        icon: 'none',
        duration: 2000
      })
      return
    }

    const prompt = this.data.prompt.trim()
    if (!prompt) {
      wx.showToast({
        title: '请输入合成提示词',
        icon: 'none'
      })
      return
    }

    if (this.data.generateVideo && !this.data.videoPrompt.trim()) {
      wx.showToast({
        title: '生成视频时需要填写视频提示词',
        icon: 'none'
      })
      return
    }

    this.setData({
      loading: true,
      errorMessage: '',
      generatedImage: '',
      generatedImages: [],
      generatedVideo: ''
    })

    try {
      // 解析参数
      const seed = this.data.seed.trim() ? parseInt(this.data.seed.trim()) : undefined
      const negativePrompt = this.data.negativePrompt.trim() || undefined
      const videoPrompt = this.data.videoPrompt.trim() || undefined

      console.log('开始多图生成，参数:', {
        hasImage1: !!this.data.image1Path,
        hasImage2: !!this.data.image2Path,
        hasImage3: !!this.data.image3Path,
        prompt,
        negativePrompt,
        seed,
        generateVideo: this.data.generateVideo,
        videoPrompt
      })

      // 显示初始加载提示
      wx.showLoading({
        title: '提交任务中...',
        mask: true
      })
      
      // 进度回调，更新加载提示
      const onProgress = (elapsed: number) => {
        const minutes = Math.floor(elapsed / 60)
        const seconds = elapsed % 60
        const timeText = minutes > 0 ? `${minutes}分${seconds}秒` : `${seconds}秒`
        wx.showLoading({
          title: `生成中，已等待${timeText}...`,
          mask: true
        })
      }

      const result = await generateMultiImage(
        this.data.image1Path,
        this.data.image2Path, // 图2必填
        this.data.image3Path, // 图3必填
        prompt,
        negativePrompt,
        seed,
        this.data.generateVideo,
        videoPrompt,
        onProgress
      )
      
      wx.hideLoading()

      console.log('API返回结果:', result)

      // 处理返回结果（类似九宫格，支持多张图片）
      let imageUrl = ''
      let imageUrls: Array<{ url: string, filename?: string }> = []
      let videoUrl = ''

      // 处理图片（支持多种格式，类似九宫格）
      if (result.images && Array.isArray(result.images) && result.images.length > 0) {
        // 多张图片（类似九宫格）
        imageUrls = result.images.map((img: any) => {
          if (typeof img === 'object' && img.url) {
            return { url: img.url, filename: img.filename }
          } else if (typeof img === 'string') {
            return { url: img }
          } else {
            return { url: img }
          }
        })
        // 第一张图片作为主图
        imageUrl = imageUrls[0]?.url || ''
      } else if (result.image_url) {
        imageUrl = result.image_url
        imageUrls = [{ url: result.image_url }]
      } else if (result.data && result.data.image_url) {
        imageUrl = result.data.image_url
        imageUrls = [{ url: result.data.image_url }]
      } else if (result.data && result.data.images && Array.isArray(result.data.images) && result.data.images.length > 0) {
        // 多张图片（类似九宫格）
        imageUrls = result.data.images.map((img: any) => {
          if (typeof img === 'object' && img.url) {
            return { url: img.url, filename: img.filename }
          } else {
            return { url: img }
          }
        })
        imageUrl = imageUrls[0]?.url || ''
      } else if (result.url) {
        imageUrl = result.url
        imageUrls = [{ url: result.url }]
      } else if (typeof result === 'string') {
        imageUrl = result
        imageUrls = [{ url: result }]
      }

      // 处理视频（支持多种格式）
      if (result.videos && Array.isArray(result.videos) && result.videos.length > 0) {
        const firstVideo = result.videos[0]
        if (typeof firstVideo === 'object' && firstVideo.url) {
          videoUrl = firstVideo.url
        } else if (typeof firstVideo === 'string') {
          videoUrl = firstVideo
        } else {
          videoUrl = firstVideo
        }
      } else if (result.video_url) {
        videoUrl = result.video_url
      } else if (result.data && result.data.video_url) {
        videoUrl = result.data.video_url
      } else if (result.data && result.data.videos && Array.isArray(result.data.videos) && result.data.videos.length > 0) {
        const firstVideo = result.data.videos[0]
        if (typeof firstVideo === 'object' && firstVideo.url) {
          videoUrl = firstVideo.url
        } else {
          videoUrl = firstVideo
        }
      }
      
      console.log('提取的图片URL:', imageUrl ? imageUrl.substring(0, 50) + '...' : '未找到')
      console.log('提取的图片数量:', imageUrls.length)
      console.log('提取的视频URL:', videoUrl ? videoUrl.substring(0, 50) + '...' : '未找到')

      // 显示消费信息
      if (result.cost !== undefined) {
        console.log('消费星星数:', result.cost)
        wx.showToast({
          title: `消费${result.cost}星星`,
          icon: 'none',
          duration: 2000
        })
      }

      if (imageUrls.length > 0 || videoUrl) {
        this.setData({
          generatedImage: imageUrl, // 保留第一张图片作为主图（兼容旧代码）
          generatedImages: imageUrls, // 多张图片（类似九宫格）
          generatedVideo: videoUrl,
          loading: false
        })
        
        wx.showToast({
          title: imageUrls.length > 1 ? `生成成功，共${imageUrls.length}张图片` : '生成成功',
          icon: 'success',
          duration: 2000
        })
      } else {
        throw new Error('未获取到图片或视频URL')
      }
    } catch (error: any) {
      wx.hideLoading()
      console.error('生成失败:', error)
      const errorMsg = error.message || '生成失败，请重试'
      
      // 如果是token无效，提示重新登录
      if (errorMsg.includes('Token已过期') || errorMsg.includes('token无效') || errorMsg.includes('not valid')) {
        this.setData({
          errorMessage: errorMsg,
          loading: false,
          isLoggedIn: false,
          showTokenInput: true
        })
        wx.showModal({
          title: 'Token已过期',
          content: '您的Token已过期或无效，请重新登录',
          showCancel: false,
          success: (res) => {
            if (res.confirm) {
              wx.navigateTo({
                url: '/pages/login/login'
              })
            }
          }
        })
      } else {
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
      return
    }

    wx.showLoading({
      title: '保存中...'
    })

    wx.downloadFile({
      url: this.data.generatedImage,
      success: (res) => {
        if (res.statusCode === 200) {
          wx.saveImageToPhotosAlbum({
            filePath: res.tempFilePath,
            success: () => {
              wx.hideLoading()
              wx.showToast({
                title: '保存成功',
                icon: 'success'
              })
            },
            fail: (err) => {
              wx.hideLoading()
              if (err.errMsg.includes('auth deny')) {
                wx.showModal({
                  title: '提示',
                  content: '需要授权访问相册',
                  showCancel: false
                })
              } else {
                wx.showToast({
                  title: '保存失败',
                  icon: 'none'
                })
              }
            }
          })
        } else {
          wx.hideLoading()
          wx.showToast({
            title: '下载失败',
            icon: 'none'
          })
        }
      },
      fail: () => {
        wx.hideLoading()
        wx.showToast({
          title: '下载失败',
          icon: 'none'
        })
      }
    })
  },

  // 保存视频
  saveVideo() {
    if (!this.data.generatedVideo) {
      return
    }

    wx.showLoading({
      title: '保存中...'
    })

    wx.downloadFile({
      url: this.data.generatedVideo,
      success: (res) => {
        if (res.statusCode === 200) {
          wx.saveVideoToPhotosAlbum({
            filePath: res.tempFilePath,
            success: () => {
              wx.hideLoading()
              wx.showToast({
                title: '保存成功',
                icon: 'success'
              })
            },
            fail: (err) => {
              wx.hideLoading()
              if (err.errMsg.includes('auth deny')) {
                wx.showModal({
                  title: '提示',
                  content: '需要授权访问相册',
                  showCancel: false
                })
              } else {
                wx.showToast({
                  title: '保存失败',
                  icon: 'none'
                })
              }
            }
          })
        } else {
          wx.hideLoading()
          wx.showToast({
            title: '下载失败',
            icon: 'none'
          })
        }
      },
      fail: () => {
        wx.hideLoading()
        wx.showToast({
          title: '下载失败',
          icon: 'none'
        })
      }
    })
  },

  // 重新生成
  regenerate() {
    this.setData({
      generatedImage: '',
      generatedVideo: '',
      errorMessage: ''
    })
    this.onGenerate()
  },
  // 用户点击右上角转发按钮时触发
  onShareAppMessage(options: WechatMiniprogram.Page.IShareAppMessageOption) {
    return {
      title: '多图生成 - AI智能体，场景与产品真实海报生成',
      path: '/pages/multi-image-generate/multi-image-generate',
      imageUrl: this.data.generatedImage || undefined
    }
  },
  // 用户点击右上角分享到朋友圈按钮时触发
  onShareTimeline() {
    return {
      title: '多图生成 - AI智能体，场景与产品真实海报生成',
      query: '',
      imageUrl: this.data.generatedImage || undefined
    }
  }
})

