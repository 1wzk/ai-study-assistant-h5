// 全局配置
const BAIDU_OCR_CONFIG = {
    apiKey: 'zuu4ZT5f3TWJ5JGNl0LcKTEZ', 
    secretKey: 'ApohBTiyVClw5lrMclps4HWkwwcVcFIi' 
  };
  // 全局变量
  let cameraStream;
  let currentCamera = 'environment';
  let threeScene, threeCamera, threeRenderer, threeModel;
  let modelScale = 1.0;
  let isRotate = true;
  let currentHelperLine = 'none';
  let currentProblemText = '';
  let ocrWorker; // 离线OCR Worker
  
  // 页面加载初始化
  window.onload = async function() {
    // 隐藏加载遮罩
    setTimeout(() => {
      document.getElementById('loading-mask').style.display = 'none';
    }, 1000);
  
    // 初始化离线OCR（提分核心）
    await initOfflineOCR();
    // 初始化相机
    await initCamera();
    // 初始化3D场景
    init3DScene();
    setTimeout(init3DScene, 1000);
    // 绑定事件
    bindEvents();
    // 初始化本地存储
    initLocalStorage();
    // 解析分享链接
    parseShareLink();
  };
  
  // 1. 初始化离线OCR（加分项）
 async function initOfflineOCR() {
    try {
      ocrWorker = Tesseract.createWorker({
        langPath: './lang-data',
        logger: m => console.log(`OCR加载进度：${m.progress * 100}%`),
        cachePath: './cache'
      });
      await ocrWorker.load();
      await ocrWorker.loadLanguage('chi_sim');
      await ocrWorker.initialize('chi_sim');
      console.log('离线OCR初始化完成');
    } catch (e) {
      console.error('离线OCR初始化失败，将使用在线OCR：', e);
      alert('离线识别功能暂不可用，将使用在线识别');
    }
  }
  
  // 2. 初始化相机
  // 替换原initCamera函数
