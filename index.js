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
        return res.status(400).json({ success: false, message: 'İstifadəçi adı və 4-rəqəmli PIN tələb olunur.' });
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
            totalDonated: 0,
            points: 0,
            age: '',
            region: '',
            avatarBase64: ''
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

    res.json({ success: true, message: 'Uğurla daxil oldunuz!', user: storage.data.users[u] });
});

// API: Submit receipt photo or donation
app.post('/api/donate', (req, res) => {
    const { username, campaignId, qrData, amount, imageBase64 } = req.body;

    if (!username) {
        return res.status(400).json({ success: false, message: 'İstifadəçi adı tələb olunur.' });
    }

    const receiptEntry = {
        id: Date.now().toString(),
        username: username.trim(),
        campaignId: campaignId || '1',
        qrData: qrData || 'Çek Şəkli',
        imageBase64: imageBase64 || null,
        amount: parseFloat(amount) || 1.0,
        timestamp: new Date().toISOString()
    };

    storage.data.receipts.push(receiptEntry);
    storage.saveReceipts();

    // Update campaign current amount
    const campaign = storage.data.campaigns.find(c => c.id === campaignId);
    if (campaign) {
        campaign.current += receiptEntry.amount;
        storage.saveCampaigns();
    }

    // Update user stats
    if (!storage.data.users[username]) {
        storage.data.users[username] = { pin: '0000', donationsCount: 0, totalDonated: 0, points: 0, age: '', region: '', avatarBase64: '' };
    }
    storage.data.users[username].donationsCount += 1;
    storage.data.users[username].totalDonated += receiptEntry.amount;
    storage.data.users[username].points += 10; // 10 points per receipt photo
    storage.saveUsers();

    res.json({
        success: true,
        message: 'Təşəkkürlər! Çek şəkliniz uğurla qeydə alındı.',
        user: storage.data.users[username],
        campaign
    });
});

// API: Update user profile
app.post('/api/profile', (req, res) => {
    const { username, age, region, avatarBase64 } = req.body;
    if (!username) {
        return res.status(400).json({ success: false, message: 'İstifadəçi adı tələb olunur.' });
    }

    const u = username.trim();
    if (!storage.data.users[u]) {
        storage.data.users[u] = { pin: '0000', donationsCount: 0, totalDonated: 0, points: 0, age: '', region: '', avatarBase64: '' };
    }

    storage.data.users[u].age = age || '';
    storage.data.users[u].region = region || '';
    if (avatarBase64) {
        storage.data.users[u].avatarBase64 = avatarBase64;
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
    const user = storage.data.users[username] || { donationsCount: 0, totalDonated: 0, points: 0, age: '', region: '', avatarBase64: '' };
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
        .map(([username, stats]) => ({ username, ...stats }))
        .sort((a, b) => b.points - a.points)
        .slice(0, 5);
    res.json(users);
});

// API: Get comments
app.get('/api/comments', (req, res) => {
    res.json(storage.data.comments);
});

// API: Post a comment
app.post('/api/comments', (req, res) => {
    const { username, text } = req.body;
    if (!username || !text || !text.trim()) {
        return res.status(400).json({ success: false, message: 'İstifadəçi adı və mətn tələb olunur.' });
    }

    const u = username.trim();
    const userObj = storage.data.users[u] || {};

    const newComment = {
        id: Date.now().toString(),
        username: u,
        avatarBase64: userObj.avatarBase64 || '',
        text: text.trim(),
        timestamp: new Date().toISOString()
    };

    storage.data.comments.push(newComment);
    storage.saveComments();

    res.json({ success: true, message: 'Komment əlavə olundu.', comment: newComment });
});

// API: Admin data overview
app.get('/api/admin/data', (req, res) => {
    res.json({
        receipts: storage.data.receipts,
        users: storage.data.users,
        campaigns: storage.data.campaigns,
        comments: storage.data.comments
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
