// Eroz Nutrition Analyzer JS
const imageInput = document.getElementById('imageInput');
const preview = document.getElementById('preview');
const cameraPickBtn = document.getElementById('cameraPickBtn');
const analyzeBtn = document.getElementById('analyzeBtn');
const resultDiv = document.getElementById('result');
let selectedFile = null;
const OPENAI_API_KEY = "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";
function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Failed to read image file.'));
        reader.readAsDataURL(file);
    });
}

function extractOutputText(responseJson) {
    if (responseJson.output_text) {
        return responseJson.output_text;
    }

    const textChunks = [];
    const output = Array.isArray(responseJson.output) ? responseJson.output : [];
    for (const item of output) {
        const content = Array.isArray(item.content) ? item.content : [];
        for (const part of content) {
            if (part.type === 'output_text' && part.text) {
                textChunks.push(part.text);
            }
            if (part.type === 'text' && part.text) {
                textChunks.push(part.text);
            }
        }
    }
    return textChunks.join('\n').trim();
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function firstMatch(text, regex) {
    const match = text.match(regex);
    return match ? match[1].trim() : '--';
}

function parseJsonLikeText(text) {
    const clean = text
        .replace(/^```(?:json)?/im, '')
        .replace(/```$/im, '')
        .trim();

    const direct = clean.match(/\{[\s\S]*\}/);
    if (!direct) return null;

    try {
        return JSON.parse(direct[0]);
    } catch (error) {
        return null;
    }
}

function parseNutrition(rawText) {
    const text = (rawText || '').trim();
    const normalized = text.replace(/\*\*/g, '');

    try {
        const parsed = JSON.parse(normalized);
        return {
            calories: parsed.calories || parsed.Calories || '--',
            protein: parsed.protein || parsed.Protein || '--',
            carbs: parsed.carbs || parsed.Carbs || parsed.carbohydrates || '--',
            fat: parsed.fat || parsed.Fat || '--',
            serving: parsed.serving || parsed.Serving || 'Estimated serving'
        };
    } catch (error) {
        const jsonLike = parseJsonLikeText(normalized);
        if (jsonLike) {
            return {
                calories: jsonLike.calories || jsonLike.Calories || '--',
                protein: jsonLike.protein || jsonLike.Protein || '--',
                carbs: jsonLike.carbs || jsonLike.Carbs || jsonLike.carbohydrates || '--',
                fat: jsonLike.fat || jsonLike.Fat || '--',
                serving: jsonLike.serving || jsonLike.Serving || 'Estimated serving'
            };
        }

        const calories = firstMatch(normalized, /calories?\s*[:=-]\s*([^,\n]+)/i);
        const protein = firstMatch(normalized, /protein\s*[:=-]\s*([^,\n]+)/i);
        const carbs = firstMatch(normalized, /(?:carbs?|carbohydrates?)\s*[:=-]\s*([^,\n]+)/i);
        const fat = firstMatch(normalized, /fat\s*[:=-]\s*([^,\n]+)/i);
        const servingMatch = normalized.match(/(?:serving|per\s*[0-9]+\s*[a-z]*)\s*[:=-]\s*([^,\n]+)/i);
        const allMissing = [calories, protein, carbs, fat].every((v) => v === '--');

        return {
            calories: calories,
            protein: protein,
            carbs: carbs,
            fat: fat,
            serving: allMissing ? `Raw: ${normalized.slice(0, 80)}...` : (servingMatch ? servingMatch[1].trim() : 'Estimated serving')
        };
    }
}

function renderResultState(message, type) {
    resultDiv.classList.remove('is-loading', 'is-error');
    if (type === 'loading') {
        resultDiv.classList.add('is-loading');
    }
    if (type === 'error') {
        resultDiv.classList.add('is-error');
    }
    resultDiv.innerHTML = `<p class="result-status">${escapeHtml(message)}</p>`;
}

function renderNutritionPanel(values) {
    resultDiv.classList.remove('is-loading', 'is-error');
    resultDiv.innerHTML = `
        <div class="nutrition-panel">
            <p class="result-title">Nutrition Estimate</p>
            <div class="nutrition-grid">
                <article class="nutrition-item">
                    <p class="nutrition-label">Calories</p>
                    <p class="nutrition-value">${escapeHtml(values.calories)}</p>
                </article>
                // <article class="nutrition-item">
                //     <p class="nutrition-label">Protein</p>
                //     <p class="nutrition-value">${escapeHtml(values.protein)}</p>
                // </article>
                // <article class="nutrition-item">
                //     <p class="nutrition-label">Carbs</p>
                //     <p class="nutrition-value">${escapeHtml(values.carbs)}</p>
                // </article>
                // <article class="nutrition-item">
                //     <p class="nutrition-label">Fat</p>
                //     <p class="nutrition-value">${escapeHtml(values.fat)}</p>
                </article>
            </div>
            <p class="serving-note">${escapeHtml(values.serving)}</p>
        </div>
    `;
}

imageInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        selectedFile = file;
        const reader = new FileReader();
        reader.onload = function(ev) {
            preview.src = ev.target.result;
        };
        reader.readAsDataURL(file);
        analyzeBtn.disabled = false;
        resultDiv.innerHTML = '';
    }
});

preview.addEventListener('click', function() {
    imageInput.click();
});

cameraPickBtn.addEventListener('click', function() {
    imageInput.click();
});

analyzeBtn.addEventListener('click', async function() {
    if (!selectedFile) return;
    if (!OPENAI_API_KEY) {
        renderResultState('Set OPENAI_API_KEY in script.js first.', 'error');
        return;
    }

    renderResultState('Analyzing image and extracting nutrition...', 'loading');
    try {
        const dataUrl = await fileToDataUrl(selectedFile);

        const response = await fetch('https://api.openai.com/v1/responses', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-4.1-mini',
                input: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'input_text',
                                text: 'Analyze this food image and return ONLY valid JSON with this exact shape: {"calories":"...","protein":"...","carbs":"...","fat":"...","serving":"..."}'
                            },
                            {
                                type: 'input_image',
                                image_url: dataUrl
                            }
                        ]
                    }
                ],
                max_output_tokens: 120
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            renderResultState(`Error ${response.status}: ${errorText}`, 'error');
            return;
        }

        const data = await response.json();
        const nutritionText = extractOutputText(data) || '';
        const nutritionData = parseNutrition(nutritionText);
        renderNutritionPanel(nutritionData);
    } catch (err) {
        renderResultState('Error: ' + err.message, 'error');
    }
});
