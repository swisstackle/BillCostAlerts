const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const pdf = require('pdf-parse');
const OpenAI = require('openai');
const emailService = require('../congress/services/emailService');
const router = express.Router();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL:"https://openrouter.ai/api/v1"
});

async function extractCostFromText(text) {
    try {
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

async function downloadAndParsePdf(pdfUrl) {
    try {
        const response = await axios.get(pdfUrl, { responseType: 'arraybuffer' });
        const data = await pdf(response.data);
        return data.text;
    } catch (error) {
        console.error('Error downloading or parsing PDF:', error);
        throw error;
    }
}

async function handleCostAlert(billInfo, costEstimate, pdfUrl) {
    try {
        const numericCost = parseFloat(costEstimate.replace(/[^0-9.-]/g, ''));
        if (!isNaN(numericCost) && numericCost > 0.1) {
            await emailService.sendCostAlert(billInfo, costEstimate, pdfUrl);
        }
    } catch (error) {
        console.error('Error handling cost alert:', error);
    }
}

router.get('/proxy-cbo', async (req, res) => {
    try {
        const cboUrl = req.query.url;
        const billInfo = JSON.parse(req.query.billInfo || '{}');

        if (!cboUrl) {
            console.log('No CBO URL provided');
            return res.status(400).json({ error: 'URL parameter is required' });
        }

        const response = await axios.get(cboUrl);
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
            try {
                const pdfText = await downloadAndParsePdf(pdfUrl);
                const costEstimate = await extractCostFromText(pdfText);
                
                await handleCostAlert(billInfo, costEstimate, pdfUrl);
                
                res.json({ pdfUrl, costEstimate });
            } catch (error) {
                res.json({ pdfUrl, costEstimate: 'Error processing PDF' });
            }
        } else {

            console.log('Cost estimate failed 1');
            res.json({ pdfUrl: null, costEstimate: null });
        }
    } catch (error) {

            console.log('Cost estimate failed 2');
        console.error('Error proxying CBO request:', error);
        res.status(500).json({ error: 'Failed to fetch CBO page' });
    }
});

module.exports = router;

 