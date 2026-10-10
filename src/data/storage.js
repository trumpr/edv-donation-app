const fs = require('fs');
const path = require('path');

const CAMPAIGNS_FILE = path.join(__dirname, 'campaigns.json');
const RECEIPTS_FILE = path.join(__dirname, 'receipts.json');
const USERS_FILE = path.join(__dirname, 'users.json');
const COMMENTS_FILE = path.join(__dirname, 'comments.json');
const MESSAGES_FILE = path.join(__dirname, 'messages.json');
const POSTS_FILE = path.join(__dirname, 'posts.json');

function readJson(file, defaultVal) {
    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, JSON.stringify(defaultVal, null, 2));
        return defaultVal;
    }
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
        return defaultVal;
    }
}

function writeJson(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

const data = {
    campaigns: readJson(CAMPAIGNS_FILE, []),
    receipts: readJson(RECEIPTS_FILE, []),
    users: readJson(USERS_FILE, {}),
    comments: readJson(COMMENTS_FILE, []),
    messages: readJson(MESSAGES_FILE, []),
    posts: readJson(POSTS_FILE, [])
};

function saveReceipts() {
    writeJson(RECEIPTS_FILE, data.receipts);
}

function saveCampaigns() {
    writeJson(CAMPAIGNS_FILE, data.campaigns);
}

function saveUsers() {
    writeJson(USERS_FILE, data.users);
}

function saveComments() {
    writeJson(COMMENTS_FILE, data.comments);
}

function saveMessages() {
    writeJson(MESSAGES_FILE, data.messages);
}

function savePosts() {
    writeJson(POSTS_FILE, data.posts);
}

module.exports = {
    data,
    saveReceipts,
    saveCampaigns,
    saveUsers,
    saveComments,
    saveMessages,
    savePosts
};
