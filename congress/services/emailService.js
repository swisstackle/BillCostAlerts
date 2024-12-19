const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');

class EmailService {
    constructor() {
        this.transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: "alain.schaerer@gmail.com",
                pass: process.env.APP_PASSWORD
            }
        });
    }

    async getSubscribers() {
        const subscribersPath = path.join('/var/data/subscribers.json');
        const data = await fs.readFile(subscribersPath, 'utf8');
        return JSON.parse(data).subscribers;
    }

    async sendCostAlert(billInfo, costEstimate, pdfUrl) {
        try {
            const subscribers = await this.getSubscribers();
            
            const emailContent = `
                <h2>High Cost Bill Alert</h2>
                <p><strong>Bill Title:</strong> ${billInfo.title}</p>
                <p><strong>Bill Number:</strong> ${billInfo.type}${billInfo.number}</p>
                <p><strong>Congress:</strong> ${billInfo.congress}</p>
                <p><strong>Estimated Cost:</strong> ${costEstimate}</p>
                <p><strong>Latest Action:</strong> ${billInfo.latestAction.text} (${billInfo.latestAction.actionDate})</p>
                <p><strong>CBO Report:</strong> <a href="${pdfUrl}">Download PDF</a></p>
                <p><strong>Bill Details:</strong> <a href="https://www.congress.gov/bill/${billInfo.congress}th-congress/${billInfo.type.toLowerCase()}/${billInfo.number}">View on Congress.gov</a></p>
            `;

            const plainText = `
                High Cost Bill Alert
                
                Bill Title: ${billInfo.title}
                Bill Number: ${billInfo.type}${billInfo.number}
                Congress: ${billInfo.congress}
                Estimated Cost: ${costEstimate}
                Latest Action: ${billInfo.latestAction.text} (${billInfo.latestAction.actionDate})
                CBO Report: ${pdfUrl}
                Bill Details: ${billInfo.url.replace('?format=json', '')}
            `;

            for (const subscriber of subscribers) {
                try {
                    const mailOptions = {
                        from: `Congressional Bills Alert <${process.env.GMAIL_USER}>`,
                        to: subscriber,
                        subject: `High Cost Bill Alert: ${billInfo.type}${billInfo.number}`,
                        text: plainText,
                        html: emailContent
                    };

                    const info = await this.transporter.sendMail(mailOptions);
                    console.log(`Email sent successfully to ${subscriber}:`, info.messageId);
                } catch (emailError) {
                    console.error(`Error sending to ${subscriber}:`, emailError);
                }
            }

            return true;
        } catch (error) {
            console.error('Error in sendCostAlert:', error);
            throw error;
        }
    }

    async testEmailService() {
        try {
            const subscribers = await this.getSubscribers();
            const mailOptions = {
                from: `Congressional Bills Alert <${process.env.GMAIL_USER}>`,
                to: subscribers[0], // Send test email to first subscriber
                subject: 'Test Email - Congressional Bills Alert System',
                html: '<h1>Test Email</h1><p>This is a test email from the Congressional Bills Alert System.</p>'
            };

            const info = await this.transporter.sendMail(mailOptions);
            console.log('Test email sent successfully:', info.messageId);
            return info;
        } catch (error) {
            console.error('Error sending test email:', error);
            throw error;
        }
    }
}

module.exports = new EmailService();
