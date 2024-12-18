const { Resend } = require('resend');
const fs = require('fs').promises;
const path = require('path');

class EmailService {
    constructor() {
        this.resend = new Resend(process.env.RESEND_API_KEY);
    }

    async getSubscribers() {
        const subscribersPath = path.join(__dirname, '../data/subscribers.json');
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
                <p><strong>Bill Details:</strong> <a href="${billInfo.url.replace('?format=json', '')}">View on Congress.gov</a></p>
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
                    const { data, error } = await this.resend.emails.send({
                        from: 'Congressional Bills Alert <onboarding@resend.dev>',
                        to: [subscriber],
                        subject: `High Cost Bill Alert: ${billInfo.type}${billInfo.number}`,
                        html: emailContent,
                        text: plainText,
                        tags: [
                            {
                                name: 'bill_number',
                                value: `${billInfo.type}${billInfo.number}`
                            },
                            {
                                name: 'congress',
                                value: billInfo.congress.toString()
                            }
                        ]
                    });

                    if (error) {
                        console.error(`Failed to send email to ${subscriber}:`, error);
                        continue;
                    }

                    console.log(`Email sent successfully to ${subscriber}:`, data.id);
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

    // Test method to verify email service is working
    async testEmailService() {
        try {
            const subscribers = await this.getSubscribers();
            const { data, error } = await this.resend.emails.send({
                from: 'Congressional Bills Alert <onboarding@resend.dev>',
                to: [subscribers[0]], // Send test email to first subscriber
                subject: 'Test Email - Congressional Bills Alert System',
                html: '<h1>Test Email</h1><p>This is a test email from the Congressional Bills Alert System.</p>'
            });

            if (error) {
                throw error;
            }

            console.log('Test email sent successfully:', data);
            return data;
        } catch (error) {
            console.error('Error sending test email:', error);
            throw error;
        }
    }
}

module.exports = new EmailService();
