const express = require('express');
const bodyParser = require('body-parser');
// 华为云 OBS SDK
const ObsClient = require('esdk-obs-nodejs');

const app = express();
const PORT = 3000;

// === 1. Huawei OBS 配置 (已填入你的 AK/SK) ===
const obsClient = new ObsClient({
    access_key_id: 'HPUAWYPM9B1M56SUHHD6',
    secret_access_key: '5Ikx6AX1mVEWoO2yyULrjRLXUDR4abrbNbuzAWWt',
    server: 'https://obs.cn-southwest-2.myhuaweicloud.com', // 西南-贵阳一节点
});

const BUCKET_NAME = 'taluopai'; // 你的桶名称

// === 中间件配置 ===
app.use((req, res, next) => {
    // 打印每一个收到的请求，方便你查看
    console.log(`[${new Date().toLocaleTimeString()}] 收到请求: ${req.method} ${req.url}`);
    next();
});

// 设置上传大小限制为 50MB，防止备份文件太大报错
app.use(bodyParser.json({ limit: '50mb' })); 
app.use(bodyParser.urlencoded({ extended: true }));

// === 首页测试接口 ===
// 如果你访问 http://服务器IP:3000 看到这句话，说明服务跑起来了
app.get('/', (req, res) => {
    res.send('<h1>恭喜！治愈之书服务器启动成功！(华为云版)</h1>');
});

// === 华为 Token 简易验证逻辑 (模拟) ===
const verifyHuaweiToken = async (token, reqUserId) => {
    if (!token) return false;
    try {
        // 这里做一个简单的解码验证，实际项目建议加更严格的签名校验
        const parts = token.split('.');
        if (parts.length !== 3) return false;
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
        
        // 只要 Token 是华为颁发的，且属于当前用户，就放行
        if (payload.iss && payload.iss.includes('huawei.com') && payload.sub === reqUserId) {
            return true;
        }
        return false;
    } catch (e) {
        return false;
    }
};

// ==========================================
// 接口 1: 数据备份 (上传 JSON 到 OBS)
// ==========================================
app.post('/api/sync/upload', async (req, res) => {
    const { userId, token, data } = req.body;
    
    console.log(`正在尝试备份用户数据: ${userId}`);

    if (!userId || !data) return res.status(400).json({ code: 400, msg: '缺少参数' });

    // 1. 验证 Token
    if (await verifyHuaweiToken(token, userId)) {
        try {
            const objectKey = `user_data/${userId}.json`;
            
            // 2. 上传到 OBS
            await obsClient.putObject({
                Bucket: BUCKET_NAME,
                Key: objectKey,
                Body: JSON.stringify(data),
                ContentType: 'application/json'
            });

            console.log(`✅ 备份成功！文件已存入 OBS: ${objectKey}`);
            res.json({ code: 200, msg: '云端备份成功' });
        } catch (error) {
            console.error('❌ OBS 上传出错:', error);
            res.status(500).json({ code: 500, msg: '云端存储异常' });
        }
    } else {
        console.log('❌ Token 验证失败');
        res.status(401).json({ code: 401, msg: '身份验证失败' });
    }
});

// ==========================================
// 接口 2: 数据恢复 (从 OBS 下载 JSON)
// ==========================================
app.post('/api/sync/download', async (req, res) => {
    const { userId, token } = req.body;
    
    console.log(`正在尝试恢复用户数据: ${userId}`);

    if (await verifyHuaweiToken(token, userId)) {
        try {
            const objectKey = `user_data/${userId}.json`;
            
            // 2. 从 OBS 下载
            const result = await obsClient.getObject({
                Bucket: BUCKET_NAME,
                Key: objectKey,
                SaveAsStream: false // 直接拿内容字符串
            });

            if (result.CommonMsg.Status < 300 && result.InterfaceResult) {
                const content = result.InterfaceResult.Content.toString();
                console.log(`✅ 恢复成功！已读取数据。`);
                res.json({ code: 200, msg: '获取成功', data: JSON.parse(content) });
            } else {
                // 如果状态码是 404，说明文件不存在（用户还没备份过）
                if (result.CommonMsg.Status === 404) {
                     console.log('⚠️ 用户没有备份过数据');
                     res.json({ code: 200, msg: '无云端备份', data: null });
                } else {
                     throw new Error(`OBS Error: ${result.CommonMsg.Status}`);
                }
            }
        } catch (error) {
            if (error.toString().includes('404') || (error.CommonMsg && error.CommonMsg.Status === 404)) {
                res.json({ code: 200, msg: '无云端备份', data: null });
            } else {
                console.error('❌ OBS 下载出错:', error);
                res.status(500).json({ code: 500, msg: '云端读取异常' });
            }
        }
    } else {
        res.status(401).json({ code: 401, msg: '身份验证失败' });
    }
});

// ==========================================
// 接口 3: AI 对话 (模拟接口)
// ==========================================
app.post('/api/ai/chat', async (req, res) => {
    console.log('收到 AI 对话请求...');
    // 模拟一个回复，防止前端报错
    const mockReply = {
        choices: [{ message: { content: "（来自华为云的回复）这是一张非常有深意的牌，它象征着..." } }]
    };
    // 延迟 1 秒返回，模拟思考
    setTimeout(() => { 
        res.json({ result: mockReply }); 
        console.log('已发送 AI 回复');
    }, 1000);
});

// 启动服务
app.listen(PORT, '0.0.0.0', () => {
    console.log('-----------------------------------------------------');
    console.log(`🚀 治愈之书后端服务已启动！`);
    console.log(`📡 正在监听端口: ${PORT}`);
    console.log(`📦 连接 OBS 桶: ${BUCKET_NAME}`);
    console.log('-----------------------------------------------------');
});