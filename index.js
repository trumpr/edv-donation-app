const express = require('express');
const cors = require('cors');
const path = require('path');
const storage = require('./src/data/storage');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '15mb' }));
app.use(cors());
app.use(express.static(path.join(__dirname)));

// API: Get campaigns
app.get('/api/campaigns', (req, res) => {
    res.json(storage.data.campaigns);
});

// API: Login or Register with 4-digit PIN
app.post('/api/login', (req, res) => {
    const { username, pin } = req.body;
    if (!username || !pin) {
        return res.status(400).json({ success: false, message: 'İştirakçı adı və 4-rəqəmli PIN tələb olunur.' });
    }
    if (pin.length !== 4 || isNaN(pin)) {
        return res.status(400).json({ success: false, message: 'PIN tam 4 rəqəmli olmalıdır.' });
    }

    const u = username.trim();
    if (!storage.data.users[u]) {
        // New user registration
        storage.data.users[u] = {
            pin: pin,
            donationsCount: 0,
            points: 0,
            hearts: 0,
            age: '',
            region: '',
            avatarBase64: '',
            blockedUsers: []
        };
        storage.saveUsers();
        return res.json({ success: true, message: 'Qeydiyyat uğurla tamamlandı!', user: storage.data.users[u] });
    }

    // Existing user login
    if (storage.data.users[u].pin && storage.data.users[u].pin !== pin) {
        return res.json({ success: false, message: 'Yanlış 4-rəqəmli PIN!' });
    }

    if (!storage.data.users[u].pin) {
        storage.data.users[u].pin = pin;
        storage.saveUsers();
    }

    // Ensure properties exist for older users
    if (storage.data.users[u].hearts === undefined) {
        storage.data.users[u].hearts = storage.data.users[u].donationsCount || 0;
    }
    if (!storage.data.users[u].blockedUsers) {
        storage.data.users[u].blockedUsers = [];
    }
    storage.saveUsers();

    res.json({ success: true, message: 'Uğurla daxil oldunuz!', user: storage.data.users[u] });
});

// API: Submit receipt photo (1 receipt = 1 Heart 💚 earned)
app.post('/api/donate', (req, res) => {
    const { username, campaignId, qrData, imageBase64 } = req.body;

    if (!username) {
        return res.status(400).json({ success: false, message: 'İstifadəçi adı tələb olunur.' });
    }

    const u = username.trim();
    const receiptEntry = {
        id: Date.now().toString(),
        username: u,
        campaignId: campaignId || '1',
        qrData: qrData || 'Çek Şəkli',
        imageBase64: imageBase64 || null,
        timestamp: new Date().toISOString()
    };

    storage.data.receipts.push(receiptEntry);
    storage.saveReceipts();

    // Update campaign progress (1 receipt)
    const campaign = storage.data.campaigns.find(c => c.id === campaignId);
    if (campaign) {
        campaign.current += 1;
        storage.saveCampaigns();
    }

    // Update user stats
    if (!storage.data.users[u]) {
        storage.data.users[u] = { pin: '0000', donationsCount: 0, points: 0, hearts: 0, age: '', region: '', avatarBase64: '', blockedUsers: [] };
    }
    storage.data.users[u].donationsCount += 1;
    storage.data.users[u].points += 10; // 10 points per receipt photo
    storage.data.users[u].hearts = (storage.data.users[u].hearts || 0) + 1; // Earns 1 Heart!
    storage.saveUsers();

    res.json({
        success: true,
        message: 'Təşəkkürlər! Çek şəkliniz qeydə alındı və balansınıza 1 Ürək 💚 əlavə olundu!',
        user: storage.data.users[u],
        campaign
    });
});

