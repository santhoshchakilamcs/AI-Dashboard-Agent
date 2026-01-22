import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { orchestratorAgent, dataAnalystAgent, quickAnswerAgent, buildDashboardAgent, dashboardArchitectAgent } from './agents.js';

config();

// Cache for data analysis (so we don't re-analyze on every question)
const dataAnalysisCache = new Map();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3002;

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.csv', '.xlsx', '.xls', '.json'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed: CSV, Excel, JSON'));
    }
  }
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.warn('\n[Warning] OPENAI_API_KEY not set in .env file');
  console.warn('Create a .env file with: OPENAI_API_KEY=sk-...\n');
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', hasApiKey: !!OPENAI_API_KEY });
});

// Upload file endpoint
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  res.json({ 
    success: true, 
    filename: req.file.filename,
    originalName: req.file.originalname,
    path: req.file.path
  });
});

// Analyze data with AI
app.post('/api/analyze', async (req, res) => {
  try {
    const { columns, columnStats, relationships, sampleRows, totalRows } = req.body;

    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: 'API key not configured' });
    }

    const systemPrompt = `You are a senior business intelligence analyst creating executive dashboards like Tableau and Power BI.

YOUR JOB: Analyze the column statistics and relationships to create the BEST possible dashboard for ANY dataset.

CRITICAL RULES FOR CALCULATED FIELDS:
1. When you see TWO numeric columns where one is small values (like prices/rates) and another is counts/quantities → MULTIPLY THEM for totals
2. When you see a "total" or "amount" column alongside a "cost" column → SUBTRACT for profit/margin
3. ALWAYS check the "calculatedFields" in relationships - use them!
4. Create meaningful business metrics even if column names are unclear

PATTERN RECOGNITION (based on DATA, not names):
1. ONE-TO-MANY PATTERN: If "transactionPattern" exists in relationships:
   - There's a grouping column with multiple items per group
   - Create: "Average items per [group]", "Top [items] by value", "Distribution analysis"
   
2. GEOGRAPHIC PATTERN: If "geographicColumns" exists:
   - Show breakdown by location using horizontalBar
   - Create: "[Metric] by [Geography]" charts

3. TIME SERIES PATTERN: If any column has isDate=true:
   - Create trend charts using "area" or "line" type
   - Aggregate by month/week

4. CATEGORICAL ANALYSIS: For low-cardinality columns (uniqueCount < 15):
   - Use for grouping/segmentation
   - "donut" for 2-6 categories, "horizontalBar" for more

5. HIGH-VALUE ITEMS: For any categorical column with numeric measures:
   - TOP 10 by value (descending)
   - BOTTOM 10 by value (ascending) - for slow movers/low performers

CHART TYPE SELECTION:
1. "horizontalBar" - Best for TOP/BOTTOM N, comparisons (always use limit: 10)
2. "donut" - Distribution ONLY when uniqueCount is 2-6
3. "area" - Time trends, filled area chart
4. "bar" - Vertical comparisons
5. "line" - Time series, comparing multiple metrics
6. "gauge" - Single KPI as percentage
7. "stackedBar" - Show composition with groupBy

AGGREGATION RULES:
- Numeric columns with large totals → use "sum"
- Numeric columns with rates/averages → use "avg"
- Counting occurrences → use "count"
- Unique counts (IDs, keys) → use "countDistinct"

Your response MUST be valid JSON:
{
  "summary": "5-7 word dashboard title",
  "dataType": "sales|financial|support|survey|timeseries|inventory|ecommerce|hr|other",
  "insights": [
    "Insight about calculated fields you identified",
    "Insight about transaction patterns",
    "Actionable business insight"
  ],
  "calculatedFields": [
    {
      "name": "Revenue",
      "formula": "UnitPrice * Quantity",
      "description": "Calculated revenue per line item"
    }
  ],
  "recommendations": [
    {
      "chartType": "horizontalBar|donut|area|bar|line|gauge|stackedBar",
      "title": "Descriptive chart title",
      "description": "Business value of this visualization",
      "xAxis": "dimension column name",
      "yAxis": "measure column OR calculated field name",
      "groupBy": "segmentation column or null",
      "limit": 10,
      "aggregation": "sum|avg|count",
      "calculatedField": "if using calculated field, specify formula like: UnitPrice * Quantity",
      "sql": "SELECT dimension, SUM(col1 * col2) as Revenue FROM data GROUP BY dimension ORDER BY Revenue DESC LIMIT 10"
    }
  ],
  "suggestedKPIs": [
    {
      "label": "Total Revenue",
      "formula": "SUM(UnitPrice * Quantity)",
      "column": "use this if no formula needed",
      "aggregation": "sum|avg|count|countDistinct|max|min|formula",
      "format": "number|currency|percent"
    }
  ]
}

IMPORTANT REQUIREMENTS:
1. USE the "calculatedFields" from relationships if provided - these are pre-detected multiplication/calculation opportunities
2. Create at least one "Top 10" analysis (highest values) 
3. Create at least one "Bottom 10" or distribution analysis
4. If geographicColumns exist, include a geographic breakdown chart
5. If transactionPattern exists, show average items per group
6. If date column exists, include a time trend

Create 5-6 diverse visualizations covering different aspects of the data. Include 4-5 KPIs.
ONLY return valid JSON.`;

    // Build relationship context for AI
    const relationshipContext = relationships ? `
=== DETECTED DATA RELATIONSHIPS ===

📊 DIMENSIONS (use for GROUP BY / x-axis):
${JSON.stringify(relationships.dimensions || [], null, 2)}

📈 MEASURES (use for SUM/AVG / y-axis):
${JSON.stringify(relationships.measures || [], null, 2)}

🧮 CALCULATED FIELDS (IMPORTANT - USE THESE!):
${JSON.stringify(relationships.calculatedFields || [], null, 2)}
${relationships.calculatedFields?.length > 0 ? '⚠️ You MUST use these calculated fields in your charts and KPIs!' : 'None detected - look for numeric columns to multiply'}

🌍 GEOGRAPHIC COLUMNS (create geographic breakdowns):
${JSON.stringify(relationships.geographicColumns || [], null, 2)}
${relationships.geographicColumns?.length > 0 ? '⚠️ Create at least one chart showing data by geography!' : ''}

🔄 TRANSACTION PATTERN (one-to-many relationship):
${JSON.stringify(relationships.transactionPattern || 'None detected', null, 2)}
${relationships.transactionPattern ? `⚠️ This data has ${relationships.transactionPattern.avgItemsPerGroup} items per ${relationships.transactionPattern.groupColumn} on average. Create a chart showing this!` : ''}

📅 DATE HIERARCHY:
${JSON.stringify(relationships.dateHierarchy || 'None detected', null, 2)}
${relationships.dateHierarchy ? '⚠️ Create a time-series trend chart!' : ''}

🔗 DATA HIERARCHIES (parent→child):
${JSON.stringify(relationships.hierarchies || [], null, 2)}

📊 CORRELATIONS:
${JSON.stringify(relationships.correlations || [], null, 2)}

🏷️ SEGMENTATION COLUMNS:
${JSON.stringify(relationships.segmentations || [], null, 2)}

🔑 KEY COLUMNS:
${JSON.stringify(relationships.potentialKeys || [], null, 2)}
` : '';

    const userMessage = `Analyze this dataset with ${totalRows.toLocaleString()} total rows.

COLUMN STATISTICS:
${JSON.stringify(columnStats, null, 2)}
${relationshipContext}
SAMPLE DATA (first 10 rows):
${JSON.stringify(sampleRows, null, 2)}

INSTRUCTIONS:
1. If calculatedFields are provided, USE THEM in charts (e.g., calculatedField: "Price * Qty")
2. If geographicColumns exist, create a breakdown by location
3. If transactionPattern exists, show items per group analysis
4. Create Top 10 and Bottom 10 charts for key metrics
5. Use proper column names from the statistics above`;

    // Log what we're sending to AI for debugging
    console.log('\n=== SENDING TO AI ===');
    console.log('Relationships:', JSON.stringify(relationships, null, 2));
    console.log('=====================\n');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        max_tokens: 2500,
        temperature: 0.3
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return res.status(response.status).json({ 
        error: error.error?.message || 'AI analysis failed' 
      });
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content || '{}';
    
    console.log('\n=== AI RESPONSE ===');
    console.log(content.substring(0, 500) + '...');
    console.log('===================\n');
    
    // Parse the JSON response
    try {
      const analysis = JSON.parse(content);
      console.log('Parsed successfully. Charts:', analysis.recommendations?.length, 'KPIs:', analysis.suggestedKPIs?.length);
      res.json(analysis);
    } catch (parseError) {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const analysis = JSON.parse(jsonMatch[0]);
        console.log('Extracted JSON. Charts:', analysis.recommendations?.length, 'KPIs:', analysis.suggestedKPIs?.length);
        res.json(analysis);
      } else {
        console.error('Failed to parse AI response:', content);
        res.status(500).json({ error: 'Failed to parse AI response' });
      }
    }
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Generate SQL query from natural language
app.post('/api/query', async (req, res) => {
  try {
    const { question, columns, relationships, tableName } = req.body;

    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: 'API key not configured' });
    }

    // Build column info with types
    const columnInfo = columns.map(c => `"${c.name}" (${c.type}, ${c.uniqueCount} unique values, sample: ${c.sample})`).join('\n');

    const systemPrompt = `You are an expert SQL analyst and data visualization specialist. Generate SQLite-compatible SQL queries for data analysis.

TABLE: ${tableName}
COLUMNS:
${columnInfo}

${relationships ? `
DETECTED RELATIONSHIPS:
- Dimensions (group by): ${relationships.dimensions?.map(d => d.name).join(', ') || 'none'}
- Measures (aggregate): ${relationships.measures?.map(m => m.name).join(', ') || 'none'}
- Date column: ${relationships.dateHierarchy?.column || 'none'}
- Hierarchies: ${relationships.hierarchies?.map(h => `${h.parent}→${h.child}`).join(', ') || 'none'}
` : ''}

SQL RULES (SQLite syntax):
1. Always quote column names with double quotes: SELECT "Column Name"
2. Use proper aggregations: SUM(), AVG(), COUNT(), COUNT(DISTINCT x), MIN(), MAX()
3. GROUP BY for dimensions, aggregate measures
4. ORDER BY for sorting (DESC for top N)
5. LIMIT for top N queries
6. For dates: strftime('%Y-%m', "DateColumn") for monthly grouping
7. COALESCE("col", 'Unknown') for handling NULLs
8. Always return at least 2 columns for charting

QUERY PATTERNS:
- "Show me top X by Y" → SELECT "X", SUM("Y") FROM data GROUP BY "X" ORDER BY SUM("Y") DESC LIMIT 10
- "Breakdown by" → SELECT "Category", COUNT(*) FROM data GROUP BY "Category"
- "Trend over time" → SELECT strftime('%Y-%m', "Date") as month, SUM("Value") FROM data GROUP BY month ORDER BY month
- "Compare X and Y" → SELECT "X", "Y" FROM data (for correlation)
- "Average X by Y" → SELECT "Y", AVG("X") FROM data GROUP BY "Y"

CHART TYPE SELECTION:
- Top N queries → "horizontalBar"
- Distribution/breakdown → "donut" (if <7 categories) or "bar"
- Time trends → "area" or "line"
- Correlation → "scatter"
- Single value → "gauge"

Return ONLY valid JSON:
{
  "sql": "SELECT ... FROM ${tableName} ...",
  "explanation": "What this query shows in plain English",
  "chartType": "horizontalBar|bar|donut|area|line|scatter|gauge",
  "chartConfig": {
    "title": "Chart title based on the question",
    "xAxis": "first SELECT column name",
    "yAxis": "second SELECT column name"
  }
}

ONLY return JSON, no markdown, no explanation outside JSON.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `User question: "${question}"\n\nGenerate an appropriate SQL query and visualization.` }
        ],
        max_tokens: 1000,
        temperature: 0.3
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return res.status(response.status).json({ 
        error: error.error?.message || 'Query generation failed' 
      });
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content || '{}';
    
    try {
      const result = JSON.parse(content);
      res.json(result);
    } catch (parseError) {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        res.json(JSON.parse(jsonMatch[0]));
      } else {
        res.status(500).json({ error: 'Failed to parse AI response' });
      }
    }
  } catch (error) {
    console.error('Query error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Generate chart configuration
app.post('/api/chart-config', async (req, res) => {
  try {
    const { chartType, data, columns, title } = req.body;

    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: 'API key not configured' });
    }

    const systemPrompt = `You are an Apache ECharts expert. Generate ECharts option configuration for the requested chart.

