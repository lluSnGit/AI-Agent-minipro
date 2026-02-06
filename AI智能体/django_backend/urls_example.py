"""
Django URL 路由配置示例
将以下路由添加到您的主 urls.py 文件中
"""
from django.urls import path
from . import dify_views  # 或者 from your_app import dify_views

urlpatterns = [
    # ... 您现有的路由 ...
    
    # Dify 智能客服接口
    path('api/dify/chat', dify_views.dify_chat, name='dify-chat'),
]