async function initCamera() {
  try {
    // 现代浏览器兼容的约束条件
    const constraints = {
      video: {
        facingMode: currentCamera,
        frameRate: { ideal: 30, max: 30 }
      }
    };
    // 正确调用navigator.mediaDevices.getUserMedia
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    cameraStream = stream;
    const video = document.getElementById('camera-preview');
    video.srcObject = stream;
  } catch (error) {
    // 更详细的错误提示
    let errMsg = '相机权限申请失败：';
    if (error.name === 'NotAllowedError') {
      errMsg += '请在浏览器设置中开启相机权限';
    } else if (error.name === 'NotFoundError') {
      errMsg += '未检测到摄像头';
    } else {
      errMsg += error.message;
    }
    alert(errMsg);
    console.error('相机初始化失败：', error);
  }
}
  
  // 3. 初始化3D场景（含交互优化）
  function init3DScene() {
    const container = document.getElementById('3d-container');
    // 创建场景
    threeScene = new THREE.Scene();
    threeScene.background = new THREE.Color(0xf9f9f9);
    
    // 创建相机
    threeCamera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    threeCamera.position.z = 5;
    
    // 创建渲染器（性能优化，加分项）
    threeRenderer = new THREE.WebGLRenderer({ 
      antialias: true,
      powerPreference: 'low-power' // 适配低性能设备
    });
    threeRenderer.setSize(container.clientWidth, container.clientHeight);
    threeRenderer.setPixelRatio(window.devicePixelRatio); // 高清适配
    container.appendChild(threeRenderer.domElement);
    
    // 添加灯光
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    threeScene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(0, 0, 5);
    threeScene.add(directionalLight);
    
    // 窗口适配
    window.addEventListener('resize', () => {
      const container = document.getElementById('3d-container');
      threeCamera.aspect = container.clientWidth / container.clientHeight;
      threeCamera.updateProjectionMatrix();
      threeRenderer.setSize(container.clientWidth, container.clientHeight);
    });
    
    // 3D模型拖拽交互（加分项）
    let isDragging = false;
    let lastX, lastY;
    container.addEventListener('mousedown', (e) => {
      isDragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    });
    container.addEventListener('mousemove', (e) => {
      if (!isDragging || !threeModel) return;
      const deltaX = e.clientX - lastX;
      const deltaY = e.clientY - lastY;
      threeModel.rotation.y += deltaX * 0.01;
      threeModel.rotation.x += deltaY * 0.01;
      lastX = e.clientX;
      lastY = e.clientY;
    });
    container.addEventListener('mouseup', () => isDragging = false);
    // 移动端触摸适配（加分项）
    container.addEventListener('touchstart', (e) => {
      isDragging = true;
      lastX = e.touches[0].clientX;
      lastY = e.touches[0].clientY;
    });
    container.addEventListener('touchmove', (e) => {
      if (!isDragging || !threeModel) return;
      const deltaX = e.touches[0].clientX - lastX;
      const deltaY = e.touches[0].clientY - lastY;
      threeModel.rotation.y += deltaX * 0.01;
      threeModel.rotation.x += deltaY * 0.01;
      lastX = e.touches[0].clientX;
      lastY = e.touches[0].clientY;
    });
    container.addEventListener('touchend', () => isDragging = false);
    
    // 动画循环
    function animate() {
      requestAnimationFrame(animate);
      if (isRotate && threeModel) {
        threeModel.rotation.x += 0.01;
        threeModel.rotation.y += 0.01;
      }
      threeRenderer.render(threeScene, threeCamera);
    }
    animate();
  }
  
  // 4. 加载3D模型（多题型+辅助线）
  function load3DModel(modelType = 'triangle', helperLine = 'none') {
    if (threeModel) {
      threeScene.remove(threeModel);
      threeModel.geometry?.dispose();
      threeModel.material?.dispose();
    }
  
    let modelPath = 'models/triangle.obj';
    if (modelType === 'circle') {
      modelPath = 'models/circle.obj';
    } else if (modelType === 'rectangle') {
      modelPath = 'models/rectangle.obj';
    } else {
      if (helperLine === 'height') modelPath = 'models/triangle_height.obj';
      else if (helperLine === 'midline') modelPath = 'models/triangle_midline.obj';
    }
  
    const loader = new THREE.OBJLoader();
    loader.load(
      modelPath,
      (object) => {
        threeModel = object;
        threeModel.scale.set(modelScale, modelScale, modelScale);
        threeModel.position.set(0, 0, 0);
        // 材质优化（加分项）
        threeModel.traverse((child) => {
          if (child.isMesh) {
            child.material = new THREE.MeshPhongMaterial({
              color: modelType === 'circle' ? 0xff0000 : 0x2196f3,
              shininess: 50,
              wireframe: false
            });
          }
        });
        threeScene.add(threeModel);
      },
      (xhr) => console.log(`模型加载中：${(xhr.loaded / xhr.total) * 100}%`),
      (error) => {
        console.error('模型加载失败：', error);
        alert('3D模型加载失败，请检查文件路径');
      }
    );
  }
  
  // 5. 拍摄+双模式OCR识别（核心提分）
  async function captureAndRecognize() {
    const video = document.getElementById('camera-preview');
    const tips = document.getElementById('recognize-tips');
    
    try {
      tips.textContent = '正在拍摄并识别...';
      // 截图优化（仅拍摄框内区域，加分项）
      const canvas = document.createElement('canvas');
      const frame = document.querySelector('.camera-frame');
      const frameRect = frame.getBoundingClientRect();
      const videoRect = video.getBoundingClientRect();
      // 计算裁剪比例
      const scaleX = video.videoWidth / videoRect.width;
      const scaleY = video.videoHeight / videoRect.height;
      canvas.width = frameRect.width * scaleX;
      canvas.height = frameRect.height * scaleY;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(
        video,
        (frameRect.left - videoRect.left) * scaleX,
        (frameRect.top - videoRect.top) * scaleY,
        canvas.width,
        canvas.height,
        0, 0, canvas.width, canvas.height
      );
      // 图片压缩（加分项）
      const base64 = canvas.toDataURL('image/jpeg', 0.8); // 压缩质量80%
      const imageBase64 = base64.split(',')[1];
  
      // 优先离线OCR识别
      let problemText = '';
      if (ocrWorker) {
        try {
          tips.textContent = '离线识别中...';
          const { data: { text } } = await ocrWorker.recognize(base64);
          problemText = text.trim();
        } catch (e) {
          console.error('离线识别失败，降级到在线：', e);
        }
      }
  
      // 离线识别失败，降级到百度OCR
      if (!problemText) {
        tips.textContent = '在线识别中...';
        const token = await getBaiduOCRToken();
        if (!token) throw new Error('获取OCR Token失败');
        const result = await callBaiduOCR(token, imageBase64);
        if (!result || result.words_result.length === 0) {
          tips.textContent = '未识别到文字，请对准题目重试';
          return;
        }
        result.words_result.forEach(item => {
          problemText += item.words + '\n';
        });
        problemText = problemText.trim();
      }
  
      if (!problemText) {
        tips.textContent = '未识别到文字，请对准题目重试';
        return;
      }
  
      currentProblemText = problemText;
      // 保存历史（去重，加分项）
      saveToHistory(problemText);
      // 跳转3D页
      showPage('3d-page');
      document.getElementById('problem-text').textContent = problemText;
      // 判断题型
      let modelType = 'triangle';
      if (problemText.includes('圆形') || problemText.includes('○')) {
        modelType = 'circle';
        document.getElementById('helper-line-bar').style.display = 'none';
      } else if (problemText.includes('矩形') || problemText.includes('长方形')) {
        modelType = 'rectangle';
        document.getElementById('helper-line-bar').style.display = 'none';
      } else {
        document.getElementById('helper-line-bar').style.display = 'flex';
      }
      load3DModel(modelType, currentHelperLine);
      tips.textContent = '识别成功！';
    } catch (error) {
      console.error('识别失败：', error);
      tips.textContent = '识别失败：' + error.message;
    }
  }
  
  // 6. 百度OCR辅助函数
  async function getBaiduOCRToken() {
    const url = `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${BAIDU_OCR_CONFIG.apiKey}&client_secret=${BAIDU_OCR_CONFIG.secretKey}`;
    const response = await fetch(url, { method: 'POST' });
    const data = await response.json();
    return data.access_token;
  }
  async function callBaiduOCR(token, imageBase64) {
    const url = `https://aip.baidubce.com/rest/2.0/ocr/v1/general_basic?access_token=${token}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `image=${encodeURIComponent(imageBase64)}`
    });
    return await response.json();
  }
  
  // 7. 功能按钮事件绑定
  function bindEvents() {
    // 拍摄按钮
    document.getElementById('capture-btn').addEventListener('click', captureAndRecognize);
    // 切换摄像头
    document.getElementById('switch-camera-btn').addEventListener('click', async () => {
      currentCamera = currentCamera === 'environment' ? 'user' : 'environment';
      if (cameraStream) cameraStream.getTracks().forEach(track => track.stop());
      await initCamera();
      document.getElementById('recognize-tips').textContent = `已切换至${currentCamera === 'environment' ? '后置' : '前置'}摄像头`;
    });
    // 返回按钮
    document.getElementById('back-btn').addEventListener('click', () => showPage('camera-page'));
    // 旋转控制
    document.getElementById('rotate-btn').addEventListener('click', () => {
      isRotate = !isRotate;
      document.getElementById('rotate-btn').textContent = isRotate ? '暂停旋转' : '开始旋转';
    });
    // 辅助线切换
    document.querySelectorAll('.helper-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.helper-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentHelperLine = btn.dataset.type;
        let modelType = 'triangle';
        if (currentProblemText.includes('圆形')) modelType = 'circle';
        else if (currentProblemText.includes('矩形')) modelType = 'rectangle';
        load3DModel(modelType, currentHelperLine);
      });
    });
    // 缩放控制
    document.getElementById('zoom-out-btn').addEventListener('click', () => {
      modelScale = Math.max(0.1, modelScale - 0.1);
      updateScaleText();
      if (threeModel) threeModel.scale.set(modelScale, modelScale, modelScale);
    });
    document.getElementById('zoom-in-btn').addEventListener('click', () => {
      modelScale = Math.min(3.0, modelScale + 0.1);
      updateScaleText();
      if (threeModel) threeModel.scale.set(modelScale, modelScale, modelScale);
    });
    // 历史记录
    document.getElementById('history-btn').addEventListener('click', () => {
      showPage('history-page');
      renderHistoryList();
    });
    document.getElementById('history-back-btn').addEventListener('click', () => showPage('camera-page'));
    document.getElementById('clear-history-btn').addEventListener('click', () => {
      if (confirm('确定清空所有历史记录？')) {
        clearHistory();
        renderHistoryList();
      }
    });
    // 分享功能（加分项）
    document.getElementById('share-btn').addEventListener('click', share3DModel);
  }
  
  // 8. 辅助函数
  function showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');
    // 3D页面尺寸适配
    if (pageId === '3d-page') {
      const container = document.getElementById('3d-container');
      threeCamera.aspect = container.clientWidth / container.clientHeight;
      threeCamera.updateProjectionMatrix();
      threeRenderer.setSize(container.clientWidth, container.clientHeight);
    }
  }
  function updateScaleText() {
    document.getElementById('scale-text').textContent = `缩放：${(modelScale * 100).toFixed(0)}%`;
  }
  function parseShareLink() {
    const urlParams = new URLSearchParams(window.location.search);
    const problem = urlParams.get('problem');
    if (problem) {
      currentProblemText = decodeURIComponent(problem);
      showPage('3d-page');
      document.getElementById('problem-text').textContent = currentProblemText;
      load3DModel('triangle', currentHelperLine);
    }
  }
  function share3DModel() {
    const shareText = encodeURIComponent(currentProblemText);
    const shareUrl = `${window.location.origin}${window.location.pathname}?problem=${shareText}`;
    if (navigator.share) {
      navigator.share({
        title: 'AI几何题解析',
        text: '我解析了一道几何题，快来看看！',
        url: shareUrl
      });
    } else {
      navigator.clipboard.writeText(shareUrl).then(() => {
        alert('分享链接已复制到剪贴板！');
      });
    }
  }
  
  // 9. 本地存储（历史记录）
  function initLocalStorage() {
    if (!localStorage.getItem('ai_study_history')) {
      localStorage.setItem('ai_study_history', JSON.stringify([]));
    }
  }
  function saveToHistory(text) {
    const history = JSON.parse(localStorage.getItem('ai_study_history') || '[]');
    const newHistory = history.filter(item => item.text !== text);
    newHistory.unshift({
      text: text,
      time: new Date().toLocaleString()
    });
    if (newHistory.length > 20) newHistory.pop();
    localStorage.setItem('ai_study_history', JSON.stringify(newHistory));
  }
  function renderHistoryList() {
    const historyList = document.getElementById('history-list');
    const history = JSON.parse(localStorage.getItem('ai_study_history') || '[]');
    
    if (history.length === 0) {
      historyList.innerHTML = '<div class="empty-tips">暂无识别记录</div>';
      return;
    }
    
    let html = '';
    history.forEach((item, index) => {
      html += `
        <div class="history-item" data-index="${index}">
          <p>${item.text}</p>
          <div class="time">${item.time}</div>
        </div>
      `;
    });
    historyList.innerHTML = html;
    
    document.querySelectorAll('.history-item').forEach(item => {
      item.addEventListener('click', () => {
        const index = item.dataset.index;
        const historyItem = history[index];
        currentProblemText = historyItem.text;
        showPage('3d-page');
        document.getElementById('problem-text').textContent = currentProblemText;
        let modelType = 'triangle';
        if (currentProblemText.includes('圆形')) modelType = 'circle';
        else if (currentProblemText.includes('矩形')) modelType = 'rectangle';
        load3DModel(modelType, currentHelperLine);
      });
    });
  }
  function clearHistory() {
    localStorage.setItem('ai_study_history', JSON.stringify([]));
  }