// API: Update user profile and sync avatar across past comments
app.post('/api/profile', (req, res) => {
    const { username, age, region, avatarBase64 } = req.body;
    if (!username) {
        return res.status(400).json({ success: false, message: 'İstifadəçi adı tələb olunur.' });
    }

    const u = username.trim();
    if (!storage.data.users[u]) {
        storage.data.users[u] = { pin: '0000', donationsCount: 0, points: 0, hearts: 0, age: '', region: '', avatarBase64: '', blockedUsers: [] };
    }

    storage.data.users[u].age = age || '';
    storage.data.users[u].region = region || '';
    if (avatarBase64) {
        storage.data.users[u].avatarBase64 = avatarBase64;

        // Sync avatar across all past comments and replies by this user
        storage.data.comments.forEach(c => {
            if (c.username.toLowerCase() === u.toLowerCase()) {
                c.avatarBase64 = avatarBase64;
            }
            if (c.replyTo && c.replyTo.toLowerCase() === u.toLowerCase()) {
                c.replyToAvatar = avatarBase64;
            }
        });
        storage.saveComments();
    }
    storage.saveUsers();

    res.json({
        success: true,
        message: 'Profil uğurla yeniləndi.',
        user: storage.data.users[u]
    });
});

// API: Get user stats & profile
app.get('/api/user/:username', (req, res) => {
    const username = req.params.username.trim();
    const user = storage.data.users[username] || { donationsCount: 0, points: 0, hearts: 0, age: '', region: '', avatarBase64: '', blockedUsers: [] };
    if (user.hearts === undefined) user.hearts = user.donationsCount || 0;
    if (!user.blockedUsers) user.blockedUsers = [];
    res.json(user);
});

// API: Get recent donations
app.get('/api/recent', (req, res) => {
    const recent = storage.data.receipts.slice(-10).reverse();
    res.json(recent);
});

// API: Get leaderboard
app.get('/api/leaderboard', (req, res) => {
    const users = Object.entries(storage.data.users)
        .map(([username, stats]) => ({ username, hearts: stats.hearts || 0, ...stats }))
        .sort((a, b) => b.points - a.points);
    res.json(users);
});

// API: Get comments
app.get('/api/comments', (req, res) => {
    res.json(storage.data.comments);
});

// API: Post a comment (spends 1 Heart 💚, allows full length message text)
app.post('/api/comments', (req, res) => {
    const { username, text, replyTo, replyToAvatar } = req.body;
    if (!username || !text || !text.trim()) {
        return res.status(400).json({ success: false, message: 'İstifadəçi adı və mətn tələb olunur.' });
    }

    const u = username.trim();
    const userObj = storage.data.users[u];
    if (!userObj) {
        return res.status(400).json({ success: false, message: 'İstifadəçi tapılmadı.' });
    }

    if ((userObj.hearts || 0) <= 0) {
        return res.status(400).json({
            success: false,
            message: 'Rəy yazmaq üçün balansınızda Ürək 💚 yoxdur! İstədiyiniz uzunluqda rəy yazabilmək üçün yeni ƏDV çeki yükləyərək Ürək qazanın 💚'
        });
    }

    // Deduct 1 Heart
    userObj.hearts -= 1;
    storage.saveUsers();

    const newComment = {
        id: Date.now().toString(),
        username: u,
        avatarBase64: userObj.avatarBase64 || '',
        replyTo: replyTo || null,
        replyToAvatar: replyToAvatar || null,
        text: text.trim(),
        timestamp: new Date().toISOString()
    };

    storage.data.comments.push(newComment);
    storage.saveComments();

    res.json({ success: true, message: 'Komment əlavə olundu (1 Ürək 💚 xərcləndi).', comment: newComment, user: userObj });
});

// API: Get private messages between two users
app.get('/api/messages', (req, res) => {
    const { user1, user2 } = req.query;
    if (!user1 || !user2) return res.status(400).json({ success: false, message: 'İstifadəçilər tələb olunur.' });

    const u1 = user1.trim().toLowerCase();
    const u2 = user2.trim().toLowerCase();

    const conversation = storage.data.messages.filter(m =>
        (m.sender.toLowerCase() === u1 && m.receiver.toLowerCase() === u2) ||
        (m.sender.toLowerCase() === u2 && m.receiver.toLowerCase() === u1)
    ).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    res.json(conversation);
});

// API: Check unread messages for user (only unread)
app.get('/api/unread', (req, res) => {
    const { username } = req.query;
    if (!username) return res.json({ count: 0, messages: [] });

    const u = username.trim().toLowerCase();
    const incoming = storage.data.messages.filter(m => m.receiver.toLowerCase() === u && !m.read);
    res.json({ count: incoming.length, messages: incoming });
});

