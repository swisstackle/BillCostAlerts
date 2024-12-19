const cron = require('node-cron');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const cheerio = require('cheerio');
const pdf = require('pdf-parse');

class CronService {
    constructor(emailService) {
        this.emailService = emailService;
        this.processedBills = new Set();
        this.API_KEY = process.env.CONGRESS_API_KEY;
        this.loadProcessedBills();
    }

    async loadProcessedBills() {
        try {
            const processedBillsPath = path.join(__dirname, '../data/processed_bills.json');
            const data = await fs.readFile(processedBillsPath, 'utf8');
            const bills = JSON.parse(data);
            this.processedBills = new Set(bills);
        } catch (error) {
            console.log('No processed bills file found, starting fresh');
            this.processedBills = new Set();
        }
    }

    async saveProcessedBills() {
        const processedBillsPath = path.join(__dirname, '../data/processed_bills.json');
        await fs.writeFile(processedBillsPath, JSON.stringify([...this.processedBills], null, 2));
    }

    async checkNewBills() {
        try {
            const response = await axios.get(`https://api.congress.gov/v3/bill?api_key=${this.API_KEY}`);
            const bills = response.data.bills;

            for (const bill of bills) {
                const billId = `${bill.congress}-${bill.type}-${bill.number}`;
                
                if (!this.processedBills.has(billId)) {
                    console.log(`Processing new bill: ${billId}`);
                    
                    const billDetails = await axios.get(
                        `https://api.congress.gov/v3/bill/${bill.congress}/${bill.type}/${bill.number}?api_key=${this.API_KEY}`
                    );

                    const cboEstimates = billDetails.data.bill?.cboCostEstimates || [];
                    
                    for (const estimate of cboEstimates) {
                        await this.processCBOEstimate(estimate, bill);
                    }

                    this.processedBills.add(billId);
                }
            }

            await this.saveProcessedBills();
        } catch (error) {
            console.error('Error checking new bills:', error);
        }
    }

    async processCBOEstimate(estimate, billInfo) {
        try {
            const response = await axios.get(estimate.url);
            const $ = cheerio.load(response.data);
            
            let pdfUrl = null;
            $('a').each((i, link) => {
                const href = $(link).attr('href');
                if (href && href.toLowerCase().includes('.pdf')) {
                    pdfUrl = href;
                    return false;
                }
            });

            if (pdfUrl && !pdfUrl.startsWith('http')) {
                const cboBaseUrl = 'https://www.cbo.gov';
                pdfUrl = cboBaseUrl + (pdfUrl.startsWith('/') ? '' : '/') + pdfUrl;
            }

            if (pdfUrl) {
                const pdfResponse = await axios.get(pdfUrl, { responseType: 'arraybuffer' });
                const pdfData = await pdf(pdfResponse.data);
                const costEstimate = await this.extractCostFromText(pdfData.text);
                
                const numericCost = parseFloat(costEstimate.replace(/[^0-9.-]/g, ''));
                if (!isNaN(numericCost) && numericCost > 0.1) {
                    await this.emailService.sendCostAlert(billInfo, costEstimate, pdfUrl);
                }
            }
        } catch (error) {
            console.error('Error processing CBO estimate:', error);
        }
    }

    async extractCostFromText(text) {
        try {
            const openai = new OpenAI({
                apiKey: "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",
                baseURL: "https://openrouter.ai/api/v1"
            });

            const completion = await openai.chat.completions.create({
                model: "openai/gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content: "You are a helpful assistant that extracts cost estimates from CBO reports. Return only the numerical cost value in billions of dollars. If multiple numbers exist, return the total cost. If no clear cost is found, return 'No clear cost estimate found.'"
                    },
                    {
                        role: "user",
                        content: `Extract the total cost estimate in billions of dollars from this CBO report text: ${text}`
                    }
                ],
                temperature: 0,
                max_tokens: 100
            });

            return completion.choices[0].message.content;
        } catch (error) {
            console.error('Error calling OpenAI:', error);
            return 'Error processing cost estimate';
        }
    }

    startCronJob() {
        // Run every 24 hr
        cron.schedule('0 0 * * *', async () => {
            console.log('Running bill check cron job:', new Date().toISOString());
            await this.checkNewBills();
        });
    }
}

module.exports = CronService;