Return ONLY valid JSON that can be directly used as ECharts option. Include:
- Proper title, tooltip, legend
- Responsive grid settings
- Appropriate colors
- Proper data formatting

Do NOT include any explanation, ONLY the ECharts option JSON.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `Create a ${chartType} chart with title "${title}".

Data columns: ${JSON.stringify(columns)}
Sample data: ${JSON.stringify(data.slice(0, 20))}

Generate the complete ECharts option configuration.`
          }
        ],
        max_tokens: 2000,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return res.status(response.status).json({ 
        error: error.error?.message || 'Chart config generation failed' 
      });
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content || '{}';
    
    try {
      const config = JSON.parse(content);
      res.json(config);
    } catch (parseError) {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        res.json(JSON.parse(jsonMatch[0]));
      } else {
        res.status(500).json({ error: 'Failed to parse chart config' });
      }
    }
  } catch (error) {
    console.error('Chart config error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Conversational Q&A endpoint - uses MULTI-AGENT system
app.post('/api/ask', async (req, res) => {
  try {
    const { question, columns, rowCount, sampleData, sessionId } = req.body;

    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: 'API key not configured' });
    }

    console.log('\n' + '═'.repeat(60));
    console.log('🤖 MULTI-AGENT SYSTEM ACTIVATED');
    console.log('═'.repeat(60));

    // Check if we have cached data analysis for this session
    const cacheKey = sessionId || JSON.stringify(columns.map(c => c.name));
    let cachedAnalysis = dataAnalysisCache.get(cacheKey);

    // Run the multi-agent orchestrator
    const result = await orchestratorAgent(
      question,
      columns,
      sampleData,
      rowCount,
      cachedAnalysis
    );

    if (!result.success) {
      // Fallback to quick answer agent
      console.log('⚠️ Orchestrator failed, trying quick answer agent...');
      try {
        const quickResult = await quickAnswerAgent(question, columns, sampleData);
        return res.json({
          answer: quickResult.answer,
          sql: quickResult.sql,
          chartType: quickResult.chartType || 'bar',
          chartConfig: quickResult.chartConfig,
          agents: [{ name: 'Quick Answer', status: 'complete' }]
        });
      } catch (fallbackError) {
        return res.status(500).json({ error: result.error || 'Failed to process question' });
      }
    }

    // Cache the data analysis for future questions
    if (result.dataAnalysis && !cachedAnalysis) {
      dataAnalysisCache.set(cacheKey, result.dataAnalysis);
      console.log('💾 Data analysis cached for session');
    }

    // Return the orchestrated result
    res.json({
      answer: result.answer.explanation,
      sql: result.answer.sql,
      chartType: result.answer.chartType,
      chartConfig: result.answer.chartConfig,
      insights: result.answer.insights,
      designRationale: result.answer.designRationale,
      dataContext: result.dataAnalysis ? {
        dataType: result.dataAnalysis.dataType,
        businessContext: result.dataAnalysis.businessContext
      } : null,
      agents: result.agents
    });

  } catch (error) {
    console.error('❌ Multi-agent error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// New endpoint: Analyze data with multi-agent system
app.post('/api/multi-agent/analyze', async (req, res) => {
  try {
    const { columns, sampleData, rowCount } = req.body;

    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: 'API key not configured' });
    }

    console.log('\n' + '═'.repeat(60));
    console.log('🔍 DATA ANALYST AGENT - Initial Analysis');
    console.log('═'.repeat(60));

    const analysis = await dataAnalystAgent(columns, sampleData, rowCount);
    
    // Cache the analysis
    const cacheKey = JSON.stringify(columns.map(c => c.name));
    dataAnalysisCache.set(cacheKey, analysis);

    res.json({
      success: true,
      analysis,
      suggestedQuestions: generateSmartQuestions(analysis)
    });

  } catch (error) {
    console.error('❌ Analysis error:', error);
    res.status(500).json({ error: 'Failed to analyze data' });
  }
});

