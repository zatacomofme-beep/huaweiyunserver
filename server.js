const express = require('express');
const bodyParser = require('body-parser');
const ObsClient = require('esdk-obs-nodejs');

// 🟢 核心：引入 dotenv，自动读取 .env 文件里的密码
require('dotenv').config();

const app = express();
const PORT = 3000;

// === 安全自检 ===
if (!process.env.HUAWEI_OBS_AK || !process.env.HUAWEI_OBS_SK) {
    console.error('❌ 错误: 未找到 AK/SK 配置！');
    console.error('👉 请检查文件夹下是否创建了 .env 文件，并填入了正确的 AccessKey 和 SecretKey。');
    process.exit(1); // 缺少密码直接停止，防止空跑
}

// 🟢 核心：从环境变量读取配置 (不再写死字符串)
const obsClient = new ObsClient({
    access_key_id: process.env.HUAWEI_OBS_AK,
    secret_access_key: process.env.HUAWEI_OBS_SK,
    server: process.env.HUAWEI_OBS_SERVER || 'https://obs.cn-southwest-2.myhuaweicloud.com',
});

const BUCKET_NAME = process.env.HUAWEI_OBS_BUCKET || 'taluopai';

app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString()}] 收到请求: ${req.method} ${req.url}`);
    next();
});

app.use(bodyParser.json({ limit: '50mb' })); 
app.use(bodyParser.urlencoded({ extended: true }));

// 测试接口
app.get('/', (req, res) => {
    res.send('<h1>✅ 治愈之书服务器 (Windows安全版) 已启动</h1>');
});

// Token 验证
const verifyHuaweiToken = async (token, reqUserId) => {
    if (!token) return false;
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return false;
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
        if (payload.iss && payload.iss.includes('huawei.com') && payload.sub === reqUserId) {
            return true;
        }
        return false;
    } catch (e) {
        return false;
    }
};

// 上传接口
app.post('/api/sync/upload', async (req, res) => {
    const { userId, token, data } = req.body;
    console.log(`📥 正在备份用户: ${userId}`);

    if (!userId || !data) return res.status(400).json({ code: 400, msg: '缺少参数' });

    if (await verifyHuaweiToken(token, userId)) {
        try {
            const objectKey = `user_data/${userId}.json`;
            
            await obsClient.putObject({
                Bucket: BUCKET_NAME,
                Key: objectKey,
                Body: JSON.stringify(data),
                ContentType: 'application/json'
            });

            console.log(`✅ 备份成功: ${objectKey}`);
            res.json({ code: 200, msg: '云端备份成功' });
        } catch (error) {
            console.error('❌ 上传失败:', error);
            res.status(500).json({ code: 500, msg: '存储异常' });
        }
    } else {
        res.status(401).json({ code: 401, msg: '身份验证失败' });
    }
});

// 下载接口
app.post('/api/sync/download', async (req, res) => {
    const { userId, token } = req.body;
    console.log(`📤 正在恢复用户: ${userId}`);

    if (await verifyHuaweiToken(token, userId)) {
        try {
            const objectKey = `user_data/${userId}.json`;
            
            const result = await obsClient.getObject({
                Bucket: BUCKET_NAME,
                Key: objectKey,
                SaveAsStream: false 
            });

            if (result.CommonMsg.Status < 300 && result.InterfaceResult) {
                const content = result.InterfaceResult.Content.toString();
                console.log(`✅ 恢复成功`);
                res.json({ code: 200, msg: '获取成功', data: JSON.parse(content) });
            } else {
                if (result.CommonMsg.Status === 404) {
                     console.log('⚠️ 未找到备份文件');
                     res.json({ code: 200, msg: '无云端备份', data: null });
                } else {
                     throw new Error(`OBS Error: ${result.CommonMsg.Status}`);
                }
            }
        } catch (error) {
            if (error.toString().includes('404') || (error.CommonMsg && error.CommonMsg.Status === 404)) {
                res.json({ code: 200, msg: '无云端备份', data: null });
            } else {
                console.error('❌ 下载失败:', error);
                res.status(500).json({ code: 500, msg: '读取异常' });
            }
        }
    } else {
        res.status(401).json({ code: 401, msg: '身份验证失败' });
    }
});

// AI 接口 (Mock)
app.post('/api/ai/chat', async (req, res) => {
    console.log('🤖 收到 AI 请求');
    setTimeout(() => { 
        res.json({ result: { choices: [{ message: { content: "（来自治愈之书的回复）星光不问赶路人，时光不负有心人。请根据牌面指引，相信直觉。" } }] } }); 
    }, 1000);
});

// 启动
app.listen(PORT, '0.0.0.0', () => {
    console.log('-----------------------------------------------------');
    console.log(`🚀 服务已启动 (Windows)`);
    console.log(`📡 端口: ${PORT}`);
    if (process.env.HUAWEI_OBS_AK) {
        console.log(`🔒 安全检查: 已成功从 .env 文件加载密钥`);
    } else {
        console.log(`⚠️ 警告: 未检测到密钥，请检查配置！`);
    }
    console.log('-----------------------------------------------------');
});