// API: Mark messages as read between two users
app.post('/api/messages/mark-read', (req, res) => {
    const { reader, sender } = req.body;
    if (!reader || !sender) return res.status(400).json({ success: false, message: 'İştirakçılar tələb olunur.' });

    const r = reader.trim().toLowerCase();
    const s = sender.trim().toLowerCase();

    let updated = false;
    storage.data.messages.forEach(m => {
        if (m.receiver.toLowerCase() === r && m.sender.toLowerCase() === s && !m.read) {
            m.read = true;
            updated = true;
        }
    });

    if (updated) {
        storage.saveMessages();
    }

    res.json({ success: true });
});

// API: Delete private chat between two users
app.post('/api/messages/delete-chat', (req, res) => {
    const { user1, user2 } = req.body;
    if (!user1 || !user2) return res.status(400).json({ success: false, message: 'İştirakçılar tələb olunur.' });

    const u1 = user1.trim().toLowerCase();
    const u2 = user2.trim().toLowerCase();

    const initialLength = storage.data.messages.length;
    storage.data.messages = storage.data.messages.filter(m => {
        const sender = m.sender.toLowerCase();
        const receiver = m.receiver.toLowerCase();
        return !((sender === u1 && receiver === u2) || (sender === u2 && receiver === u1));
    });

    if (storage.data.messages.length !== initialLength) {
        storage.saveMessages();
    }

    res.json({ success: true, message: 'Söhbət silindi.' });
});

// API: Block / Unblock user
app.post('/api/messages/block', (req, res) => {
    const { blocker, target } = req.body;
    if (!blocker || !target) return res.status(400).json({ success: false, message: 'İştirakçılar tələb olunur.' });

    const b = blocker.trim();
    const t = target.trim().toLowerCase();

    if (!storage.data.users[b]) return res.status(404).json({ success: false, message: 'İstifadəçi tapılmadı.' });
    if (!storage.data.users[b].blockedUsers) storage.data.users[b].blockedUsers = [];

    const index = storage.data.users[b].blockedUsers.indexOf(t);
    let isBlocked = false;
    if (index > -1) {
        storage.data.users[b].blockedUsers.splice(index, 1);
        isBlocked = false;
    } else {
        storage.data.users[b].blockedUsers.push(t);
        isBlocked = true;
    }
    storage.saveUsers();

    res.json({ success: true, isBlocked, message: isBlocked ? 'İstifadəçi bloklandı.' : 'İstifadəçi blokdan çıxarıldı.' });
});

// API: Send Green Heart Gift between users
app.post('/api/messages/send-heart', (req, res) => {
    const { sender, receiver } = req.body;
    if (!sender || !receiver) {
        return res.status(400).json({ success: false, message: 'Göndərən və alan tələb olunur.' });
    }

    const s = sender.trim();
    const r = receiver.trim();
    const senderObj = storage.data.users[s];
    const receiverObj = storage.data.users[r];

    if (!senderObj || !receiverObj) {
        return res.status(400).json({ success: false, message: 'İştirakçı tapılmadı.' });
    }

    if ((senderObj.hearts || 0) <= 0) {
        return res.status(400).json({
            success: false,
            message: 'Ürək göndərmək üçün balansınızda Ürək 💚 yoxdur! Yeni ƏDV çeki yükləyərək ürək qazanın.'
        });
    }

    // Deduct 1 heart from sender, add 1 to receiver
    senderObj.hearts -= 1;
    receiverObj.hearts = (receiverObj.hearts || 0) + 1;
    storage.saveUsers();

    const giftMessage = {
        id: Date.now().toString(),
        sender: s,
        receiver: r,
        text: `🎁 ${s} sizə 1 Ürək 💚 hədiyyə göndərdi!`,
        isHeartGift: true,
        read: false,
        timestamp: new Date().toISOString()
    };

    storage.data.messages.push(giftMessage);
    storage.saveMessages();

    res.json({
        success: true,
        message: `Uğurla ${r} iştirakçısına 1 Ürək 💚 göndərdiniz!`,
        messageObj: giftMessage,
        user: senderObj
    });
});