// Generate smart questions based on data analysis
function generateSmartQuestions(analysis) {
  const questions = [];
  
  if (analysis.dimensions?.length > 0 && analysis.measures?.length > 0) {
    const dim = analysis.dimensions[0].name;
    const measure = analysis.measures[0].name;
    questions.push(`What is the total ${measure} by ${dim}?`);
    questions.push(`Show me the top 10 ${dim} by ${measure}`);
  }
  
  if (analysis.calculatedFields?.length > 0) {
    const calc = analysis.calculatedFields[0];
    questions.push(`Calculate ${calc.name} (${calc.formula}) and show by ${analysis.dimensions?.[0]?.name || 'category'}`);
  }
  
  if (analysis.dateColumns?.length > 0 && analysis.measures?.length > 0) {
    questions.push(`Show the trend of ${analysis.measures[0].name} over time`);
  }
  
  if (analysis.relationships?.length > 0) {
    const rel = analysis.relationships[0];
    questions.push(`How does ${rel.columns[0]} relate to ${rel.columns[1]}?`);
  }
  
  questions.push(`What are the key insights from this data?`);
  
  return questions.slice(0, 8);
}

/**
 * AUTO BUILD DASHBOARD ENDPOINT
 * Like clicking "Build Dashboard" in Power BI
 * Uses multi-agent system to automatically create a complete dashboard
 */
