const express = require('express');
const cors = require('cors');
const path = require('path');
const storage = require('./src/data/storage');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// API: Get campaigns
app.get('/api/campaigns', (req, res) => {
    res.json(storage.data.campaigns);
});

// API: Submit receipt or donation
app.post('/api/donate', (req, res) => {
    const { username, campaignId, qrData, amount } = req.body;

    if (!username) {
        return res.status(400).json({ success: false, message: 'İstifadəçi adı tələb olunur.' });
    }

    const receiptEntry = {
        id: Date.now().toString(),
        username: username.trim(),
        campaignId: campaignId || '1',
        qrData: qrData || 'manual_donation',
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
        storage.data.users[username] = { donationsCount: 0, totalDonated: 0, points: 0 };
    }
    storage.data.users[username].donationsCount += 1;
    storage.data.users[username].totalDonated += receiptEntry.amount;
    storage.data.users[username].points += 10; // 10 points per donation/receipt
    storage.saveUsers();

    res.json({
        success: true,
        message: 'Təşəkkürlər! İanəniz/Çekiniz qeydə alındı.',
        user: storage.data.users[username],
        campaign
    });
});

// API: Get user stats
app.get('/api/user/:username', (req, res) => {
    const username = req.params.username.trim();
    const user = storage.data.users[username] || { donationsCount: 0, totalDonated: 0, points: 0 };
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

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 EDV Donation Server işləyir: http://localhost:${PORT}`);
});