// API: Send private message (spends 1 Heart 💚, checks blocking status)
app.post('/api/messages', (req, res) => {
    const { sender, receiver, text } = req.body;
    if (!sender || !receiver || !text || !text.trim()) {
        return res.status(400).json({ success: false, message: 'Göndərən, alan və mətn tələb olunur.' });
    }

    const s = sender.trim();
    const r = receiver.trim();
    const senderObj = storage.data.users[s];
    const receiverObj = storage.data.users[r];

    if (!senderObj) {
        return res.status(400).json({ success: false, message: 'İstifadəçi tapılmadı.' });
    }

    // Check if receiver blocked sender
    if (receiverObj && receiverObj.blockedUsers && receiverObj.blockedUsers.includes(s.toLowerCase())) {
        return res.status(400).json({ success: false, message: 'Bu istifadəçi sizi bloklayıb, mesaj göndərə bilməzsiniz.' });
    }

    // Check if sender blocked receiver
    if (senderObj && senderObj.blockedUsers && senderObj.blockedUsers.includes(r.toLowerCase())) {
        return res.status(400).json({ success: false, message: 'Siz bu istifadəçini bloklamısınız. Mesaj göndərmək üçün əvvəlcə blokdan çıxarın.' });
    }

    if ((senderObj.hearts || 0) <= 0) {
        return res.status(400).json({
            success: false,
            message: 'Mesaj göndərmək üçün balansınızda Ürək 💚 yoxdur! Yeni ƏDV çeki yükləyərək 1 Ürək qazanın 💚'
        });
    }

    // Deduct 1 Heart for this message
    senderObj.hearts -= 1;
    storage.saveUsers();

    const newMessage = {
        id: Date.now().toString(),
        sender: s,
        receiver: r,
        text: text.trim(),
        read: false,
        timestamp: new Date().toISOString()
    };

    storage.data.messages.push(newMessage);
    storage.saveMessages();

    res.json({ success: true, message: 'Mesaj göndərildi (1 Ürək 💚 xərcləndi).', messageObj: newMessage, user: senderObj });
});

// --- ADMIN POSTS & SOCIAL FEED APIS ---

// API: Get all admin posts
app.get('/api/posts', (req, res) => {
    res.json(storage.data.posts);
});

// API: Admin create post
app.post('/api/posts', (req, res) => {
    const { title, imageBase64, password } = req.body;
    if (password !== 'admin331234') {
        return res.status(403).json({ success: false, message: 'Admin parol səhvdir.' });
    }
    if (!title || !title.trim()) {
        return res.status(400).json({ success: false, message: 'Başlıq tələb olunur.' });
    }

    const newPost = {
        id: Date.now().toString(),
        title: title.trim(),
        imageBase64: imageBase64 || null,
        likes: 0,
        likedBy: [],
        comments: [],
        timestamp: new Date().toISOString()
    };

    storage.data.posts.unshift(newPost);
    storage.savePosts();

    res.json({ success: true, message: 'Paylaşım uğurla yayımlandı.', post: newPost });
});

// API: Admin delete post
app.post('/api/posts/delete', (req, res) => {
    const { postId, password } = req.body;
    if (password !== 'admin331234') {
        return res.status(403).json({ success: false, message: 'Admin parol səhvdir.' });
    }

    storage.data.posts = storage.data.posts.filter(p => p.id !== postId);
    storage.savePosts();

    res.json({ success: true, message: 'Paylaşım silindi.' });
});

// API: Like / Unlike post
app.post('/api/posts/:id/like', (req, res) => {
    const postId = req.params.id;
    const { username } = req.body;
    if (!username) return res.status(400).json({ success: false, message: 'İstifadəçi adı tələb olunur.' });

    const post = storage.data.posts.find(p => p.id === postId);
    if (!post) return res.status(404).json({ success: false, message: 'Paylaşım tapılmadı.' });

    if (!post.likedBy) post.likedBy = [];

    const index = post.likedBy.indexOf(username);
    if (index > -1) {
        post.likedBy.splice(index, 1);
        post.likes = Math.max(0, post.likes - 1);
    } else {
        post.likedBy.push(username);
        post.likes += 1;
    }
    storage.savePosts();

    res.json({ success: true, likes: post.likes, likedBy: post.likedBy });
});