app.post('/api/build-dashboard', async (req, res) => {
  try {
    const { columns, sampleData, rowCount } = req.body;

    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: 'API key not configured' });
    }

    console.log('\n' + '🏗️'.repeat(30));
    console.log('AUTO-BUILD DASHBOARD - Like Power BI / Tableau');
    console.log('🏗️'.repeat(30));

    // Run the full dashboard building pipeline
    const result = await buildDashboardAgent(columns, sampleData, rowCount);

    if (!result.success) {
      return res.status(500).json({ 
        error: result.error || 'Failed to build dashboard',
        agents: result.agents
      });
    }

    // Cache the analysis for future Q&A
    const cacheKey = JSON.stringify(columns.map(c => c.name));
    dataAnalysisCache.set(cacheKey, result.dataAnalysis);

    res.json({
      success: true,
      dashboard: result.dashboard,
      dataAnalysis: result.dataAnalysis,
      agents: result.agents
    });

  } catch (error) {
    console.error('❌ Build Dashboard error:', error);
    res.status(500).json({ error: 'Failed to build dashboard' });
  }
});

app.listen(PORT, () => {
  console.log(`\nAI Dashboard Agent API running on http://localhost:${PORT}`);
  console.log(`Upload directory: ${path.join(__dirname, 'uploads')}\n`);
});
