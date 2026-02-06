import requests
import json
import os
import time
import uuid
import random

# ================= 配置区域 (自定义修改这里) =================
SERVER_URL = "https://u143265--7643f9efaf6e.westd.seetacloud.com:8443"  # 您的服务器地址
API_KEY = "comfyui-3c430f65a5d2e04a2dbbee5682c3fdc843b2e9684df126bb680ccaa37d7ca1a1"  # 您的 API Key

# 工作流文件路径
WORKFLOW_FILE = "mul (1).json"

# --- 图片输入配置 ---
# 对应 mul.json 中的节点 94 (Load Character Image)
INPUT_IMAGE_PATH = "./OIP.jpg"

# 结果保存目录
OUTPUT_FOLDER = "./output_results_mul"
# ===============================================================

requests.packages.urllib3.disable_warnings()


class ComfyUIClient:
    def __init__(self, server_url, api_key):
        self.server_url = server_url
        self.headers = {
            "Authorization": f"Bearer {api_key}"
        }

    def upload_image(self, image_path):
        """上传图片到 ComfyUI 服务器"""
        if not os.path.exists(image_path):
            raise FileNotFoundError(f"找不到图片: {image_path}")

        print(f"📤 正在上传: {os.path.basename(image_path)} ...")

        with open(image_path, 'rb') as f:
            files = {'image': f}
            data = {'overwrite': 'true'}
            response = requests.post(
                f"{self.server_url}/upload/image",
                files=files,
                data=data,
                headers=self.headers,
                verify=False
            )

        if response.status_code == 200:
            result = response.json()
            filename = result.get('name')
            if result.get('subfolder'):
                filename = os.path.join(result.get('subfolder'), filename)
            print(f"✅ 上传成功: {filename}")
            return filename
        else:
            raise Exception(f"图片上传失败: {response.text}")

    def queue_prompt(self, workflow_data):
        """提交任务"""
        p = {"prompt": workflow_data, "client_id": str(uuid.uuid4())}
        data = json.dumps(p).encode('utf-8')
        headers = self.headers.copy()
        headers["Content-Type"] = "application/json"

        response = requests.post(
            f"{self.server_url}/prompt",
            data=data,
            headers=headers,
            verify=False
        )

        if response.status_code == 200:
            return response.json()['prompt_id']
        else:
            raise Exception(f"任务提交失败: {response.text}")

    def get_history(self, prompt_id):
        """获取历史记录"""
        response = requests.get(
            f"{self.server_url}/history/{prompt_id}",
            headers=self.headers,
            verify=False
        )
        return response.json()

    def download_file(self, filename, subfolder, file_type, save_dir):
        """下载文件"""
        params = {
            "filename": filename,
            "subfolder": subfolder,
            "type": file_type
        }

        print(f"⬇️ 正在下载: {filename} ...")
        response = requests.get(
            f"{self.server_url}/view",
            params=params,
            headers=self.headers,
            verify=False,
            stream=True
        )

        if response.status_code == 200:
            os.makedirs(save_dir, exist_ok=True)
            save_path = os.path.join(save_dir, filename)
            with open(save_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=1024):
                    if chunk:
                        f.write(chunk)
            print(f"💾 已保存: {os.path.abspath(save_path)}")
            return save_path
        else:
            print(f"❌ 下载失败: {response.text}")
            return None

    def track_and_save(self, prompt_id, save_dir):
        """轮询并保存所有输出"""
        print(f"⏳ 任务 ID: {prompt_id} 执行中，请稍候...")

        start_time = time.time()
        while True:
            history = self.get_history(prompt_id)
            if prompt_id in history:
                print(f"✅ 任务完成！耗时: {int(time.time() - start_time)}秒")
                outputs = history[prompt_id].get('outputs', {})

                if not outputs:
                    print("⚠️ 任务显示完成，但没有输出文件。")
                    return

                for node_id, node_output in outputs.items():
                    # 处理图片输出
                    if 'images' in node_output:
                        for image in node_output['images']:
                            self.download_file(image['filename'], image['subfolder'], image['type'], save_dir)

                    # mul.json 似乎只输出图片，但保留gif逻辑以防万一
                    if 'gifs' in node_output:
                        for video in node_output['gifs']:
                            self.download_file(video['filename'], video['subfolder'], video['type'], save_dir)
                break
            else:
                time.sleep(3)


def main():
    try:
        client = ComfyUIClient(SERVER_URL, API_KEY)

        # 1. 读取工作流
        print(f"📂 读取工作流文件: {WORKFLOW_FILE} ...")
        with open(WORKFLOW_FILE, 'r', encoding='utf-8') as f:
            workflow = json.load(f)

        # 2. 上传输入图片
        img_server_filename = client.upload_image(INPUT_IMAGE_PATH)

        # 3. 修改工作流参数
        print("🔧 正在修改工作流参数...")

        # --- 修改 A: 关联图片节点 (Node 94) ---
        if "94" in workflow:
            workflow["94"]["inputs"]["image"] = img_server_filename
            print(f"   - 节点 94 (LoadImage) 已关联: {os.path.basename(INPUT_IMAGE_PATH)}")
        else:
            print("⚠️ 警告: 未在工作流中找到节点 94，图片可能未正确设置。")

        # --- 修改 B: 随机化所有采样器的 Seed ---
        # mul.json 中有大量的 KSampler (如 83:33:21, 83:37:21 等)
        # 遍历所有节点，如果有 seed 参数，则设置为随机数
        random_seed = random.randint(1, 1000000000000000)
        seed_count = 0

        for node_id, node_info in workflow.items():
            if "inputs" in node_info and "seed" in node_info["inputs"]:
                # 这是一个带有种子的节点 (通常是 KSampler)
                node_info["inputs"]["seed"] = random_seed
                seed_count += 1

        print(f"   - 已更新 {seed_count} 个节点的随机种子为: {random_seed}")

        # 4. 提交并运行
        print("🚀 提交任务到服务器...")
        prompt_id = client.queue_prompt(workflow)

        # 5. 等待并下载结果
        client.track_and_save(prompt_id, OUTPUT_FOLDER)

    except Exception as e:
        print(f"❌ 程序发生错误: {e}")


if __name__ == "__main__":
    main()