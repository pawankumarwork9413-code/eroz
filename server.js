const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, '.')));

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
    console.warn('⚠️ Warning: OPENAI_API_KEY not set in environment variables');
}

app.post('/api/analyze-nutrition', async (req, res) => {
    try {
        const { imageData } = req.body;

        if (!imageData) {
            return res.status(400).json({ error: 'Image data is required' });
        }

        if (!OPENAI_API_KEY) {
            return res.status(500).json({ error: 'API key not configured on server' });
        }

        const response = await fetch('https://api.openai.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-4-vision',
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: 'Analyze this food image and return ONLY valid JSON with this exact shape: {"calories":"estimate in kcal","protein":"grams","carbs":"grams","fat":"grams","serving":"description"}'
                            },
                            {
                                type: 'image_url',
                                image_url: {
                                    url: imageData
                                }
                            }
                        ]
                    }
                ],
                max_tokens: 200
            })
        });

        if (!response.ok) {
            const errorData = await response.text();
            console.error('OpenAI API Error:', response.status, errorData);
            return res.status(response.status).json({ 
                error: `OpenAI API error: ${response.status}`,
                details: errorData 
            });
        }

        const data = await response.json();
        const nutritionText = data.choices?.[0]?.message?.content || '';
        
        res.json({ success: true, nutritionData: nutritionText });
    } catch (error) {
        console.error('Server Error:', error);
        res.status(500).json({ error: 'Failed to analyze image', details: error.message });
    }
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'Server is running', apiKeySet: !!OPENAI_API_KEY });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Eroz server running on http://localhost:${PORT}`);
    console.log(`API endpoint: POST http://localhost:${PORT}/api/analyze-nutrition`);
});
