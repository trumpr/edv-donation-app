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
        storage.data.users[username] = { donationsCount: 0, totalDonated: 0, points: 0, age: '', region: '', avatarBase64: '' };
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
        storage.data.users[u] = { donationsCount: 0, totalDonated: 0, points: 0, age: '', region: '', avatarBase64: '' };
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

// API: Admin data overview
app.get('/api/admin/data', (req, res) => {
    res.json({
        receipts: storage.data.receipts,
        users: storage.data.users,
        campaigns: storage.data.campaigns
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
