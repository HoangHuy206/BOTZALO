const fs = require('fs');
const path = require('path');
const login = require('fca-unofficial');

const APPSTATE_FILE = path.join(__dirname, 'appstate.json');
const MODERN_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36';

function parseRawCookieString(cookieStr) {
    if (!cookieStr || typeof cookieStr !== 'string') return null;
    const items = cookieStr.split(';').map(item => {
        const parts = item.trim().split('=');
        if (parts.length < 2) return null;
        const key = parts[0].trim();
        const value = parts.slice(1).join('=').trim();
        if (!key || !value) return null;
        return {
            key,
            value,
            domain: "facebook.com",
            path: "/",
            hostOnly: false,
            creation: new Date().toISOString(),
            lastAccessed: new Date().toISOString()
        };
    }).filter(Boolean);
    return items.length > 0 ? items : null;
}

function normalizeAppStateDomains(rawState) {
    if (!Array.isArray(rawState)) return rawState;
    const normalized = [];
    rawState.forEach(c => {
        const cleanCookie = { ...c, path: c.path || '/' };
        normalized.push({ ...cleanCookie, domain: 'facebook.com' });
        normalized.push({ ...cleanCookie, domain: 'www.facebook.com' });
    });
    return normalized;
}

/**
 * Khởi tạo Facebook Personal Account Bot (Messenger Nick Cá Nhân)
 */
function initFbUserBot({ getAIResponse, getMemoryReply, getAIVisionResponse }) {
    if (!fs.existsSync(APPSTATE_FILE)) {
        console.warn('\n⚠️ [Facebook Personal Bot] CHƯA TÌM THẤY FILE appstate.json!');
        console.warn('📌 Vui lòng tạo file d:\\botzalo\\appstate.json chứa cookie để bot kết nối Messenger.\n');
        return;
    }

    let rawAppState;
    try {
        const rawData = fs.readFileSync(APPSTATE_FILE, 'utf8').replace(/^\uFEFF/, '').trim();
        if (rawData.startsWith('[')) {
            rawAppState = JSON.parse(rawData);
        } else if (rawData.includes('c_user=') && rawData.includes('xs=')) {
            rawAppState = parseRawCookieString(rawData);
        } else {
            rawAppState = JSON.parse(rawData);
        }
    } catch (e) {
        console.error('❌ [Facebook Personal Bot] File appstate.json bị lỗi định dạng:', e.message);
        return;
    }

    const appState = normalizeAppStateDomains(rawAppState);

    console.log('🔄 [Facebook Personal Bot] Đang kết nối và đăng nhập vào Nick Facebook cá nhân qua appstate.json...');

    const loginOptions = {
        appState: appState,
        userAgent: MODERN_USER_AGENT
    };

    login(loginOptions, (err, api) => {
        if (err) {
            console.error('❌ [Facebook Personal Bot] Đăng nhập thất bại:', err.error || err.message || err);
            return;
        }

        const myUserID = api.getCurrentUserID();
        console.log(`✅ [Facebook Personal Bot] ĐÃ XÁC THỰC THÀNH CÔNG NICK FACEBOOK [${myUserID}]! 🚀`);

        api.setOptions({
            listenEvents: true,
            selfListen: true, // Bật cho phép lắng nghe tin nhắn từ chính nick bot để dễ tự test
            logLevel: 'silent',
            updatePresence: true,
            userAgent: MODERN_USER_AGENT,
            autoMarkDelivery: true,
            autoMarkRead: false
        });

        // Lưu lại appState mới nhất nếu API cập nhật cookie
        try {
            const freshState = api.getAppState();
            fs.writeFileSync(APPSTATE_FILE, JSON.stringify(freshState, null, 2), 'utf8');
        } catch (e) {}

        // Lắng nghe sự kiện tin nhắn Messenger qua giao thức MQTT
        api.listenMqtt(async (listenErr, event) => {
            if (listenErr) {
                console.error('\n⚠️ [Facebook Personal Bot] Lỗi kết nối MQTT Messenger:', listenErr.error || listenErr.message || listenErr);
                return;
            }

            const { type, body, threadID, messageID, senderID, attachments, isGroup } = event;

            console.log(`📩 [Messenger Event: ${type}] từ Sender ID [${senderID}] (Thread: ${threadID}) | Nội dung: "${body || ''}"`);

            if (type === 'message' || type === 'message_reply') {
                const userText = (body || '').trim();
                const hasPhoto = attachments && attachments.length > 0 && attachments.some(a => a.type === 'photo');

                // 1. Xử lý HÌNH ẢNH
                if (hasPhoto && getAIVisionResponse) {
                    const photoAttachment = attachments.find(a => a.type === 'photo');
                    const photoUrl = photoAttachment.largePreviewUrl || photoAttachment.previewUrl || photoAttachment.url;
                    const caption = userText || 'Hãy phân tích hình ảnh này giúp tôi.';

                    console.log(`🖼️ [Facebook Personal Bot] Nhận ảnh từ ID [${senderID}]: "${photoUrl}"`);
                    
                    try {
                        const visionReply = await getAIVisionResponse(photoUrl, caption);
                        api.sendMessage({ body: visionReply }, threadID, messageID);
                    } catch (e) {
                        console.error('❌ Lỗi Vision AI Messenger:', e.message);
                    }
                }
                // 2. Xử lý VĂN BẢN
                else if (userText) {
                    console.log(`💬 [Facebook Personal Bot] Đang xử lý tin nhắn từ ID [${senderID}]: "${userText}"`);

                    try {
                        const directMemory = getMemoryReply ? getMemoryReply(userText) : null;
                        if (directMemory) {
                            api.sendMessage({ body: directMemory }, threadID, messageID);
                        } else if (getAIResponse) {
                            const aiReply = await getAIResponse(userText, threadID);
                            api.sendMessage({ body: aiReply }, threadID, messageID);
                        }
                    } catch (e) {
                        console.error('❌ Lỗi AI Response Messenger:', e.message);
                    }
                }
            }
        });
    });
}

module.exports = { initFbUserBot };
