const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const billsRouter = require('../routes/bills');
const CronService = require('./services/cronService');
const emailService = require('./services/emailService');
const dotenv = require('dotenv');

// Configure dotenv to look for .env in the project root
dotenv.config({ path: path.join(__dirname, '../.env') });

const app = express();

// Initialize cron service
const cronService = new CronService(emailService);
cronService.startCronJob();

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use('/api', billsRouter);

// Subscription endpoint
app.post('/api/subscribe', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email || !email.includes('@')) {
            return res.status(400).json({ error: 'Invalid email address' });
        }

        const subscribersPath = path.join('/var/data/subscribers.json');
        const data = await fs.readFile(subscribersPath, 'utf8');
        const subscribers = JSON.parse(data);

        // Check if email already exists
        if (subscribers.subscribers.includes(email)) {
            return res.status(400).json({ error: 'Email already subscribed' });
        }

        // Add new email
        subscribers.subscribers.push(email);

        // Write back to file
        await fs.writeFile(subscribersPath, JSON.stringify(subscribers, null, 4));

        res.json({ message: 'Successfully subscribed' });
    } catch (error) {
        console.error('Subscription error:', error);
        res.status(500).json({ error: 'Failed to process subscription' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log('Environment variables loaded:', {
        RESEND_API_KEY: !!process.env.RESEND_API_KEY,
        OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
        CONGRESS_API_KEY: !!process.env.CONGRESS_API_KEY
    });
});

module.exports = app;