// API: Add comment to post (spends 1 Heart 💚, allows full length message text)
app.post('/api/posts/:id/comment', (req, res) => {
    const postId = req.params.id;
    const { username, text } = req.body;
    if (!username || !text || !text.trim()) {
        return res.status(400).json({ success: false, message: 'İstifadəçi adı və mətn tələb olunur.' });
    }

    const u = username.trim();
    const post = storage.data.posts.find(p => p.id === postId);
    if (!post) return res.status(404).json({ success: false, message: 'Paylaşım tapılmadı.' });

    const userObj = storage.data.users[u];
    if (!userObj) {
        return res.status(400).json({ success: false, message: 'İstifadəçi tapılmadı.' });
    }

    if ((userObj.hearts || 0) <= 0) {
        return res.status(400).json({
            success: false,
            message: 'Rəy yazmaq üçün balansınızda Ürək 💚 yoxdur! İstədiyiniz uzunluqda rəy yazabilmək üçün yeni ƏDV çeki yükləyərək 1 Ürək qazanın 💚'
        });
    }

    // Deduct 1 Heart
    userObj.hearts -= 1;
    storage.saveUsers();

    const newComment = {
        id: Date.now().toString(),
        username: u,
        avatarBase64: userObj.avatarBase64 || '',
        text: text.trim(),
        timestamp: new Date().toISOString()
    };

    if (!post.comments) post.comments = [];
    post.comments.push(newComment);
    storage.savePosts();

    res.json({ success: true, message: 'Komment əlavə olundu (1 Ürək 💚 xərcləndi).', comment: newComment, user: userObj });
});

// API: Admin delete user
app.post('/api/admin/delete-user', (req, res) => {
    const { username, password } = req.body;
    if (password !== 'admin331234') {
        return res.status(403).json({ success: false, message: 'Admin parol səhvdir.' });
    }
    if (!username || !storage.data.users[username]) {
        return res.status(404).json({ success: false, message: 'İştirakçı tapılmadı.' });
    }

    delete storage.data.users[username];
    storage.saveUsers();

    res.json({ success: true, message: 'İştirakçı uğurla silindi.' });
});

// API: Admin adjust user points
app.post('/api/admin/adjust-points', (req, res) => {
    const { username, amount, password } = req.body;
    if (password !== 'admin331234') {
        return res.status(403).json({ success: false, message: 'Admin parol səhvdir.' });
    }
    if (!username || !storage.data.users[username]) {
        return res.status(404).json({ success: false, message: 'İştirakçı tapılmadı.' });
    }

    const numAmount = parseInt(amount) || 0;
    storage.data.users[username].points = Math.max(0, (storage.data.users[username].points || 0) + numAmount);
    storage.saveUsers();

    res.json({ success: true, message: 'Xallar yeniləndi.', user: storage.data.users[username] });
});

// API: Admin adjust user hearts
app.post('/api/admin/adjust-hearts', (req, res) => {
    const { username, amount, password } = req.body;
    if (password !== 'admin331234') {
        return res.status(403).json({ success: false, message: 'Admin parol səhvdir.' });
    }
    if (!username || !storage.data.users[username]) {
        return res.status(404).json({ success: false, message: 'İştirakçı tapılmadı.' });
    }

    const numAmount = parseInt(amount) || 0;
    if (storage.data.users[username].hearts === undefined) {
        storage.data.users[username].hearts = storage.data.users[username].donationsCount || 0;
    }
    storage.data.users[username].hearts = Math.max(0, storage.data.users[username].hearts + numAmount);
    storage.saveUsers();

    res.json({ success: true, message: 'Ürəklər yeniləndi.', user: storage.data.users[username] });
});

// API: Admin data overview
app.get('/api/admin/data', (req, res) => {
    res.json({
        receipts: storage.data.receipts,
        users: storage.data.users,
        campaigns: storage.data.campaigns,
        comments: storage.data.comments,
        messages: storage.data.messages,
        posts: storage.data.posts
    });
});

// API: Clear all receipts
app.post('/api/admin/clear-receipts', (req, res) => {
    storage.data.receipts = [];
    storage.saveReceipts();
    res.json({ success: true, message: 'Bütün çeklər təmizləndi.' });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 EDV Donation Server işləyir: http://localhost:${PORT}`);
});
